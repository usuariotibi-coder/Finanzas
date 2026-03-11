import { useEffect, useRef, useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Viatico, DestinoPais, VehicleAssignment, VehicleConditionChecklist, Vehicle, SolicitudViaje, Proyecto } from '../../types';
import { getProyectos } from '../../components/common/ProyectoSelector';
import ProyectoSelector from '../../components/common/ProyectoSelector';
import GSActivitySelector from '../../components/common/GSActivitySelector';
import { GS_ACTIVITY_OTHER_ID, getActivityById } from '../../data/gsActivities';
import {
  createFactura,
  createFlotillaAsignacion,
  createViaje,
  createViatico,
  deleteFlotillaAsignacion,
  deleteViaje,
  deleteViatico,
  fetchFlotillaAsignaciones,
  fetchProyectos,
  syncCoreAppData,
  uploadFlotillaEntregaFotos,
  updateFlotillaAsignacion,
  updateViatico,
} from '../../utils/backendSync';
import { API_ROOT } from '../../utils/api';
import { formatProyectoLabel } from '../../utils/proyectoLabel';
import { clearAppStorage } from '../../utils/storage';
import { getViaticoGastadoKpi } from '../../utils/viaticoMetrics';
import {
  getLatestViaticoExtensionResolution,
  getPendingViaticoExtension,
  withPendingViaticoExtension,
} from '../../utils/viaticoExtensions';
import { fetchNearbyPlaces } from '../../utils/nearbyPlaces';
import LeafletDestinationMap from '../../components/common/LeafletDestinationMap';

const VEHICLE_ASSIGNMENTS_STORAGE_KEY = 'vehicle_assignments_data';
const MS_POR_DIA = 1000 * 60 * 60 * 24;
const VEHICLE_DESTINATION_MAP_CENTER: [number, number] = [20.6597, -103.3496];
const SOLICITAR_VEHICULO_INITIAL_FORM = {
  proyectoId: '',
  origen: '',
  destino: '',
  motivo: '',
  fechaInicio: '',
  fechaFin: '',
  proposito: 'operaciones' as 'operaciones' | 'visita' | 'viaje',
  requiereGasolina: false,
};

type VehicleMapPoint = { lat: number; lng: number };
const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const toUniqueTextParts = (parts: Array<string | undefined | null>) => {
  const seen = new Set<string>();
  return parts
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      const normalized = normalizeText(value);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};

const joinUniqueTextParts = (parts: Array<string | undefined | null>) => toUniqueTextParts(parts).join(', ');

const isLikelyBusinessName = (name: string) => {
  const normalized = normalizeText(name);
  if (!normalized) {
    return false;
  }
  if (/^(calle|av|avenida|blvd|boulevard|carretera|camino|autopista|ruta)\b/.test(normalized)) {
    return false;
  }
  return true;
};

type VehicleDestinationDetails = {
  poi?: string;
  road?: string;
  industrial?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  nearbyPlaces?: string[];
  nearbyPoints?: Array<{ name: string; lat: number; lng: number }>;
};

type NearbyPlaceCandidate = {
  name: string;
  distance: number;
  lat: number;
  lng: number;
};

const dedupeNearbyPlaceCandidates = (places: NearbyPlaceCandidate[], limit = 140): NearbyPlaceCandidate[] => {
  const seen = new Set<string>();
  const unique: NearbyPlaceCandidate[] = [];
  for (const place of places) {
    const normalized = normalizeText(place.name)
      .replace(/\b(sa de cv|s a de c v|s de rl de cv|s de rl|de cv|sa|sc|ac|inc|llc)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(place);
    if (unique.length >= limit) {
      break;
    }
  }
  return unique;
};

const fetchNearbyPlaceCandidates = async (lat: number, lng: number, signal?: AbortSignal): Promise<NearbyPlaceCandidate[]> => {
  try {
    const places = await fetchNearbyPlaces(lat, lng, 220, signal);
    const normalized = places
      .filter((item) => isLikelyBusinessName(item.name))
      .map((item) => ({
        name: item.name.trim(),
        distance: Number.isFinite(Number(item.distance)) ? Number(item.distance) : Number.POSITIVE_INFINITY,
        lat: Number(item.lat),
        lng: Number(item.lng),
      }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .sort((a, b) => a.distance - b.distance);
    return dedupeNearbyPlaceCandidates(normalized);
  } catch {
    return [];
  }
};

const normalizeNearbyPoints = (
  points: Array<{ name?: string; lat?: number; lng?: number }>
): Array<{ name: string; lat: number; lng: number }> => {
  const unique = new Map<string, { name: string; lat: number; lng: number }>();
  points.forEach((point) => {
    const name = String(point.name || '').trim();
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const key = `${normalizeText(name)}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
    if (!unique.has(key)) {
      unique.set(key, { name, lat, lng });
    }
  });
  return Array.from(unique.values());
};

const GEOCODE_API_BASE = `${API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '')}/api/geocode`;
const reverseGeocodeCache = new Map<string, ReverseGeocodeResult>();

type ReverseGeocodeResult = {
  formatted_address?: string;
  details?: Partial<VehicleDestinationDetails>;
  nearby_places?: string[];
  nearby_points?: Array<{ name?: string; lat?: number; lng?: number }>;
};

type NominatimReverseResponse = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

const resolveWithTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
  let timeoutHandle: number | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutHandle !== null) {
    window.clearTimeout(timeoutHandle);
  }
  return result;
};

const reverseGeocodeDestination = async (
  lat: number,
  lng: number,
  signal?: AbortSignal,
  includeNearby = false
): Promise<ReverseGeocodeResult | null> => {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(`${cacheKey}:${includeNearby ? '1' : '0'}`);
  if (cached) {
    return cached;
  }
  const url =
    `${GEOCODE_API_BASE}/reverse/?lat=${encodeURIComponent(String(lat))}` +
    `&lng=${encodeURIComponent(String(lng))}&include_nearby=${includeNearby ? '1' : '0'}`;
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'omit', signal });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as ReverseGeocodeResult;
    const hasNearbyData = Boolean((payload?.nearby_places || []).length || (payload?.nearby_points || []).length);
    if (payload?.formatted_address && (!includeNearby || hasNearbyData)) {
      reverseGeocodeCache.set(`${cacheKey}:${includeNearby ? '1' : '0'}`, payload);
    }
    return payload;
  } catch {
    return null;
  }
};

const reverseGeocodeDirectNominatim = async (lat: number, lng: number, signal?: AbortSignal): Promise<ReverseGeocodeResult | null> => {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(`${cacheKey}:0`);
  if (cached) {
    return cached;
  }
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18` +
    `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&accept-language=es`;
  try {
    const response = await fetch(url, { method: 'GET', signal });
    if (!response.ok) {
      return null;
    }
    const nominatimPayload = (await response.json()) as NominatimReverseResponse;
    const address = nominatimPayload.address ?? {};
    const road = address.road || address.pedestrian || address.footway || address.path || address.highway || '';
    const industrial = address.industrial || address.commercial || '';
    const neighborhood = address.neighbourhood || address.suburb || address.quarter || address.hamlet || '';
    const city = address.city || address.town || address.village || address.municipality || address.county || '';
    const state = address.state || '';
    const postcode = address.postcode || '';
    const country = address.country || '';
    const formattedAddress =
      joinUniqueTextParts([road, industrial, neighborhood, city, state, postcode, country]) ||
      String(nominatimPayload.display_name || '').trim();

    if (!formattedAddress) {
      return null;
    }
    const reversePayload: ReverseGeocodeResult = {
      formatted_address: formattedAddress,
      details: {
        road,
        industrial,
        neighborhood,
        city,
        state,
        postcode,
        country,
      },
      nearby_places: [],
    };
    reverseGeocodeCache.set(`${cacheKey}:0`, reversePayload);
    return reversePayload;
  } catch {
    return null;
  }
};

function VehicleDestinationLayeredMap({
  center,
  selectedPoint,
  destinationText,
  destinationDetails,
  onSelect,
  compact = false,
}: {
  center: [number, number];
  selectedPoint: VehicleMapPoint | null;
  destinationText: string;
  destinationDetails: VehicleDestinationDetails | null;
  onSelect: (coords: VehicleMapPoint) => void;
  compact?: boolean;
}) {
  const mapCenter = selectedPoint ?? { lat: center[0], lng: center[1] };
  const markerTitle = destinationDetails?.poi || destinationDetails?.road || 'Destino seleccionado';
  const markerSubtitle =
    destinationText ||
    (selectedPoint ? 'Punto seleccionado en el mapa' : '');

  return (
    <LeafletDestinationMap
      center={mapCenter}
      marker={selectedPoint}
      markerTitle={markerTitle}
      markerSubtitle={markerSubtitle}
      fallbackNearbyNames={destinationDetails?.nearbyPlaces || []}
      externalNearbyPlaces={destinationDetails?.nearbyPoints || []}
      defaultZoom={compact ? 15 : 17}
      fallbackZoom={5}
      onMapClick={onSelect}
    />
  );
}

const parseDateOnly = (value: string) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    const localDate = new Date(year, month - 1, day);
    if (Number.isNaN(localDate.getTime())) {
      return null;
    }
    return localDate;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const formatDateOnlyMx = (value: string) => {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return value;
  }
  return parsed.toLocaleDateString('es-MX');
};

const calcularDiasViaje = (fechaInicio: string, fechaFin: string) => {
  if (!fechaInicio || !fechaFin) {
    return 0;
  }

  const inicio = parseDateOnly(fechaInicio);
  const fin = parseDateOnly(fechaFin);
  if (!inicio || !fin || fin < inicio) {
    return 0;
  }

  return Math.floor((fin.getTime() - inicio.getTime()) / MS_POR_DIA) + 1;
};

const calcularDiasExtension = (fechaFinActual: string, nuevaFechaFin: string) => {
  if (!fechaFinActual || !nuevaFechaFin) {
    return 0;
  }

  const finActual = parseDateOnly(fechaFinActual);
  const finNuevo = parseDateOnly(nuevaFechaFin);
  if (!finActual || !finNuevo || finNuevo <= finActual) {
    return 0;
  }

  return Math.floor((finNuevo.getTime() - finActual.getTime()) / MS_POR_DIA);
};

const toDateInputFormat = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getExtensionMinDate = (fechaFinActual: string) => {
  if (!fechaFinActual) {
    return '';
  }
  const currentEndDate = parseDateOnly(fechaFinActual);
  if (!currentEndDate) {
    return '';
  }
  currentEndDate.setDate(currentEndDate.getDate() + 1);
  return toDateInputFormat(currentEndDate);
};

const getVehicleAssignments = (): VehicleAssignment[] => {
  const stored = localStorage.getItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as VehicleAssignment[];
    } catch {
      // ignore parse errors and fall back to empty
    }
  }
  return [];
};

const dedupeAssignmentsById = (items: VehicleAssignment[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = String(item.id || '').trim();
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
};

interface GastoDocumento {
  id: string;
  viaticoId: string;
  tipo: 'completo' | 'sin_xml';
  descripcion: string;
  monto: number;
  pdfName?: string;
  xmlName?: string;
  ticketName?: string;
  fecha: string;
}

interface GastoArchivos {
  pdf?: File | null;
  xml?: File | null;
  ticket?: File | null;
}

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: 'danger' | 'info';
}

interface UploadDocumentosSummary {
  totalGastos: number;
  montoTotal: number;
}

const parseCurrencyAmount = (value: string): number => {
  const raw = String(value || '')
    .trim()
    .replace(/\$/g, '')
    .replace(/\s+/g, '');
  if (!raw) {
    return Number.NaN;
  }

  let normalized = raw;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount === 1 && /,\d{1,2}$/.test(normalized)) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const getXmlAttributeValue = (node: Element | null, attributeName: string): string => {
  if (!node) {
    return '';
  }
  const wanted = attributeName.toLowerCase();
  for (const attribute of Array.from(node.attributes)) {
    if (attribute.name.toLowerCase() === wanted) {
      return attribute.value;
    }
  }
  return '';
};

const findXmlNodeByName = (xmlDoc: Document, tagName: string): Element | null => {
  const wanted = tagName.toLowerCase();
  return Array.from(xmlDoc.getElementsByTagName('*')).find((node) => {
    const raw = String(node.tagName || '');
    const normalized = raw.includes(':') ? raw.split(':').pop() || raw : raw;
    return normalized.toLowerCase() === wanted;
  }) || null;
};

const parseCfdiAmountFromXmlFile = async (file: File): Promise<number> => {
  try {
    const xmlText = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      return Number.NaN;
    }
    const comprobante = findXmlNodeByName(xmlDoc, 'Comprobante') || xmlDoc.documentElement;
    const totalRaw = getXmlAttributeValue(comprobante, 'Total');
    return parseCurrencyAmount(totalRaw);
  } catch {
    return Number.NaN;
  }
};

