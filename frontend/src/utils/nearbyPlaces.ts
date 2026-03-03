import { API_ROOT } from './api';

export type NearbyPlace = {
  name: string;
  lat: number;
  lng: number;
  distance?: number;
  score?: number;
  source?: string;
};

const API_BASE = `${API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '')}/api`;
const NEARBY_PLACES_MAX_LIMIT = 50;
const NEARBY_PLACES_CACHE_TTL_MS = 10 * 60 * 1000;
const NEARBY_PLACES_EMPTY_CACHE_TTL_MS = 20 * 1000;
const nearbyPlacesCache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const nearbyPlacesInFlight = new Map<string, Promise<NearbyPlace[]>>();

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isLikelyBusinessName = (name: string) => {
  const normalized = normalizeText(name);
  if (!normalized) {
    return false;
  }
  return !/^(calle|av|avenida|blvd|boulevard|carretera|camino|autopista|ruta)\b/.test(normalized);
};

const getDistanceMeters = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

type NominatimSearchItem = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

const toNearbyPlace = (value: unknown): NearbyPlace | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const name = String(payload.name || '').trim();
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    name,
    lat,
    lng,
    distance: Number.isFinite(Number(payload.distance)) ? Number(payload.distance) : undefined,
    score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : undefined,
    source: typeof payload.source === 'string' ? payload.source : undefined,
  };
};

