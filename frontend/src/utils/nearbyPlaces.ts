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

const fetchNearbyPlacesFromOverpassFallback = async (lat: number, lng: number, limit: number, signal?: AbortSignal): Promise<NearbyPlace[]> => {
  const radiusMeters = 1800;
  const query = `
[out:json][timeout:10];
(
  nwr(around:${radiusMeters},${lat},${lng})["name"];
);
out center 250;
`;
  const endpoints = [
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
    return [];
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
      if (distance > 2500) {
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

  return places;
};

export const fetchNearbyPlaces = async (lat: number, lng: number, limit = 18, signal?: AbortSignal): Promise<NearbyPlace[]> => {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const url = `${API_BASE}/geocode/nearby-places/?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&limit=${safeLimit}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      return fetchNearbyPlacesFromOverpassFallback(lat, lng, safeLimit, signal);
    }
    const payload = (await response.json()) as { places?: unknown[] };
    const places = (payload.places || [])
      .map(toNearbyPlace)
      .filter((place): place is NearbyPlace => Boolean(place));
    if (places.length > 0) {
      return places;
    }
    return fetchNearbyPlacesFromOverpassFallback(lat, lng, safeLimit, signal);
  } catch {
    return fetchNearbyPlacesFromOverpassFallback(lat, lng, safeLimit, signal);
  }
};