export default function UsuarioView() {
  const { user } = useAuth();
  const isStaffOperator = user?.role === 'staff' && normalizeText(user?.category || '') === 'operador';
  const canCreatePortalRequests = !isStaffOperator;
  const [viaticos, setViaticos] = useLocalStorageState<Viatico[]>('usuario:viaticos', []);
  const [viaticoSeleccionado, setViaticoSeleccionado] = useLocalStorageState<string | null>('usuario:viaticoSeleccionado', null);
  const [filtro, setFiltro] = useState<'todos' | 'activos' | 'completados'>('activos');
  const [solicitudesViaje, setSolicitudesViaje] = useLocalStorageState<SolicitudViaje[]>('usuario:solicitudesViaje', []);

  // Estado para nuevo viático
  const [showModalNuevoViatico, setShowModalNuevoViatico] = useLocalStorageState('usuario:showModalNuevoViatico', false);
  const [formNuevoViatico, setFormNuevoViatico] = useLocalStorageState('usuario:formNuevoViatico', {
    proyectoId: '',
    gsActivityId: null as number | null,
    motivo: '',
    origen: 'Queretaro',
    destino: '',
    destinoPais: 'Mexico' as DestinoPais,
    tipoViatico: 'efectifintech' as 'efectifintech' | 'amex' | 'mixto',
    fechaInicio: '',
    fechaFin: '',
    desayunos: 0,
    comidas: 0,
    cenas: 0,
  });

  // Estado para documentos
  const [gastos, setGastos] = useLocalStorageState<GastoDocumento[]>('usuario:gastos', []);
  const [gastoFiles, setGastoFiles] = useState<Record<string, GastoArchivos>>({});
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [descripcionGasto, setDescripcionGasto] = useState('');
  const [montoGasto, setMontoGasto] = useState('');
  const [montoGastoBloqueado, setMontoGastoBloqueado] = useState(false);

  // Estado para vehículos
  const [vehicles] = useLocalStorageState<Vehicle[]>('usuario:vehicles', []);
  const [vehicleAssignments, setVehicleAssignments] = useState<VehicleAssignment[]>(getVehicleAssignments);
  const [showModalSolicitarVehiculo, setShowModalSolicitarVehiculo] = useLocalStorageState('usuario:showModalSolicitarVehiculo', false);
  const [showModalRecibirVehiculo, setShowModalRecibirVehiculo] = useLocalStorageState('usuario:showModalRecibirVehiculo', false);
  const [showModalDevolverVehiculo, setShowModalDevolverVehiculo] = useLocalStorageState('usuario:showModalDevolverVehiculo', false);
  const [showVehicleReturnSuccess, setShowVehicleReturnSuccess] = useLocalStorageState('usuario:showVehicleReturnSuccess', false);
  const [assignmentSeleccionado, setAssignmentSeleccionado] = useLocalStorageState<string | null>('usuario:assignmentSeleccionado', null);
  const [showNuevoViaticoErrors, setShowNuevoViaticoErrors] = useState(false);
  const [showSolicitarVehiculoErrors, setShowSolicitarVehiculoErrors] = useState(false);
  const [showSolicitarViajeErrors, setShowSolicitarViajeErrors] = useState(false);
  const [showRecibirErrors, setShowRecibirErrors] = useState(false);
  const [showDevolverErrors, setShowDevolverErrors] = useState(false);
  const [showGastoDocumentoErrors, setShowGastoDocumentoErrors] = useState(false);
  const [showSubirDocumentosErrors, setShowSubirDocumentosErrors] = useState(false);
  const [isSavingExtension, setIsSavingExtension] = useState(false);
  const [isSubmittingSolicitarVehiculo, setIsSubmittingSolicitarVehiculo] = useState(false);
  const [hiddenViaticoCards, setHiddenViaticoCards] = useLocalStorageState<string[]>('usuario:hiddenViaticoCards', []);
  const [hiddenVehiculoCards, setHiddenVehiculoCards] = useLocalStorageState<string[]>('usuario:hiddenVehiculoCards', []);
  const [hiddenViajeCards, setHiddenViajeCards] = useLocalStorageState<string[]>('usuario:hiddenViajeCards', []);
  const [deletingCardKey, setDeletingCardKey] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isSubiendoDocumentos, setIsSubiendoDocumentos] = useState(false);
  const [uploadDocumentosSummary, setUploadDocumentosSummary] = useState<UploadDocumentosSummary | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const confirmResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const xmlAmountParseRef = useRef(0);
  const destinoVehiculoSelectionRef = useRef(0);
  const destinoVehiculoAbortRef = useRef<AbortController | null>(null);
  const skipSolicitarVehiculoResetRef = useRef(false);
  const solicitarVehiculoSubmitLockRef = useRef(false);

  useEffect(() => () => destinoVehiculoAbortRef.current?.abort(), []);

  const saveVehicleAssignments = (assignments: VehicleAssignment[]) => {
    const normalizedAssignments = dedupeAssignmentsById(assignments);
    setVehicleAssignments(normalizedAssignments);
    localStorage.setItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(normalizedAssignments));
    window.dispatchEvent(new CustomEvent('app-storage-change', { detail: { key: VEHICLE_ASSIGNMENTS_STORAGE_KEY } }));
  };

  useEffect(() => {
    let isActive = true;

    const loadAssignments = async () => {
      try {
        const remoteAssignments = await fetchFlotillaAsignaciones();
        if (!isActive) {
          return;
        }
        const normalizedAssignments = dedupeAssignmentsById(remoteAssignments);
        setVehicleAssignments(normalizedAssignments);
        localStorage.setItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(normalizedAssignments));
        window.dispatchEvent(new CustomEvent('app-storage-change', { detail: { key: VEHICLE_ASSIGNMENTS_STORAGE_KEY } }));
      } catch {
        // Keep local cache if backend is temporarily unavailable.
      }
    };

    void loadAssignments();
    return () => {
      isActive = false;
    };
  }, []);

  const [formSolicitudVehiculo, setFormSolicitudVehiculo] = useLocalStorageState('usuario:formSolicitudVehiculo', {
    ...SOLICITAR_VEHICULO_INITIAL_FORM,
  });
  const [showDestinoVehiculoMap, setShowDestinoVehiculoMap] = useState(false);
  const [showDestinoVehiculoMapExpanded, setShowDestinoVehiculoMapExpanded] = useState(false);
  const [destinoVehiculoCoords, setDestinoVehiculoCoords] = useState<VehicleMapPoint | null>(null);
  const [destinoVehiculoDetalles, setDestinoVehiculoDetalles] = useState<VehicleDestinationDetails | null>(null);
  const [isResolviendoDestinoVehiculo, setIsResolviendoDestinoVehiculo] = useState(false);
  const [destinoVehiculoMapMensaje, setDestinoVehiculoMapMensaje] = useState('');

  useEffect(() => {
    if (!showModalSolicitarVehiculo) {
      return;
    }
    if (skipSolicitarVehiculoResetRef.current) {
      skipSolicitarVehiculoResetRef.current = false;
      return;
    }
    destinoVehiculoSelectionRef.current += 1;
    destinoVehiculoAbortRef.current?.abort();
    destinoVehiculoAbortRef.current = null;
    setFormSolicitudVehiculo({ ...SOLICITAR_VEHICULO_INITIAL_FORM });
    setShowSolicitarVehiculoErrors(false);
    setShowDestinoVehiculoMap(false);
    setShowDestinoVehiculoMapExpanded(false);
    setDestinoVehiculoCoords(null);
    setDestinoVehiculoDetalles(null);
    setIsResolviendoDestinoVehiculo(false);
    setDestinoVehiculoMapMensaje('');
  }, [showModalSolicitarVehiculo, setFormSolicitudVehiculo]);

  // Estado para solicitud de viaje
  const [showModalSolicitarViaje, setShowModalSolicitarViaje] = useLocalStorageState('usuario:showModalSolicitarViaje', false);
  const [formSolicitudViaje, setFormSolicitudViaje] = useLocalStorageState('usuario:formSolicitudViaje', {
    proyectoId: '',
    motivo: '',
    origen: '',
    destino: '',
    fechaInicio: '',
    fechaFin: '',
    necesitaAvion: false,
    necesitaCamion: false,
    necesitaHotel: false,
    detallesAvion: '',
    detallesCamion: '',
    detallesHotel: '',
  });

  // Estado para extender viaje
  const [showModalExtenderViaje, setShowModalExtenderViaje] = useLocalStorageState('usuario:showModalExtenderViaje', false);
  const [viaticoParaExtender, setViaticoParaExtender] = useLocalStorageState<Viatico | null>('usuario:viaticoParaExtender', null);
  const [nuevaFechaFin, setNuevaFechaFin] = useLocalStorageState('usuario:nuevaFechaFin', '');
  const [alimentosExtension, setAlimentosExtension] = useState({
    desayunos: 0,
    comidas: 0,
    cenas: 0,
  });

  const [checklistRecepcion, setChecklistRecepcion] = useLocalStorageState<VehicleConditionChecklist>('usuario:checklistRecepcion', {
    exterior: { carroceria: 'bueno', pintura: 'bueno', llantas: 'bueno', cristales: 'bueno', espejos: 'bueno' },
    interior: { asientos: 'bueno', tablero: 'bueno', tapiceria: 'bueno', limpieza: 'bueno' },
    mecanico: { motor: 'bueno', frenos: 'bueno', luces: 'bueno', aire_acondicionado: 'bueno' },
    accesorios: { gato: true, llave_cruz: true, triangulo_seguridad: true, extintor: true, llanta_refaccion: true },
    nivelCombustible: 'lleno',
    observaciones: '',
  });

  const [checklistEntrega, setChecklistEntrega] = useLocalStorageState<VehicleConditionChecklist>('usuario:checklistEntrega', {
    exterior: { carroceria: 'bueno', pintura: 'bueno', llantas: 'bueno', cristales: 'bueno', espejos: 'bueno' },
    interior: { asientos: 'bueno', tablero: 'bueno', tapiceria: 'bueno', limpieza: 'bueno' },
    mecanico: { motor: 'bueno', frenos: 'bueno', luces: 'bueno', aire_acondicionado: 'bueno' },
    accesorios: { gato: true, llave_cruz: true, triangulo_seguridad: true, extintor: true, llanta_refaccion: true },
    nivelCombustible: 'lleno',
    observaciones: '',
  });

  const [fotoRecepcion, setFotoRecepcion] = useState<File[]>([]);
  const [fotoEntrega, setFotoEntrega] = useState<File[]>([]);
  const [kmInicial, setKmInicial] = useLocalStorageState<number>('usuario:kmInicial', 0);
  const [kmFinal, setKmFinal] = useLocalStorageState<number>('usuario:kmFinal', 0);

  const [proyectos, setProyectos] = useLocalStorageState<Proyecto[]>('proyectos_data', getProyectos());
  useEffect(() => {
    let isActive = true;

    const loadProjects = async () => {
      try {
        const remoteProjects = await fetchProyectos();
        if (!isActive || remoteProjects.length === 0) {
          return;
        }
        setProyectos(remoteProjects);
      } catch {
        // Keep cached projects if backend is temporarily unavailable.
      }
    };

    void loadProjects();
    return () => {
      isActive = false;
    };
  }, [setProyectos]);
  const totalAlimentos =
    formNuevoViatico.desayunos * 150 +
    formNuevoViatico.comidas * 200 +
    formNuevoViatico.cenas * 250;
  const diasViajeSugeridos = calcularDiasViaje(formNuevoViatico.fechaInicio, formNuevoViatico.fechaFin);
  const placeholderAlimentos = diasViajeSugeridos > 0 ? String(diasViajeSugeridos) : '0';
  const diasExtensionSugeridos = viaticoParaExtender
    ? calcularDiasExtension(viaticoParaExtender.fechaFin, nuevaFechaFin)
    : 0;
  const extensionMinDate = viaticoParaExtender ? getExtensionMinDate(viaticoParaExtender.fechaFin) : '';
  const placeholderAlimentosExtension = diasExtensionSugeridos > 0 ? String(diasExtensionSugeridos) : '0';
  const totalAlimentosExtensionSugeridos = diasExtensionSugeridos * (150 + 200 + 250);
  const totalAlimentosExtensionCapturados =
    alimentosExtension.desayunos * 150 +
    alimentosExtension.comidas * 200 +
    alimentosExtension.cenas * 250;
  const extensionPendienteModal = viaticoParaExtender
    ? getPendingViaticoExtension(viaticoParaExtender.comentarios)
    : null;
  const actividadSeleccionada = formNuevoViatico.gsActivityId ? getActivityById(formNuevoViatico.gsActivityId) : undefined;

  const resolveProyectoDisplay = (proyectoId?: string, proyectoNombre?: string) => {
    const normalizedProyectoId = normalizeText(proyectoId || '');
    const normalizedProyectoNombre = normalizeText(proyectoNombre || '');
    const proyecto = proyectos.find((item) => {
      const candidates = [item.id, item.codigo, item.nombre, item.cliente, item.descripcion]
        .map((value) => normalizeText(value || ''))
        .filter(Boolean);
      return (
        (normalizedProyectoId && candidates.includes(normalizedProyectoId)) ||
        (normalizedProyectoNombre && candidates.includes(normalizedProyectoNombre))
      );
    });
    const jobLabel = (proyecto?.codigo || '').trim() || formatProyectoLabel(undefined, proyectoId);
    return {
      jobLabel,
    };
  };
  const proyectoRequeridoViatico = actividadSeleccionada?.proyectoRequerido ?? true;
  const isOtroMotivo = formNuevoViatico.gsActivityId === GS_ACTIVITY_OTHER_ID;
  const isFormValid = Boolean(
    (!proyectoRequeridoViatico || formNuevoViatico.proyectoId) &&
      formNuevoViatico.gsActivityId !== null &&
      formNuevoViatico.motivo.trim() &&
      formNuevoViatico.origen.trim() &&
      formNuevoViatico.destino.trim() &&
      formNuevoViatico.fechaInicio &&
      formNuevoViatico.fechaFin &&
      totalAlimentos > 0
  );
  const assignmentSeleccionadoRecord = assignmentSeleccionado
    ? vehicleAssignments.find(a => a.id === assignmentSeleccionado)
    : null;
  const kmInicialAsignado = assignmentSeleccionadoRecord?.kmInicial ?? 0;
  const nuevoViaticoErrors = showNuevoViaticoErrors
    ? {
      proyectoId: proyectoRequeridoViatico && !formNuevoViatico.proyectoId ? 'Selecciona un proyecto.' : '',
      gsActivityId: formNuevoViatico.gsActivityId === null ? 'Selecciona el tipo de actividad.' : '',
      motivo: !formNuevoViatico.motivo.trim() ? 'Ingresa el motivo.' : '',
      origen: !formNuevoViatico.origen.trim() ? 'Ingresa el origen.' : '',
      destino: !formNuevoViatico.destino.trim() ? 'Ingresa el destino.' : '',
      fechaInicio: !formNuevoViatico.fechaInicio ? 'Selecciona la fecha de inicio.' : '',
      fechaFin: !formNuevoViatico.fechaFin ? 'Selecciona la fecha de fin.' : '',
      alimentos: totalAlimentos <= 0 ? 'Agrega al menos un alimento.' : '',
    }
    : {};
  const solicitarVehiculoErrors = showSolicitarVehiculoErrors
    ? {
      proyectoId: !formSolicitudVehiculo.proyectoId ? 'Selecciona un proyecto.' : '',
      origen: !formSolicitudVehiculo.origen.trim() ? 'Ingresa el origen.' : '',
      destino: !formSolicitudVehiculo.destino.trim() ? 'Ingresa el destino.' : '',
      fechaInicio: !formSolicitudVehiculo.fechaInicio ? 'Selecciona la fecha de inicio.' : '',
      motivo: !formSolicitudVehiculo.motivo.trim() ? 'Ingresa el motivo.' : '',
    }
    : {};
  const serviciosError = showSolicitarViajeErrors
    && !formSolicitudViaje.necesitaAvion
    && !formSolicitudViaje.necesitaCamion
    && !formSolicitudViaje.necesitaHotel
    ? 'Selecciona al menos un servicio.'
    : '';
  const solicitarViajeErrors = showSolicitarViajeErrors
    ? {
      proyectoId: !formSolicitudViaje.proyectoId ? 'Selecciona un proyecto.' : '',
      origen: !formSolicitudViaje.origen.trim() ? 'Ingresa el origen.' : '',
      destino: !formSolicitudViaje.destino.trim() ? 'Ingresa el destino.' : '',
      fechaInicio: !formSolicitudViaje.fechaInicio ? 'Selecciona la fecha de inicio.' : '',
      fechaFin: !formSolicitudViaje.fechaFin ? 'Selecciona la fecha de fin.' : '',
      motivo: !formSolicitudViaje.motivo.trim() ? 'Ingresa el motivo.' : '',
      servicios: serviciosError,
    }
    : {};
  const recibirErrors = showRecibirErrors
    ? {
      km: kmInicial <= 0 ? 'Ingresa el kilometraje inicial.' : '',
    }
    : {};
  const devolverErrors = showDevolverErrors
    ? {
      km: kmFinal <= 0
        ? 'Ingresa el kilometraje final.'
        : kmInicialAsignado > 0 && kmFinal < kmInicialAsignado
        ? 'El kilometraje final debe ser mayor o igual al inicial.'
        : '',
      foto: fotoEntrega.length === 0 ? 'Agrega al menos una foto.' : '',
    }
    : {};
  const gastoArchivoError = showGastoDocumentoErrors && !pdfFile && !ticketFile
    ? 'Agrega el PDF o el ticket.'
    : '';
  const gastoDescripcionError = showGastoDocumentoErrors && !descripcionGasto.trim()
    ? 'Agrega una descripcion del gasto.'
    : '';
  const montoGastoCapturado = parseCurrencyAmount(montoGasto);
  const gastoMontoError = showGastoDocumentoErrors && !xmlFile && (!Number.isFinite(montoGastoCapturado) || montoGastoCapturado <= 0)
    ? 'Agrega un monto mayor a 0 o sube el XML.'
    : '';
  const subirDocumentosError = showSubirDocumentosErrors && gastos.length === 0
    ? 'Agrega al menos un gasto.'
    : '';
  const resetExtensionState = () => {
    setShowModalExtenderViaje(false);
    setViaticoParaExtender(null);
    setNuevaFechaFin('');
    setAlimentosExtension({
      desayunos: 0,
      comidas: 0,
      cenas: 0,
    });
  };

  const showToast = (text: string, type: ToastType = 'success') => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }

    const id = Date.now();
    setToast({ id, text, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      toastTimeoutRef.current = null;
    }, 3500);
  };

  const handleSolicitarExtension = async () => {
    if (!canCreatePortalRequests) {
      showToast('Tu categoria no puede solicitar extensiones desde este portal.', 'info');
      return;
    }

    if (!viaticoParaExtender || !nuevaFechaFin || nuevaFechaFin <= viaticoParaExtender.fechaFin || isSavingExtension) {
      return;
    }

    if (getPendingViaticoExtension(viaticoParaExtender.comentarios)) {
      showToast('Ya existe una extension pendiente de aprobacion para este viatico.', 'info');
      return;
    }

    const viaticoId = viaticoParaExtender.id;
    const fechaFinActual = viaticoParaExtender.fechaFin;
    const fechaFinNueva = nuevaFechaFin;
    const extensionRequest = {
      requestId: `EXT-${Date.now()}`,
      requestedAt: new Date().toISOString(),
      requestedById: user ? String(user.id) : viaticoParaExtender.userId,
      requestedByName: user?.full_name || viaticoParaExtender.userName,
      fechaFinActual,
      nuevaFechaFin: fechaFinNueva,
      desayunos: alimentosExtension.desayunos,
      comidas: alimentosExtension.comidas,
      cenas: alimentosExtension.cenas,
      montoCapturado: totalAlimentosExtensionCapturados,
    };
    const comentariosConExtension = withPendingViaticoExtension(viaticoParaExtender.comentarios, extensionRequest);
    const payloadExtension: Partial<Viatico> = {
      comentarios: comentariosConExtension,
    };

    setIsSavingExtension(true);
    setViaticos((prev) =>
      prev.map((item) =>
        String(item.id) === String(viaticoId)
          ? {
              ...item,
              ...payloadExtension,
            }
          : item
      )
    );

    try {
      const persisted = await updateViatico(viaticoId, payloadExtension);
      setViaticos((prev) =>
        prev.map((item) =>
          String(item.id) === String(viaticoId)
            ? {
                ...item,
                ...persisted,
                ...payloadExtension,
              }
            : item
        )
      );
      void syncCoreAppData({ userId: persisted.userId || (user ? String(user.id) : undefined) }).catch(() => {});
      showToast('Solicitud de extension enviada al PM para aprobacion.', 'success');
      resetExtensionState();
    } catch (error) {
      showToast(
        error instanceof Error
          ? `${error.message}. Se guardo localmente y quedo pendiente para PM.`
          : 'No se pudo sincronizar con servidor. Se guardo localmente y quedo pendiente para PM.',
        'info'
      );
      resetExtensionState();
    } finally {
      setIsSavingExtension(false);
    }
  };

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  useEscapeKey(() => setShowModalNuevoViatico(false), showModalNuevoViatico);
  useEscapeKey(() => setShowModalSolicitarVehiculo(false), showModalSolicitarVehiculo);
  useEscapeKey(() => setShowModalRecibirVehiculo(false), showModalRecibirVehiculo);
  useEscapeKey(() => setShowModalDevolverVehiculo(false), showModalDevolverVehiculo);
  useEscapeKey(() => setShowModalSolicitarViaje(false), showModalSolicitarViaje);
  useEscapeKey(() => setShowDestinoVehiculoMapExpanded(false), showDestinoVehiculoMapExpanded);
  useEscapeKey(resetExtensionState, showModalExtenderViaje);
  useEscapeKey(() => setShowVehicleReturnSuccess(false), showVehicleReturnSuccess);
  useEscapeKey(() => setUploadDocumentosSummary(null), Boolean(uploadDocumentosSummary));
  useEscapeKey(() => {
    if (!confirmDialog) {
      return;
    }
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolver?.(false);
  }, Boolean(confirmDialog));

  const openConfirmDialog = ({
    title,
    message,
    confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar',
    tone = 'danger',
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmDialogState['tone'];
  }) =>
    new Promise<boolean>((resolve) => {
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
      }
      confirmResolverRef.current = resolve;
      setConfirmDialog({ title, message, confirmLabel, cancelLabel, tone });
    });

  const resolveConfirmDialog = (accepted: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolver?.(accepted);
  };

  const openDatePicker = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // Ignore browsers/contexts that require a stricter user gesture.
      }
    }
  };

  // Filtrar viáticos
  const isHiddenCard = (hiddenIds: string[], id: string) => hiddenIds.includes(String(id));
  const isCompletedViatico = (viatico: Viatico) => viatico.status === 'completado';
  const isCompletedVehiculo = (assignment: VehicleAssignment) => assignment.status === 'completado';
  const isCompletedViaje = (solicitud: SolicitudViaje) => solicitud.status === 'completado';
  const isViaticoActivo = (status: Viatico['status']) =>
    ['pendiente', 'aprobado', 'dispersado', 'en_viaje', 'viaje_finalizado', 'en_recuperacion'].includes(status);
  const isViaticoCompletado = (status: Viatico['status']) =>
    status === 'completado';
  const visibleViaticos = viaticos.filter((item) => !isHiddenCard(hiddenViaticoCards, item.id));
  const visibleVehicleAssignments = vehicleAssignments.filter((item) => !isHiddenCard(hiddenVehiculoCards, item.id));
  const visibleSolicitudesViaje = solicitudesViaje.filter((item) => !isHiddenCard(hiddenViajeCards, item.id));
  const totalViaticosActivos = visibleViaticos.filter(v => isViaticoActivo(v.status)).length;
  const totalViaticosCompletados = visibleViaticos.filter(v => isViaticoCompletado(v.status)).length;

  const viaticosFiltrados = visibleViaticos.filter(v => {
    if (filtro === 'activos') {
      return isViaticoActivo(v.status);
    }
    if (filtro === 'completados') {
      return isViaticoCompletado(v.status);
    }
    return true;
  });
  const getEstadoInfo = (status: Viatico['status']) => {
    const configs = {
      pendiente: { label: 'Pendiente de Aprobación', color: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
      aprobado: { label: 'Esperando dispersión', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
      rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: 'X' },
      dispersado: { label: 'Dispersado', color: 'bg-green-100 text-green-700', icon: 'OK' },
      en_viaje: { label: 'En Viaje', color: 'bg-purple-100 text-purple-700', icon: 'AIR' },
      viaje_finalizado: { label: 'Viaje Finalizado', color: 'bg-indigo-100 text-indigo-700', icon: 'FIN' },
      en_recuperacion: { label: 'Pendiente Recuperación', color: 'bg-orange-100 text-orange-700', icon: '$' },
      completado: { label: 'Completado', color: 'bg-gray-100 text-gray-700', icon: 'OK' },
    };
    return configs[status] || configs.pendiente;
  };

  const getProcesoViatico = (viatico: Viatico) => {
    if (viatico.status === 'aprobado' && (viatico.montoDispersado || 0) > 0) {
      return { texto: '2/6 Extension aprobada - pendiente dispersion adicional', avance: 33, barra: 'bg-blue-500' };
    }

    const procesos: Record<Viatico['status'], { texto: string; avance: number; barra: string }> = {
      pendiente: { texto: '1/6 Solicitud enviada', avance: 16, barra: 'bg-amber-500' },
      aprobado: { texto: '2/6 Aprobado por PM', avance: 33, barra: 'bg-blue-500' },
      dispersado: { texto: '3/6 Dispersado', avance: 50, barra: 'bg-sky-500' },
      en_viaje: { texto: '4/6 En viaje', avance: 66, barra: 'bg-indigo-500' },
      viaje_finalizado: { texto: '5/6 Cierre de viaje', avance: 83, barra: 'bg-violet-500' },
      en_recuperacion: { texto: '5/6 En recuperación', avance: 83, barra: 'bg-orange-500' },
      completado: { texto: '6/6 Completado', avance: 100, barra: 'bg-emerald-600' },
      rechazado: { texto: 'Proceso cerrado: Rechazado', avance: 100, barra: 'bg-rose-500' },
    };
    return procesos[viatico.status] ?? procesos.pendiente;
  };

  const getAccionBoton = (viatico: Viatico) => {
    if (viatico.status === 'dispersado' || viatico.status === 'viaje_finalizado') {
      const facturasCompletas = (viatico.montoGastado || 0) >= (viatico.montoDispersado || 0) * 0.9;
      return facturasCompletas
        ? { label: 'Documentos completos', color: 'bg-green-100 text-green-700', icon: 'OK', accion: 'ver' }
        : { label: 'Pendiente por subir facturas', color: 'bg-yellow-100 text-yellow-700', icon: 'DOC', accion: 'subir' };
    }
    if (viatico.status === 'aprobado') {
      return { label: 'Esperando dispersión', color: 'bg-blue-100 text-blue-700', icon: '⏳', accion: 'none' };
    }
    if (viatico.status === 'completado') {
      return { label: 'Documentos completos', color: 'bg-green-100 text-green-700', icon: 'OK', accion: 'ver' };
    }
    return { label: 'Ver detalles', color: 'bg-gray-100 text-gray-700', icon: 'i', accion: 'ver' };
  };

  const getVehiculoStatusIcon = (status: VehicleAssignment['status']) => {
    const icons: Record<VehicleAssignment['status'], string> = {
      solicitado: '⏳',
      asignado: 'PIN',
      activo: 'CAR',
      completado: 'FIN',
      rechazado: 'X',
    };
    return icons[status] ?? 'CAR';
  };

  const getProcesoVehiculo = (status: VehicleAssignment['status']) => {
    const procesos: Record<VehicleAssignment['status'], { texto: string; avance: number; barra: string }> = {
      solicitado: { texto: '1/4 Solicitud enviada', avance: 25, barra: 'bg-amber-500' },
      asignado: { texto: '2/4 Vehículo asignado', avance: 50, barra: 'bg-blue-500' },
      activo: { texto: '3/4 En uso', avance: 75, barra: 'bg-indigo-500' },
      completado: { texto: '4/4 Vehículo devuelto', avance: 100, barra: 'bg-emerald-600' },
      rechazado: { texto: 'Proceso cerrado: Rechazado', avance: 100, barra: 'bg-rose-500' },
    };
    return procesos[status] ?? procesos.solicitado;
  };

  const getViajeStatusIcon = (status: SolicitudViaje['status']) => {
    const icons = {
      pendiente: '⏳',
      en_proceso: 'PROC',
      confirmado: 'OK',
      rechazado: 'X',
      cancelado: 'X',
      completado: 'FIN',
    };
    return icons[status] || 'PROC';
  };

  const getProcesoViaje = (status: SolicitudViaje['status']) => {
    const procesos: Record<SolicitudViaje['status'], { texto: string; avance: number; barra: string }> = {
      pendiente: { texto: '1/4 Solicitud enviada', avance: 25, barra: 'bg-amber-500' },
      en_proceso: { texto: '2/4 Gestión de servicios', avance: 50, barra: 'bg-blue-500' },
      confirmado: { texto: '3/4 Confirmado', avance: 75, barra: 'bg-indigo-500' },
      completado: { texto: '4/4 Completado', avance: 100, barra: 'bg-emerald-600' },
      cancelado: { texto: 'Proceso cerrado: Cancelado', avance: 100, barra: 'bg-rose-500' },
      rechazado: { texto: 'Proceso cerrado: Rechazado', avance: 100, barra: 'bg-rose-500' },
    };
    return procesos[status] ?? procesos.pendiente;
  };

  const resetGastoDraft = () => {
    setPdfFile(null);
    setXmlFile(null);
    setTicketFile(null);
    setDescripcionGasto('');
    setMontoGasto('');
    setMontoGastoBloqueado(false);
    setShowGastoDocumentoErrors(false);
  };

  const resetSubirDocumentosFlow = () => {
    setViaticoSeleccionado(null);
    setGastos([]);
    setGastoFiles({});
    setShowSubirDocumentosErrors(false);
    resetGastoDraft();
  };

  const handleAccionClick = (viatico: Viatico, accion: string) => {
    if (accion === 'subir' || accion === 'ver') {
      setViaticoSeleccionado(viatico.id);
      setGastos([]);
      setGastoFiles({});
      setShowSubirDocumentosErrors(false);
      resetGastoDraft();
    }
  };

  const handleAgregarGasto = async () => {
    const descripcionCapturada = descripcionGasto.trim();
    let montoCapturado = parseCurrencyAmount(montoGasto);
    if ((!Number.isFinite(montoCapturado) || montoCapturado <= 0) && xmlFile) {
      montoCapturado = await parseCfdiAmountFromXmlFile(xmlFile);
    }

    if ((!pdfFile && !ticketFile) || !descripcionCapturada || !Number.isFinite(montoCapturado) || montoCapturado <= 0) {
      setShowGastoDocumentoErrors(true);
      if ((!Number.isFinite(montoCapturado) || montoCapturado <= 0) && xmlFile) {
        showToast('No se pudo leer el total del XML. Captura el monto manualmente.', 'error');
      }
      return;
    }

    const nuevoGasto: GastoDocumento = {
      id: `GASTO-${Date.now()}`,
      viaticoId: viaticoSeleccionado!,
      tipo: xmlFile ? 'completo' : 'sin_xml',
      descripcion: descripcionCapturada,
      monto: Number(montoCapturado.toFixed(2)),
      pdfName: pdfFile?.name,
      xmlName: xmlFile?.name,
      ticketName: ticketFile?.name,
      fecha: new Date().toISOString(),
    };

    setGastos([...gastos, nuevoGasto]);
    setGastoFiles((prev) => ({
      ...prev,
      [nuevoGasto.id]: {
        pdf: pdfFile,
        xml: xmlFile,
        ticket: ticketFile,
      },
    }));
    setShowSubirDocumentosErrors(false);
    resetGastoDraft();
  };

  const handleXmlFileSelection = async (file: File | null) => {
    xmlAmountParseRef.current += 1;
    setXmlFile(file);
    if (!file) {
      setMontoGastoBloqueado(false);
      return;
    }

    const requestId = xmlAmountParseRef.current + 1;
    xmlAmountParseRef.current = requestId;

    const montoDetectado = await parseCfdiAmountFromXmlFile(file);
    if (xmlAmountParseRef.current !== requestId) {
      return;
    }

    if (Number.isFinite(montoDetectado) && montoDetectado > 0) {
      setMontoGasto(montoDetectado.toFixed(2));
      setMontoGastoBloqueado(true);
      setShowGastoDocumentoErrors(false);
      return;
    }

    setMontoGastoBloqueado(false);
    showToast('No se pudo detectar el monto del XML. Puedes capturarlo manualmente.', 'info');
  };

  const handleSubirDocumentos = async () => {
    if (gastos.length === 0) {
      setShowSubirDocumentosErrors(true);
      return;
    }

    const currentUserId = user ? String(user.id) : undefined;
    const gastosSnapshot = [...gastos];
    const gastoFilesSnapshot = { ...gastoFiles };
    const gastosSinArchivos = gastosSnapshot.filter((gasto) => {
      const files = gastoFilesSnapshot[gasto.id];
      return !files || (!files.pdf && !files.ticket);
    });
    if (gastosSinArchivos.length > 0) {
      showToast('Hay gastos sin archivo para subir. Vuelve a agregarlos.', 'error');
      return;
    }
    const gastosSinMonto = gastosSnapshot.filter((gasto) => !Number.isFinite(gasto.monto) || gasto.monto <= 0);
    if (gastosSinMonto.length > 0) {
      showToast('Hay gastos sin monto. Capturalos nuevamente antes de subir.', 'error');
      return;
    }

    const montoTotal = gastosSnapshot.reduce((acc, gasto) => acc + (Number.isFinite(gasto.monto) ? gasto.monto : 0), 0);
    setIsSubiendoDocumentos(true);
    try {
      const baseTimestamp = Date.now();
      await Promise.all(gastosSnapshot.map((gasto, index) => {
        const files = gastoFilesSnapshot[gasto.id] || {};
        const monto = Number.isFinite(gasto.monto) ? gasto.monto : 0;
        const fechaFactura = parseDateOnly(gasto.fecha) || new Date();
        return createFactura({
          viaticoId: gasto.viaticoId,
          folio: `FAC-${baseTimestamp}-${index + 1}`,
          uuid: `PEND-${baseTimestamp}-${index + 1}`,
          rfc: 'XAXX010101000',
          razonSocial: gasto.descripcion || 'Gasto de viatico',
          fecha: toDateInputFormat(fechaFactura),
          subtotal: monto,
          iva: 0,
          total: monto,
          formaPago: 'NA',
          metodoPago: 'NA',
          archivoPdf: files.pdf || files.ticket || null,
          archivoXml: files.xml || null,
        });
      }));

      void syncCoreAppData({ userId: currentUserId }).catch(() => {});
      setUploadDocumentosSummary({
        totalGastos: gastosSnapshot.length,
        montoTotal: Number(montoTotal.toFixed(2)),
      });
      showToast(`${gastosSnapshot.length} gasto(s) subido(s) exitosamente`, 'success');
      resetSubirDocumentosFlow();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudieron subir los documentos.', 'error');
    } finally {
      setIsSubiendoDocumentos(false);
    }
  };

  const eliminarGasto = (gastoId: string) => {
    setGastos(gastos.filter(g => g.id !== gastoId));
    setGastoFiles((prev) => {
      const next = { ...prev };
      delete next[gastoId];
      return next;
    });
  };

  const viaticoActual = viaticos.find(v => v.id === viaticoSeleccionado);
  const proyectoActual = proyectos.find(p => p.id === viaticoActual?.proyectoId);

  const handleCrearNuevoViatico = async () => {
    if (!canCreatePortalRequests) {
      showToast('Tu categoria no puede solicitar viaticos desde este portal.', 'info');
      return;
    }
    if (!isFormValid) {
      setShowNuevoViaticoErrors(true);
      return;
    }

    const currentUserId = user ? String(user.id) : '';
    const snapshotFormNuevoViatico = { ...formNuevoViatico };
    const snapshotTotalAlimentos = totalAlimentos;

    setShowModalNuevoViatico(false);
    setFormNuevoViatico({
      proyectoId: '',
      gsActivityId: null,
      motivo: '',
      origen: 'Queretaro',
      destino: '',
      destinoPais: 'Mexico',
      tipoViatico: 'efectifintech',
      fechaInicio: '',
      fechaFin: '',
      desayunos: 0,
      comidas: 0,
      cenas: 0,
    });
    setShowNuevoViaticoErrors(false);

    try {
      const nuevoViatico = await createViatico({
        userId: currentUserId || undefined,
        proyectoId: snapshotFormNuevoViatico.proyectoId || undefined,
        gsActivityId: snapshotFormNuevoViatico.gsActivityId || undefined,
        motivo: snapshotFormNuevoViatico.motivo,
        origen: snapshotFormNuevoViatico.origen,
        destino: snapshotFormNuevoViatico.destino,
        destinoPais: snapshotFormNuevoViatico.destinoPais,
        tipoViatico: snapshotFormNuevoViatico.tipoViatico,
        fechaInicio: snapshotFormNuevoViatico.fechaInicio,
        fechaFin: snapshotFormNuevoViatico.fechaFin,
        montoSolicitado: snapshotTotalAlimentos,
        status: 'pendiente',
      });

      setViaticos((prev) => [...prev, nuevoViatico]);
      void syncCoreAppData({ userId: currentUserId || undefined }).catch(() => {});
    } catch (error) {
      setFormNuevoViatico(snapshotFormNuevoViatico);
      setShowNuevoViaticoErrors(false);
      setShowModalNuevoViatico(true);
      showToast(error instanceof Error ? error.message : 'No se pudo crear el viatico.', 'error');
    }
  };

  // Funciones para vehículos (solo coches)
  const cancelDestinoVehiculoLookup = () => {
    destinoVehiculoSelectionRef.current += 1;
    destinoVehiculoAbortRef.current?.abort();
    destinoVehiculoAbortRef.current = null;
  };

  const resetSolicitarVehiculoMapState = () => {
    cancelDestinoVehiculoLookup();
    setShowDestinoVehiculoMap(false);
    setShowDestinoVehiculoMapExpanded(false);
    setDestinoVehiculoCoords(null);
    setDestinoVehiculoDetalles(null);
    setIsResolviendoDestinoVehiculo(false);
    setDestinoVehiculoMapMensaje('');
  };

  const handleSeleccionDestinoVehiculoEnMapa = async ({ lat, lng }: VehicleMapPoint) => {
    cancelDestinoVehiculoLookup();
    const selectionId = destinoVehiculoSelectionRef.current;
    const controller = new AbortController();
    destinoVehiculoAbortRef.current = controller;

    setDestinoVehiculoCoords({ lat, lng });
    setIsResolviendoDestinoVehiculo(true);
    setDestinoVehiculoMapMensaje('Resolviendo direccion...');
    setFormSolicitudVehiculo((prev) => ({ ...prev, destino: 'Resolviendo direccion del punto seleccionado...' }));

    const fallbackAddress = 'Direccion no disponible en este punto. Selecciona una vialidad o empresa cercana.';
    setDestinoVehiculoDetalles(null);

    try {
      const reverseFromApiPromise = resolveWithTimeout(
        reverseGeocodeDestination(lat, lng, controller.signal),
        2200,
        null
      );
      const reverseFromNominatimPromise = resolveWithTimeout(
        reverseGeocodeDirectNominatim(lat, lng, controller.signal),
        2200,
        null
      );
      const reverseFromApi = await reverseFromApiPromise;
      const reverseData = reverseFromApi || await reverseFromNominatimPromise;
      if (controller.signal.aborted || selectionId !== destinoVehiculoSelectionRef.current) {
        return;
      }
      const reverseDetails = reverseData?.details || {};
      const reverseNearbyPoints = normalizeNearbyPoints(reverseData?.nearby_points || []);
      const nearbyPlaces = toUniqueTextParts([
        ...(reverseData?.nearby_places || []),
        String(reverseDetails.poi || ''),
        String(reverseDetails.industrial || ''),
        String(reverseDetails.road || ''),
      ]);
      const direccion = String(reverseData?.formatted_address || '').trim() || fallbackAddress;

      setFormSolicitudVehiculo((prev) => ({ ...prev, destino: direccion }));
      setDestinoVehiculoDetalles({
        poi: (reverseDetails.poi || '') || undefined,
        road: (reverseDetails.road || '') || undefined,
        industrial: (reverseDetails.industrial || '') || undefined,
        neighborhood: (reverseDetails.neighborhood || '') || undefined,
        city: (reverseDetails.city || '') || undefined,
        state: (reverseDetails.state || '') || undefined,
        postcode: (reverseDetails.postcode || '') || undefined,
        country: (reverseDetails.country || '') || undefined,
        nearbyPlaces,
        nearbyPoints: reverseNearbyPoints,
      });
      setDestinoVehiculoMapMensaje(reverseData ? 'Destino tomado del mapa.' : 'Se cargo una direccion aproximada.');

      // Nearby names should not block the address update; enrich in background.
      const nearbyFromApiPromise = resolveWithTimeout(
        reverseGeocodeDestination(lat, lng, controller.signal, true),
        30000,
        null
      );
      const nearbyFromPlacesPromise = resolveWithTimeout(fetchNearbyPlaceCandidates(lat, lng, controller.signal), 30000, []);
      void Promise.all([nearbyFromApiPromise, nearbyFromPlacesPromise])
        .then(([apiNearby, candidates]) => {
          if (controller.signal.aborted || selectionId !== destinoVehiculoSelectionRef.current) {
            return;
          }
          const candidateNames = candidates.map((item) => item.name);
          const candidatePoints = candidates.map((item) => ({ name: item.name, lat: item.lat, lng: item.lng }));
          const apiNames = apiNearby?.nearby_places || [];
          const apiPoints = normalizeNearbyPoints(apiNearby?.nearby_points || []);
          const mergedNames = toUniqueTextParts([...candidateNames, ...apiNames]);
          const mergedPoints = normalizeNearbyPoints([...candidatePoints, ...apiPoints]);
          if (!mergedNames.length && !mergedPoints.length) {
            return;
          }
          setDestinoVehiculoDetalles((prev) => {
            if (!prev) {
              return null;
            }
            return {
              ...prev,
              nearbyPlaces: toUniqueTextParts([...(prev.nearbyPlaces || []), ...mergedNames]),
              nearbyPoints: normalizeNearbyPoints([...(prev.nearbyPoints || []), ...mergedPoints]),
            };
          });
        })
        .catch(() => {});
    } catch (error) {
      if (controller.signal.aborted || selectionId !== destinoVehiculoSelectionRef.current) {
        return;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      setFormSolicitudVehiculo((prev) => ({ ...prev, destino: fallbackAddress }));
      setDestinoVehiculoDetalles(null);
      setDestinoVehiculoMapMensaje('No se pudo resolver la direccion exacta. Ajusta el punto en calle o empresa cercana.');
    } finally {
      if (!controller.signal.aborted && selectionId === destinoVehiculoSelectionRef.current) {
        setIsResolviendoDestinoVehiculo(false);
      }
      if (destinoVehiculoAbortRef.current === controller) {
        destinoVehiculoAbortRef.current = null;
      }
    }
  };

  const handleSolicitarVehiculo = async () => {
    if (!canCreatePortalRequests) {
      showToast('Tu categoria no puede solicitar vehiculos desde este portal.', 'info');
      return;
    }
    if (isSubmittingSolicitarVehiculo || solicitarVehiculoSubmitLockRef.current) {
      return;
    }

    if (!formSolicitudVehiculo.proyectoId || !formSolicitudVehiculo.origen || !formSolicitudVehiculo.destino || !formSolicitudVehiculo.motivo || !formSolicitudVehiculo.fechaInicio) {
      setShowSolicitarVehiculoErrors(true);
      return;
    }

    console.log('Solicitud de vehículo:', {
      ...formSolicitudVehiculo,
      requiereGasolina: formSolicitudVehiculo.requiereGasolina,
    });

    const currentUserId = user ? String(user.id) : undefined;
    const snapshot = { ...formSolicitudVehiculo };
    solicitarVehiculoSubmitLockRef.current = true;
    setIsSubmittingSolicitarVehiculo(true);
    setShowModalSolicitarVehiculo(false);
    setShowSolicitarVehiculoErrors(false);
    resetSolicitarVehiculoMapState();
    setFormSolicitudVehiculo({ ...SOLICITAR_VEHICULO_INITIAL_FORM });

    try {
      const nuevaSolicitud = await createFlotillaAsignacion({
        userId: currentUserId,
        proyectoId: snapshot.proyectoId,
        origen: snapshot.origen,
        destino: snapshot.destino,
        fechaInicio: snapshot.fechaInicio,
        fechaFin: snapshot.fechaFin || undefined,
        motivo: snapshot.motivo,
        proposito: snapshot.proposito,
        kmInicial: 0,
        status: 'solicitado',
      });

      saveVehicleAssignments([nuevaSolicitud, ...vehicleAssignments]);
      showToast('Solicitud de vehiculo enviada. El administrador asignara un coche disponible.', 'success');
      void syncCoreAppData({ userId: currentUserId }).catch(() => {});
    } catch (error) {
      skipSolicitarVehiculoResetRef.current = true;
      setFormSolicitudVehiculo(snapshot);
      setShowModalSolicitarVehiculo(true);
      showToast(error instanceof Error ? error.message : 'No se pudo solicitar el vehiculo.', 'error');
    } finally {
      setIsSubmittingSolicitarVehiculo(false);
      solicitarVehiculoSubmitLockRef.current = false;
    }
  };

  // Función para solicitar viaje (avión, camión, hotel)
  const handleSolicitarViaje = async () => {
    if (!canCreatePortalRequests) {
      showToast('Tu categoria no puede solicitar viajes desde este portal.', 'info');
      return;
    }
    if (!formSolicitudViaje.proyectoId || !formSolicitudViaje.motivo || !formSolicitudViaje.origen || !formSolicitudViaje.destino || !formSolicitudViaje.fechaInicio || !formSolicitudViaje.fechaFin) {
      setShowSolicitarViajeErrors(true);
      return;
    }

    if (!formSolicitudViaje.necesitaAvion && !formSolicitudViaje.necesitaCamion && !formSolicitudViaje.necesitaHotel) {
      setShowSolicitarViajeErrors(true);
      return;
    }

    const currentUserId = user ? String(user.id) : '';
    const snapshotFormSolicitudViaje = { ...formSolicitudViaje };
    const proyectoLabel = formatProyectoLabel(
      proyectos.find((p) => p.id === snapshotFormSolicitudViaje.proyectoId)?.nombre,
      snapshotFormSolicitudViaje.proyectoId
    );

    setShowModalSolicitarViaje(false);
    setFormSolicitudViaje({
      proyectoId: '',
      motivo: '',
      origen: '',
      destino: '',
      fechaInicio: '',
      fechaFin: '',
      necesitaAvion: false,
      necesitaCamion: false,
      necesitaHotel: false,
      detallesAvion: '',
      detallesCamion: '',
      detallesHotel: '',
    });
    setShowSolicitarViajeErrors(false);

    try {
      const nuevaSolicitud = await createViaje({
        userId: currentUserId || undefined,
        proyectoId: snapshotFormSolicitudViaje.proyectoId,
        proyectoNombre: proyectoLabel,
        origen: snapshotFormSolicitudViaje.origen,
        destino: snapshotFormSolicitudViaje.destino,
        fechaInicio: snapshotFormSolicitudViaje.fechaInicio,
        fechaFin: snapshotFormSolicitudViaje.fechaFin,
        motivo: snapshotFormSolicitudViaje.motivo,
        necesitaAvion: snapshotFormSolicitudViaje.necesitaAvion,
        necesitaCamion: snapshotFormSolicitudViaje.necesitaCamion,
        necesitaHotel: snapshotFormSolicitudViaje.necesitaHotel,
        detallesAvion: snapshotFormSolicitudViaje.detallesAvion || undefined,
        detallesCamion: snapshotFormSolicitudViaje.detallesCamion || undefined,
        detallesHotel: snapshotFormSolicitudViaje.detallesHotel || undefined,
        status: 'pendiente',
        statusAvion: snapshotFormSolicitudViaje.necesitaAvion ? 'pendiente' : undefined,
        statusCamion: snapshotFormSolicitudViaje.necesitaCamion ? 'pendiente' : undefined,
        statusHotel: snapshotFormSolicitudViaje.necesitaHotel ? 'pendiente' : undefined,
      });

      setSolicitudesViaje((prev) => [...prev, nuevaSolicitud]);
      showToast('Solicitud de viaje enviada. El administrador te contactara para coordinar los servicios.', 'success');
      void syncCoreAppData({ userId: currentUserId || undefined }).catch(() => {});
    } catch (error) {
      setFormSolicitudViaje(snapshotFormSolicitudViaje);
      setShowSolicitarViajeErrors(false);
      setShowModalSolicitarViaje(true);
      showToast(error instanceof Error ? error.message : 'No se pudo crear la solicitud de viaje.', 'error');
    }
  };

  const handleEliminarTarjetaViatico = async (viatico: Viatico) => {
    const id = String(viatico.id);
    const isCompleted = isCompletedViatico(viatico);
    const shouldContinue = await openConfirmDialog({
      title: isCompleted ? 'Ocultar tarjeta de viatico' : 'Eliminar viatico',
      message: isCompleted
        ? 'Este viatico ya esta completado. Solo se ocultara la tarjeta en tu portal.'
        : 'Este viatico no esta completado. Se eliminaran todos sus datos relacionados.',
      confirmLabel: isCompleted ? 'Ocultar tarjeta' : 'Eliminar viatico',
      tone: isCompleted ? 'info' : 'danger',
    });
    if (!shouldContinue) {
      return;
    }

    if (isCompleted) {
      setHiddenViaticoCards((prev) => (prev.includes(id) ? prev : [...prev, id]));
      if (viaticoSeleccionado === id) {
        resetSubirDocumentosFlow();
      }
      showToast('Tarjeta de viatico ocultada.', 'success');
      return;
    }

    const operationKey = `viatico:${id}`;
    setDeletingCardKey(operationKey);
    try {
      await deleteViatico(id);
      setViaticos((prev) => prev.filter((item) => String(item.id) !== id));
      setGastos((prev) => prev.filter((item) => String(item.viaticoId) !== id));
      setHiddenViaticoCards((prev) => prev.filter((itemId) => itemId !== id));
      if (viaticoSeleccionado === id) {
        resetSubirDocumentosFlow();
      }
      showToast('Viatico eliminado correctamente.', 'success');
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar el viatico.', 'error');
    } finally {
      setDeletingCardKey(null);
    }
  };

  const handleEliminarTarjetaVehiculo = async (assignment: VehicleAssignment) => {
    const id = String(assignment.id);
    const isCompleted = isCompletedVehiculo(assignment);
    const shouldContinue = await openConfirmDialog({
      title: isCompleted ? 'Ocultar tarjeta de vehiculo' : 'Eliminar solicitud de vehiculo',
      message: isCompleted
        ? 'Esta solicitud de vehiculo ya esta completada. Solo se ocultara la tarjeta.'
        : 'Esta solicitud de vehiculo no esta completada. Se eliminaran todos sus datos.',
      confirmLabel: isCompleted ? 'Ocultar tarjeta' : 'Eliminar solicitud',
      tone: isCompleted ? 'info' : 'danger',
    });
    if (!shouldContinue) {
      return;
    }

    if (isCompleted) {
      setHiddenVehiculoCards((prev) => (prev.includes(id) ? prev : [...prev, id]));
      if (assignmentSeleccionado === id) {
        setAssignmentSeleccionado(null);
      }
      showToast('Tarjeta de vehiculo ocultada.', 'success');
      return;
    }

    const operationKey = `vehiculo:${id}`;
    setDeletingCardKey(operationKey);
    try {
      await deleteFlotillaAsignacion(id);
      const nextAssignments = vehicleAssignments.filter((item) => String(item.id) !== id);
      saveVehicleAssignments(nextAssignments);
      setHiddenVehiculoCards((prev) => prev.filter((itemId) => itemId !== id));
      if (assignmentSeleccionado === id) {
        setAssignmentSeleccionado(null);
        setShowModalRecibirVehiculo(false);
        setShowModalDevolverVehiculo(false);
      }
      showToast('Solicitud de vehiculo eliminada correctamente.', 'success');
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar la solicitud de vehiculo.', 'error');
    } finally {
      setDeletingCardKey(null);
    }
  };

  const handleEliminarTarjetaViaje = async (solicitud: SolicitudViaje) => {
    const id = String(solicitud.id);
    const isCompleted = isCompletedViaje(solicitud);
    const shouldContinue = await openConfirmDialog({
      title: isCompleted ? 'Ocultar tarjeta de viaje' : 'Eliminar solicitud de viaje',
      message: isCompleted
        ? 'Esta solicitud de viaje ya esta completada. Solo se ocultara la tarjeta.'
        : 'Esta solicitud de viaje no esta completada. Se eliminaran todos sus datos.',
      confirmLabel: isCompleted ? 'Ocultar tarjeta' : 'Eliminar solicitud',
      tone: isCompleted ? 'info' : 'danger',
    });
    if (!shouldContinue) {
      return;
    }

    if (isCompleted) {
      setHiddenViajeCards((prev) => (prev.includes(id) ? prev : [...prev, id]));
      showToast('Tarjeta de viaje ocultada.', 'success');
      return;
    }

    const operationKey = `viaje:${id}`;
    setDeletingCardKey(operationKey);
    try {
      await deleteViaje(id);
      setSolicitudesViaje((prev) => prev.filter((item) => String(item.id) !== id));
      setHiddenViajeCards((prev) => prev.filter((itemId) => itemId !== id));
      showToast('Solicitud de viaje eliminada correctamente.', 'success');
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar la solicitud de viaje.', 'error');
    } finally {
      setDeletingCardKey(null);
    }
  };

  const handleRecibirVehiculo = async () => {
    if (kmInicial <= 0) {
      setShowRecibirErrors(true);
      return;
    }

    const assignment = vehicleAssignments.find(a => a.id === assignmentSeleccionado);
    if (!assignment) return;

    try {
      const persisted = await updateFlotillaAsignacion(assignment.id, {
        kmInicial,
        checklistRecepcion: {
          ...checklistRecepcion,
          foto: fotoRecepcion[0]?.name,
          fotos: fotoRecepcion
            .filter((file): file is File => Boolean(file))
            .map((file) => file.name),
        },
        status: 'activo',
      });

      const updatedAssignments = vehicleAssignments.map((item) => (
        item.id === persisted.id ? { ...item, ...persisted } : item
      ));

      saveVehicleAssignments(updatedAssignments);
      setShowModalRecibirVehiculo(false);
      setAssignmentSeleccionado(null);
      setKmInicial(0);
      setFotoRecepcion([]);
      setShowRecibirErrors(false);
      showToast('Vehiculo recibido correctamente', 'success');
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo registrar la recepcion del vehiculo.', 'error');
    }
  };

  const handleDevolverVehiculo = async () => {
    const assignment = vehicleAssignments.find(a => a.id === assignmentSeleccionado);
    if (!assignment || !assignment.kmInicial) return;

    if (kmFinal <= 0 || fotoEntrega.length === 0 || kmFinal < assignment.kmInicial) {
      setShowDevolverErrors(true);
      return;
    }

    try {
      let persisted = await updateFlotillaAsignacion(assignment.id, {
        kmFinal,
        checklistEntrega: {
          ...checklistEntrega,
          foto: fotoEntrega[0]?.name,
          fotos: fotoEntrega
            .filter((file): file is File => Boolean(file))
            .map((file) => file.name),
        },
        fechaFin: new Date().toISOString().split('T')[0],
        status: 'completado',
      });

      if (fotoEntrega.length > 0) {
        persisted = await uploadFlotillaEntregaFotos(assignment.id, fotoEntrega);
      }

      const updatedAssignments = vehicleAssignments.map((item) => (
        item.id === persisted.id ? { ...item, ...persisted } : item
      ));

      saveVehicleAssignments(updatedAssignments);
      setShowVehicleReturnSuccess(true);
      setShowModalDevolverVehiculo(false);
      setShowDevolverErrors(false);
      setAssignmentSeleccionado(null);
      setKmFinal(0);
      setFotoEntrega([]);
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo registrar la devolucion del vehiculo.', 'error');
    }
  };

  const handleClearLocalData = async () => {
    const shouldClear = await openConfirmDialog({
      title: 'Limpiar datos locales',
      message: 'Esto borrara los datos guardados localmente en este navegador.',
      confirmLabel: 'Si, limpiar',
      tone: 'danger',
    });
    if (!shouldClear) {
      return;
    }
    clearAppStorage();
    window.location.reload();
  };

  return (
    <div className="h-full min-h-0 w-full px-2 sm:px-3 lg:px-4 py-2 space-y-4">
      {toast && (
        <div className="fixed right-4 top-4 z-[90] w-[calc(100%-2rem)] max-w-sm">
          <div
            className={`rounded-xl border shadow-lg backdrop-blur-sm ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : toast.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className="mt-0.5 text-base">
                {toast.type === 'success' ? 'OK' : toast.type === 'error' ? '!' : 'i'}
              </span>
              <p className="flex-1 text-sm font-medium leading-5">{toast.text}</p>
              <button
                onClick={() => setToast(null)}
                className="text-base leading-none opacity-70 transition hover:opacity-100"
                aria-label="Cerrar notificacion"
                type="button"
              >
                x
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className={`h-1 w-full ${
              confirmDialog.tone === 'danger'
                ? 'bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400'
                : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500'
            }`} />
            <div className="px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  confirmDialog.tone === 'danger'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-sky-100 text-sky-700'
                }`}>
                  {confirmDialog.tone === 'danger' ? '!' : 'i'}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-900">{confirmDialog.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{confirmDialog.message}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => resolveConfirmDialog(false)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
                >
                  {confirmDialog.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => resolveConfirmDialog(true)}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors sm:w-auto ${
                    confirmDialog.tone === 'danger'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isSubiendoDocumentos && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500" />
            <div className="px-5 py-5 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-600" />
              <h3 className="mt-4 text-base font-semibold text-slate-900">Subiendo documentos...</h3>
              <p className="mt-1 text-sm text-slate-600">Estamos registrando tus facturas y comprobantes.</p>
            </div>
          </div>
        </div>
      )}
      {uploadDocumentosSummary && !isSubiendoDocumentos && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />
            <div className="px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  OK
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-900">Documentos subidos correctamente</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {uploadDocumentosSummary.totalGastos} gasto(s) registrados por un total de $
                    {uploadDocumentosSummary.montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setUploadDocumentosSummary(null)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {!viaticoSeleccionado || !viaticoActual ? (
        <>
          <div className="space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-1 xl:flex-col xl:space-y-0 xl:gap-4 xl:overflow-hidden">
          <div className="sticky top-0 z-30 -mx-2 sm:-mx-3 lg:-mx-4 px-2 sm:px-3 lg:px-4 pt-1 pb-2 xl:flex-shrink-0">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
              <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
              <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-3xl" />
              <div className="relative space-y-2">
                {/* Vista Principal: Lista de Viáticos y Vehículos */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Usuario</p>
                    <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Mi Portal</h1>
                    {isStaffOperator && <p className="text-[11px] font-medium text-amber-700">Modo operador: puedes consultar estatus, pero no generar solicitudes desde este portal.</p>}
                    <p className="text-[11px] text-slate-600">Gestiona tus viáticos, vehículos, viajes y comprobantes.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 w-full sm:w-auto sm:justify-end">
                  {canCreatePortalRequests && (
                    <>
                  <button
                    onClick={() => {
                      setFormNuevoViatico((prev) => ({
                        ...prev,
                        origen: prev.origen ? prev.origen : 'Queretaro',
                      }));
                      setShowNuevoViaticoErrors(false);
                      setShowModalNuevoViatico(true);
                    }}
                    className="w-full sm:w-auto px-2 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center justify-center gap-1 text-[11px]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Viático</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowSolicitarVehiculoErrors(false);
                      resetSolicitarVehiculoMapState();
                      setShowModalSolicitarVehiculo(true);
                    }}
                    className="w-full sm:w-auto px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-1 text-[11px]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                    </svg>
                    <span>Vehículo</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowSolicitarViajeErrors(false);
                      setShowModalSolicitarViaje(true);
                    }}
                    className="w-full sm:w-auto px-2 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center justify-center gap-1 text-[11px]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Viaje</span>
                  </button>
                    </>
                  )}
                  <button
                    onClick={handleClearLocalData}
                    className="w-full sm:w-auto px-2 py-1 border border-red-200 text-red-700 rounded-md hover:bg-red-50 flex items-center justify-center gap-1 text-[11px]"
                    type="button"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m3-3h4a1 1 0 011 1v1H9V5a1 1 0 011-1z" />
                    </svg>
                    <span>Limpiar datos</span>
                  </button>
                </div>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFiltro('todos')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    filtro === 'todos'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Todos ({visibleViaticos.length})
                </button>
                <button
                  onClick={() => setFiltro('activos')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    filtro === 'activos'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Activos ({totalViaticosActivos})
                </button>
                <button
                  onClick={() => setFiltro('completados')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    filtro === 'completados'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Completados ({totalViaticosCompletados})
                </button>
              </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch xl:min-h-0 xl:flex-1">
            <div className="xl:h-full xl:min-h-0 xl:flex xl:flex-col">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Mis Viáticos</h2>
              {/* Lista de Viáticos */}
              <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
            {viaticosFiltrados.length > 0 ? (
              viaticosFiltrados.map((viatico) => {
                const estadoInfo = getEstadoInfo(viatico.status);
                const procesoViatico = getProcesoViatico(viatico);
                const accionBoton = getAccionBoton(viatico);
                const deletingViatico = deletingCardKey === `viatico:${viatico.id}`;
                const extensionPendiente = getPendingViaticoExtension(viatico.comentarios);
                const extensionResuelta = !extensionPendiente
                  ? getLatestViaticoExtensionResolution(viatico.comentarios)
                  : null;
                const requiereDispersionAdicional = viatico.status === 'aprobado' && (viatico.montoDispersado || 0) > 0;
                const proyectoDisplay = resolveProyectoDisplay(viatico.proyectoId, viatico.proyectoNombre);

                return (
                  <div key={viatico.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4 hover:shadow transition-shadow">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-1.5 leading-tight">
                            <span className="text-base">{estadoInfo.icon}</span>
                            <span className="truncate">{proyectoDisplay.jobLabel}</span>
                          </h3>
                          {viatico.destino && normalizeText(viatico.destino) !== normalizeText(proyectoDisplay.jobLabel) && (
                            <p className="mt-0.5 text-xs text-gray-600">{viatico.destino}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${estadoInfo.color}`}>
                            {estadoInfo.label}
                          </span>
                          <button
                            type="button"
                            disabled={deletingViatico}
                            onClick={() => {
                              void handleEliminarTarjetaViatico(viatico);
                            }}
                            className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingViatico ? 'Eliminando...' : (isCompletedViatico(viatico) ? 'Ocultar' : 'Eliminar')}
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] text-gray-600">
                          Proceso actual: <span className="font-semibold text-gray-900">{procesoViatico.texto}</span>
                        </p>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                          <div
                            className={`h-1.5 rounded-full ${procesoViatico.barra}`}
                            style={{ width: `${procesoViatico.avance}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                        <span><span className="font-medium">Job:</span> {proyectoDisplay.jobLabel}</span>
                        <span><span className="font-medium">Desde:</span> {formatDateOnlyMx(viatico.fechaInicio)}</span>
                        <span><span className="font-medium">Hasta:</span> {formatDateOnlyMx(viatico.fechaFin)}</span>
                        <span className="font-semibold text-gray-900">
                          <span className="font-medium text-gray-600">Monto:</span> ${viatico.montoAprobado?.toLocaleString() || viatico.montoSolicitado.toLocaleString()} MXN
                        </span>
                      </div>

                      <div className="space-y-1">
                        {extensionPendiente && (
                          <p className="text-[11px] text-amber-700">
                            Extension pendiente PM: {formatDateOnlyMx(extensionPendiente.nuevaFechaFin)}
                          </p>
                        )}
                        {!extensionPendiente && extensionResuelta && (
                          <p className={`text-[11px] ${extensionResuelta.status === 'aprobada' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {extensionResuelta.status === 'aprobada' ? 'Extension aprobada PM' : 'Extension rechazada PM'}: {extensionResuelta.resolvedAt}
                          </p>
                        )}
                        {requiereDispersionAdicional && (
                          <p className="text-[11px] text-blue-700">
                            Pendiente de dispersion adicional por extension aprobada.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {accionBoton.accion !== 'none' && (
                          <button
                            onClick={() => handleAccionClick(viatico, accionBoton.accion)}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${accionBoton.color} hover:opacity-90`}
                            type="button"
                          >
                            <span>{accionBoton.icon}</span>
                            <span>{accionBoton.label}</span>
                          </button>
                        )}

                        {canCreatePortalRequests && (viatico.status === 'dispersado' || viatico.status === 'en_viaje') && !extensionPendiente && (
                          <button
                            onClick={() => {
                              const minExtensionDate = getExtensionMinDate(viatico.fechaFin) || viatico.fechaFin;
                              setViaticoParaExtender(viatico);
                              setNuevaFechaFin(minExtensionDate);
                              setAlimentosExtension({
                                desayunos: 0,
                                comidas: 0,
                                cenas: 0,
                              });
                              setShowModalExtenderViaje(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                            type="button"
                          >
                            <span>Extender Viaje</span>
                          </button>
                        )}

                        {extensionPendiente && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            ⏳ <span>Esperando aprobacion PM</span>
                          </span>
                        )}

                        {viatico.saldoRestante && viatico.saldoRestante > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                            <span>Pendiente por recuperar:</span> ${viatico.saldoRestante.toLocaleString()} MXN
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8 text-center w-full">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay viáticos {filtro !== 'todos' ? filtro : ''}</h3>
                <p className="text-gray-600">Intenta cambiar los filtros o solicita un nuevo viático</p>
                {filtro === 'completados' && totalViaticosActivos > 0 && (
                  <button
                    onClick={() => setFiltro('activos')}
                    className="mt-4 inline-flex items-center rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                    type="button"
                  >
                    Ver Activos ({totalViaticosActivos})
                  </button>
                )}
              </div>
            )}
              </div>
            </div>

            <div className="xl:col-span-2 xl:h-full xl:min-h-0">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch xl:h-full xl:min-h-0">
            {/* Sección de Vehículos Asignados */}
            <div className="xl:h-full xl:min-h-0 xl:flex xl:flex-col">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Mis Vehículos</h2>
              <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
              {visibleVehicleAssignments.length > 0 ? (
                visibleVehicleAssignments.map((assignment) => {
                  const vehicle = vehicles.find(v => v.id === assignment.vehicleId);
                  const proyectoDisplay = resolveProyectoDisplay(assignment.proyectoId, assignment.proyectoNombre);
                  const vehiculoStatusIcon = getVehiculoStatusIcon(assignment.status);
                  const procesoVehiculo = getProcesoVehiculo(assignment.status);
                  const deletingVehiculo = deletingCardKey === `vehiculo:${assignment.id}`;

                  return (
                    <div key={assignment.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4 hover:shadow transition-shadow">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
                          <div className="min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                            <span className="text-base">{vehiculoStatusIcon}</span>{' '}
                            {proyectoDisplay.jobLabel}
                          </p>
                          <h3 className="mt-0.5 text-xs text-gray-600">
                            <span className="text-base">{vehiculoStatusIcon}</span>{' '}
                            {vehicle
                              ? `${vehicle.marca} ${vehicle.modelo} (${vehicle.placas})`
                              : assignment.vehiculoLabel || 'Vehículo pendiente de asignación'}
                          </h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                          {assignment.status === 'solicitado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                              ⏳ Pendiente de Asignación
                            </span>
                          )}
                          {assignment.status === 'asignado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              Asignado - Pendiente Recepción
                            </span>
                          )}
                          {assignment.status === 'activo' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              En Uso
                            </span>
                          )}
                          {assignment.status === 'completado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                              Completado
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={deletingVehiculo}
                            onClick={() => {
                              void handleEliminarTarjetaVehiculo(assignment);
                            }}
                            className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingVehiculo ? 'Eliminando...' : (isCompletedVehiculo(assignment) ? 'Ocultar' : 'Eliminar')}
                          </button>
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-gray-600">
                            Proceso actual: <span className="font-semibold text-gray-900">{procesoVehiculo.texto}</span>
                          </p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                            <div
                              className={`h-1.5 rounded-full ${procesoVehiculo.barra}`}
                              style={{ width: `${procesoVehiculo.avance}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span><span className="font-medium">Job:</span> {proyectoDisplay.jobLabel}</span>
                          {assignment.destino && (
                            <span><span className="font-medium">Destino:</span> {assignment.destino}</span>
                          )}
                          <span><span className="font-medium">Motivo:</span> {assignment.motivo}</span>
                          <span><span className="font-medium">Desde:</span> {formatDateOnlyMx(assignment.fechaInicio)}</span>
                          {assignment.fechaFin && (
                            <span><span className="font-medium">Hasta:</span> {formatDateOnlyMx(assignment.fechaFin)}</span>
                          )}
                          {assignment.kmInicial != null && (
                            <span><span className="font-medium">KM Inicial:</span> {assignment.kmInicial.toLocaleString()}</span>
                          )}
                          {assignment.kmFinal != null && (
                            <span><span className="font-medium">KM Final:</span> {assignment.kmFinal.toLocaleString()}</span>
                          )}
                          {assignment.kmFinal != null && assignment.kmInicial != null && (
                            <span><span className="font-medium">KM Recorridos:</span> {(assignment.kmFinal - assignment.kmInicial).toLocaleString()}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {assignment.status === 'asignado' && (
                            <button
                              onClick={() => {
                                setAssignmentSeleccionado(assignment.id);
                                setShowRecibirErrors(false);
                                setShowModalRecibirVehiculo(true);
                              }}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs"
                              type="button"
                            >
                              Recibir Vehículo
                            </button>
                          )}
                          {assignment.status === 'activo' && (
                            <button
                              onClick={() => {
                                setAssignmentSeleccionado(assignment.id);
                                setShowDevolverErrors(false);
                                setShowModalDevolverVehiculo(true);
                              }}
                              className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-xs"
                              type="button"
                            >
                              Regresar Vehículo
                            </button>
                          )}
                          {assignment.checklistRecepcion && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                              Checklist recepción completado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8 text-center w-full">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No tienes vehículos asignados</h3>
                  <p className="text-gray-600">Solicita un vehículo usando el botón de arriba</p>
                </div>
              )}
            </div>
          </div>

            {/* Sección de Solicitudes de Viaje */}
            <div className="xl:h-full xl:min-h-0 xl:flex xl:flex-col">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Mis Solicitudes de Viaje</h2>
              <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
              {visibleSolicitudesViaje.length > 0 ? (
                visibleSolicitudesViaje.map((solicitud) => {
                  const proyectoDisplay = resolveProyectoDisplay(solicitud.proyectoId, solicitud.proyectoNombre);
                  const confirmacionesAvion = solicitud.confirmaciones?.avion ?? [];
                  const confirmacionesCamion = solicitud.confirmaciones?.camion ?? [];
                  const confirmacionesHotel = solicitud.confirmaciones?.hotel ?? [];
                  const tieneConfirmaciones = confirmacionesAvion.length > 0 || confirmacionesCamion.length > 0 || confirmacionesHotel.length > 0;
                  const viajeStatusIcon = getViajeStatusIcon(solicitud.status);
                  const procesoViaje = getProcesoViaje(solicitud.status);
                  const deletingViaje = deletingCardKey === `viaje:${solicitud.id}`;

                  return (
                    <div key={solicitud.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4 hover:shadow transition-shadow">
                      <div className="flex flex-col gap-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                              <span className="text-base">{viajeStatusIcon}</span> {proyectoDisplay.jobLabel}
                            </h3>
                            <p className="mt-0.5 text-xs text-gray-600">{solicitud.destino}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              solicitud.status === 'pendiente' ? 'bg-yellow-100 text-yellow-800' :
                              solicitud.status === 'en_proceso' ? 'bg-blue-100 text-blue-800' :
                              solicitud.status === 'confirmado' ? 'bg-green-100 text-green-800' :
                              solicitud.status === 'rechazado' ? 'bg-red-100 text-red-800' :
                              solicitud.status === 'cancelado' ? 'bg-red-100 text-red-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {solicitud.status === 'pendiente' ? '⏳ Pendiente' :
                               solicitud.status === 'en_proceso' ? 'En Proceso' :
                               solicitud.status === 'confirmado' ? 'Confirmado' :
                               solicitud.status === 'rechazado' ? 'Rechazado' :
                               solicitud.status === 'cancelado' ? 'Cancelado' : 'Completado'}
                            </span>
                            <button
                              type="button"
                              disabled={deletingViaje}
                              onClick={() => {
                                void handleEliminarTarjetaViaje(solicitud);
                              }}
                              className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingViaje ? 'Eliminando...' : (isCompletedViaje(solicitud) ? 'Ocultar' : 'Eliminar')}
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-gray-600">
                            Proceso actual: <span className="font-semibold text-gray-900">{procesoViaje.texto}</span>
                          </p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                            <div
                              className={`h-1.5 rounded-full ${procesoViaje.barra}`}
                              style={{ width: `${procesoViaje.avance}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span><span className="font-medium">Job:</span> {proyectoDisplay.jobLabel}</span>
                          <span><span className="font-medium">Motivo:</span> {solicitud.motivo}</span>
                          <span><span className="font-medium">Fechas:</span> {formatDateOnlyMx(solicitud.fechaInicio)} - {formatDateOnlyMx(solicitud.fechaFin)}</span>
                        </div>

                        {/* Servicios solicitados con sus estados */}
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 pt-2">
                          {solicitud.necesitaAvion && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Avión
                              </span>
                              {solicitud.statusAvion && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  solicitud.statusAvion === 'pendiente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  solicitud.statusAvion === 'gestionando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                  {solicitud.statusAvion === 'pendiente' ? 'Pendiente' :
                                   solicitud.statusAvion === 'gestionando' ? 'Gestionando' : 'Confirmado'}
                                </span>
                              )}
                            </div>
                          )}
                          {solicitud.necesitaCamion && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                Camión
                              </span>
                              {solicitud.statusCamion && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  solicitud.statusCamion === 'pendiente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  solicitud.statusCamion === 'gestionando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                  {solicitud.statusCamion === 'pendiente' ? 'Pendiente' :
                                   solicitud.statusCamion === 'gestionando' ? 'Gestionando' : 'Confirmado'}
                                </span>
                              )}
                            </div>
                          )}
                          {solicitud.necesitaHotel && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Hotel
                              </span>
                              {solicitud.statusHotel && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  solicitud.statusHotel === 'pendiente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  solicitud.statusHotel === 'gestionando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                  {solicitud.statusHotel === 'pendiente' ? 'Pendiente' :
                                   solicitud.statusHotel === 'gestionando' ? 'Gestionando' : 'Confirmado'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Confirmaciones */}
                        {tieneConfirmaciones && (
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="text-xs font-medium text-gray-700 mb-1">Confirmaciones</p>
                            <div className="space-y-1 text-xs text-gray-600">
                              {confirmacionesAvion.map((confirmacion, index) => (
                                <p key={`avion-${solicitud.id}-${index}`}>Avión: {confirmacion.aerolinea} - Conf: {confirmacion.confirmacion}</p>
                              ))}
                              {confirmacionesCamion.map((confirmacion, index) => (
                                <p key={`camion-${solicitud.id}-${index}`}>Camión: {confirmacion.proveedor} - Conf: {confirmacion.confirmacion}</p>
                              ))}
                              {confirmacionesHotel.map((confirmacion, index) => (
                                <p key={`hotel-${solicitud.id}-${index}`}>Hotel: {confirmacion.nombre} - Conf: {confirmacion.confirmacion}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        {solicitud.atendidoPor && (
                          <div className="text-xs text-gray-500">
                            <p>Atendido por: {solicitud.atendidoPor}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8 text-center w-full">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No tienes solicitudes de viaje</h3>
                  <p className="text-gray-600">Solicita un viaje usando el botón de arriba</p>
                </div>
              )}
            </div>
          </div>
          </div>
          </div>
          </div>
          </div>
        </>
      ) : (
        <>
          {/* Vista de Carga de Documentos */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={resetSubirDocumentosFlow}
              className="text-primary-600 hover:text-primary-700 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Volver a la lista</span>
            </button>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Viático: {viaticoActual?.destino} - {proyectoActual?.nombre}
            </h1>
          </div>

          {/* Información del Viático */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Información del Viático</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Destino</p>
                <p className="text-base font-medium text-gray-900">{viaticoActual?.destino}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Proyecto</p>
                <p className="text-base font-medium text-gray-900">{proyectoActual?.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fechas</p>
                <p className="text-base font-medium text-gray-900">
                  {formatDateOnlyMx(viaticoActual.fechaInicio)} -{' '}
                  {formatDateOnlyMx(viaticoActual.fechaFin)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monto</p>
                <p className="text-base font-semibold text-gray-900">
                  ${viaticoActual?.montoDispersado?.toLocaleString() || viaticoActual?.montoAprobado?.toLocaleString()} MXN
                </p>
              </div>
            </div>

            {viaticoActual && getViaticoGastadoKpi(viaticoActual) > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Monto Comprobado:</span>
                  <span className="font-semibold text-gray-900">${getViaticoGastadoKpi(viaticoActual).toLocaleString()} MXN</span>
                </div>
                {viaticoActual.saldoRestante && viaticoActual.saldoRestante > 0 && (
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-orange-600 font-medium">Por Recuperar:</span>
                    <span className="font-semibold text-orange-600">${viaticoActual.saldoRestante.toLocaleString()} MXN</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subir Documentos */}
          <div className="bg-white rounded-lg shadow p-3">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Subir Documentos</h2>

            <div className="space-y-2.5">
              {/* 1. Factura PDF */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-900">
                  1️⒣ Factura PDF
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className={`flex-1 px-3 py-2 border border-dashed rounded-md hover:border-primary-500 cursor-pointer transition-colors ${
                    gastoArchivoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}>
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-xs text-gray-600">Seleccionar archivo PDF</span>
                    </div>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {pdfFile && (
                    <div className="flex items-center justify-between gap-2 bg-green-50 px-2 py-1.5 rounded-md sm:max-w-[45%]">
                      <span className="truncate text-xs font-medium text-green-700">{pdfFile.name}</span>
                      <button onClick={() => setPdfFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Factura XML */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-900">
                  2️⒣ Factura XML
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className={`flex-1 px-3 py-2 border border-dashed rounded-md hover:border-primary-500 cursor-pointer transition-colors ${
                    gastoArchivoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}>
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-xs text-gray-600">Seleccionar archivo XML</span>
                    </div>
                    <input
                      type="file"
                      accept=".xml"
                      onChange={(e) => {
                        void handleXmlFileSelection(e.target.files?.[0] || null);
                      }}
                      className="hidden"
                    />
                  </label>
                  {xmlFile && (
                    <div className="flex items-center justify-between gap-2 bg-green-50 px-2 py-1.5 rounded-md sm:max-w-[45%]">
                      <span className="truncate text-xs font-medium text-green-700">{xmlFile.name}</span>
                      <button onClick={() => {
                        void handleXmlFileSelection(null);
                      }} className="text-red-600 hover:text-red-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Ticket/Foto */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-900">
                  3️⒣ Ticket / Comprobante (Foto)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className={`flex-1 px-3 py-2 border border-dashed rounded-md hover:border-primary-500 cursor-pointer transition-colors ${
                    gastoArchivoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}>
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-xs text-gray-600">Tomar foto o seleccionar</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setTicketFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {ticketFile && (
                    <div className="flex items-center justify-between gap-2 bg-green-50 px-2 py-1.5 rounded-md sm:max-w-[45%]">
                      <span className="truncate text-xs font-medium text-green-700">{ticketFile.name}</span>
                      <button onClick={() => setTicketFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón agregar gasto */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-900">
                  4. Descripcion <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={descripcionGasto}
                  onChange={(e) => setDescripcionGasto(e.target.value)}
                  maxLength={120}
                  placeholder="Ej. Alimentos, casetas, estacionamiento..."
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    gastoDescripcionError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-900">
                  5. Monto del gasto (MXN)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={montoGasto}
                  onChange={(e) => setMontoGasto(e.target.value)}
                  disabled={montoGastoBloqueado}
                  placeholder="Ej. 350.00 (opcional si subes XML)"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 ${
                    gastoMontoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}
                />
                {montoGastoBloqueado && (
                  <p className="mt-1 text-[11px] text-emerald-700">Monto autocompletado desde XML (campo bloqueado).</p>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAgregarGasto}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  + Agregar Gasto
                </button>
              </div>
              {gastoArchivoError && (
                <p className="text-xs text-rose-600">{gastoArchivoError}</p>
              )}
              {gastoDescripcionError && (
                <p className="text-xs text-rose-600">{gastoDescripcionError}</p>
              )}
              {gastoMontoError && (
                <p className="text-xs text-rose-600">{gastoMontoError}</p>
              )}

              {/* Lista de gastos agregados */}
              {gastos.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <h3 className="text-xs font-semibold text-gray-900 mb-2">
                    Gastos agregados ({gastos.length})
                  </h3>
                  <div className="space-y-1.5">
                    {gastos.map((gasto) => (
                      <div key={gasto.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                        <div className="flex items-center space-x-2">
                          <div>
                            <p className="text-xs font-medium text-gray-900">{gasto.descripcion}</p>
                            <p className="text-xs font-semibold text-slate-700">
                              ${gasto.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                            </p>
                            <div className="flex items-center space-x-1.5 mt-1">
                              {gasto.pdfName && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">PDF</span>}
                              {gasto.xmlName && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">XML</span>}
                              {gasto.ticketName && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Ticket</span>}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => eliminarGasto(gasto.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón final de subir */}
              <div className="flex justify-end space-x-2 pt-3">
                <button
                  onClick={resetSubirDocumentosFlow}
                  className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubirDocumentos}
                  disabled={gastos.length === 0 || isSubiendoDocumentos}
                  className="px-4 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {isSubiendoDocumentos ? 'Subiendo...' : `Subir Documentos (${gastos.length})`}
                </button>
              </div>
              {subirDocumentosError && (
                <p className="text-xs text-rose-600">{subirDocumentosError}</p>
              )}
            </div>
          </div>

          {/* Ayuda */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start">
              <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-2.5">
                <h4 className="text-xs font-semibold text-blue-800 mb-1">Ayuda</h4>
                <ul className="text-xs text-blue-700 space-y-0.5">
                  <li>⬢ El PDF y XML deben ser de la misma factura</li>
                  <li>⬢ Si solo tienes un ticket (sin factura), solo sube la foto en la sección 3</li>
                  <li>⬢ Puedes agregar múltiples gastos para un mismo viático</li>
                  <li>⬢ Asegúrate de que las fotos sean legibles</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal para crear nuevo viático */}
      {showModalNuevoViatico && canCreatePortalRequests && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Solicitar Nuevo Viático</h2>
                  <p className="text-xs text-slate-500">Completa la solicitud en formato compacto.</p>
                </div>
                <button
                  onClick={() => {
                    setShowModalNuevoViatico(false);
                    setShowNuevoViaticoErrors(false);
                  }}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid flex-1 auto-rows-max grid-cols-1 gap-2.5 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-3 py-2.5 sm:px-4 sm:py-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm md:grid-cols-2">
                <div>
                  {/* Proyecto - OBLIGATORIO */}
                  <ProyectoSelector
                    value={formNuevoViatico.proyectoId}
                    onChange={(proyectoId) => setFormNuevoViatico({ ...formNuevoViatico, proyectoId })}
                    required={proyectoRequeridoViatico}
                    label="Proyecto"
                    compact
                    inputClassName={nuevoViaticoErrors.proyectoId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
                  />
                  {nuevoViaticoErrors.proyectoId && (
                    <p className="text-xs text-rose-600">{nuevoViaticoErrors.proyectoId}</p>
                  )}
                </div>

                <div>
                  {/* GS Activity */}
                  <GSActivitySelector
                    value={formNuevoViatico.gsActivityId}
                    onChange={(activityId, activity) =>
                      setFormNuevoViatico((prev) => ({
                        ...prev,
                        gsActivityId: activityId,
                        motivo: activityId === GS_ACTIVITY_OTHER_ID ? '' : activity.label,
                      }))}
                    filterByCategory="travel"
                    label="Tipo de Actividad"
                    compact
                    inputClassName={nuevoViaticoErrors.gsActivityId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
                  />
                  {nuevoViaticoErrors.gsActivityId && (
                    <p className="text-xs text-rose-600">{nuevoViaticoErrors.gsActivityId}</p>
                  )}
                </div>
              </div>

              {/* Motivo */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo del Viaje <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNuevoViatico.motivo}
                  onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, motivo: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                    nuevoViaticoErrors.motivo
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                  }`}
                  placeholder={isOtroMotivo ? 'Escribe otro motivo...' : 'Se llena según el tipo de actividad'}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Selecciona "Otro" para capturar un motivo personalizado.
                </p>
                {nuevoViaticoErrors.motivo && (
                  <p className="mt-1 text-xs text-rose-600">{nuevoViaticoErrors.motivo}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-sky-100 bg-sky-50/60 p-2.5 shadow-sm md:grid-cols-2">
              {/* Pais */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pais
                </label>
                <select
                  value={formNuevoViatico.destinoPais}
                  onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, destinoPais: e.target.value as DestinoPais })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="Mexico">Mexico</option>
                  <option value="USA">USA</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              {/* Origen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origen <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNuevoViatico.origen}
                  onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, origen: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                    nuevoViaticoErrors.origen
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                  }`}
                  placeholder="Ej: Guadalajara, Jalisco"
                />
                {nuevoViaticoErrors.origen && (
                  <p className="mt-1 text-xs text-rose-600">{nuevoViaticoErrors.origen}</p>
                )}
              </div>

              {/* Destino */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destino <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNuevoViatico.destino}
                  onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, destino: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                    nuevoViaticoErrors.destino
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                  }`}
                  placeholder="Ej: Guadalajara, Jalisco"
                />
                {nuevoViaticoErrors.destino && (
                  <p className="mt-1 text-xs text-rose-600">{nuevoViaticoErrors.destino}</p>
                )}
              </div>

              {/* Tipo de Viático */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Viático
                </label>
                <select
                  value={formNuevoViatico.tipoViatico}
                  onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, tipoViatico: e.target.value as 'efectifintech' | 'amex' | 'mixto' })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="efectifintech">Efectivo / Fintech</option>
                  <option value="amex">AMEX</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>

              </div>

              {/* Fechas */}
              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Inicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formNuevoViatico.fechaInicio}
                    onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, fechaInicio: e.target.value })}
                    onClick={openDatePicker}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                      nuevoViaticoErrors.fechaInicio
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                    }`}
                  />
                  {nuevoViaticoErrors.fechaInicio && (
                    <p className="mt-1 text-xs text-rose-600">{nuevoViaticoErrors.fechaInicio}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Fin <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formNuevoViatico.fechaFin}
                    onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, fechaFin: e.target.value })}
                    onClick={openDatePicker}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                      nuevoViaticoErrors.fechaFin
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                    }`}
                  />
                  {nuevoViaticoErrors.fechaFin && (
                    <p className="mt-1 text-xs text-rose-600">{nuevoViaticoErrors.fechaFin}</p>
                  )}
                </div>
              </div>

              {/* Alimentos */}
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-2.5 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alimentos (MXN) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Desayunos ($150)</label>
                    <input
                      type="number"
                      value={formNuevoViatico.desayunos === 0 ? '' : formNuevoViatico.desayunos}
                      onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, desayunos: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                        nuevoViaticoErrors.alimentos
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                      }`}
                      placeholder={placeholderAlimentos}
                      min="0"
                />
              </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Comidas ($200)</label>
                    <input
                      type="number"
                      value={formNuevoViatico.comidas === 0 ? '' : formNuevoViatico.comidas}
                      onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, comidas: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                        nuevoViaticoErrors.alimentos
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                      }`}
                      placeholder={placeholderAlimentos}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cenas ($250)</label>
                    <input
                      type="number"
                      value={formNuevoViatico.cenas === 0 ? '' : formNuevoViatico.cenas}
                      onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, cenas: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                        nuevoViaticoErrors.alimentos
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                      }`}
                      placeholder={placeholderAlimentos}
                      min="0"
                    />
                  </div>
                </div>
                {nuevoViaticoErrors.alimentos && (
                  <p className="mt-2 text-xs text-rose-600">{nuevoViaticoErrors.alimentos}</p>
                )}
                <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5">
                  <span className="text-sm text-gray-600">Total estimado</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ${totalAlimentos.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
              <button
                onClick={() => {
                  setShowModalNuevoViatico(false);
                  setShowNuevoViaticoErrors(false);
                }}
                className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearNuevoViatico}
                className={`w-full sm:w-auto px-4 py-1.5 rounded-lg text-sm ${
                  isFormValid
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 text-white hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                Solicitar Viatico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para solicitar vehículo (solo coches) */}
      {showModalSolicitarVehiculo && canCreatePortalRequests && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Solicitar Vehículo (Coche)</h2>
                  <p className="text-xs text-slate-500">Define origen, destino y fechas del traslado.</p>
                </div>
                <button
                  onClick={() => {
                    setShowModalSolicitarVehiculo(false);
                    setShowSolicitarVehiculoErrors(false);
                    resetSolicitarVehiculoMapState();
                  }}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid flex-1 auto-rows-max grid-cols-1 gap-2.5 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-3 py-2.5 sm:px-4 sm:py-3 xl:grid-cols-2">
              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm md:grid-cols-2">
              {/* Proyecto */}
              <ProyectoSelector
                value={formSolicitudVehiculo.proyectoId}
                onChange={(proyectoId) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, proyectoId })}
                required={true}
                showCreateOption={true}
                label="Proyecto"
                inputClassName={solicitarVehiculoErrors.proyectoId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
              />
              {solicitarVehiculoErrors.proyectoId && (
                <p className="text-xs text-rose-600">{solicitarVehiculoErrors.proyectoId}</p>
              )}

              {/* Propósito */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Propósito <span className="text-red-500">*</span>
                </label>
                <select
                  value={formSolicitudVehiculo.proposito}
                  onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, proposito: e.target.value as 'operaciones' | 'visita' | 'viaje' })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="operaciones">Operaciones</option>
                  <option value="visita">Visita</option>
                  <option value="viaje">Viaje</option>
                </select>
              </div>

              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-sky-100 bg-sky-50/60 p-2.5 shadow-sm md:grid-cols-2">
              {/* Origen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origen <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formSolicitudVehiculo.origen}
                  onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, origen: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                    solicitarVehiculoErrors.origen
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500'
                  }`}
                  placeholder="Ej: Guadalajara, Jalisco"
                />
                {solicitarVehiculoErrors.origen && (
                  <p className="mt-1 text-xs text-rose-600">{solicitarVehiculoErrors.origen}</p>
                )}
              </div>

              {/* Destino */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destino <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formSolicitudVehiculo.destino}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setFormSolicitudVehiculo({ ...formSolicitudVehiculo, destino: nextValue });
                    if (destinoVehiculoCoords || destinoVehiculoDetalles) {
                      cancelDestinoVehiculoLookup();
                      setDestinoVehiculoCoords(null);
                      setDestinoVehiculoDetalles(null);
                      setIsResolviendoDestinoVehiculo(false);
                      setDestinoVehiculoMapMensaje(nextValue.trim() ? 'Destino editado manualmente. Selecciona en mapa para sincronizar coordenadas.' : '');
                    }
                  }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                    solicitarVehiculoErrors.destino
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500'
                  }`}
                  placeholder="Ej: Planta GDL, oficina central..."
                />
                {solicitarVehiculoErrors.destino && (
                  <p className="mt-1 text-xs text-rose-600">{solicitarVehiculoErrors.destino}</p>
                )}
                <div className="mt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDestinoVehiculoMap((prev) => {
                          const nextValue = !prev;
                          if (!nextValue) {
                            setShowDestinoVehiculoMapExpanded(false);
                          }
                          return nextValue;
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      {showDestinoVehiculoMap ? 'Ocultar mapa' : 'Seleccionar en mapa'}
                    </button>
                    {showDestinoVehiculoMap && (
                      <button
                        type="button"
                        onClick={() => setShowDestinoVehiculoMapExpanded(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Ampliar mapa
                      </button>
                    )}
                  </div>
                  {showDestinoVehiculoMap && !showDestinoVehiculoMapExpanded && (
                    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
                      <p className="text-[11px] text-gray-600">
                        Haz clic en el mapa para seleccionar el destino.
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Usa el selector superior del mapa: Mapa, Satelite, Hibrido y Relieve. En Satelite/Hibrido se muestran etiquetas de lugares.
                      </p>
                      <div className="mt-2 h-40 overflow-hidden rounded-md border border-gray-200">
                        <VehicleDestinationLayeredMap
                          center={VEHICLE_DESTINATION_MAP_CENTER}
                          selectedPoint={destinoVehiculoCoords}
                          destinationText={formSolicitudVehiculo.destino}
                          destinationDetails={destinoVehiculoDetalles}
                          onSelect={handleSeleccionDestinoVehiculoEnMapa}
                          compact
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                        {isResolviendoDestinoVehiculo && <span>Resolviendo dirección...</span>}
                        {!isResolviendoDestinoVehiculo && destinoVehiculoMapMensaje && (
                          <span className="text-blue-700">{destinoVehiculoMapMensaje}</span>
                        )}
                        {destinoVehiculoDetalles?.road && (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                            Calle: {destinoVehiculoDetalles.road}
                          </span>
                        )}
                        {destinoVehiculoDetalles?.industrial && (
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                            Parque/Zona: {destinoVehiculoDetalles.industrial}
                          </span>
                        )}
                        {destinoVehiculoDetalles?.poi && (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                            Punto: {destinoVehiculoDetalles.poi}
                          </span>
                        )}
                        {destinoVehiculoDetalles?.nearbyPlaces?.length ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                            Empresas detectadas: {destinoVehiculoDetalles.nearbyPlaces.length}
                          </span>
                        ) : null}
                        {(destinoVehiculoDetalles?.city || destinoVehiculoDetalles?.state) && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                            Zona: {joinUniqueTextParts([destinoVehiculoDetalles.city, destinoVehiculoDetalles.state])}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              </div>

              {/* Fechas */}
              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Inicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formSolicitudVehiculo.fechaInicio}
                    onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, fechaInicio: e.target.value })}
                    onClick={openDatePicker}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                      solicitarVehiculoErrors.fechaInicio
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {solicitarVehiculoErrors.fechaInicio && (
                    <p className="mt-1 text-xs text-rose-600">{solicitarVehiculoErrors.fechaInicio}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Fin
                  </label>
                  <input
                    type="date"
                    value={formSolicitudVehiculo.fechaFin}
                    onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, fechaFin: e.target.value })}
                    onClick={openDatePicker}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              </div>

              {/* Motivo */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formSolicitudVehiculo.motivo}
                  onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, motivo: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                    solicitarVehiculoErrors.motivo
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500'
                  }`}
                  rows={2}
                  placeholder="Describe el motivo de la solicitud..."
                />
                {solicitarVehiculoErrors.motivo && (
                  <p className="mt-1 text-xs text-rose-600">{solicitarVehiculoErrors.motivo}</p>
                )}
              </div>

              {/* Requiere Gasolina */}
              <div className="flex items-center rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 shadow-sm">
                <input
                  type="checkbox"
                  id="requiereGasolina"
                  checked={formSolicitudVehiculo.requiereGasolina}
                  onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, requiereGasolina: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                />
                <label htmlFor="requiereGasolina" className="ml-2 text-sm font-medium text-gray-700">
                  ¿Se requiere gasolina?
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setShowModalSolicitarVehiculo(false);
                  setShowSolicitarVehiculoErrors(false);
                  resetSolicitarVehiculoMapState();
                }}
                className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSolicitarVehiculo}
                disabled={isSubmittingSolicitarVehiculo}
                className="w-full sm:w-auto rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 px-4 py-1.5 text-sm text-white transition-colors hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Solicitar Vehículo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para solicitar viaje (avión, camión, hotel) */}
      {showModalSolicitarVehiculo && showDestinoVehiculoMapExpanded && canCreatePortalRequests && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/70 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:h-[88vh] sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 sm:px-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 sm:text-base">Mapa ampliado del destino</h3>
                <p className="text-xs text-slate-500">Haz clic para actualizar el destino seleccionado.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDestinoVehiculoMapExpanded(false)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex h-full flex-col p-3 sm:p-4">
              <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Destino actual:</span>{' '}
                {formSolicitudVehiculo.destino || 'Selecciona un punto en el mapa'}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {destinoVehiculoDetalles?.road && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Calle: {destinoVehiculoDetalles.road}</span>
                  )}
                  {destinoVehiculoDetalles?.industrial && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">Parque/Zona: {destinoVehiculoDetalles.industrial}</span>
                  )}
                  {destinoVehiculoDetalles?.poi && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Empresa/Punto: {destinoVehiculoDetalles.poi}</span>
                  )}
                  {destinoVehiculoDetalles?.nearbyPlaces?.length ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                      Empresas detectadas: {destinoVehiculoDetalles.nearbyPlaces.length}
                    </span>
                  ) : null}
                  {(destinoVehiculoDetalles?.neighborhood || destinoVehiculoDetalles?.city) && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                      Zona: {joinUniqueTextParts([destinoVehiculoDetalles.neighborhood, destinoVehiculoDetalles.city])}
                    </span>
                  )}
                  {(destinoVehiculoDetalles?.state || destinoVehiculoDetalles?.postcode) && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                      Estado/CP: {joinUniqueTextParts([destinoVehiculoDetalles.state, destinoVehiculoDetalles.postcode])}
                    </span>
                  )}
                  {destinoVehiculoDetalles?.country && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">País: {destinoVehiculoDetalles.country}</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
                Vista tipo Google: cambia entre Mapa, Satelite, Hibrido (satelite con calles y lugares) y Relieve.
              </div>
              <div className="mt-2 flex-1 overflow-hidden rounded-xl border border-slate-200">
                <VehicleDestinationLayeredMap
                  center={VEHICLE_DESTINATION_MAP_CENTER}
                  selectedPoint={destinoVehiculoCoords}
                  destinationText={formSolicitudVehiculo.destino}
                  destinationDetails={destinoVehiculoDetalles}
                  onSelect={handleSeleccionDestinoVehiculoEnMapa}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {showModalSolicitarViaje && canCreatePortalRequests && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Solicitar Viaje</h2>
                  <p className="text-xs text-slate-500">Captura servicios y detalles del itinerario.</p>
                </div>
                <button
                  onClick={() => {
                    setShowModalSolicitarViaje(false);
                    setShowSolicitarViajeErrors(false);
                  }}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid flex-1 auto-rows-max grid-cols-1 gap-2 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-3 py-2.5 sm:px-4 sm:py-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
              {/* Información General */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm">
                <h3 className="text-md font-semibold text-gray-900">Información General</h3>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* Proyecto */}
                <div className="min-w-0">
                  <ProyectoSelector
                    value={formSolicitudViaje.proyectoId}
                    onChange={(proyectoId) => setFormSolicitudViaje({ ...formSolicitudViaje, proyectoId })}
                    required={true}
                    showCreateOption={true}
                    label="Proyecto"
                    compact
                    showOnlyJob
                    matchInputStyle
                    inputClassName={solicitarViajeErrors.proyectoId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
                  />
                  {solicitarViajeErrors.proyectoId && (
                    <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.proyectoId}</p>
                  )}
                </div>

                {/* Origen */}
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Origen <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formSolicitudViaje.origen}
                    onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, origen: e.target.value })}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                      solicitarViajeErrors.origen
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    placeholder="Ej: Guadalajara, Jalisco"
                  />
                  {solicitarViajeErrors.origen && (
                    <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.origen}</p>
                  )}
                </div>

                </div>

                {/* Destino */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destino <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formSolicitudViaje.destino}
                    onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, destino: e.target.value })}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                      solicitarViajeErrors.destino
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    placeholder="Ej: Houston, Texas, USA"
                  />
                  {solicitarViajeErrors.destino && (
                    <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.destino}</p>
                  )}
                </div>

                {/* Fechas */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de Inicio <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formSolicitudViaje.fechaInicio}
                      onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, fechaInicio: e.target.value })}
                      onClick={openDatePicker}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                        solicitarViajeErrors.fechaInicio
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500'
                      }`}
                    />
                    {solicitarViajeErrors.fechaInicio && (
                      <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.fechaInicio}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de Fin <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formSolicitudViaje.fechaFin}
                      onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, fechaFin: e.target.value })}
                      onClick={openDatePicker}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                        solicitarViajeErrors.fechaFin
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500'
                      }`}
                    />
                    {solicitarViajeErrors.fechaFin && (
                      <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.fechaFin}</p>
                    )}
                  </div>
                </div>

                {/* Motivo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo del Viaje <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formSolicitudViaje.motivo}
                    onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, motivo: e.target.value })}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                      solicitarViajeErrors.motivo
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    rows={2}
                    placeholder="Describe el motivo del viaje..."
                  />
                  {solicitarViajeErrors.motivo && (
                    <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.motivo}</p>
                  )}
                </div>
              </div>

              {/* Servicios Requeridos */}
              <div className="self-start space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 shadow-sm">
                <h3 className="text-md font-semibold text-gray-900">Servicios Requeridos</h3>
                <p className="text-xs text-gray-600">Selecciona los servicios que necesitas (al menos uno)</p>
                {solicitarViajeErrors.servicios && (
                  <p className="text-xs text-rose-600">{solicitarViajeErrors.servicios}</p>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {/* Avión */}
                <div className="rounded-lg border border-gray-200 bg-white/80 p-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSolicitudViaje.necesitaAvion}
                      onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, necesitaAvion: e.target.checked })}
                      className="w-5 h-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Boleto de Avión</p>
                      <p className="text-xs text-gray-500">Solicitud de vuelo</p>
                    </div>
                  </label>
                  {formSolicitudViaje.necesitaAvion && (
                    <div className="mt-1.5">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detalles del Vuelo
                      </label>
                      <textarea
                        value={formSolicitudViaje.detallesAvion}
                        onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, detallesAvion: e.target.value })}
                        className="w-full min-h-[88px] resize-y px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows={3}
                        placeholder="Vuelo redondo, horarios, escalas..."
                      />
                    </div>
                  )}
                </div>

                {/* Camión */}
                <div className="rounded-lg border border-gray-200 bg-white/80 p-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSolicitudViaje.necesitaCamion}
                      onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, necesitaCamion: e.target.checked })}
                      className="w-5 h-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Camión / Transporte Terrestre</p>
                      <p className="text-xs text-gray-500">Renta de camión o transporte</p>
                    </div>
                  </label>
                  {formSolicitudViaje.necesitaCamion && (
                    <div className="mt-1.5">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detalles del Transporte
                      </label>
                      <textarea
                        value={formSolicitudViaje.detallesCamion}
                        onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, detallesCamion: e.target.value })}
                        className="w-full min-h-[88px] resize-y px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows={3}
                        placeholder="Ej: Camión de carga, tipo de vehículo, capacidad necesaria..."
                      />
                    </div>
                  )}
                </div>

                {/* Hotel */}
                <div className="rounded-lg border border-gray-200 bg-white/80 p-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSolicitudViaje.necesitaHotel}
                      onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, necesitaHotel: e.target.checked })}
                      className="w-5 h-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Hotel / Hospedaje</p>
                      <p className="text-xs text-gray-500">Reservación de hotel</p>
                    </div>
                  </label>
                  {formSolicitudViaje.necesitaHotel && (
                    <div className="mt-1.5">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detalles del Hospedaje
                      </label>
                      <textarea
                        value={formSolicitudViaje.detallesHotel}
                        onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, detallesHotel: e.target.value })}
                        className="w-full min-h-[88px] resize-y px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows={3}
                        placeholder="Ej: Hotel cerca del aeropuerto, habitación sencilla, 3 noches..."
                      />
                    </div>
                  )}
                </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
              <button
                onClick={() => {
                  setShowModalSolicitarViaje(false);
                  setShowSolicitarViajeErrors(false);
                }}
                className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSolicitarViaje}
                className="w-full sm:w-auto rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 px-4 py-1.5 text-sm text-white transition-colors hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-600"
              >
                Solicitar Viaje
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para recibir vehículo con checklist */}
      {showModalRecibirVehiculo && (
        <VehicleChecklistModal
          title="Recibir Vehículo"
          checklist={checklistRecepcion}
          setChecklist={setChecklistRecepcion}
          km={kmInicial}
          setKm={setKmInicial}
          foto={fotoRecepcion}
          setFoto={setFotoRecepcion}
          errors={recibirErrors}
          onSubmit={handleRecibirVehiculo}
          onCancel={() => {
            setShowModalRecibirVehiculo(false);
            setAssignmentSeleccionado(null);
            setShowRecibirErrors(false);
          }}
        />
      )}

      {/* Modal para devolver vehículo con checklist */}
      {showModalDevolverVehiculo && (
        <VehicleChecklistModal
          title="Devolver Vehículo"
          checklist={checklistEntrega}
          setChecklist={setChecklistEntrega}
          km={kmFinal}
          setKm={setKmFinal}
          foto={fotoEntrega}
          setFoto={setFotoEntrega}
          onSubmit={handleDevolverVehiculo}
          requireAllFields={true}
          errors={devolverErrors}
          onCancel={() => {
            setShowModalDevolverVehiculo(false);
            setAssignmentSeleccionado(null);
            setShowDevolverErrors(false);
          }}
        />
      )}

      {showVehicleReturnSuccess && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm text-gray-500">Estado actualizado</p>
                  <h3 className="text-lg font-semibold text-gray-900">Vehículo devuelto correctamente</h3>
                </div>
              </div>
              <button
                onClick={() => setShowVehicleReturnSuccess(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Se guardó el checklist y el kilometraje final. Si necesitas agregar algo extra, usa Observaciones.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowVehicleReturnSuccess(false)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Extender Viaje */}
      {showModalExtenderViaje && viaticoParaExtender && canCreatePortalRequests && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Extender Viaje</h2>
                <button
                  onClick={resetExtensionState}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-2.5 sm:px-5">
              {/* Información del viático */}
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-600">Viático</p>
                <p className="font-semibold text-gray-900">{viaticoParaExtender.destino}</p>
                <p className="text-sm text-gray-600 mt-2">Fecha fin actual</p>
                <p className="font-semibold text-gray-900">{formatDateOnlyMx(viaticoParaExtender.fechaFin)}</p>
              </div>

              {/* Nueva fecha fin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nueva Fecha de Fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={nuevaFechaFin}
                  onChange={(e) => setNuevaFechaFin(e.target.value)}
                  onClick={openDatePicker}
                  min={extensionMinDate || viaticoParaExtender.fechaFin}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Sugerencia de alimentos por días de extensión */}
              <div className={`rounded-lg border p-3 ${diasExtensionSugeridos > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-sm font-semibold text-gray-900">Sugerencia por extensión</p>
                {diasExtensionSugeridos > 0 ? (
                  <>
                    <p className="mt-1 text-xs text-gray-600">
                      Días adicionales: <span className="font-semibold text-gray-900">{diasExtensionSugeridos}</span>
                    </p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-600">Desayunos ($150)</label>
                        <input
                          type="number"
                          value={alimentosExtension.desayunos === 0 ? '' : alimentosExtension.desayunos}
                          onChange={(e) => setAlimentosExtension({
                            ...alimentosExtension,
                            desayunos: e.target.value === '' ? 0 : Number(e.target.value),
                          })}
                          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-center text-sm font-semibold text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                          placeholder={placeholderAlimentosExtension}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-600">Comidas ($200)</label>
                        <input
                          type="number"
                          value={alimentosExtension.comidas === 0 ? '' : alimentosExtension.comidas}
                          onChange={(e) => setAlimentosExtension({
                            ...alimentosExtension,
                            comidas: e.target.value === '' ? 0 : Number(e.target.value),
                          })}
                          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-center text-sm font-semibold text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                          placeholder={placeholderAlimentosExtension}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-600">Cenas ($250)</label>
                        <input
                          type="number"
                          value={alimentosExtension.cenas === 0 ? '' : alimentosExtension.cenas}
                          onChange={(e) => setAlimentosExtension({
                            ...alimentosExtension,
                            cenas: e.target.value === '' ? 0 : Number(e.target.value),
                          })}
                          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-center text-sm font-semibold text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                          placeholder={placeholderAlimentosExtension}
                          min="0"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-600">
                      Monto sugerido adicional: <span className="font-semibold text-gray-900">${totalAlimentosExtensionSugeridos.toLocaleString()} MXN</span>
                    </p>
                    <p className="mt-1 text-[11px] text-gray-600">
                      Monto capturado: <span className="font-semibold text-gray-900">${totalAlimentosExtensionCapturados.toLocaleString()} MXN</span>
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-gray-600">
                    Selecciona una fecha mayor a la fecha fin actual para calcular desayunos, comidas y cenas adicionales.
                  </p>
                )}
              </div>

              {/* Nota informativa */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Nota:</strong> La extension se envia a aprobacion del PM. La fecha fin cambia solo cuando PM aprueba.
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
              <button
                onClick={resetExtensionState}
                className="w-full sm:w-auto px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleSolicitarExtension}
                disabled={
                  isSavingExtension ||
                  Boolean(extensionPendienteModal) ||
                  !nuevaFechaFin ||
                  (extensionMinDate ? nuevaFechaFin < extensionMinDate : nuevaFechaFin <= viaticoParaExtender.fechaFin)
                }
                className="w-full sm:w-auto px-4 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSavingExtension ? 'Guardando...' : extensionPendienteModal ? 'Pendiente de aprobacion PM' : 'Solicitar Extension'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente para el checklist de vehículos
interface VehicleChecklistModalProps {
  title: string;
  checklist: VehicleConditionChecklist;
  setChecklist: (checklist: VehicleConditionChecklist) => void;
  km: number;
  setKm: (km: number) => void;
  foto: File[];
  setFoto: (foto: File[]) => void;
  errors?: {
    km?: string;
    foto?: string;
    combustible?: string;
  };
  onSubmit: () => void;
  onCancel: () => void;
  requireAllFields?: boolean;
}

function VehicleChecklistModal({ title, checklist, setChecklist, km, setKm, foto, setFoto, errors, onSubmit, onCancel, requireAllFields = false }: VehicleChecklistModalProps) {
  useEscapeKey(onCancel);
  const [kmInput, setKmInput] = useState<string>(km > 0 ? String(km) : '');
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    setKmInput(km > 0 ? String(km) : '');
  }, [km]);

  useEffect(() => {
    if (!foto.length) {
      setPhotoPreviewUrls([]);
      return;
    }

    const previewUrls = foto.map((file) => URL.createObjectURL(file));
    setPhotoPreviewUrls(previewUrls);

    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [foto]);

  const kmError = errors?.km;
  const fotoError = errors?.foto;
  const combustibleError = errors?.combustible;
  type ConditionSection = 'exterior' | 'interior' | 'mecanico';

  const sectionTone: Record<ConditionSection, string> = {
    exterior: 'border-sky-100 bg-sky-50/60',
    interior: 'border-indigo-100 bg-indigo-50/60',
    mecanico: 'border-emerald-100 bg-emerald-50/60',
  };

  const renderConditionSection = (section: ConditionSection, label: string) => (
    <div className={`rounded-xl border p-3 ${sectionTone[section]}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
        {label} {requireAllFields && <span className="text-rose-500">*</span>}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {Object.entries(checklist[section]).map(([key, value]) => (
          <div key={`${section}-${key}`}>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {key.replace('_', ' ')}
            </label>
            <select
              value={value}
              onChange={(event) => {
                const nextValue = event.target.value as 'bueno' | 'regular' | 'malo';
                setChecklist({
                  ...checklist,
                  [section]: { ...checklist[section], [key]: nextValue },
                });
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              required={requireAllFields}
            >
              <option value="bueno">Bueno</option>
              <option value="regular">Regular</option>
              <option value="malo">Malo</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
              <p className="text-xs text-slate-500">Checklist compacto de estado del vehiculo.</p>
            </div>
            <button onClick={onCancel} className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/30 px-3 py-3 sm:px-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm xl:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Datos generales</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Kilometraje <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={kmInput}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setKmInput(nextValue);
                        setKm(nextValue === '' ? 0 : Number(nextValue));
                      }}
                      className={`w-full rounded-lg border px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                        kmError
                          ? 'border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-rose-200'
                          : 'border-slate-200 bg-white focus:border-primary-500 focus:ring-primary-200'
                      }`}
                      placeholder="0"
                      min="0"
                      required={requireAllFields}
                    />
                    {kmError && <p className="mt-1 text-xs text-rose-600">{kmError}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Nivel de combustible {requireAllFields && <span className="text-rose-500">*</span>}
                    </label>
                    <select
                      value={checklist.nivelCombustible}
                      onChange={(event) => setChecklist({ ...checklist, nivelCombustible: event.target.value as '1/4' | '1/2' | '3/4' | 'lleno' })}
                      className={`w-full rounded-lg border px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                        combustibleError
                          ? 'border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-rose-200'
                          : 'border-slate-200 bg-white focus:border-primary-500 focus:ring-primary-200'
                      }`}
                      required={requireAllFields}
                    >
                      <option value="1/4">1/4</option>
                      <option value="1/2">1/2</option>
                      <option value="3/4">3/4</option>
                      <option value="lleno">Lleno</option>
                    </select>
                    {combustibleError && <p className="mt-1 text-xs text-rose-600">{combustibleError}</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Accesorios {requireAllFields && <span className="text-rose-500">*</span>}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(checklist.accesorios).map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(event) => setChecklist({
                          ...checklist,
                          accesorios: { ...checklist.accesorios, [key]: event.target.checked },
                        })}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="capitalize">{key.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {renderConditionSection('exterior', 'Exterior')}
              {renderConditionSection('interior', 'Interior')}
              {renderConditionSection('mecanico', 'Mecanico')}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observaciones
                </label>
                <textarea
                  value={checklist.observaciones}
                  onChange={(event) => setChecklist({ ...checklist, observaciones: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  rows={2}
                  placeholder="Notas adicionales sobre el estado del vehiculo..."
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fotos (hasta 3) {requireAllFields && <span className="text-rose-500">*</span>}
                </label>
                <p className="mb-2 text-[11px] text-slate-500">Agrega evidencia visual del estado.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[0, 1, 2].map((index) => (
                    <label
                      key={index}
                      className={`relative flex aspect-[5/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
                        fotoError ? 'border-rose-300 bg-rose-50' : 'border-slate-300 bg-slate-50 hover:border-primary-500 hover:bg-slate-100'
                      }`}
                    >
                      {photoPreviewUrls[index] ? (
                        <>
                          <img
                            src={photoPreviewUrls[index]}
                            alt="Vista previa"
                            className="h-full w-full rounded-md object-cover"
                          />
                          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
                            Cambiar foto
                          </span>
                        </>
                      ) : (
                        <>
                          <svg className="mb-1 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="px-1 text-[11px] text-slate-500">Agregar foto</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const selected = event.target.files?.[0] || null;
                          if (!selected) {
                            return;
                          }
                          const nextPhotos = [...foto];
                          nextPhotos[index] = selected;
                          setFoto(nextPhotos.slice(0, 3));
                        }}
                        className="hidden"
                      />
                    </label>
                  ))}
                </div>
                {fotoError && <p className="mt-2 text-xs text-rose-600">{fotoError}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
          <button
            onClick={onCancel}
            className="w-full rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 px-4 py-1.5 text-sm text-white transition-colors hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-600 sm:w-auto"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