const dedupeNearbyPlaces = (places: NearbyPlace[], limit: number): NearbyPlace[] => {
  const unique = new Map<string, NearbyPlace>();
  places.forEach((place) => {
    const name = String(place.name || '').trim();
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const key = `${normalizeText(name)}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
    if (!unique.has(key)) {
      unique.set(key, { ...place, name, lat, lng });
    }
  });
  return Array.from(unique.values()).slice(0, limit);
};

const fetchNearbyPlacesFromNominatimFallback = async (lat: number, lng: number, limit: number, signal?: AbortSignal): Promise<NearbyPlace[]> => {
  const delta = 0.06;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  const queries = [
    'parque industrial',
    'industrial',
    'fabrica',
    'empresa',
    'planta',
    'manufactura',
    'almacen',
    'logistica',
    'taller',
    'maquiladora',
    'automotriz',
    'proveedor',
    'gasolinera',
    'restaurant',
    'hotel',
    'hospital',
    'farmacia',
    'banco',
    'supermercado',
    'tienda',
  ];
  const unique = new Set<string>();
  const places: NearbyPlace[] = [];

  for (const query of queries) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: '35',
      'accept-language': 'es',
      bounded: '1',
      viewbox: `${left},${top},${right},${bottom}`,
      q: query,
    });
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        method: 'GET',
        signal,
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as NominatimSearchItem[];
      for (const item of payload) {
        const rawDisplay = String(item.display_name || '');
        const name = rawDisplay.split(',')[0]?.trim() || '';
        if (!name || !isLikelyBusinessName(name)) {
          continue;
        }
        const canonicalName = normalizeText(name);
        if (!canonicalName || unique.has(canonicalName)) {
          continue;
        }
        const placeLat = Number(item.lat);
        const placeLng = Number(item.lon);
        if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
          continue;
        }
        const distance = getDistanceMeters(lat, lng, placeLat, placeLng);
        if (distance > 8000) {
          continue;
        }
        unique.add(canonicalName);
        places.push({
          name,
          lat: placeLat,
          lng: placeLng,
          distance,
          score: distance + 1200,
          source: 'nominatim-fallback',
        });
      }
    } catch {
      continue;
    }
  }

  return places
    .sort((a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY))
    .slice(0, limit);
};

const fetchNearbyPlacesFromOverpassFallback = async (lat: number, lng: number, limit: number, signal?: AbortSignal): Promise<NearbyPlace[]> => {
  const radiusMeters = 9000;
  const query = `
[out:json][timeout:6];
(
  nwr(around:${radiusMeters},${lat},${lng})["name"];
  nwr(around:${radiusMeters},${lat},${lng})["brand"];
  nwr(around:${radiusMeters},${lat},${lng})["operator"];
  nwr(around:${radiusMeters},${lat},${lng})["amenity"];
  nwr(around:${radiusMeters},${lat},${lng})["shop"];
  nwr(around:${radiusMeters},${lat},${lng})["office"];
);
out center 2400;
`;
  const endpoints = [
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  let data: { elements?: OverpassElement[] } | null = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!response.ok) {
        continue;
      }
      data = (await response.json()) as { elements?: OverpassElement[] };
      break;
    } catch {
      continue;
    }
  }
  if (!data) {
    return fetchNearbyPlacesFromNominatimFallback(lat, lng, limit, signal);
  }

  const unique = new Set<string>();
  type ScoredPlace = {
    name: string;
    lat: number;
    lng: number;
    distance: number;
    score: number;
    source: string;
  };

  const places = (data.elements ?? [])
    .map((element) => {
      const tags = element.tags ?? {};
      const name = (tags.name || tags.brand || tags.operator || '').trim();
      const latValue =
        typeof element.lat === 'number' ? element.lat : typeof element.center?.lat === 'number' ? element.center.lat : NaN;
      const lngValue =
        typeof element.lon === 'number' ? element.lon : typeof element.center?.lon === 'number' ? element.center.lon : NaN;
      if (!name || !Number.isFinite(latValue) || !Number.isFinite(lngValue)) {
        return null;
      }
      const normalizedName = normalizeText(name);
      if (!normalizedName || unique.has(normalizedName) || !isLikelyBusinessName(name)) {
        return null;
      }
      unique.add(normalizedName);
      const hasBusinessTag = Boolean(
        tags.shop ||
          tags.amenity ||
          tags.office ||
          tags.brand ||
          tags.operator ||
          tags.craft ||
          tags.man_made ||
          tags.industrial ||
          tags.commercial ||
          tags.retail ||
          tags.landuse === 'industrial' ||
          tags.building === 'industrial' ||
          tags.building === 'commercial' ||
          tags.building === 'retail'
      );
      const isMostlyInfrastructure = Boolean(
        tags.highway || tags.railway || tags.route || tags.boundary || tags.admin_level || tags.place || tags.waterway || tags.aeroway
      );
      if (!hasBusinessTag && isMostlyInfrastructure) {
        return null;
      }
      const distance = getDistanceMeters(lat, lng, latValue, lngValue);
      if (distance > 12000) {
        return null;
      }
      const item: ScoredPlace = {
        name,
        lat: latValue,
        lng: lngValue,
        distance,
        score: distance + (hasBusinessTag ? 0 : 800) + (tags.building ? 120 : 0),
        source: 'overpass-fallback',
      };
      return item;
    })
    .filter((value): value is ScoredPlace => Boolean(value))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ score, ...item }) => item);

  if (places.length > 0) {
    return places;
  }
  return fetchNearbyPlacesFromNominatimFallback(lat, lng, limit, signal);
};

export const fetchNearbyPlaces = async (lat: number, lng: number, limit = 18, signal?: AbortSignal): Promise<NearbyPlace[]> => {
  const safeLimit = Math.max(1, Math.min(limit, NEARBY_PLACES_MAX_LIMIT));
  const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}:${safeLimit}`;
  const now = Date.now();
  const cached = nearbyPlacesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return dedupeNearbyPlaces(cached.places, safeLimit);
  }

  const inFlight = nearbyPlacesInFlight.get(cacheKey);
  if (inFlight) {
    const sharedPlaces = await inFlight;
    return dedupeNearbyPlaces(sharedPlaces, safeLimit);
  }

  const url = `${API_BASE}/geocode/nearby-places/?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&limit=${safeLimit}`;

  const requestPromise = (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        signal,
      });
      if (!response.ok) {
        const fallbackPlaces = await fetchNearbyPlacesFromOverpassFallback(lat, lng, safeLimit, signal);
        return dedupeNearbyPlaces(fallbackPlaces, safeLimit);
      }
      const payload = (await response.json()) as { places?: unknown[] };
      const places = (payload.places || [])
        .map(toNearbyPlace)
        .filter((place): place is NearbyPlace => Boolean(place));
      if (places.length > 0) {
        return dedupeNearbyPlaces(places, safeLimit);
      }
      const fallbackPlaces = await fetchNearbyPlacesFromOverpassFallback(lat, lng, safeLimit, signal);
      return dedupeNearbyPlaces(fallbackPlaces, safeLimit);
    } catch {
      const fallbackPlaces = await fetchNearbyPlacesFromOverpassFallback(lat, lng, safeLimit, signal);
      return dedupeNearbyPlaces(fallbackPlaces, safeLimit);
    }
  })();

  nearbyPlacesInFlight.set(cacheKey, requestPromise);
  try {
    const places = await requestPromise;
    nearbyPlacesCache.set(cacheKey, {
      expiresAt: Date.now() + (places.length ? NEARBY_PLACES_CACHE_TTL_MS : NEARBY_PLACES_EMPTY_CACHE_TTL_MS),
      places,
    });
    return places;
  } finally {
    nearbyPlacesInFlight.delete(cacheKey);
  }
};
