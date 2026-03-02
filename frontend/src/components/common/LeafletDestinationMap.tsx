import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type MapMode = 'mapa' | 'satelite' | 'hibrido' | 'relieve';

type LatLngPoint = {
  lat: number;
  lng: number;
};

type NearbyPlacePoint = {
  name: string;
  lat: number;
  lng: number;
};

interface LeafletDestinationMapProps {
  center: LatLngPoint;
  marker?: LatLngPoint | null;
  markerTitle?: string;
  markerSubtitle?: string;
  defaultZoom?: number;
  fallbackZoom?: number;
  showModeControl?: boolean;
  initialMode?: MapMode;
  onMapClick?: (coords: LatLngPoint) => void;
}

const CARTO_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';
const ESRI_TILE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const TILE_LAYER_SMOOTH_PROPS = {
  keepBuffer: 12,
  updateWhenZooming: true as const,
  updateWhenIdle: true as const,
};

function MapViewportSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    const currentCenter = map.getCenter();
    const centerDiffLat = Math.abs(currentCenter.lat - center[0]);
    const centerDiffLng = Math.abs(currentCenter.lng - center[1]);
    const needsCenterUpdate = centerDiffLat > 0.000001 || centerDiffLng > 0.000001;
    const needsZoomUpdate = map.getZoom() !== zoom;
    if (needsCenterUpdate || needsZoomUpdate) {
      map.setView(center, zoom, { animate: false });
    }
  }, [map, center[0], center[1], zoom]);
  return null;
}

function MapClickCapture({ onSelect }: { onSelect: (coords: LatLngPoint) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

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

const fetchNearbyPlacesForMap = async (
  lat: number,
  lng: number,
  signal: AbortSignal
): Promise<NearbyPlacePoint[]> => {
  const radiusMeters = 750;
  const overpassQuery = `
[out:json][timeout:8];
(
  node(around:${radiusMeters},${lat},${lng})["amenity"]["name"];
  node(around:${radiusMeters},${lat},${lng})["shop"]["name"];
  node(around:${radiusMeters},${lat},${lng})["office"]["name"];
  node(around:${radiusMeters},${lat},${lng})["tourism"]["name"];
  node(around:${radiusMeters},${lat},${lng})["leisure"]["name"];
  node(around:${radiusMeters},${lat},${lng})["brand"];
  way(around:${radiusMeters},${lat},${lng})["amenity"]["name"];
  way(around:${radiusMeters},${lat},${lng})["shop"]["name"];
  way(around:${radiusMeters},${lat},${lng})["office"]["name"];
  way(around:${radiusMeters},${lat},${lng})["tourism"]["name"];
  way(around:${radiusMeters},${lat},${lng})["leisure"]["name"];
  way(around:${radiusMeters},${lat},${lng})["brand"];
  relation(around:${radiusMeters},${lat},${lng})["amenity"]["name"];
  relation(around:${radiusMeters},${lat},${lng})["shop"]["name"];
  relation(around:${radiusMeters},${lat},${lng})["office"]["name"];
  relation(around:${radiusMeters},${lat},${lng})["tourism"]["name"];
  relation(around:${radiusMeters},${lat},${lng})["leisure"]["name"];
  relation(around:${radiusMeters},${lat},${lng})["brand"];
);
out center 80;
`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let data: { elements?: OverpassElement[] } | null = null;

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal,
    });
    if (!response.ok) {
      continue;
    }
    data = (await response.json()) as { elements?: OverpassElement[] };
    break;
  }

  if (!data) {
    return [];
  }

  const unique = new Set<string>();
  const places = (data.elements ?? [])
    .map((element) => {
      const placeName = (element.tags?.name || element.tags?.brand || element.tags?.operator || '').trim();
      const point =
        Number.isFinite(element.lat) && Number.isFinite(element.lon)
          ? { lat: Number(element.lat), lng: Number(element.lon) }
          : Number.isFinite(element.center?.lat) && Number.isFinite(element.center?.lon)
            ? { lat: Number(element.center?.lat), lng: Number(element.center?.lon) }
            : null;
      if (!placeName || !point) {
        return null;
      }
      const normalized = placeName.toLowerCase().trim();
      if (!normalized || unique.has(normalized)) {
        return null;
      }
      unique.add(normalized);
      return {
        name: placeName,
        lat: point.lat,
        lng: point.lng,
        distance: getDistanceMeters(lat, lng, point.lat, point.lng),
      };
    })
    .filter((value): value is { name: string; lat: number; lng: number; distance: number } => Boolean(value))
    .filter((value) => value.distance <= 1000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10)
    .map((value) => ({ name: value.name, lat: value.lat, lng: value.lng }));

  return places;
};

