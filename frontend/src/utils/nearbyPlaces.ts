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
      return [];
    }
    const payload = (await response.json()) as { places?: unknown[] };
    return (payload.places || [])
      .map(toNearbyPlace)
      .filter((place): place is NearbyPlace => Boolean(place));
  } catch {
    return [];
  }
};
