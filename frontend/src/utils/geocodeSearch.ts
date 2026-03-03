import { API_ROOT } from './api';

export type GeocodeSearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance?: number;
  source?: string;
};

type SearchOptions = {
  limit?: number;
  nearLat?: number;
  nearLng?: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  bounded?: boolean;
  signal?: AbortSignal;
};

const API_BASE = `${API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '')}/api`;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const searchCache = new Map<string, { expiresAt: number; results: GeocodeSearchResult[] }>();
const searchInFlight = new Map<string, Promise<GeocodeSearchResult[]>>();

const normalizeSearchText = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const toSearchResult = (value: unknown): GeocodeSearchResult | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const name = String(raw.name || '').trim();
  const address = String(raw.address || raw.display_name || raw.name || '').trim();
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const distance = Number(raw.distance);
  return {
    name,
    address,
    lat,
    lng,
    distance: Number.isFinite(distance) && distance >= 0 ? distance : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };
};

export const searchGeocodePlaces = async (
  query: string,
  { limit = 8, nearLat, nearLng, bounds, bounded = false, signal }: SearchOptions = {}
): Promise<GeocodeSearchResult[]> => {
  const safeQuery = normalizeSearchText(query);
  if (safeQuery.length < 3) {
    return [];
  }
  const safeLimit = Math.max(1, Math.min(limit, 80));
  const nearLatSafe = Number.isFinite(Number(nearLat)) ? Number(nearLat) : undefined;
  const nearLngSafe = Number.isFinite(Number(nearLng)) ? Number(nearLng) : undefined;
  const hasBounds = Boolean(
    bounds &&
    Number.isFinite(Number(bounds.north)) &&
    Number.isFinite(Number(bounds.south)) &&
    Number.isFinite(Number(bounds.east)) &&
    Number.isFinite(Number(bounds.west)) &&
    Number(bounds.north) > Number(bounds.south) &&
    Number(bounds.east) > Number(bounds.west)
  );
  const boundsKey = hasBounds && bounds
    ? `${bounds.north.toFixed(3)}:${bounds.south.toFixed(3)}:${bounds.east.toFixed(3)}:${bounds.west.toFixed(3)}:${bounded ? '1' : '0'}`
    : '-';
  const cacheKey = `${safeQuery}:${safeLimit}:${nearLatSafe?.toFixed(3) || '-'}:${nearLngSafe?.toFixed(3) || '-'}:${boundsKey}`;
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.results;
  }

  const inFlight = searchInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const params = new URLSearchParams({
    q: safeQuery,
    limit: String(safeLimit),
  });
  if (nearLatSafe !== undefined && nearLngSafe !== undefined) {
    params.set('near_lat', String(nearLatSafe));
    params.set('near_lng', String(nearLngSafe));
  }
  if (hasBounds && bounds) {
    params.set('north', String(bounds.north));
    params.set('south', String(bounds.south));
    params.set('east', String(bounds.east));
    params.set('west', String(bounds.west));
    if (bounded) {
      params.set('bounded', '1');
    }
  }
  const url = `${API_BASE}/geocode/search/?${params.toString()}`;

  const requestPromise = (async () => {
    try {
      const response = await fetch(url, { method: 'GET', credentials: 'omit', signal });
      if (!response.ok) {
        return [];
      }
      const payload = (await response.json()) as { results?: unknown[] };
      const results = (payload.results || [])
        .map(toSearchResult)
        .filter((item): item is GeocodeSearchResult => Boolean(item));
      return results;
    } catch {
      return [];
    }
  })();

  searchInFlight.set(cacheKey, requestPromise);
  try {
    const results = await requestPromise;
    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results });
    return results;
  } finally {
    searchInFlight.delete(cacheKey);
  }
};