export default function LeafletDestinationMap({
  center,
  marker = null,
  markerTitle = 'Destino seleccionado',
  markerSubtitle = '',
  defaultZoom = 17,
  fallbackZoom = 5,
  showModeControl = true,
  initialMode = 'hibrido',
  onMapClick,
}: LeafletDestinationMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>(initialMode);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlacePoint[]>([]);
  const activeCenter = useMemo<[number, number]>(
    () => (marker ? [marker.lat, marker.lng] : [center.lat, center.lng]),
    [marker?.lat, marker?.lng, center.lat, center.lng]
  );
  const activeZoom = marker ? defaultZoom : fallbackZoom;

  const baseLayer = useMemo(() => {
    switch (mapMode) {
      case 'mapa':
        return {
          key: 'mapa',
          attribution: CARTO_TILE_ATTRIBUTION,
          url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          subdomains: ['a', 'b', 'c', 'd'] as string[],
          maxNativeZoom: 20,
        };
      case 'relieve':
        return {
          key: 'relieve',
          attribution: ESRI_TILE_ATTRIBUTION,
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          subdomains: 'abc',
          maxNativeZoom: 16,
        };
      case 'satelite':
      case 'hibrido':
      default:
        return {
          key: 'satelite',
          attribution: ESRI_TILE_ATTRIBUTION,
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          subdomains: 'abc',
          maxNativeZoom: 19,
        };
    }
  }, [mapMode]);

  useEffect(() => {
    const anchor = marker ?? center;
    if (!anchor) {
      setNearbyPlaces([]);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7000);

    void fetchNearbyPlacesForMap(anchor.lat, anchor.lng, controller.signal)
      .then((places) => {
        setNearbyPlaces(places);
      })
      .catch(() => {
        setNearbyPlaces([]);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [marker?.lat, marker?.lng, center.lat, center.lng]);

  return (
    <div className="relative h-full w-full">
      {showModeControl ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-md border border-slate-300 bg-white shadow">
          {([
            { id: 'mapa', label: 'Mapa' },
            { id: 'satelite', label: 'Satelite' },
            { id: 'hibrido', label: 'Hibrido' },
            { id: 'relieve', label: 'Relieve' },
          ] as Array<{ id: MapMode; label: string }>).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setMapMode(mode.id)}
              className={`px-2 py-1 text-[10px] font-semibold transition ${
                mapMode === mode.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}
      <MapContainer
        center={activeCenter}
        zoom={activeZoom}
        minZoom={4}
        maxZoom={18}
        scrollWheelZoom={true}
        fadeAnimation={false}
        className="h-full w-full"
      >
        <MapViewportSync center={activeCenter} zoom={activeZoom} />
        <TileLayer
          key={baseLayer.key}
          attribution={baseLayer.attribution}
          url={baseLayer.url}
          subdomains={baseLayer.subdomains}
          maxNativeZoom={baseLayer.maxNativeZoom}
          {...TILE_LAYER_SMOOTH_PROPS}
        />
        {mapMode === 'hibrido' || mapMode === 'satelite' ? (
          <>
            {mapMode === 'hibrido' ? (
              <TileLayer
                attribution={ESRI_TILE_ATTRIBUTION}
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={16}
                {...TILE_LAYER_SMOOTH_PROPS}
              />
            ) : null}
            <TileLayer
              attribution={CARTO_TILE_ATTRIBUTION}
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
              subdomains={['a', 'b', 'c', 'd']}
              maxNativeZoom={20}
              {...TILE_LAYER_SMOOTH_PROPS}
            />
            <TileLayer
              attribution={ESRI_TILE_ATTRIBUTION}
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={16}
              {...TILE_LAYER_SMOOTH_PROPS}
            />
          </>
        ) : null}
        {onMapClick ? <MapClickCapture onSelect={onMapClick} /> : null}
        {marker ? (
          <CircleMarker
            center={[marker.lat, marker.lng]}
            radius={8}
            pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95} permanent>
              <div className="text-xs">
                <p className="font-semibold text-slate-900">{markerTitle}</p>
                {markerSubtitle ? <p className="text-slate-700">{markerSubtitle}</p> : null}
              </div>
            </Tooltip>
          </CircleMarker>
        ) : null}
        {nearbyPlaces.map((place) => (
          <CircleMarker
            key={`${place.name}:${place.lat.toFixed(6)}:${place.lng.toFixed(6)}`}
            center={[place.lat, place.lng]}
            radius={2}
            pathOptions={{ color: '#1f2937', fillColor: '#1f2937', fillOpacity: 0.65, weight: 1 }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.92} permanent>
              <span className="text-[10px] font-semibold text-slate-800">{place.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
