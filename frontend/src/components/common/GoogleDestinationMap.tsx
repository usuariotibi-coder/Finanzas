import { useMemo } from 'react';
import {
  GoogleMap,
  InfoWindowF,
  MarkerF,
  useJsApiLoader,
  type Libraries,
} from '@react-google-maps/api';

type LatLngPoint = {
  lat: number;
  lng: number;
};

type GoogleMapType = 'roadmap' | 'hybrid' | 'satellite' | 'terrain';

interface GoogleDestinationMapProps {
  center: LatLngPoint;
  marker?: LatLngPoint | null;
  markerTitle?: string;
  markerSubtitle?: string;
  mapHeightClassName?: string;
  defaultZoom?: number;
  fallbackZoom?: number;
  initialMapTypeId?: GoogleMapType;
  onMapClick?: (coords: LatLngPoint) => void;
}

const GOOGLE_LIBRARIES: Libraries = [];
const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

export default function GoogleDestinationMap({
  center,
  marker = null,
  markerTitle = 'Destino seleccionado',
  markerSubtitle = '',
  mapHeightClassName = 'h-full',
  defaultZoom = 17,
  fallbackZoom = 5,
  initialMapTypeId = 'hybrid',
  onMapClick,
}: GoogleDestinationMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_LIBRARIES,
  });

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      mapTypeControl: true,
      mapTypeId: initialMapTypeId as google.maps.MapTypeId,
      mapTypeControlOptions: {
        mapTypeIds: ['roadmap', 'hybrid', 'satellite', 'terrain'] as google.maps.MapTypeId[],
      },
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    }),
    [initialMapTypeId]
  );

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`flex w-full items-center justify-center bg-slate-50 px-3 text-xs text-slate-600 ${mapHeightClassName}`}>
        Falta configurar `VITE_GOOGLE_MAPS_API_KEY` para usar Google Maps.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`flex w-full items-center justify-center bg-slate-50 px-3 text-xs text-rose-700 ${mapHeightClassName}`}>
        No se pudo cargar Google Maps.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`flex w-full items-center justify-center bg-slate-50 px-3 text-xs text-slate-600 ${mapHeightClassName}`}>
        Cargando mapa...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerClassName={`w-full ${mapHeightClassName}`}
      center={marker ?? center}
      zoom={marker ? defaultZoom : fallbackZoom}
      options={mapOptions}
      onClick={
        onMapClick
          ? (event) => {
              const lat = event.latLng?.lat();
              const lng = event.latLng?.lng();
              if (lat === undefined || lng === undefined) {
                return;
              }
              onMapClick({ lat, lng });
            }
          : undefined
      }
    >
      {marker ? (
        <>
          <MarkerF position={marker} />
          {(markerTitle || markerSubtitle) && (
            <InfoWindowF position={marker}>
              <div className="text-xs">
                <p className="font-semibold text-slate-900">{markerTitle}</p>
                {markerSubtitle ? <p className="text-slate-700">{markerSubtitle}</p> : null}
              </div>
            </InfoWindowF>
          )}
        </>
      ) : null}
    </GoogleMap>
  );
}
