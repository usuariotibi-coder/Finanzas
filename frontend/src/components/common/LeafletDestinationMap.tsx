import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { fetchNearbyPlaces } from '../../utils/nearbyPlaces';
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

type BoundsBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeBusinessKey = (value: string) =>
  normalizeText(value)
    .replace(/\b(sa de cv|s a de c v|s de rl de cv|s de rl|de cv|sa|sc|ac|inc|llc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getDistanceMeters = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const toRad = (numberValue: number) => (numberValue * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRad(toLat - fromLat);
  const deltaLng = toRad(toLng - fromLng);
  const latA = toRad(fromLat);
  const latB = toRad(toLat);
  const value =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
};

const buildReadableNearbyPlaces = (
  places: NearbyPlacePoint[],
  anchor: LatLngPoint,
  currentZoom: number
) => {
  const maxVisible =
    currentZoom >= 16 ? 160 :
      currentZoom >= 15 ? 120 :
        currentZoom >= 14 ? 90 :
          currentZoom >= 13 ? 70 : 40;
  const minGapMeters =
    currentZoom >= 16 ? 12 :
      currentZoom >= 15 ? 18 :
        currentZoom >= 14 ? 24 :
          currentZoom >= 13 ? 32 : 45;

  const sorted = places
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng) && place.name.trim())
    .sort(
      (a, b) =>
        getDistanceMeters(anchor.lat, anchor.lng, a.lat, a.lng) -
        getDistanceMeters(anchor.lat, anchor.lng, b.lat, b.lng)
    );

  const selected: NearbyPlacePoint[] = [];
  const seenNames = new Set<string>();
  for (const place of sorted) {
    const canonicalName = normalizeBusinessKey(place.name);
    if (!canonicalName || seenNames.has(canonicalName)) {
      continue;
    }
    const tooCloseToExisting = selected.some(
      (existing) => getDistanceMeters(existing.lat, existing.lng, place.lat, place.lng) < minGapMeters
    );
    if (tooCloseToExisting) {
      continue;
    }
    seenNames.add(canonicalName);
    selected.push(place);
    if (selected.length >= maxVisible) {
      break;
    }
  }

  return selected;
};

