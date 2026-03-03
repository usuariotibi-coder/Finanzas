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
    currentZoom >= 17 ? 120 :
      currentZoom >= 16 ? 95 :
        currentZoom >= 15 ? 70 :
          currentZoom >= 14 ? 48 :
            currentZoom >= 13 ? 32 : 20;
  const minGapMeters =
    currentZoom >= 17 ? 16 :
      currentZoom >= 16 ? 22 :
        currentZoom >= 15 ? 28 :
          currentZoom >= 14 ? 36 :
            currentZoom >= 13 ? 48 : 64;

  const sorted = places
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng) && place.name.trim())
    .sort(
      (a, b) =>
        getDistanceMeters(anchor.lat, anchor.lng, a.lat, a.lng) -
        getDistanceMeters(anchor.lat, anchor.lng, b.lat, b.lng)
    );

  const selected: NearbyPlacePoint[] = [];
  const seenNames = new Set<string>();
  const seenCells = new Set<string>();
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.max(12_000, 111_320 * Math.cos((anchor.lat * Math.PI) / 180));
  const cellLatDegrees = minGapMeters / metersPerDegreeLat;
  const cellLngDegrees = minGapMeters / metersPerDegreeLng;
  for (const place of sorted) {
    const canonicalName = normalizeBusinessKey(place.name);
    if (!canonicalName || seenNames.has(canonicalName)) {
      continue;
    }
    const cellY = Math.round((place.lat - anchor.lat) / cellLatDegrees);
    const cellX = Math.round((place.lng - anchor.lng) / cellLngDegrees);
    const cellKey = `${cellX}:${cellY}`;
    if (seenCells.has(cellKey)) {
      continue;
    }
    seenNames.add(canonicalName);
    seenCells.add(cellKey);
    selected.push(place);
    if (selected.length >= maxVisible) {
      break;
    }
  }

  return selected;
};

