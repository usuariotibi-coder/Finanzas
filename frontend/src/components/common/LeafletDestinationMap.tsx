import { useEffect, useMemo, useState } from 'react';
import { searchGeocodePlaces, type GeocodeSearchResult } from '../../utils/geocodeSearch';
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

const formatSearchDistance = (distance?: number) => {
  if (!Number.isFinite(Number(distance)) || Number(distance) < 0) {
    return '';
  }
  const safeDistance = Number(distance);
  if (safeDistance < 1000) {
    return `${Math.round(safeDistance)} m`;
  }
  return `${(safeDistance / 1000).toFixed(1)} km`;
};

const buildViewportFetchAnchors = (
  primary: LatLngPoint,
  bounds: BoundsBox | null,
  zoom: number
): LatLngPoint[] => {
  const anchors: LatLngPoint[] = [{ lat: primary.lat, lng: primary.lng }];
  if (!bounds || zoom < 12) {
    return anchors;
  }
  const midLat = (bounds.north + bounds.south) / 2;
  const midLng = (bounds.east + bounds.west) / 2;
  if (zoom >= 12) {
    anchors.push({ lat: bounds.north, lng: midLng });
    anchors.push({ lat: bounds.south, lng: midLng });
    anchors.push({ lat: midLat, lng: bounds.east });
    anchors.push({ lat: midLat, lng: bounds.west });
  }

  const unique = new Map<string, LatLngPoint>();
  anchors.forEach((anchor) => {
    const key = `${anchor.lat.toFixed(3)}:${anchor.lng.toFixed(3)}`;
    if (!unique.has(key)) {
      unique.set(key, anchor);
    }
  });
  return Array.from(unique.values());
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
  showSearchControl?: boolean;
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
  onCenterChange,
}: {
  onZoomChange: (zoom: number) => void;
  onBoundsChange: (bounds: BoundsBox) => void;
  onCenterChange: (coords: LatLngPoint) => void;
}) {
  const emitState = (mapInstance: ReturnType<typeof useMapEvents>) => {
    const bounds = mapInstance.getBounds();
    const center = mapInstance.getCenter();
    onZoomChange(mapInstance.getZoom());
    onCenterChange({ lat: center.lat, lng: center.lng });
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
  showSearchControl = true,
  initialMode = 'hibrido',
  onMapClick,
}: LeafletDestinationMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>(initialMode);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlacePoint[]>([]);
  const [showNearbyPanel, setShowNearbyPanel] = useState(false);
  const [isHydratingNearbyPlaces, setIsHydratingNearbyPlaces] = useState(false);
  const [isLoadingNearbyPlaces, setIsLoadingNearbyPlaces] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [isLoadingReferencePlaces, setIsLoadingReferencePlaces] = useState(false);
  const [lastReferenceHydrationKey, setLastReferenceHydrationKey] = useState('');
  const [lastNearbyFetchKey, setLastNearbyFetchKey] = useState('');
  const [mapBounds, setMapBounds] = useState<BoundsBox | null>(null);
  const [mapViewportCenter, setMapViewportCenter] = useState<LatLngPoint | null>(null);
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
    const latPad = Math.max(0.0015, (mapBounds.north - mapBounds.south) * 0.08);
    const lngPad = Math.max(0.0015, (mapBounds.east - mapBounds.west) * 0.08);
    return allNearbyPlaces.filter((place) => (
      place.lat <= mapBounds.north + latPad &&
      place.lat >= mapBounds.south - latPad &&
      place.lng <= mapBounds.east + lngPad &&
      place.lng >= mapBounds.west - lngPad
    ));
  }, [allNearbyPlaces, mapBounds]);
  const labelAnchor = mapViewportCenter ?? marker ?? center;
  const nearbyPlacesToRender = useMemo(
    () => buildReadableNearbyPlaces(visibleNearbyPlaces, labelAnchor, currentZoom),
    [visibleNearbyPlaces, labelAnchor.lat, labelAnchor.lng, currentZoom]
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
  const searchTermSafe = searchTerm.trim();
  const shouldShowSearchDropdown = showSearchPanel && (
    isSearchingPlaces ||
    searchResults.length > 0 ||
    Boolean(searchError) ||
    searchTermSafe.length >= 3
  );

  const handleSelectSearchResult = (result: GeocodeSearchResult) => {
    setSearchTerm(result.address);
    setShowSearchPanel(false);
    setSearchResults([]);
    setSearchError('');
    if (onMapClick) onMapClick({ lat: result.lat, lng: result.lng });
  };
  const handleMapSelection = (coords: LatLngPoint) => {
    setShowSearchPanel(false);
    if (onMapClick) onMapClick(coords);
  };

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
    const query = searchTerm.trim();
    if (query.length < 3) {
      setSearchResults([]);
      setSearchError('');
      setIsSearchingPlaces(false);
      return;
    }

    const anchor = mapViewportCenter ?? marker ?? center;
    const controller = new AbortController();
    const debounceId = window.setTimeout(() => {
      setIsSearchingPlaces(true);
      setSearchError('');
      void searchGeocodePlaces(query, {
        limit: 8,
        nearLat: anchor?.lat,
        nearLng: anchor?.lng,
        signal: controller.signal,
      })
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }
          setSearchResults(results);
          if (results.length === 0) {
            setSearchError('No encontramos resultados para esa busqueda.');
          }
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }
          setSearchResults([]);
          setSearchError('No se pudo buscar en este momento.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearchingPlaces(false);
          }
        });
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(debounceId);
    };
  }, [searchTerm, mapViewportCenter?.lat, mapViewportCenter?.lng, marker?.lat, marker?.lng, center.lat, center.lng]);

  useEffect(() => {
    const primaryAnchor = mapViewportCenter ?? marker ?? center;
    if (!primaryAnchor) {
      setNearbyPlaces([]);
      return;
    }
    const roundedAnchor = {
      lat: Number(primaryAnchor.lat.toFixed(3)),
      lng: Number(primaryAnchor.lng.toFixed(3)),
    };
    const nearbyFetchKey = `${roundedAnchor.lat}:${roundedAnchor.lng}:${Math.floor(currentZoom)}`;
    if (lastNearbyFetchKey === nearbyFetchKey) {
      return;
    }
    setLastNearbyFetchKey(nearbyFetchKey);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 18000);
    setIsLoadingNearbyPlaces(true);
    setIsHydratingNearbyPlaces(false);

    const quickAnchors = buildViewportFetchAnchors(roundedAnchor, mapBounds, currentZoom);
    const sideQuickAnchors = quickAnchors.slice(1, Math.min(4, quickAnchors.length));
    void (async () => {
      try {
        // Prioritize one fast request from center so labels appear quickly.
        const centerQuick = await fetchNearbyPlaces(
          roundedAnchor.lat,
          roundedAnchor.lng,
          72,
          controller.signal,
          'quick'
        ).catch(() => []);
        if (controller.signal.aborted) {
          return;
        }
        let mergedCount = centerQuick.length;
        if (centerQuick.length > 0) {
          setNearbyPlaces((prev) => mergeNearbyPlaceCollections(
            prev,
            centerQuick.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng }))
          ));
        }
        setIsLoadingNearbyPlaces(false);

        // Only query additional anchors when center is sparse.
        if (mergedCount < 36 && sideQuickAnchors.length > 0) {
          setIsHydratingNearbyPlaces(true);
          const sideQuickGroups = await Promise.all(
            sideQuickAnchors.map((anchor) => (
              fetchNearbyPlaces(anchor.lat, anchor.lng, 54, controller.signal, 'quick').catch(() => [])
            ))
          );
          if (controller.signal.aborted) {
            return;
          }
          const sideQuickPlaces = sideQuickGroups.flat();
          mergedCount += sideQuickPlaces.length;
          if (sideQuickPlaces.length > 0) {
            setNearbyPlaces((prev) => mergeNearbyPlaceCollections(
              prev,
              sideQuickPlaces.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng }))
            ));
          }
        }

        // Deep hydration only when still sparse after quick passes.
        if (mergedCount < 90) {
          setIsHydratingNearbyPlaces(true);
          const fullAnchors = [roundedAnchor, ...sideQuickAnchors.slice(0, 1)];
          const fullGroups = await Promise.all(
            fullAnchors.map((anchor) => (
              fetchNearbyPlaces(anchor.lat, anchor.lng, 180, controller.signal, 'full').catch(() => [])
            ))
          );
          if (controller.signal.aborted) {
            return;
          }
          const fullPlaces = fullGroups.flat();
          if (fullPlaces.length > 0) {
            setNearbyPlaces((prev) => mergeNearbyPlaceCollections(
              prev,
              fullPlaces.map((place) => ({ name: place.name, lat: place.lat, lng: place.lng }))
            ));
          }
        }
      } finally {
        setIsLoadingNearbyPlaces(false);
        setIsHydratingNearbyPlaces(false);
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    mapViewportCenter?.lat,
    mapViewportCenter?.lng,
    marker?.lat,
    marker?.lng,
    center.lat,
    center.lng,
    mapBounds,
    currentZoom,
    lastNearbyFetchKey,
  ]);

  useEffect(() => {
    if (currentZoom < 13) {
      setShowNearbyPanel(false);
    }
  }, [currentZoom]);

  useEffect(() => {
    if (currentZoom < 12 || isLoadingNearbyPlaces || isHydratingNearbyPlaces || nearbyPlacesToRender.length > 0) {
      return;
    }
    const anchor = mapViewportCenter ?? marker ?? center;
    if (!anchor) {
      return;
    }
    const hydrationKey = `${anchor.lat.toFixed(3)}:${anchor.lng.toFixed(3)}:${Math.floor(currentZoom)}`;
    if (lastReferenceHydrationKey === hydrationKey) {
      return;
    }
    setLastReferenceHydrationKey(hydrationKey);

    const controller = new AbortController();
    let isActive = true;
    const timeoutId = window.setTimeout(() => controller.abort(), 9500);
    setIsLoadingReferencePlaces(true);
    void searchGeocodePlaces('__any__', {
      limit: 64,
      nearLat: anchor.lat,
      nearLng: anchor.lng,
      bounds: mapBounds ?? undefined,
      bounded: Boolean(mapBounds),
      signal: controller.signal,
    })
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        const referencePlaces = results
          .filter((result) => !Number.isFinite(Number(result.distance)) || Number(result.distance) <= 16000)
          .map((result) => ({ name: result.name, lat: result.lat, lng: result.lng }));
        if (referencePlaces.length > 0) {
          setNearbyPlaces((prev) => mergeNearbyPlaceCollections(prev, referencePlaces));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingReferencePlaces(false);
        }
        window.clearTimeout(timeoutId);
      });

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    currentZoom,
    isLoadingNearbyPlaces,
    isHydratingNearbyPlaces,
    nearbyPlacesToRender.length,
    mapViewportCenter?.lat,
    mapViewportCenter?.lng,
    marker?.lat,
    marker?.lng,
    center.lat,
    center.lng,
    mapBounds?.north,
    mapBounds?.south,
    mapBounds?.east,
    mapBounds?.west,
    lastReferenceHydrationKey,
  ]);

  return (
    <div className="relative h-full w-full">
      {showSearchControl ? (
        <div className="pointer-events-auto absolute left-3 top-3 z-[1100] w-[min(33rem,calc(100%-6.5rem))] sm:w-[min(34rem,calc(100%-14rem))]">
          <div className="rounded-2xl border border-slate-200/95 bg-white/95 p-1.5 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
              <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.04 6.04a7.5 7.5 0 0 0 10.61 10.61Z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setShowSearchPanel(true);
                }}
                onFocus={() => setShowSearchPanel(true)}
                placeholder="Buscar empresa, calle o direccion..."
                className="w-full border-0 bg-transparent p-0 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
              />
              {isSearchingPlaces ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
              ) : null}
            </div>
            <p className="px-1.5 pt-1 text-[10px] text-slate-500">Escribe 3 letras o mas y elige una opcion para mover el mapa.</p>
            {shouldShowSearchDropdown ? (
              <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {searchResults.map((result) => (
                  <button
                    key={`${result.name}:${result.lat.toFixed(6)}:${result.lng.toFixed(6)}`}
                    type="button"
                    onClick={() => handleSelectSearchResult(result)}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-sky-50"
                  >
                    <p className="text-xs font-semibold text-slate-800">{result.name}</p>
                    <p className="truncate text-[10px] text-slate-500">{result.address}</p>
                    {formatSearchDistance(result.distance) ? (
                      <p className="text-[10px] font-medium text-sky-700">{formatSearchDistance(result.distance)} desde el punto actual</p>
                    ) : null}
                  </button>
                ))}
                {searchError && !isSearchingPlaces && searchResults.length === 0 ? (
                  <p className="px-3 py-2 text-[10px] text-amber-700">{searchError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
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
        <div className="pointer-events-none absolute left-3 top-[92px] z-[1000] inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-lg backdrop-blur">
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
        <MapViewWatcher
          onZoomChange={setCurrentZoom}
          onBoundsChange={setMapBounds}
          onCenterChange={setMapViewportCenter}
        />
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
        {onMapClick ? <MapClickCapture onSelect={handleMapSelection} /> : null}
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
      {currentZoom >= 12 && !isLoadingNearbyPlaces && !isLoadingReferencePlaces && nearbyPlacesToRender.length === 0 && fallbackNearbyNamesSafe.length === 0 ? (
        <div className="absolute bottom-7 right-3 z-[1000] rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow">
          Sin etiquetas de empresas en esta zona, intentando referencias cercanas
        </div>
      ) : null}
      {currentZoom >= 12 && (isLoadingNearbyPlaces || isHydratingNearbyPlaces || isLoadingReferencePlaces) ? (
        <div className="absolute bottom-16 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/95 px-3 py-1.5 text-[10px] font-medium text-sky-700 shadow">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
          {isHydratingNearbyPlaces
            ? 'Cargando mas empresas...'
            : isLoadingReferencePlaces
              ? 'Buscando referencias de la zona...'
              : 'Buscando empresas cercanas...'}
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
