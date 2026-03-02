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

  const visibleNearbyPlaces = useMemo(() => {
    if (!mapBounds) {
      return nearbyPlaces;
    }
    return nearbyPlaces.filter((place) => (
      place.lat <= mapBounds.north &&
      place.lat >= mapBounds.south &&
      place.lng <= mapBounds.east &&
      place.lng >= mapBounds.west
    ));
  }, [nearbyPlaces, mapBounds]);

  useEffect(() => {
    const anchor = marker ?? center;
    if (!anchor) {
      setNearbyPlaces([]);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    setIsLoadingNearbyPlaces(true);

    void fetchNearbyPlaces(anchor.lat, anchor.lng, 60, controller.signal)
      .then((places) => {
        setNearbyPlaces(places.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng })));
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
                {markerSubtitle ? <p className="text-slate-700">{markerSubtitle}</p> : null}
              </div>
            </Tooltip>
          </CircleMarker>
        ) : null}
        {currentZoom >= 12 &&
          visibleNearbyPlaces.map((place) => (
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
      {currentZoom >= 12 && visibleNearbyPlaces.length > 0 ? (
        <div className="pointer-events-none absolute bottom-8 right-2 z-[1000] max-h-36 w-56 overflow-y-auto rounded-md border border-slate-300 bg-white/95 p-2 shadow">
          <p className="mb-1 text-[10px] font-semibold text-slate-800">Empresas/Lugares cercanos</p>
          <div className="space-y-0.5">
            {visibleNearbyPlaces.slice(0, 12).map((place) => (
              <p key={`list:${place.name}:${place.lat.toFixed(5)}:${place.lng.toFixed(5)}`} className="text-[10px] text-slate-700">
                {place.name}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {currentZoom >= 12 && !isLoadingNearbyPlaces && visibleNearbyPlaces.length === 0 ? (
        <div className="pointer-events-none absolute bottom-8 right-2 z-[1000] rounded-md border border-slate-300 bg-white/95 px-2 py-1 shadow">
          <p className="text-[10px] text-slate-700">No hay nombres OSM en esta zona.</p>
        </div>
      ) : null}
    </div>
  );
}