const mergeNearbyPlaceCollections = (base: NearbyPlacePoint[], incoming: NearbyPlacePoint[]) => {
  const merged = new Map<string, NearbyPlacePoint>();
  [...base, ...incoming].forEach((place) => {
    const key = `${normalizeBusinessKey(place.name)}:${place.lat.toFixed(5)}:${place.lng.toFixed(5)}`;
    if (!merged.has(key)) {
      merged.set(key, place);
    }
  });
  return Array.from(merged.values());
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
  const [showNearbyPanel, setShowNearbyPanel] = useState(false);
  const [isHydratingNearbyPlaces, setIsHydratingNearbyPlaces] = useState(false);
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
  const nearbyCount = nearbyPlacesToRender.length;

  useEffect(() => {
    const seedPlaces = externalNearbyPlaces
      .filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)) && String(place.name || '').trim())
      .map((place) => ({ name: String(place.name).trim(), lat: Number(place.lat), lng: Number(place.lng) }));
    if (seedPlaces.length === 0) {
      return;
    }
    setNearbyPlaces((prev) => mergeNearbyPlaceCollections(prev, seedPlaces));
  }, [externalNearbyPlaces]);

  useEffect(() => {
    const anchor = marker ?? center;
    if (!anchor) {
      setNearbyPlaces([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 26000);
    setIsLoadingNearbyPlaces(true);
    setIsHydratingNearbyPlaces(false);

    const normalizedAnchor = { lat: anchor.lat, lng: anchor.lng };
    void fetchNearbyPlaces(normalizedAnchor.lat, normalizedAnchor.lng, 72, controller.signal, 'quick')
      .then(async (quickPlaces) => {
        if (controller.signal.aborted) {
          return;
        }
        const normalizedQuick = quickPlaces.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng }));
        if (normalizedQuick.length > 0) {
          setNearbyPlaces((prev) => mergeNearbyPlaceCollections(prev, normalizedQuick));
        }
        setIsLoadingNearbyPlaces(false);
        if (normalizedQuick.length >= 120) {
          return;
        }

        setIsHydratingNearbyPlaces(true);
        const fullPlaces = await fetchNearbyPlaces(normalizedAnchor.lat, normalizedAnchor.lng, 220, controller.signal, 'full').catch(() => []);
        if (controller.signal.aborted || fullPlaces.length === 0) {
          return;
        }
        const normalizedFull = fullPlaces.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng }));
        setNearbyPlaces((prev) => mergeNearbyPlaceCollections(prev, normalizedFull));
      })
      .catch(() => {
        // Preserve previous labels on network issues.
      })
      .finally(() => {
        setIsLoadingNearbyPlaces(false);
        setIsHydratingNearbyPlaces(false);
        window.clearTimeout(timeoutId);
      });

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [marker?.lat, marker?.lng, center.lat, center.lng]);

  useEffect(() => {
    if (currentZoom < 13) {
      setShowNearbyPanel(false);
    }
  }, [currentZoom]);

  return (
    <div className="relative h-full w-full">
      {showModeControl ? (
        <div className="pointer-events-auto absolute right-3 top-3 z-[1000] rounded-2xl border border-slate-200/90 bg-white/90 p-1 shadow-xl backdrop-blur">
          <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vista</p>
          <div className="flex overflow-hidden rounded-xl border border-slate-200/80 bg-white/75">
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
              className={`px-2.5 py-1.5 text-[10px] font-semibold transition ${
                mapMode === mode.id
                  ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-inner'
                  : 'bg-white/90 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {mode.label}
            </button>
          ))}
          </div>
        </div>
      ) : null}
      {currentZoom >= 12 && nearbyCount > 0 ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-lg backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {nearbyCount} empresas visibles
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
        {currentZoom >= 12 &&
          nearbyPlacesToRender.map((place) => (
          <CircleMarker
            key={`${place.name}:${place.lat.toFixed(6)}:${place.lng.toFixed(6)}`}
            center={[place.lat, place.lng]}
            radius={2}
            pathOptions={{ color: '#1f2937', fillColor: '#1f2937', fillOpacity: 0.65, weight: 1 }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1} permanent className="gm-place-tooltip">
              <span className="gm-place-label-text">{place.name}</span>
            </Tooltip>
          </CircleMarker>
          ))}
      </MapContainer>
      {currentZoom >= 12 && nearbyPlacesToRender.length > 0 ? (
        <div className="absolute bottom-7 right-3 z-[1000] flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setShowNearbyPanel((prev) => !prev)}
            className="rounded-full border border-slate-200/90 bg-white/95 px-3.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-lg backdrop-blur hover:bg-white"
          >
            {showNearbyPanel ? 'Ocultar lista' : `Empresas cercanas (${nearbyCount})`}
          </button>
          {showNearbyPanel ? (
            <div className="w-72 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur">
              <div className="border-b border-slate-200/80 bg-gradient-to-r from-sky-50 to-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Empresas y lugares</p>
                <p className="text-xs font-semibold text-slate-800">Selecciona visualmente el punto mas cercano</p>
              </div>
              <div className="max-h-56 overflow-y-auto p-2">
                <div className="space-y-1">
                  {nearbyPlacesToRender.slice(0, 140).map((place, index) => (
                    <p
                      key={`list:${place.name}:${place.lat.toFixed(5)}:${place.lng.toFixed(5)}`}
                      className="rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-[11px] text-slate-700"
                    >
                      <span className="mr-1 text-slate-400">{index + 1}.</span>
                      {place.name}
                    </p>
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-[10px] text-slate-500">
                Tip: usa zoom para filtrar y ver etiquetas mas precisas.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {currentZoom >= 12 && nearbyPlacesToRender.length === 0 && fallbackNearbyNamesSafe.length > 0 ? (
        <div className="absolute bottom-7 right-3 z-[1000] rounded-full border border-amber-200/90 bg-amber-50/95 px-3 py-1.5 text-[10px] font-semibold text-amber-800 shadow">
          {fallbackNearbyNamesSafe.length} lugares detectados sin coordenadas visibles
        </div>
      ) : null}
      {currentZoom >= 12 && !isLoadingNearbyPlaces && nearbyPlacesToRender.length === 0 && fallbackNearbyNamesSafe.length === 0 ? (
        <div className="absolute bottom-7 right-3 z-[1000] rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow">
          Sin etiquetas de empresas en esta zona
        </div>
      ) : null}
      {currentZoom >= 12 && (isLoadingNearbyPlaces || isHydratingNearbyPlaces) ? (
        <div className="absolute bottom-16 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/95 px-3 py-1.5 text-[10px] font-medium text-sky-700 shadow">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
          {isHydratingNearbyPlaces ? 'Cargando mas empresas...' : 'Buscando empresas cercanas...'}
        </div>
      ) : null}
      {currentZoom < 12 ? (
        <div className="absolute bottom-7 right-3 z-[1000] rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow">
          Acerca para ver nombres de empresas
        </div>
      ) : null}
    </div>
  );
}
