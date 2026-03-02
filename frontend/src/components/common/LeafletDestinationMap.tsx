import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type MapMode = 'mapa' | 'satelite' | 'hibrido' | 'relieve';

type LatLngPoint = {
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
  keepBuffer: 8,
  updateWhenZooming: false as const,
  updateWhenIdle: true as const,
};

function MapViewportSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, [map, center, zoom]);
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
  const activeCenter: [number, number] = marker ? [marker.lat, marker.lng] : [center.lat, center.lng];
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
        maxZoom={19}
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
      </MapContainer>
    </div>
  );
}