interface LeafletDestinationMapProps {
  center: LatLngPoint;
  marker?: LatLngPoint | null;
  markerTitle?: string;
  markerSubtitle?: string;
  fallbackNearbyNames?: string[];
  externalNearbyPlaces?: NearbyPlacePoint[];
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

function MapViewWatcher({
  onZoomChange,
  onBoundsChange,
}: {
  onZoomChange: (zoom: number) => void;
  onBoundsChange: (bounds: BoundsBox) => void;
}) {
  const emitState = (mapInstance: ReturnType<typeof useMapEvents>) => {
    const bounds = mapInstance.getBounds();
    onZoomChange(mapInstance.getZoom());
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
  };

  const map = useMapEvents({
    moveend() {
      emitState(map);
    },
    zoomend() {
      emitState(map);
    },
  });

  useEffect(() => {
    emitState(map);
  }, [map]);

  return null;
}

export default function LeafletDestinationMap({
  center,
  marker = null,
  markerTitle = 'Destino seleccionado',
  markerSubtitle = '',
  fallbackNearbyNames = [],
  externalNearbyPlaces = [],
  defaultZoom = 17,
  fallbackZoom = 5,
  showModeControl = true,
  initialMode = 'hibrido',
  onMapClick,
}: LeafletDestinationMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>(initialMode);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlacePoint[]>([]);
  const [isLoadingNearbyPlaces, setIsLoadingNearbyPlaces] = useState(false);
  const [mapBounds, setMapBounds] = useState<BoundsBox | null>(null);
  const activeCenter = useMemo<[number, number]>(
    () => (marker ? [marker.lat, marker.lng] : [center.lat, center.lng]),
    [marker?.lat, marker?.lng, center.lat, center.lng]
  );
  const activeZoom = marker ? defaultZoom : fallbackZoom;
  const [currentZoom, setCurrentZoom] = useState(activeZoom);

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
    setCurrentZoom(activeZoom);
  }, [activeZoom, marker?.lat, marker?.lng, center.lat, center.lng]);

  const allNearbyPlaces = useMemo(() => {
    const unique = new Map<string, NearbyPlacePoint>();
    [...nearbyPlaces, ...externalNearbyPlaces].forEach((place) => {
      const name = String(place.name || '').trim();
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      const key = `${normalizeBusinessKey(name)}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
      if (!unique.has(key)) {
        unique.set(key, { name, lat, lng });
      }
    });
    return Array.from(unique.values());
  }, [nearbyPlaces, externalNearbyPlaces]);

  const visibleNearbyPlaces = useMemo(() => {
    if (!mapBounds) {
      return allNearbyPlaces;
    }
    return allNearbyPlaces.filter((place) => (
      place.lat <= mapBounds.north &&
      place.lat >= mapBounds.south &&
      place.lng <= mapBounds.east &&
      place.lng >= mapBounds.west
    ));
  }, [allNearbyPlaces, mapBounds]);
  const nearbyPlacesToRender = useMemo(
    () => buildReadableNearbyPlaces(visibleNearbyPlaces, marker ?? center, currentZoom),
    [visibleNearbyPlaces, marker?.lat, marker?.lng, center.lat, center.lng, currentZoom]
  );
  const markerSubtitleSafe = useMemo(() => {
    const subtitle = String(markerSubtitle || '').trim();
    if (!subtitle) {
      return '';
    }
    const titleNormalized = normalizeText(markerTitle);
    const subtitleNormalized = normalizeText(subtitle);
    if (!titleNormalized || titleNormalized === subtitleNormalized) {
      return titleNormalized === subtitleNormalized ? '' : subtitle;
    }
    if (subtitleNormalized.startsWith(`${titleNormalized} `) || subtitleNormalized.startsWith(`${titleNormalized},`)) {
      return subtitle.slice(markerTitle.length).replace(/^[,\s-]+/, '').trim();
    }
    return subtitle;
  }, [markerTitle, markerSubtitle]);
  const fallbackNearbyNamesSafe = useMemo(
    () => (
      fallbackNearbyNames
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, array) => array.findIndex((item) => normalizeBusinessKey(item) === normalizeBusinessKey(value)) === index)
        .slice(0, 12)
    ),
    [fallbackNearbyNames]
  );

  useEffect(() => {
    const anchor = marker ?? center;
    if (!anchor) {
      setNearbyPlaces([]);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    setIsLoadingNearbyPlaces(true);

    void fetchNearbyPlaces(anchor.lat, anchor.lng, 60, controller.signal)
      .then(async (places) => {
        if (places.length > 0) {
          setNearbyPlaces(places.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng })));
          return;
        }
        // Quick retry to avoid intermittent empty payloads from public OSM services.
        const retryPlaces = await fetchNearbyPlaces(anchor.lat, anchor.lng, 60, controller.signal).catch(() => []);
        if (retryPlaces.length > 0) {
          setNearbyPlaces(retryPlaces.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng })));
        }
      })
      .catch(() => {
        // Preserve the previous labels if a network timeout occurs.
      })
      .finally(() => {
        setIsLoadingNearbyPlaces(false);
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
        maxZoom={20}
        preferCanvas={true}
        scrollWheelZoom={true}
        fadeAnimation={false}
        className="h-full w-full"
      >
        <MapViewportSync center={activeCenter} zoom={activeZoom} />
        <MapViewWatcher onZoomChange={setCurrentZoom} onBoundsChange={setMapBounds} />
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
            <TileLayer
              attribution={CARTO_TILE_ATTRIBUTION}
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
              subdomains={['a', 'b', 'c', 'd']}
              maxNativeZoom={20}
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
                {markerSubtitleSafe ? <p className="text-slate-700">{markerSubtitleSafe}</p> : null}
              </div>
            </Tooltip>
          </CircleMarker>
        ) : null}
        {currentZoom >= 11 &&
          nearbyPlacesToRender.map((place) => (
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
      {currentZoom >= 11 && nearbyPlacesToRender.length > 0 ? (
        <div className="pointer-events-none absolute bottom-8 right-2 z-[1000] max-h-36 w-56 overflow-y-auto rounded-md border border-slate-300 bg-white/95 p-2 shadow">
          <p className="mb-1 text-[10px] font-semibold text-slate-800">Empresas/Lugares cercanos</p>
          <div className="space-y-0.5">
            {nearbyPlacesToRender.slice(0, 60).map((place) => (
              <p key={`list:${place.name}:${place.lat.toFixed(5)}:${place.lng.toFixed(5)}`} className="text-[10px] text-slate-700">
                {place.name}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {currentZoom >= 11 && nearbyPlacesToRender.length === 0 && fallbackNearbyNamesSafe.length > 0 ? (
        <div className="pointer-events-none absolute bottom-8 right-2 z-[1000] max-h-36 w-56 overflow-y-auto rounded-md border border-slate-300 bg-white/95 p-2 shadow">
          <p className="mb-1 text-[10px] font-semibold text-slate-800">Empresas/Lugares cercanos</p>
          <div className="space-y-0.5">
            {fallbackNearbyNamesSafe.map((name) => (
              <p key={`fallback:${name}`} className="text-[10px] text-slate-700">
                {name}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {currentZoom >= 11 && !isLoadingNearbyPlaces && nearbyPlacesToRender.length === 0 && fallbackNearbyNamesSafe.length === 0 ? (
        <div className="pointer-events-none absolute bottom-8 right-2 z-[1000] rounded-md border border-slate-300 bg-white/95 px-2 py-1 shadow">
          <p className="text-[10px] text-slate-700">No hay nombres OSM en esta zona.</p>
        </div>
      ) : null}
    </div>
  );
}
