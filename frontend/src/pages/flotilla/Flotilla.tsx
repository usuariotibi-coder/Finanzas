import { useEffect, useMemo, useState, type FormEvent } from 'react';
import useAuth from '../../hooks/useAuth';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Vehicle, VehicleAssignment, VehicleAlert, CargaGasolina, MaintenanceRecord, VehicleConditionChecklist } from '../../types';
import GasolinaKPI from '../../components/flotilla/GasolinaKPI';
import MenuMantenimiento from '../../components/flotilla/MenuMantenimiento';
import LeafletDestinationMap from '../../components/common/LeafletDestinationMap';
import { exportToExcel, formatCurrency, formatDate } from '../../utils/exportExcel';
import {
  createFlotillaGasto,
  createFlotillaMantenimiento,
  createFlotillaVehiculo,
  fetchFlotillaAlertas,
  fetchFlotillaAsignaciones,
  fetchFlotillaCargasGasolina,
  fetchFlotillaMantenimiento,
  syncCoreAppData,
  updateFlotillaAlerta,
  updateFlotillaAsignacion,
  updateFlotillaVehiculo,
  uploadFlotillaEntregaFotos,
} from '../../utils/backendSync';
import { toApiAssetUrl } from '../../utils/api';
import { formatProyectoLabel } from '../../utils/proyectoLabel';

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isDerivedAlertId = (value: string) => value.startsWith('derived-');

const parseCoordinatesFromText = (value: string): [number, number] | null => {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const latLonPattern = /Lat\s*(-?\d+(?:\.\d+)?)\s*,\s*Lon\s*(-?\d+(?:\.\d+)?)/i;
  const latLonMatch = text.match(latLonPattern);
  if (latLonMatch) {
    const lat = Number(latLonMatch[1]);
    const lon = Number(latLonMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return [lat, lon];
    }
  }

  const decimalPairPattern = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;
  const decimalPairMatch = text.match(decimalPairPattern);
  if (decimalPairMatch) {
    const lat = Number(decimalPairMatch[1]);
    const lon = Number(decimalPairMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return [lat, lon];
    }
  }

  return null;
};

interface DestinationLayeredMapProps {
  coords: [number, number];
  destinationLabel: string;
  compact?: boolean;
}

function DestinationLayeredMap({ coords, destinationLabel, compact = false }: DestinationLayeredMapProps) {
  const tooltipText = destinationLabel || 'Destino seleccionado';

  return (
    <LeafletDestinationMap
      center={{ lat: coords[0], lng: coords[1] }}
      marker={{ lat: coords[0], lng: coords[1] }}
      markerTitle="Destino seleccionado"
      markerSubtitle={tooltipText}
      showSearchControl={false}
      showModeControl={!compact}
      defaultZoom={compact ? 15 : 17}
    />
  );
}

const getVehicleFallbackImage = (brand: string, model: string) => {
  const title = `${brand} ${model}`.trim() || 'Vehiculo';
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e2e8f0" />
          <stop offset="100%" stop-color="#cbd5e1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#bg)" />
      <rect x="160" y="200" width="880" height="400" rx="28" fill="#f8fafc" stroke="#94a3b8" stroke-width="8" />
      <text x="600" y="340" text-anchor="middle" fill="#334155" font-family="Segoe UI, Arial, sans-serif" font-size="56" font-weight="700">
        ${safeTitle}
      </text>
      <text x="600" y="420" text-anchor="middle" fill="#64748b" font-family="Segoe UI, Arial, sans-serif" font-size="36">
        Foto de referencia no disponible
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const getVehicleImageSources = (uploadedImage = '', referenceImage = '', fallbackImage = '') => {
  const sources = [
    uploadedImage,
    referenceImage,
    fallbackImage,
  ];

  const unique = new Set<string>();
  return sources.filter((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || unique.has(normalized)) {
      return false;
    }
    unique.add(normalized);
    return true;
  });
};

const VEHICLE_REFERENCE_IMAGE_CACHE_KEY = 'flotilla:vehicle-reference-image-cache:v1';
const vehicleReferenceImageCache = new Map<string, string | null>();
const vehicleReferenceImagePending = new Map<string, Promise<string | null>>();
let vehicleReferenceImageCacheLoaded = false;

const getVehicleReferenceKey = (brand: string, model: string) => {
  const normalizedBrand = normalizeText(brand);
  const normalizedModel = normalizeText(model);
  if (!normalizedBrand || !normalizedModel) {
    return '';
  }
  return `${normalizedBrand}::${normalizedModel}`;
};

const hydrateVehicleReferenceImageCache = () => {
  if (vehicleReferenceImageCacheLoaded || typeof window === 'undefined') {
    return;
  }
  vehicleReferenceImageCacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(VEHICLE_REFERENCE_IMAGE_CACHE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    Object.entries(parsed).forEach(([key, value]) => {
      vehicleReferenceImageCache.set(key, typeof value === 'string' ? value : null);
    });
  } catch {
    // ignore cache parsing errors
  }
};

const persistVehicleReferenceImageCache = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const payload = Object.fromEntries(vehicleReferenceImageCache.entries());
  try {
    window.localStorage.setItem(VEHICLE_REFERENCE_IMAGE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage write errors
  }
};

const getCachedVehicleReferenceImage = (brand: string, model: string) => {
  const key = getVehicleReferenceKey(brand, model);
  if (!key) {
    return undefined;
  }
  hydrateVehicleReferenceImageCache();
  return vehicleReferenceImageCache.get(key);
};

const setCachedVehicleReferenceImage = (brand: string, model: string, image: string | null) => {
  const key = getVehicleReferenceKey(brand, model);
  if (!key) {
    return;
  }
  hydrateVehicleReferenceImageCache();
  vehicleReferenceImageCache.set(key, image);
  persistVehicleReferenceImageCache();
};

const searchWikipediaVehicleImage = async (language: 'es' | 'en', query: string) => {
  try {
    const endpoint = `https://${language}.wikipedia.org/w/api.php`;
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrnamespace: '0',
      gsrlimit: '6',
      gsrsearch: query,
      prop: 'pageimages',
      piprop: 'original|thumbnail',
      pithumbsize: '1200',
    });
    const response = await fetch(`${endpoint}?${params.toString()}`);
    if (!response.ok) {
      return '';
    }
    const data = (await response.json()) as {
      query?: { pages?: Record<string, { original?: { source?: string }; thumbnail?: { source?: string } }> };
    };
    const pages = Object.values(data.query?.pages ?? {});
    for (const page of pages) {
      const source = page.original?.source || page.thumbnail?.source || '';
      if (source.startsWith('http')) {
        return source;
      }
    }
  } catch {
    // ignore network/API errors and try next query
  }
  return '';
};

const resolveVehicleReferenceImage = async (brand: string, model: string): Promise<string | null> => {
  const cacheKey = getVehicleReferenceKey(brand, model);
  if (!cacheKey) {
    return null;
  }

  const cached = getCachedVehicleReferenceImage(brand, model);
  if (cached !== undefined) {
    return cached;
  }

  const pending = vehicleReferenceImagePending.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const baseQuery = `${brand} ${model}`.trim();
    const queries = [
      baseQuery,
      `${baseQuery} car`,
      `${baseQuery} (automobile)`,
      `${baseQuery} carro`,
      `${baseQuery} coche`,
      `${baseQuery} automobile`,
      `${baseQuery} sedan`,
      `${brand} ${model} auto`,
      `${brand} ${model} vehicle`,
      `${brand} ${model} mexico`,
      `${brand} ${model} specs`,
    ];
    const brandOnlyQueries = [
      `${brand} car`,
      `${brand} automobile`,
      `${brand} sedan`,
      `${brand} suv`,
    ];

    for (const language of ['es', 'en'] as const) {
      for (const query of queries) {
        const image = await searchWikipediaVehicleImage(language, query);
        if (image) {
          setCachedVehicleReferenceImage(brand, model, image);
          return image;
        }
      }
      for (const query of brandOnlyQueries) {
        const image = await searchWikipediaVehicleImage(language, query);
        if (image) {
          setCachedVehicleReferenceImage(brand, model, image);
          return image;
        }
      }
    }

    setCachedVehicleReferenceImage(brand, model, null);
    return null;
  })().finally(() => {
    vehicleReferenceImagePending.delete(cacheKey);
  });

  vehicleReferenceImagePending.set(cacheKey, request);
  return request;
};

const useVehicleReferenceImage = (brand: string, model: string) => {
  const referenceKey = useMemo(() => getVehicleReferenceKey(brand, model), [brand, model]);
  const [referenceImage, setReferenceImage] = useState<string>(() => {
    const cached = getCachedVehicleReferenceImage(brand, model);
    return typeof cached === 'string' ? cached : '';
  });

  useEffect(() => {
    const cached = getCachedVehicleReferenceImage(brand, model);
    if (cached !== undefined) {
      setReferenceImage(cached ?? '');
      return;
    }

    if (!referenceKey) {
      setReferenceImage('');
      return;
    }

    let cancelled = false;
    void resolveVehicleReferenceImage(brand, model).then((image) => {
      if (!cancelled) {
        setReferenceImage(image ?? '');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [brand, model, referenceKey]);

  return referenceImage;
};

const getVehicleStatusIcon = (status: Vehicle['status']) => {
  const icons: Record<Vehicle['status'], string> = {
    disponible: '\u2705',
    asignado: '\ud83d\ude97',
    en_taller: '\ud83d\udee0\ufe0f',
    baja: '\u26d4',
    available: '\u2705',
    assigned: '\ud83d\ude97',
    in_shop: '\ud83d\udee0\ufe0f',
    out_of_service: '\u26d4',
  };

  return icons[status] ?? '\ud83d\ude97';
};

const getAssignmentStatusIcon = (status: VehicleAssignment['status']) => {
  const icons: Record<VehicleAssignment['status'], string> = {
    solicitado: '\u23f3',
    asignado: '\ud83d\ude97',
    activo: '\u2705',
    completado: '\ud83c\udfc1',
    rechazado: '\u26d4',
  };

  return icons[status] ?? '\ud83d\ude97';
};

type CanonicalVehicleStatus = 'available' | 'assigned' | 'in_shop' | 'out_of_service';

const toCanonicalVehicleStatus = (status: Vehicle['status'] | string): CanonicalVehicleStatus => {
  const normalized = String(status).trim();
  switch (normalized) {
    case 'disponible':
    case 'activo':
    case 'available':
      return 'available';
    case 'asignado':
    case 'assigned':
      return 'assigned';
    case 'en_taller':
    case 'in_shop':
      return 'in_shop';
    case 'baja':
    case 'de_baja':
    case 'out_of_service':
    default:
      return 'out_of_service';
  }
};

const getVehicleStatusLabel = (status: Vehicle['status']) => {
  const canonical = toCanonicalVehicleStatus(status);
  if (canonical === 'available') return 'Disponible';
  if (canonical === 'assigned') return 'Asignado';
  if (canonical === 'in_shop') return 'En Taller';
  return 'De Baja';
};

const isEntregaLiberada = (assignment: VehicleAssignment) =>
  Boolean(assignment.checklistEntrega?.liberacionEntrega?.validada);

const normalizeEntregaPhotoPath = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const normalized = raw.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return normalized;
  }
  if (normalized.startsWith('media/')) {
    return `/${normalized}`;
  }
  if (normalized.startsWith('flotilla/')) {
    return `/media/${normalized}`;
  }
  if (normalized.startsWith('odometro/')) {
    return `/media/flotilla/${normalized}`;
  }

  // Legacy records may store only file name; delivery photos are uploaded to flotilla/odometro.
  return `/media/flotilla/odometro/${normalized.replace(/^\/+/, '')}`;
};





const VEHICLE_ASSIGNMENTS_STORAGE_KEY = 'vehicle_assignments_data';

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
export default function Flotilla() {
  const { user } = useAuth();
  const [showNewVehicleForm, setShowNewVehicleForm] = useLocalStorageState('flotilla:showNewVehicleForm', false);
  const [showAssignmentForm, setShowAssignmentForm] = useLocalStorageState('flotilla:showAssignmentForm', false);
  const [showExportModal, setShowExportModal] = useLocalStorageState('flotilla:showExportModal', false);
  const [activeTab, setActiveTab] = useLocalStorageState<'vehiculos' | 'asignaciones' | 'mantenimiento' | 'gasolina'>('flotilla:activeTab', 'vehiculos');
  const [selectedVehicleId, setSelectedVehicleId] = useLocalStorageState<string | null>('flotilla:selectedVehicleId', null);
  const [showDetalleModal, setShowDetalleModal] = useLocalStorageState('flotilla:showDetalleModal', false);
  const [showHistorialModal, setShowHistorialModal] = useLocalStorageState('flotilla:showHistorialModal', false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicles] = useLocalStorageState<Vehicle[]>('flotilla:vehiculos', []);
  const [alerts, setAlerts] = useLocalStorageState<VehicleAlert[]>('flotilla:alertas', []);
  const [cargasGasolina, setCargasGasolina] = useLocalStorageState<CargaGasolina[]>('flotilla:cargasGasolina', []);
  const [maintenanceHistory, setMaintenanceHistory] = useLocalStorageState<MaintenanceRecord[]>('flotilla:maintenanceHistory', []);
  const [assignments, setAssignments] = useState<VehicleAssignment[]>(getVehicleAssignments);
  const [showFinalizarModal, setShowFinalizarModal] = useState(false);
  const [showRevisionEntregaModal, setShowRevisionEntregaModal] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [selectedMaintenanceAlertId, setSelectedMaintenanceAlertId] = useState<string | null>(null);
  const [maintenanceModalMode, setMaintenanceModalMode] = useState<'manual' | 'schedule' | 'complete'>('manual');

  useEscapeKey(() => setShowExportModal(false), showExportModal);

  const refreshMaintenanceData = async () => {
    const [remoteAlerts, remoteMaintenance] = await Promise.all([
      fetchFlotillaAlertas(),
      fetchFlotillaMantenimiento(),
    ]);
    setAlerts(remoteAlerts);
    setMaintenanceHistory(remoteMaintenance);
    return { remoteAlerts, remoteMaintenance };
  };

  const refreshGasolinaData = async () => {
    const remoteCargas = await fetchFlotillaCargasGasolina();
    setCargasGasolina(remoteCargas);
    return remoteCargas;
  };

  useEffect(() => {
    let isActive = true;

    const loadAssignments = async () => {
      try {
        const remoteAssignments = await fetchFlotillaAsignaciones();
        if (!isActive) {
          return;
        }
        setAssignments(remoteAssignments);
        localStorage.setItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(remoteAssignments));
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const refreshAssignments = () => {
      setAssignments(getVehicleAssignments());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === VEHICLE_ASSIGNMENTS_STORAGE_KEY) {
        refreshAssignments();
      }
    };

    const handleCustomStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === VEHICLE_ASSIGNMENTS_STORAGE_KEY) {
        refreshAssignments();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('app-storage-change', handleCustomStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app-storage-change', handleCustomStorage);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadMaintenanceSnapshot = async () => {
      try {
        await refreshMaintenanceData();
        if (!isActive) {
          return;
        }
      } catch {
        // Keep local cache if backend is temporarily unavailable.
      }
    };

    const loadGasolina = async () => {
      try {
        const remoteCargas = await refreshGasolinaData();
        if (!isActive) {
          return;
        }
        setCargasGasolina(remoteCargas);
      } catch {
        // Keep local cache if backend is temporarily unavailable.
      }
    };

    void loadMaintenanceSnapshot();
    void loadGasolina();

    return () => {
      isActive = false;
    };
  }, [setAlerts, setCargasGasolina, setMaintenanceHistory]);

  useEffect(() => {
    if (activeTab !== 'mantenimiento') {
      return;
    }

    let isActive = true;

    const reloadMaintenanceTab = async () => {
      try {
        await refreshMaintenanceData();
        if (!isActive) {
          return;
        }
      } catch {
        // Keep cached values in the view.
      }
    };

    void reloadMaintenanceTab();

    return () => {
      isActive = false;
    };
  }, [activeTab, setAlerts, setMaintenanceHistory]);

  useEffect(() => {
    if (activeTab !== 'gasolina') {
      return;
    }

    let isActive = true;

    const reloadGasolina = async () => {
      try {
        await refreshGasolinaData();
        if (!isActive) {
          return;
        }
      } catch {
        // Keep cached values in the view.
      }
    };

    void reloadGasolina();

    return () => {
      isActive = false;
    };
  }, [activeTab, setCargasGasolina]);

  const assignedVehicleIds = new Set(
    assignments
      .filter(a => a.vehicleId && (a.status === 'asignado' || a.status === 'activo'))
      .map(a => a.vehicleId)
  );
  const vehiclesWithStatus = vehicles.map((vehicle) => {
    const normalizedVehicle = {
      ...vehicle,
      status: toCanonicalVehicleStatus(vehicle.status) as Vehicle['status'],
    };

    if (normalizedVehicle.status === 'in_shop' || normalizedVehicle.status === 'out_of_service') {
      return normalizedVehicle;
    }
    if (assignedVehicleIds.has(normalizedVehicle.id)) {
      return { ...normalizedVehicle, status: 'assigned' as const };
    }
    if (normalizedVehicle.status === 'assigned') {
      return { ...normalizedVehicle, status: 'available' as const };
    }
    return normalizedVehicle;
  });

  const vehiculosDisponibles = vehiclesWithStatus.filter(v => v.status === 'available').length;
  const vehiculosAsignados = vehiclesWithStatus.filter(v => v.status === 'assigned').length;
  const vehiculosEnTaller = vehiclesWithStatus.filter(v => v.status === 'in_shop').length;
  const alertasPendientes = alerts.filter(a => !(a.atendido ?? a.attended)).length;
  const solicitudesPendientes = assignments.filter(a => a.status === 'solicitado');
  const entregasPendientesValidacion = assignments.filter(
    (assignment) => assignment.status === 'completado' && !isEntregaLiberada(assignment)
  );
  const asignacionesActivas = assignments.filter(a => a.status !== 'completado');
  const asignacionesCompletadas = assignments.filter(a => a.status === 'completado');
  const selectedAssignment = selectedAssignmentId
    ? assignments.find(a => a.id === selectedAssignmentId) ?? null
    : null;
  const selectedAssignmentVehicle = selectedAssignment
    ? vehiclesWithStatus.find(v => v.id === selectedAssignment.vehicleId) ?? null
    : null;
  const selectedMaintenanceAlert = selectedMaintenanceAlertId
    ? alerts.find((alert) => alert.id === selectedMaintenanceAlertId) ?? null
    : null;
  const editingVehicle = editingVehicleId
    ? vehiclesWithStatus.find((vehicle) => vehicle.id === editingVehicleId) ?? null
    : null;

  const saveAssignments = (nextAssignments: VehicleAssignment[]) => {
    setAssignments(nextAssignments);
    localStorage.setItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments));
    window.dispatchEvent(new CustomEvent('app-storage-change', { detail: { key: VEHICLE_ASSIGNMENTS_STORAGE_KEY } }));
  };

  const handleAssignVehicle = async (
    requestId: string,
    vehicleId: string,
    vehiculoLabel: string,
    fuelRequest?: {
      monto: number;
      tag?: string;
      fuelSource?: string;
      comentarios?: string;
    }
  ) => {
    try {
      const persisted = await updateFlotillaAsignacion(requestId, {
        vehicleId,
        status: 'asignado',
      });

      const hasAssignment = assignments.some((assignment) => assignment.id === persisted.id);
      const updatedAssignments = hasAssignment
        ? assignments.map((assignment) => (
            assignment.id === persisted.id
              ? { ...assignment, ...persisted, vehiculoLabel: persisted.vehiculoLabel || vehiculoLabel }
              : assignment
          ))
        : [{ ...persisted, vehiculoLabel: persisted.vehiculoLabel || vehiculoLabel }, ...assignments];

      saveAssignments(updatedAssignments);

      if (fuelRequest && fuelRequest.monto > 0) {
        try {
          const extra = [fuelRequest.comentarios?.trim(), fuelRequest.tag?.trim()]
            .filter(Boolean)
            .join(' | ');
          const descripcionBase = 'Solicitud de gasolina al asignar vehiculo';
          const descripcion = extra ? `${descripcionBase} - ${extra}` : descripcionBase;
          await createFlotillaGasto({
            vehicleId,
            assignmentId: persisted.id,
            tipo: 'gasolina',
            fecha: persisted.fechaInicio || new Date().toISOString().slice(0, 10),
            monto: fuelRequest.monto,
            descripcion,
            proveedor: fuelRequest.fuelSource?.trim() || 'Solicitud interna',
          });
          const remoteCargas = await fetchFlotillaCargasGasolina();
          setCargasGasolina(remoteCargas);
        } catch {
          window.alert('La asignacion se guardo, pero no se pudo registrar el gasto de gasolina.');
        }
      }

      setShowAssignmentForm(false);
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo asignar el vehiculo.');
    }
  };

  const handleOpenFinalizarModal = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setShowFinalizarModal(true);
  };

  const handleCloseFinalizarModal = () => {
    setShowFinalizarModal(false);
    setSelectedAssignmentId(null);
  };

  const handleOpenRevisionEntregaModal = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setShowRevisionEntregaModal(true);
  };

  const handleOpenRevisionEntregas = () => {
    setActiveTab('asignaciones');
    if (entregasPendientesValidacion.length > 0) {
      setSelectedAssignmentId(entregasPendientesValidacion[0].id);
      setShowRevisionEntregaModal(true);
    }
  };

  const handleCloseRevisionEntregaModal = () => {
    setShowRevisionEntregaModal(false);
    setSelectedAssignmentId(null);
  };

  const handleFinalizarAsignacion = async (
    assignmentId: string,
    kmFinal: number,
    checklistEntrega: VehicleConditionChecklist,
    fotosEntrega: File[]
  ) => {
    try {
      let persisted = await updateFlotillaAsignacion(assignmentId, {
        kmFinal,
        fechaFin: new Date().toISOString().split('T')[0],
        status: 'completado',
        checklistEntrega,
      });

      if (fotosEntrega.length > 0) {
        persisted = await uploadFlotillaEntregaFotos(assignmentId, fotosEntrega);
      }

      const updatedAssignments = assignments.map((assignment) => (
        assignment.id === assignmentId ? { ...assignment, ...persisted } : assignment
      ));
      saveAssignments(updatedAssignments);
      await refreshGasolinaData();
      handleCloseFinalizarModal();
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo finalizar la asignacion.');
    }
  };

  const handleValidarLiberacionEntrega = async (
    assignmentId: string,
    comentarios: string
  ) => {
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment || !assignment.checklistEntrega) {
      return;
    }

    try {
      const nextChecklistEntrega: VehicleConditionChecklist = {
        ...assignment.checklistEntrega,
        liberacionEntrega: {
          validada: true,
          validadaPor: user?.full_name || 'Administrador',
          validadaEn: new Date().toISOString(),
          comentarios: comentarios.trim() || undefined,
        },
      };

      const persisted = await updateFlotillaAsignacion(assignmentId, {
        checklistEntrega: nextChecklistEntrega,
      });

      const updatedAssignments = assignments.map((item) => (
        item.id === assignmentId ? { ...item, ...persisted } : item
      ));
      saveAssignments(updatedAssignments);
      handleCloseRevisionEntregaModal();
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo validar la liberacion de entrega.');
    }
  };
  const handleCloseMaintenanceModal = () => {
    setShowMaintenanceModal(false);
    setSelectedMaintenanceAlertId(null);
    setMaintenanceModalMode('manual');
  };

  const handleScheduleService = (alertId: string) => {
    setSelectedMaintenanceAlertId(alertId);
    setMaintenanceModalMode('schedule');
    setShowMaintenanceModal(true);
  };

  const handleCompleteService = (alertId: string) => {
    setSelectedMaintenanceAlertId(alertId);
    setMaintenanceModalMode('complete');
    setShowMaintenanceModal(true);
  };

  const handleOpenManualMaintenanceModal = () => {
    setSelectedMaintenanceAlertId(null);
    setMaintenanceModalMode('manual');
    setShowMaintenanceModal(true);
  };

  const handleSubmitMaintenance = async (payload: {
    vehicleId: string;
    tipo: MaintenanceRecord['tipo'];
    fecha: string;
    descripcion: string;
    costo: number;
    km?: number;
    proveedor?: string;
    nextServiceDate?: string;
    nextServiceKm?: number;
  }) => {
    try {
      const vehicle = vehiclesWithStatus.find((item) => item.id === payload.vehicleId);
      if (!vehicle) {
        throw new Error('No se encontro el vehiculo seleccionado.');
      }

      const vehiclePayload: Parameters<typeof updateFlotillaVehiculo>[1] = {};

      if (maintenanceModalMode === 'schedule') {
        if (payload.nextServiceDate) {
          vehiclePayload.nextServiceDate = payload.nextServiceDate;
        }
        if (payload.nextServiceKm !== undefined && Number.isFinite(payload.nextServiceKm)) {
          vehiclePayload.nextServiceKm = payload.nextServiceKm;
        }
      } else {
        await createFlotillaMantenimiento({
          vehicleId: payload.vehicleId,
          fecha: payload.fecha,
          tipo: payload.tipo,
          descripcion: payload.descripcion,
          costo: payload.costo,
          km: payload.km,
          proveedor: payload.proveedor,
        });

        vehiclePayload.lastServiceDate = payload.fecha;
        if (payload.km !== undefined && Number.isFinite(payload.km)) {
          vehiclePayload.lastServiceKm = payload.km;
          vehiclePayload.currentKm = payload.km;
        }
        if (payload.nextServiceDate) {
          vehiclePayload.nextServiceDate = payload.nextServiceDate;
        }
        if (payload.nextServiceKm !== undefined && Number.isFinite(payload.nextServiceKm)) {
          vehiclePayload.nextServiceKm = payload.nextServiceKm;
        }
      }

      if (Object.keys(vehiclePayload).length > 0) {
        await updateFlotillaVehiculo(payload.vehicleId, vehiclePayload);
      }

      if (selectedMaintenanceAlert && !isDerivedAlertId(selectedMaintenanceAlert.id)) {
        const nextDueDate =
          maintenanceModalMode === 'complete'
            ? selectedMaintenanceAlert.dueDate || selectedMaintenanceAlert.fechaVencimiento
            : payload.nextServiceDate || selectedMaintenanceAlert.dueDate || selectedMaintenanceAlert.fechaVencimiento;
        await updateFlotillaAlerta(selectedMaintenanceAlert.id, {
          atendido: maintenanceModalMode === 'complete',
          attended: maintenanceModalMode === 'complete',
          fechaVencimiento: nextDueDate,
          dueDate: nextDueDate,
          descripcion: selectedMaintenanceAlert.descripcion,
          tipoMantenimiento: selectedMaintenanceAlert.tipoMantenimiento,
          tipoAlerta: selectedMaintenanceAlert.tipoAlerta,
          prioridad: selectedMaintenanceAlert.prioridad,
          costoEstimado: payload.costo || selectedMaintenanceAlert.costoEstimado,
          proveedorSugerido: payload.proveedor || selectedMaintenanceAlert.proveedorSugerido,
        });
      }

      await refreshMaintenanceData();
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      handleCloseMaintenanceModal();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo registrar el mantenimiento.');
    }
  };

  const handleExportExcel = () => {
    // Crear hojas de Excel según el plan
    const sheets = [
      // Hoja 1: Resumen de Flotilla
      {
        name: 'Resumen Flotilla',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Placas', key: 'plates', width: 12 },
          { header: 'Kilometraje actual', key: 'currentKm', width: 18 },
          { header: 'Estado', key: 'status', width: 15 },
          { header: 'Próximo Servicio', key: 'nextService', width: 15 },
          { header: 'KM Próximo Servicio', key: 'nextServiceKm', width: 18 },
        ],
        data: vehiclesWithStatus.map(v => ({
          vehicle: `${v.brand} ${v.model} ${v.year}`,
          plates: v.plates,
          currentKm: v.currentKm.toLocaleString(),
          status: getVehicleStatusLabel(v.status),
          nextService: formatDate(v.maintenance.nextServiceDate),
          nextServiceKm: v.maintenance.nextServiceKm.toLocaleString(),
        })),
      },
      // Hoja 2: Historial de Mantenimientos
      {
        name: 'Mantenimientos',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Fecha', key: 'date', width: 12 },
          { header: 'Tipo', key: 'type', width: 15 },
          { header: 'KM', key: 'km', width: 12 },
          { header: 'Descripción', key: 'description', width: 40 },
          { header: 'Costo', key: 'cost', width: 15 },
          { header: 'Proveedor', key: 'provider', width: 25 },
        ],
        data: maintenanceHistory.map(m => {
          const vehicle = vehiclesWithStatus.find(v => v.id === m.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            date: formatDate(m.fecha),
            type: m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1),
            km: m.km ? m.km.toLocaleString() : 'N/A',
            description: m.descripcion,
            cost: formatCurrency(m.costo),
            provider: m.proveedor,
          };
        }),
      },
      // Hoja 3: Consumo de Gasolina
      {
        name: 'Gasolina',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Fecha', key: 'date', width: 12 },
          { header: 'Litros', key: 'liters', width: 10 },
          { header: 'Precio/L', key: 'pricePerLiter', width: 12 },
          { header: 'Total', key: 'total', width: 15 },
          { header: 'Odómetro', key: 'odometer', width: 12 },
          { header: 'Estación', key: 'station', width: 25 },
          { header: 'Factura', key: 'invoice', width: 10 },
        ],
        data: cargasGasolina.map(c => {
          const vehicle = vehiclesWithStatus.find(v => v.id === c.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            date: formatDate(c.fecha),
            liters: c.litros.toFixed(2),
            pricePerLiter: formatCurrency(c.precioLitro),
            total: formatCurrency(c.total),
            odometer: c.odometro.toLocaleString(),
            station: c.estacion,
            invoice: c.facturaId ? 'Sí' : 'No',
          };
        }),
      },
      // Hoja 4: Costos por Vehículo
      {
        name: 'Costos',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Gasolina', key: 'fuel', width: 15 },
          { header: 'Mantenimiento', key: 'maintenance', width: 15 },
          { header: 'Seguro', key: 'insurance', width: 15 },
          { header: 'Total', key: 'total', width: 15 },
        ],
        data: vehiclesWithStatus.map(v => {
          const gasolina = cargasGasolina.filter(c => c.vehicleId === v.id).reduce((sum, c) => sum + c.total, 0);
          const mantenimiento = maintenanceHistory.filter(m => m.vehicleId === v.id).reduce((sum, m) => sum + m.costo, 0);
          const seguro = 0;
          const total = gasolina + mantenimiento + seguro;

          return {
            vehicle: `${v.brand} ${v.model} (${v.plates})`,
            fuel: formatCurrency(gasolina),
            maintenance: formatCurrency(mantenimiento),
            insurance: formatCurrency(seguro),
            total: formatCurrency(total),
          };
        }),
      },
      // Hoja 5: Asignaciones
      {
        name: 'Asignaciones',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Usuario', key: 'user', width: 20 },
          { header: 'Fecha Inicio', key: 'startDate', width: 12 },
          { header: 'KM Inicial', key: 'initialKm', width: 12 },
          { header: 'Propósito', key: 'purpose', width: 15 },
          { header: 'Motivo', key: 'reason', width: 40 },
        ],
        data: assignments.map(a => {
          const vehicle = vehiclesWithStatus.find(v => v.id === a.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            user: a.userName,
            startDate: formatDate(a.fechaInicio),
            initialKm: a.kmInicial.toLocaleString(),
            purpose: a.proposito.charAt(0).toUpperCase() + a.proposito.slice(1),
            reason: a.motivo,
          };
        }),
      },
    ];

    exportToExcel(sheets, `Reporte_Flotilla_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}`);
    setShowExportModal(false);
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-0.5 pb-1.5">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2.5 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-slate-200/40 blur-3xl" />
          <div className="relative space-y-1.5">
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Flotilla</p>
                <h1 className="text-base sm:text-lg font-semibold text-slate-900">Administracion de Flotilla</h1>
                <p className="text-[10px] text-slate-600">Gestión de vehículos empresariales.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-2 py-1 text-[10px] bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Exportar Excel</span>
                </button>
                <button
                  onClick={() => setShowAssignmentForm(true)}
                  className="relative px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>Asignar Vehiculo</span>
                  {solicitudesPendientes.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center font-semibold shadow">
                      {solicitudesPendientes.length > 99 ? '99+' : solicitudesPendientes.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleOpenRevisionEntregas}
                  className="relative px-2 py-1 text-[10px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-7 9l2 2 4-4" />
                  </svg>
                  <span>Revisar Entregas</span>
                  {entregasPendientesValidacion.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center font-semibold shadow">
                      {entregasPendientesValidacion.length > 99 ? '99+' : entregasPendientesValidacion.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleOpenManualMaintenanceModal}
                  className="px-2 py-1 text-[10px] bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h2m-1-1v2m-6.938 8h13.856M7 16h10a2 2 0 002-2v-1a2 2 0 00-2-2H7a2 2 0 00-2 2v1a2 2 0 002 2zm0 0v2m10-2v2" />
                  </svg>
                  <span>Registrar Mantenimiento</span>
                </button>
                <button
                  onClick={() => setShowNewVehicleForm(true)}
                  className="px-2 py-1 text-[10px] bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Nuevo Vehiculo</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5">
              <MetricCard label="Total Vehiculos" value={vehiclesWithStatus.length} color="blue" />
              <MetricCard label="Disponibles" value={vehiculosDisponibles} color="green" />
              <MetricCard label="Asignados" value={vehiculosAsignados} color="yellow" />
              <MetricCard label="Por asignar" value={solicitudesPendientes.length} color="orange" />
              <MetricCard label="En Taller" value={vehiculosEnTaller} color="red" />
            </div>
          </div>
        </div>
      </div>

      {alertasPendientes > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
          <div className="flex">
            <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="ml-3">
              <p className="text-xs font-medium text-red-800">
                Tienes {alertasPendientes} alerta(s) pendiente(s) que requieren atención inmediata
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <TabButton label="Vehículos" isActive={activeTab === 'vehiculos'} onClick={() => setActiveTab('vehiculos')} />
            <TabButton label="Asignaciones" isActive={activeTab === 'asignaciones'} onClick={() => setActiveTab('asignaciones')} />
            <TabButton label="Mantenimiento" count={alertasPendientes} isActive={activeTab === 'mantenimiento'} onClick={() => setActiveTab('mantenimiento')} />
            <TabButton label="Gasolina" isActive={activeTab === 'gasolina'} onClick={() => setActiveTab('gasolina')} />
          </nav>
        </div>

        <div className="p-3">
          {activeTab === 'vehiculos' && (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,360px))]">
              {vehiclesWithStatus.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onVerDetalles={() => {
                    setSelectedVehicleId(vehicle.id);
                    setShowDetalleModal(true);
                  }}
                  onVerHistorial={() => {
                    setSelectedVehicleId(vehicle.id);
                    setShowHistorialModal(true);
                  }}
                  onEditar={() => {
                    setEditingVehicleId(vehicle.id);
                  }}
                />
              ))}
            </div>
          )}

          {activeTab === 'asignaciones' && (
            <div className="space-y-3">
              {assignments.length > 0 ? (
                <div className="space-y-3">
                  {asignacionesActivas.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Activas</p>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          {asignacionesActivas.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
                        {asignacionesActivas.map((assignment) => (
                          <AssignmentCard
                            key={assignment.id}
                            assignment={assignment}
                            vehicles={vehiclesWithStatus}
                            onFinalize={() => handleOpenFinalizarModal(assignment.id)}
                            onReviewEntrega={() => handleOpenRevisionEntregaModal(assignment.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {asignacionesCompletadas.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-emerald-50/40 p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Finalizadas</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {asignacionesCompletadas.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
                        {asignacionesCompletadas.map((assignment) => (
                          <AssignmentCard
                            key={assignment.id}
                            assignment={assignment}
                            vehicles={vehiclesWithStatus}
                            onFinalize={() => handleOpenFinalizarModal(assignment.id)}
                            onReviewEntrega={() => handleOpenRevisionEntregaModal(assignment.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <p className="text-sm text-gray-500">No hay asignaciones activas</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'mantenimiento' && (
            <MenuMantenimiento
              alerts={alerts}
              maintenanceHistory={maintenanceHistory}
              onScheduleService={handleScheduleService}
              onCompleteService={handleCompleteService}
            />
          )}

          {activeTab === 'gasolina' && (
            <GasolinaKPI cargas={cargasGasolina} vehicles={vehiclesWithStatus} />
          )}
        </div>
      </div>

      {/* Modal de Exportación */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Exportar Reporte de Flotilla</h3>
            <p className="text-sm text-gray-600 mb-6">
              Se generará un archivo Excel con 5 hojas:
            </p>
            <ul className="text-sm text-gray-700 space-y-2 mb-6">
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Resumen de Flotilla
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Historial de Mantenimientos
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Consumo de Gasolina
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Costos por Vehículo
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Asignaciones
              </li>
            </ul>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewVehicleForm && (
        <NewVehicleModal onClose={() => setShowNewVehicleForm(false)} />
      )}

      {editingVehicle && (
        <NewVehicleModal
          initialVehicle={editingVehicle}
          onClose={() => setEditingVehicleId(null)}
        />
      )}

      {showAssignmentForm && (
        <AssignmentModal
          vehicles={vehiclesWithStatus.filter(v => v.status === 'available')}
          requests={solicitudesPendientes}
          onAssign={handleAssignVehicle}
          onClose={() => setShowAssignmentForm(false)}
        />
      )}

      {/* Modal de Detalles del Vehículo */}
      {showDetalleModal && selectedVehicleId && (
        <DetalleVehiculoModal
          vehicle={vehiclesWithStatus.find(v => v.id === selectedVehicleId)!}
          assignments={assignments.filter(a => a.vehicleId === selectedVehicleId)}
          alerts={alerts.filter(a => a.vehicleId === selectedVehicleId)}
          onClose={() => {
            setShowDetalleModal(false);
            setSelectedVehicleId(null);
          }}
        />
      )}

      {/* Modal de Historial del Vehículo */}
      {showHistorialModal && selectedVehicleId && (
        <HistorialVehiculoModal
          vehicle={vehiclesWithStatus.find(v => v.id === selectedVehicleId)!}
          maintenanceHistory={maintenanceHistory.filter(m => m.vehicleId === selectedVehicleId)}
          cargasGasolina={cargasGasolina.filter(c => c.vehicleId === selectedVehicleId)}
          onClose={() => {
            setShowHistorialModal(false);
            setSelectedVehicleId(null);
          }}
        />
      )}

      {showFinalizarModal && selectedAssignment && (
        <FinalizarAsignacionModal
          assignment={selectedAssignment}
          vehicle={selectedAssignmentVehicle}
          onClose={handleCloseFinalizarModal}
          onFinalize={(kmFinal, checklistEntrega, fotosEntrega) =>
            handleFinalizarAsignacion(selectedAssignment.id, kmFinal, checklistEntrega, fotosEntrega)
          }
        />
      )}

      {showRevisionEntregaModal && selectedAssignment && (
        <RevisionEntregaModal
          assignment={selectedAssignment}
          vehicle={selectedAssignmentVehicle}
          onClose={handleCloseRevisionEntregaModal}
          onValidate={(comentarios) => handleValidarLiberacionEntrega(selectedAssignment.id, comentarios)}
        />
      )}

      {showMaintenanceModal && (
        <MaintenanceEntryModal
          mode={maintenanceModalMode}
          vehicles={vehiclesWithStatus}
          alert={selectedMaintenanceAlert}
          onClose={handleCloseMaintenanceModal}
          onSubmit={handleSubmitMaintenance}
        />
      )}
    </div>
  );
}

interface MaintenanceEntryModalProps {
  mode: 'manual' | 'schedule' | 'complete';
  vehicles: Vehicle[];
  alert: VehicleAlert | null;
  onClose: () => void;
  onSubmit: (payload: {
    vehicleId: string;
    tipo: MaintenanceRecord['tipo'];
    fecha: string;
    descripcion: string;
    costo: number;
    km?: number;
    proveedor?: string;
    nextServiceDate?: string;
    nextServiceKm?: number;
  }) => void;
}

function MaintenanceEntryModal({ mode, vehicles, alert, onClose, onSubmit }: MaintenanceEntryModalProps) {
  const initialVehicleId = alert?.vehicleId || vehicles[0]?.id || '';
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) ?? vehicles[0] ?? null;
  const [tipo, setTipo] = useState<MaintenanceRecord['tipo']>(alert?.tipoMantenimiento || 'preventivo');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState(alert?.descripcion || alert?.message || '');
  const [costo, setCosto] = useState(alert?.costoEstimado ? String(alert.costoEstimado) : '');
  const [km, setKm] = useState(
    selectedVehicle ? String(selectedVehicle.currentKm || selectedVehicle.kmActual || 0) : ''
  );
  const [proveedor, setProveedor] = useState(alert?.proveedorSugerido || '');
  const [nextServiceDate, setNextServiceDate] = useState(
    alert?.dueDate || alert?.fechaVencimiento || selectedVehicle?.maintenance.nextServiceDate || ''
  );
  const [nextServiceKm, setNextServiceKm] = useState(
    selectedVehicle && selectedVehicle.maintenance.nextServiceKm > 0
      ? String(selectedVehicle.maintenance.nextServiceKm)
      : ''
  );

  const title =
    mode === 'schedule'
      ? 'Agendar servicio'
      : mode === 'complete'
        ? 'Completar mantenimiento'
        : 'Registrar mantenimiento';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedCost = Number(costo);
    const parsedKm = km.trim() ? Number(km) : undefined;
    const parsedNextServiceKm = nextServiceKm.trim() ? Number(nextServiceKm) : undefined;

    if (!vehicleId) {
      window.alert('Selecciona un vehiculo.');
      return;
    }
    if (mode === 'schedule' && !nextServiceDate && parsedNextServiceKm === undefined) {
      window.alert('Captura una fecha o kilometraje para el proximo servicio.');
      return;
    }
    if (mode !== 'schedule') {
      if (!fecha.trim() || !descripcion.trim() || !Number.isFinite(parsedCost) || parsedCost <= 0) {
        window.alert('Completa fecha, descripcion y costo del mantenimiento.');
        return;
      }
    }

    onSubmit({
      vehicleId,
      tipo,
      fecha,
      descripcion: descripcion.trim(),
      costo: Number.isFinite(parsedCost) ? parsedCost : 0,
      km: parsedKm,
      proveedor: proveedor.trim() || undefined,
      nextServiceDate: nextServiceDate.trim() || undefined,
      nextServiceKm: parsedNextServiceKm,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">Los cambios se guardan en backend y actualizan la alerta del vehiculo.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Vehiculo</span>
              <select
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.brand} {vehicle.model} ({vehicle.plates})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Tipo</span>
              <select
                value={tipo}
                onChange={(event) => setTipo(event.target.value as MaintenanceRecord['tipo'])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="preventivo">Preventivo</option>
                <option value="predictivo">Predictivo</option>
                <option value="correctivo">Correctivo</option>
                <option value="otro">Otro</option>
              </select>
            </label>
          </div>

          {mode !== 'schedule' && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Fecha</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Costo</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costo}
                  onChange={(event) => setCosto(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {mode !== 'schedule' && (
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">Descripcion</span>
              <textarea
                value={descripcion}
                onChange={(event) => setDescripcion(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Kilometraje</span>
              <input
                type="number"
                min="0"
                value={km}
                onChange={(event) => setKm(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700 md:col-span-2">
              <span className="mb-1 block font-medium">Proveedor</span>
              <input
                type="text"
                value={proveedor}
                onChange={(event) => setProveedor(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm font-medium text-amber-900">Proximo servicio</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Fecha proxima</span>
                <input
                  type="date"
                  value={nextServiceDate}
                  onChange={(event) => setNextServiceDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">KM proximo</span>
                <input
                  type="number"
                  min="0"
                  value={nextServiceKm}
                  onChange={(event) => setNextServiceKm(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ label, count, isActive, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center space-x-1.5 ${
        isActive
          ? 'border-primary-500 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
          isActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'orange' | 'red';
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    blue: { accent: 'bg-blue-500', soft: 'bg-blue-100 text-blue-700' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-700' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-700' },
    orange: { accent: 'bg-orange-500', soft: 'bg-orange-100 text-orange-700' },
    red: { accent: 'bg-rose-500', soft: 'bg-rose-100 text-rose-700' },
  };
  const palette = colorClasses[color] ?? colorClasses.blue;

  return (
    <button
      type="button"
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white/90 p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md select-none"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.accent}`} />
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-base font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-full ${palette.soft}`}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
      </div>
    </button>
  );
}

interface VehicleCardProps {
  vehicle: Vehicle;
  onVerDetalles: () => void;
  onVerHistorial: () => void;
  onEditar: () => void;
}

function VehicleCard({ vehicle, onVerDetalles, onVerHistorial, onEditar }: VehicleCardProps) {
  const statusConfig: Record<Vehicle['status'], { color: string; label: string; icon: string }> = {
    disponible: { color: 'bg-green-100 text-green-800', label: 'Disponible', icon: '\u2705' },
    asignado: { color: 'bg-blue-100 text-blue-800', label: 'Asignado', icon: '\ud83d\ude97' },
    en_taller: { color: 'bg-red-100 text-red-800', label: 'En Taller', icon: '\ud83d\udee0\ufe0f' },
    baja: { color: 'bg-gray-100 text-gray-800', label: 'De Baja', icon: '\u26d4' },
    available: { color: 'bg-green-100 text-green-800', label: 'Disponible', icon: '\u2705' },
    assigned: { color: 'bg-blue-100 text-blue-800', label: 'Asignado', icon: '\ud83d\ude97' },
    in_shop: { color: 'bg-red-100 text-red-800', label: 'En Taller', icon: '\ud83d\udee0\ufe0f' },
    out_of_service: { color: 'bg-gray-100 text-gray-800', label: 'De Baja', icon: '\u26d4' },
  };

  const status = statusConfig[vehicle.status];
  const uploadedImage = vehicle.foto ? (toApiAssetUrl(vehicle.foto) ?? vehicle.foto) : '';
  const referenceImage = useVehicleReferenceImage(vehicle.brand, vehicle.model);
  const fallbackImage = getVehicleFallbackImage(vehicle.brand, vehicle.model);
  const imageSources = useMemo(
    () => getVehicleImageSources(uploadedImage, referenceImage, fallbackImage),
    [uploadedImage, referenceImage, fallbackImage]
  );
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [imageSources]);

  const vehicleImage = imageSources[Math.min(imageIndex, imageSources.length - 1)] || fallbackImage;
  const isPlaceholderImage = vehicleImage.startsWith('data:image/svg+xml');

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-lg">
      {/* Imagen del Vehículo */}
      <div className="relative h-24 bg-gray-200">
        <img
          src={vehicleImage}
          alt={`${vehicle.brand} ${vehicle.model}`}
          className={`h-full w-full ${isPlaceholderImage ? 'object-contain bg-slate-100 p-1.5' : 'object-cover bg-slate-50'}`}
          loading="lazy"
          onError={() => {
            setImageIndex((prev) => (prev < imageSources.length - 1 ? prev + 1 : prev));
          }}
        />
        <div className="absolute right-1.5 top-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${status.color} shadow-sm`}>
            <span className="text-xs">{status.icon}</span>
            {status.label}
          </span>
        </div>
      </div>

      {/* Información del Vehículo */}
      <div className="p-2">
        <div className="mb-1">
          <h3 className="text-[14px] font-bold text-gray-900">{vehicle.brand} {vehicle.model}</h3>
          <p className="text-[11px] text-gray-600">{vehicle.year}</p>
        </div>

        <div className="mb-1.5 space-y-0.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-600">Placas:</span>
            <span className="font-semibold text-gray-900">{vehicle.plates}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-600">Color:</span>
            <span className="text-gray-900">{vehicle.color}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-600">Kilometraje actual:</span>
            <span className="font-semibold text-gray-900">{vehicle.currentKm.toLocaleString()} km</span>
          </div>
        </div>

        <div className="mb-1.5 border-t border-gray-200 pt-1">
          <p className="mb-0.5 text-[10px] text-gray-600">Próximo Mantenimiento:</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-900">{formatDate(vehicle.maintenance.nextServiceDate)}</span>
            <span className="text-[10px] text-gray-600">{vehicle.maintenance.nextServiceKm.toLocaleString()} km</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={onVerDetalles}
            className="flex-1 rounded-lg bg-primary-50 px-1.5 py-1 text-[10px] font-medium text-primary-700 transition-colors hover:bg-primary-100"
          >
            Ver Detalles
          </button>
          <button
            onClick={onVerHistorial}
            className="flex-1 rounded-lg bg-gray-50 px-1.5 py-1 text-[10px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Historial
          </button>
          <button
            onClick={onEditar}
            className="rounded-lg bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            Modificar
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  vehicles,
  onFinalize,
  onReviewEntrega,
}: {
  assignment: VehicleAssignment;
  vehicles: Vehicle[];
  onFinalize: () => void;
  onReviewEntrega: () => void;
}) {
  const vehicle = vehicles.find(v => v.id === assignment.vehicleId);
  const vehicleLabel = vehicle
    ? `${vehicle.brand} ${vehicle.model} - ${vehicle.plates}`
    : assignment.vehiculoLabel || 'Vehiculo pendiente de asignacion';
  const statusIcon = getAssignmentStatusIcon(assignment.status);
  const isCompleted = assignment.status === 'completado';
  const entregaLiberada = isEntregaLiberada(assignment);
  const canReviewEntrega = isCompleted;
  const kmFinalText = assignment.kmFinal ? assignment.kmFinal.toLocaleString() : 'Sin captura';
  const accentByStatus: Record<VehicleAssignment['status'], string> = {
    solicitado: 'bg-slate-500',
    asignado: 'bg-amber-500',
    activo: 'bg-blue-500',
    completado: 'bg-emerald-500',
    rechazado: 'bg-rose-500',
  };
  const statusBadge = (() => {
    switch (assignment.status) {
      case 'solicitado':
        return { label: 'Solicitado', color: 'bg-slate-100 text-slate-700' };
      case 'asignado':
        return { label: 'Asignado', color: 'bg-amber-100 text-amber-700' };
      case 'activo':
        return { label: 'Activo', color: 'bg-blue-100 text-blue-700' };
      case 'completado':
        return { label: 'Completado', color: 'bg-emerald-100 text-emerald-700' };
      case 'rechazado':
        return { label: 'Rechazado', color: 'bg-rose-100 text-rose-700' };
      default:
        return { label: assignment.status, color: 'bg-slate-100 text-slate-700' };
    }
  })();

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${accentByStatus[assignment.status] ?? 'bg-slate-400'}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">
              {statusIcon}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900">{vehicleLabel}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {assignment.motivo} - Desde {formatDate(assignment.fechaInicio)}
              </p>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
            {isCompleted && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                entregaLiberada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {entregaLiberada ? 'Liberacion validada' : 'Pendiente liberacion'}
              </span>
            )}
            <span className="max-w-[150px] truncate rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
              Asignado a: {assignment.userName}
            </span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-slate-700">
              Proposito: {assignment.proposito}
            </span>
            {(assignment.origen || assignment.destino) && (
              <span className="max-w-[180px] truncate rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                Ruta: {assignment.origen || 'N/A'} - {assignment.destino || 'N/A'}
              </span>
            )}
          </div>
        </div>

        <div className="w-[96px] flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-right">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">KM Inicial</p>
          <p className="text-[11px] font-semibold text-slate-900">{assignment.kmInicial.toLocaleString()}</p>
          {isCompleted && (
            <>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">KM Final</p>
              <p className="text-[11px] font-semibold text-slate-900">{kmFinalText}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-1.5">
        {isCompleted ? (
          <span className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {'\ud83c\udfc1'} Finalizado
          </span>
        ) : (
          <button
            onClick={onFinalize}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Finalizar
          </button>
        )}
        {canReviewEntrega && (
          <button
            onClick={onReviewEntrega}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Revisar entrega
          </button>
        )}
      </div>
    </div>
  );
}

function RevisionEntregaModal({
  assignment,
  vehicle,
  onClose,
  onValidate,
}: {
  assignment: VehicleAssignment;
  vehicle: Vehicle | null;
  onClose: () => void;
  onValidate: (comentarios: string) => Promise<void> | void;
}) {
  useEscapeKey(onClose);
  const checklist = assignment.checklistEntrega;
  const [comentariosLiberacion, setComentariosLiberacion] = useState(checklist?.liberacionEntrega?.comentarios || '');
  const [submitting, setSubmitting] = useState(false);
  const entregaLiberada = isEntregaLiberada(assignment);
  const fotosNombres = checklist?.fotos?.length
    ? checklist.fotos
    : checklist?.foto
    ? [checklist.foto]
    : [];
  const fotosPaths = checklist?.fotosUrls?.length
    ? checklist.fotosUrls
    : assignment.fotoOdometroFinal
    ? [assignment.fotoOdometroFinal]
    : [];
  const fotosEntrega = Array.from({ length: Math.max(fotosNombres.length, fotosPaths.length) }, (_, index) => ({
    nombre: fotosNombres[index] || fotosPaths[index] || `Foto ${index + 1}`,
    path: fotosPaths[index] || '',
  }));
  const vehiculoLabel = vehicle
    ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})`
    : assignment.vehiculoLabel || 'Vehiculo sin asignar';

  const getConditionBadgeClass = (value: 'bueno' | 'regular' | 'malo') => {
    if (value === 'bueno') return 'bg-emerald-100 text-emerald-700';
    if (value === 'regular') return 'bg-amber-100 text-amber-700';
    return 'bg-rose-100 text-rose-700';
  };

  const renderConditionSection = (
    title: string,
    values: Record<string, 'bueno' | 'regular' | 'malo'>
  ) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(values).map(([key, value]) => (
          <div key={`${title}-${key}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
            <span className="text-xs text-slate-700 capitalize">{key.replace('_', ' ')}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getConditionBadgeClass(value)}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const handleValidate = async () => {
    setSubmitting(true);
    try {
      await onValidate(comentariosLiberacion);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Revision de entrega</h2>
              <p className="text-xs text-slate-500">Validacion para liberacion del vehiculo.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 transition-colors hover:text-slate-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="text-slate-500">Vehiculo:</span> <span className="font-medium text-slate-900">{vehiculoLabel}</span></div>
              <div><span className="text-slate-500">Usuario:</span> <span className="font-medium text-slate-900">{assignment.userName}</span></div>
              <div><span className="text-slate-500">KM inicial:</span> <span className="font-medium text-slate-900">{assignment.kmInicial.toLocaleString()}</span></div>
              <div><span className="text-slate-500">KM final:</span> <span className="font-medium text-slate-900">{assignment.kmFinal?.toLocaleString() || 'Sin captura'}</span></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                entregaLiberada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {entregaLiberada ? 'Liberacion validada' : 'Pendiente de liberacion'}
              </span>
              {checklist?.liberacionEntrega?.validadaPor && (
                <span className="text-xs text-slate-600">
                  Validado por {checklist.liberacionEntrega.validadaPor}
                  {checklist.liberacionEntrega.validadaEn ? ` (${formatDate(checklist.liberacionEntrega.validadaEn)})` : ''}
                </span>
              )}
            </div>
          </div>

          {checklist ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {renderConditionSection('Exterior', checklist.exterior)}
                {renderConditionSection('Interior', checklist.interior)}
                {renderConditionSection('Mecanico', checklist.mecanico)}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Accesorios</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {Object.entries(checklist.accesorios).map(([key, value]) => (
                      <div key={`accesorio-${key}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <span className="text-xs text-slate-700 capitalize">{key.replace('_', ' ')}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          value ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {value ? 'Si' : 'No'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Captura del usuario</p>
                  <p className="text-sm text-slate-700">
                    <span className="text-slate-500">Combustible:</span> {checklist.nivelCombustible || 'Sin captura'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Observaciones</p>
                  <p className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                    {checklist.observaciones?.trim() || 'Sin observaciones.'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Fotos reportadas</p>
                {fotosEntrega.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {fotosEntrega.map((foto, index) => {
                      const fotoUrl = toApiAssetUrl(normalizeEntregaPhotoPath(foto.path));
                      return (
                        <a
                          key={`${foto.nombre}-${index}`}
                          href={fotoUrl || undefined}
                          target={fotoUrl ? '_blank' : undefined}
                          rel={fotoUrl ? 'noreferrer' : undefined}
                          className="flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-xs text-slate-700"
                        >
                          {fotoUrl ? (
                            <img
                              src={fotoUrl}
                              alt={foto.nombre}
                              className="h-7 w-7 rounded-full border border-slate-200 object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-[10px] text-slate-500">
                              N/A
                            </span>
                          )}
                          <span className="max-w-52 truncate" title={foto.nombre}>
                            {foto.nombre}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">El usuario no subio fotos en esta entrega.</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Esta asignacion no tiene checklist de entrega capturado por el usuario.
            </div>
          )}

          {!entregaLiberada && checklist && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Comentarios de validacion (opcional)
              </label>
              <textarea
                value={comentariosLiberacion}
                onChange={(event) => setComentariosLiberacion(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                rows={3}
                placeholder="Ej. Se reviso fisicamente y coincide con la entrega reportada."
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cerrar
          </button>
          {!entregaLiberada && checklist && (
            <button
              onClick={() => {
                void handleValidate();
              }}
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Validando...' : 'Validar liberacion'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FinalizarAsignacionModal({
  assignment,
  vehicle,
  onClose,
  onFinalize,
}: {
  assignment: VehicleAssignment;
  vehicle: Vehicle | null;
  onClose: () => void;
  onFinalize: (kmFinal: number, checklistEntrega: VehicleConditionChecklist, fotosEntrega: File[]) => Promise<void> | void;
}) {
  useEscapeKey(onClose);
  const [kmFinal, setKmFinal] = useState<string>(assignment.kmFinal ? String(assignment.kmFinal) : '');
  const [fotoEntrega, setFotoEntrega] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checklistEntrega, setChecklistEntrega] = useState<VehicleConditionChecklist>(
    assignment.checklistEntrega ?? {
      exterior: {
        carroceria: 'bueno',
        pintura: 'bueno',
        llantas: 'bueno',
        cristales: 'bueno',
        espejos: 'bueno',
      },
      interior: {
        asientos: 'bueno',
        tablero: 'bueno',
        tapiceria: 'bueno',
        limpieza: 'bueno',
      },
      mecanico: {
        motor: 'bueno',
        frenos: 'bueno',
        luces: 'bueno',
        aire_acondicionado: 'bueno',
      },
      accesorios: {
        gato: true,
        llave_cruz: true,
        triangulo_seguridad: true,
        extintor: true,
        llanta_refaccion: true,
      },
      nivelCombustible: 'lleno',
      observaciones: '',
    }
  );

  const statusConfig: Record<Vehicle['status'], { label: string; color: string }> = {
    disponible: { label: 'Disponible', color: 'bg-green-100 text-green-800' },
    asignado: { label: 'Asignado', color: 'bg-blue-100 text-blue-800' },
    en_taller: { label: 'En Taller', color: 'bg-red-100 text-red-800' },
    baja: { label: 'De Baja', color: 'bg-gray-100 text-gray-800' },
    available: { label: 'Disponible', color: 'bg-green-100 text-green-800' },
    assigned: { label: 'Asignado', color: 'bg-blue-100 text-blue-800' },
    in_shop: { label: 'En Taller', color: 'bg-red-100 text-red-800' },
    out_of_service: { label: 'De Baja', color: 'bg-gray-100 text-gray-800' },
  };
  const statusBadge = vehicle ? statusConfig[vehicle.status] : null;
  const vehiculoLabel = vehicle
    ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})`
    : assignment.vehiculoLabel || 'Vehiculo sin asignar';
  const kmFinalValue = Number(kmFinal);
  const kmFinalInvalid = !kmFinal || Number.isNaN(kmFinalValue) || kmFinalValue <= 0;
  const kmFinalError = showErrors
    ? kmFinalInvalid
      ? 'Ingresa el kilometraje final.'
      : kmFinalValue < assignment.kmInicial
      ? 'El KM final debe ser mayor o igual al KM inicial.'
      : ''
    : '';
  const fuelError = showErrors && !checklistEntrega.nivelCombustible ? 'Selecciona el nivel de combustible.' : '';
  const fotoError = showErrors && !fotoEntrega ? 'Agrega al menos una foto.' : '';

  const handleSubmit = async () => {
    setShowErrors(true);
    if (kmFinalInvalid || kmFinalValue < assignment.kmInicial || !checklistEntrega.nivelCombustible || !fotoEntrega) {
      return;
    }
    const checklistToSave = {
      ...checklistEntrega,
      foto: fotoEntrega?.name,
      fotos: fotoEntrega ? [fotoEntrega.name] : [],
    };
    setSubmitting(true);
    try {
      await onFinalize(kmFinalValue, checklistToSave, fotoEntrega ? [fotoEntrega] : []);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Finalizar asignacion</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-600">Vehiculo</p>
                <p className="text-base font-semibold text-slate-900">{vehiculoLabel}</p>
              </div>
              {statusBadge && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBadge.color}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
              <div>
                <span className="text-slate-500">Asignado a:</span> {assignment.userName}
              </div>
              <div>
                <span className="text-slate-500">Motivo:</span> {assignment.motivo}
              </div>
              <div>
                <span className="text-slate-500">Inicio:</span> {formatDate(assignment.fechaInicio)}
              </div>
              <div>
                <span className="text-slate-500">KM inicial:</span> {assignment.kmInicial.toLocaleString()} km
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">KM final *</label>
              <input
                type="number"
                min={assignment.kmInicial}
                value={kmFinal}
                onChange={(event) => setKmFinal(event.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  kmFinalError
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder="Ingresa el KM final"
              />
              {kmFinalError && (
                <p className="mt-1 text-xs text-rose-600">{kmFinalError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de cierre</label>
              <input
                type="text"
                value={formatDate(new Date().toISOString())}
                readOnly
                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
              />
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Exterior *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.exterior).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      exterior: { ...checklistEntrega.exterior, [key]: e.target.value as 'bueno' | 'regular' | 'malo' },
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="bueno">Bueno</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Interior *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.interior).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      interior: { ...checklistEntrega.interior, [key]: e.target.value as 'bueno' | 'regular' | 'malo' },
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="bueno">Bueno</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Mecanico *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.mecanico).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      mecanico: { ...checklistEntrega.mecanico, [key]: e.target.value as 'bueno' | 'regular' | 'malo' },
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="bueno">Bueno</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Accesorios *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.accesorios).map(([key, value]) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      accesorios: { ...checklistEntrega.accesorios, [key]: e.target.checked },
                    })}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 capitalize">{key.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nivel de combustible *</label>
            <select
              value={checklistEntrega.nivelCombustible}
              onChange={(e) => setChecklistEntrega({
                ...checklistEntrega,
                nivelCombustible: e.target.value as '1/4' | '1/2' | '3/4' | 'lleno',
              })}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                fuelError
                  ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                  : 'border-gray-300 focus:ring-primary-500'
              }`}
            >
              <option value="1/4">1/4</option>
              <option value="1/2">1/2</option>
              <option value="3/4">3/4</option>
              <option value="lleno">Lleno</option>
            </select>
            {fuelError && (
              <p className="mt-1 text-xs text-rose-600">{fuelError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fotos (minimo 1) *</label>
            <p className="text-xs text-gray-500 mb-3">Agrega evidencia del estado del vehiculo.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((index) => (
                <label
                  key={index}
                  className={`aspect-square border-2 border-dashed rounded-lg hover:border-primary-500 cursor-pointer transition-colors flex flex-col items-center justify-center ${
                    fotoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a1 1 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-gray-500 text-center px-2">Agregar foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setFotoEntrega(selected);
                    }}
                    className="hidden"
                  />
                </label>
              ))}
            </div>
            {fotoError && (
              <p className="text-xs text-rose-600 mt-2">{fotoError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
            <textarea
              value={checklistEntrega.observaciones}
              onChange={(e) => setChecklistEntrega({ ...checklistEntrega, observaciones: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              rows={3}
              placeholder="Notas adicionales sobre el estado del vehiculo..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={submitting}
            className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            {submitting ? 'Guardando...' : 'Finalizar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewVehicleModal({
  onClose,
  initialVehicle = null,
}: {
  onClose: () => void;
  initialVehicle?: Vehicle | null;
}) {
  useEscapeKey(onClose);
  const { user } = useAuth();
  const isEditMode = Boolean(initialVehicle);
  const brandModelOptions: Record<string, string[]> = {
    Nissan: ['Versa', 'Sentra', 'March', 'NP300', 'Frontier', 'Kicks', 'X-Trail'],
    Toyota: ['Yaris', 'Corolla', 'Hilux', 'RAV4', 'Avanza', 'Hiace'],
    Chevrolet: ['Aveo', 'Onix', 'Tracker', 'S10', 'Silverado', 'Captiva'],
    Volkswagen: ['Jetta', 'Vento', 'Taos', 'Tiguan', 'Saveiro', 'Amarok'],
    Ford: ['Figo', 'Focus', 'Escape', 'Ranger', 'Transit', 'Maverick'],
    Kia: ['Rio', 'Forte', 'Sportage', 'Seltos', 'Soul', 'K3'],
    Hyundai: ['Grand i10', 'Accent', 'Elantra', 'Tucson', 'Creta', 'Santa Fe'],
    Mazda: ['Mazda2', 'Mazda3', 'CX-3', 'CX-5', 'BT-50'],
    Honda: ['City', 'Civic', 'HR-V', 'CR-V', 'BR-V'],
    Renault: ['Kwid', 'Logan', 'Duster', 'Oroch', 'Koleos'],
    Otro: ['Sedan', 'SUV', 'Pickup', 'Van', 'Hatchback', 'Coupe'],
  };
  const brandOptions = Object.keys(brandModelOptions);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 31 }, (_, index) => String(currentYear + 1 - index));
  const colorOptions = ['Blanco', 'Negro', 'Gris', 'Plata', 'Azul', 'Rojo', 'Verde', 'Beige', 'Cafe', 'Amarillo', 'Naranja', 'Otro'];
  const existingPhotoUrl = initialVehicle?.foto ? (toApiAssetUrl(initialVehicle.foto) || initialVehicle.foto) : '';

  const [formData, setFormData] = useState(() => ({
    brand: initialVehicle?.brand || initialVehicle?.marca || '',
    model: initialVehicle?.model || initialVehicle?.modelo || '',
    year: initialVehicle ? String(initialVehicle.year || initialVehicle.anio || '') : '',
    plates: initialVehicle?.plates || initialVehicle?.placas || '',
    serialNumber: initialVehicle?.serialNumber || initialVehicle?.numeroSerie || '',
    color: initialVehicle?.color || '',
    currentKm: initialVehicle ? String(initialVehicle.currentKm ?? initialVehicle.kmActual ?? 0) : '0',
    insuranceCompany: initialVehicle?.insurance?.company || initialVehicle?.seguro?.compania || '',
    insurancePolicyNumber: initialVehicle?.insurance?.policyNumber || initialVehicle?.seguro?.poliza || '',
    insuranceExpirationDate: initialVehicle?.insurance?.expirationDate || initialVehicle?.seguro?.vigencia || '',
  }));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(existingPhotoUrl);
  const modelOptions = formData.brand ? (brandModelOptions[formData.brand] ?? []) : [];
  const referencePhotoUrl = useVehicleReferenceImage(formData.brand, formData.model);
  const modelSelected = Boolean(formData.brand.trim() && formData.model.trim());
  const fallbackPhotoUrl = modelSelected ? getVehicleFallbackImage(formData.brand, formData.model) : '';
  const referenceLookupStatus = getCachedVehicleReferenceImage(formData.brand, formData.model);
  const referenceLookupFinished = modelSelected && referenceLookupStatus !== undefined;
  const autoPhotoPreviewSources = useMemo(() => {
    if (!modelSelected) {
      return [];
    }
    return getVehicleImageSources('', referencePhotoUrl, fallbackPhotoUrl);
  }, [modelSelected, referencePhotoUrl, fallbackPhotoUrl]);
  const previewSources = useMemo(
    () => (existingPhotoUrl ? [existingPhotoUrl, ...autoPhotoPreviewSources] : autoPhotoPreviewSources),
    [existingPhotoUrl, autoPhotoPreviewSources]
  );
  const [previewSourceIndex, setPreviewSourceIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [optimisticClosing, setOptimisticClosing] = useState(false);

  useEffect(() => {
    setPreviewSourceIndex(0);
  }, [previewSources, photoFile]);

  useEffect(() => {
    if (!photoFile) {
      const source = previewSources[Math.min(previewSourceIndex, previewSources.length - 1)] || '';
      setPhotoPreviewUrl(source);
      return;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile, previewSources, previewSourceIndex]);

  const yearValue = Number(formData.year);
  const yearInvalid = !formData.year || Number.isNaN(yearValue) || yearValue <= 0;
  const currentKmValue = Number(formData.currentKm);
  const currentKmInvalid = Number.isNaN(currentKmValue) || currentKmValue < 0;
  const computedErrors = {
    brand: !formData.brand.trim() ? 'Ingresa la marca.' : '',
    model: !formData.model.trim() ? 'Ingresa el modelo.' : '',
    year: yearInvalid ? 'Ingresa un año válido.' : '',
    plates: !formData.plates.trim() ? 'Ingresa las placas.' : '',
    serialNumber: !formData.serialNumber.trim() ? 'Ingresa el número de serie.' : '',
    color: !formData.color.trim() ? 'Ingresa el color.' : '',
    currentKm: currentKmInvalid ? 'Ingresa un kilometraje actual válido (>= 0).' : '',
  };
  const errors: Partial<typeof computedErrors> = showErrors ? computedErrors : {};
  const hasErrors = Object.values(computedErrors).some(Boolean);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    setOptimisticClosing(true);
    try {
      const payload = {
        brand: formData.brand.trim(),
        model: formData.model.trim(),
        year: Number(formData.year),
        plates: formData.plates.trim().toUpperCase(),
        serialNumber: formData.serialNumber.trim().toUpperCase(),
        color: formData.color.trim(),
        currentKm: Number(formData.currentKm || 0),
        insuranceCompany: formData.insuranceCompany.trim(),
        insurancePolicyNumber: formData.insurancePolicyNumber.trim(),
        insuranceExpirationDate: formData.insuranceExpirationDate.trim(),
        foto: photoFile,
      };

      if (isEditMode && initialVehicle) {
        await updateFlotillaVehiculo(initialVehicle.id, payload);
      } else {
        await createFlotillaVehiculo(payload);
      }
      onClose();
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      setOptimisticClosing(false);
      window.alert(
        error instanceof Error
          ? error.message
          : isEditMode
            ? 'No se pudo actualizar el vehiculo.'
            : 'No se pudo registrar el vehiculo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (optimisticClosing) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {isEditMode ? 'Modificar Vehiculo' : 'Registrar Nuevo Vehiculo'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form className="p-6 space-y-6" onSubmit={(event) => {
          void handleSubmit(event);
        }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Marca</label>
              <select
                value={formData.brand}
                onChange={(event) => setFormData((prev) => ({
                  ...prev,
                  brand: event.target.value,
                  model: '',
                }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.brand
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              >
                <option value="">Selecciona una marca</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
              {errors.brand && (
                <p className="mt-1 text-xs text-rose-600">{errors.brand}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
              <select
                value={formData.model}
                onChange={(event) => setFormData((prev) => ({ ...prev, model: event.target.value }))}
                disabled={!formData.brand}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.model
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              >
                <option value="">
                  {formData.brand ? 'Selecciona un modelo' : 'Primero selecciona marca'}
                </option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              {errors.model && (
                <p className="mt-1 text-xs text-rose-600">{errors.model}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Año</label>
              <select
                value={formData.year}
                onChange={(event) => setFormData((prev) => ({ ...prev, year: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.year
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              >
                <option value="">Selecciona el anio</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              {errors.year && (
                <p className="mt-1 text-xs text-rose-600">{errors.year}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Placas</label>
              <input
                type="text"
                value={formData.plates}
                onChange={(event) => setFormData((prev) => ({ ...prev, plates: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.plates
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.plates && (
                <p className="mt-1 text-xs text-rose-600">{errors.plates}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Número de Serie</label>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={(event) => setFormData((prev) => ({ ...prev, serialNumber: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.serialNumber
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.serialNumber && (
                <p className="mt-1 text-xs text-rose-600">{errors.serialNumber}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <select
                value={formData.color}
                onChange={(event) => setFormData((prev) => ({ ...prev, color: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.color
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              >
                <option value="">Selecciona un color</option>
                {colorOptions.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
              {errors.color && (
                <p className="mt-1 text-xs text-rose-600">{errors.color}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kilometraje actual</label>
              <input
                type="number"
                min={0}
                value={formData.currentKm}
                onChange={(event) => setFormData((prev) => ({ ...prev, currentKm: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.currentKm
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder="Ej: 12500"
              />
              {errors.currentKm && (
                <p className="mt-1 text-xs text-rose-600">{errors.currentKm}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Compañía de seguro (opcional)</label>
              <input
                type="text"
                value={formData.insuranceCompany}
                onChange={(event) => setFormData((prev) => ({ ...prev, insuranceCompany: event.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Ej: AXA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Póliza (opcional)</label>
              <input
                type="text"
                value={formData.insurancePolicyNumber}
                onChange={(event) => setFormData((prev) => ({ ...prev, insurancePolicyNumber: event.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Ej: POL-123456"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vigencia del seguro (opcional)</label>
              <input
                type="date"
                value={formData.insuranceExpirationDate}
                onChange={(event) => setFormData((prev) => ({ ...prev, insuranceExpirationDate: event.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Foto del Vehiculo (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPhotoFile(file);
                  }}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-primary-700"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Formatos recomendados: JPG o PNG. Maximo sugerido: 5 MB.
                </p>
                <p className="mt-1 text-xs text-primary-700">
                  Si no seleccionas archivo, se usara una foto automatica y, si no existe, un fallback del vehiculo.
                </p>
              </div>
              <div className="w-full md:w-56">
                <div className="h-28 w-full overflow-hidden rounded-md border border-gray-200 bg-white">
                  {photoPreviewUrl ? (
                    <img
                      src={photoPreviewUrl}
                      alt="Vista previa del vehiculo"
                      className="h-full w-full object-cover"
                      onError={() => {
                        if (photoFile) {
                          return;
                        }
                        setPreviewSourceIndex((prev) => (prev < previewSources.length - 1 ? prev + 1 : prev));
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-500">
                      {modelSelected
                        ? (referenceLookupFinished ? 'Cargando fallback del vehiculo...' : 'Buscando foto de referencia...')
                        : 'Selecciona marca y modelo'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? (isEditMode ? 'Guardando...' : 'Registrando...') : (isEditMode ? 'Guardar cambios' : 'Registrar Vehiculo')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignmentModal({
  vehicles,
  requests,
  onAssign,
  onClose,
}: {
  vehicles: Vehicle[];
  requests: VehicleAssignment[];
  onAssign: (
    requestId: string,
    vehicleId: string,
    vehiculoLabel: string,
    fuelRequest?: {
      monto: number;
      tag?: string;
      fuelSource?: string;
      comentarios?: string;
    }
  ) => Promise<void> | void;
  onClose: () => void;
}) {
  const [showExpandedMap, setShowExpandedMap] = useState(false);
  useEscapeKey(() => {
    if (showExpandedMap) {
      setShowExpandedMap(false);
      return;
    }
    onClose();
  });
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedFuelSource, setSelectedFuelSource] = useState('');
  const [solicitudGasolina, setSolicitudGasolina] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedRequest = requests.find(r => r.id === selectedRequestId);
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const projectLabel = formatProyectoLabel(selectedRequest?.proyectoNombre, selectedRequest?.proyectoId);
  const requestError = showErrors && !selectedRequestId ? 'Selecciona una solicitud.' : '';
  const vehicleError = showErrors && !selectedVehicleId ? 'Selecciona un vehiculo.' : '';
  const summaryDestination = selectedRequest?.destino?.trim() || '';
  const summaryDestinationEmbedUrl = summaryDestination
    ? `https://www.google.com/maps?q=${encodeURIComponent(summaryDestination)}&output=embed`
    : '';
  const [summaryMapCoords, setSummaryMapCoords] = useState<[number, number] | null>(null);
  const [loadingSummaryMap, setLoadingSummaryMap] = useState(false);
  const [summaryMapMessage, setSummaryMapMessage] = useState('');
  const hasMapPreview = Boolean(summaryMapCoords || summaryDestinationEmbedUrl);

  useEffect(() => {
    const destination = summaryDestination;
    if (!destination) {
      setSummaryMapCoords(null);
      setSummaryMapMessage('Sin destino para mostrar en el mapa.');
      setLoadingSummaryMap(false);
      return;
    }

    const fromText = parseCoordinatesFromText(destination);
    if (fromText) {
      setSummaryMapCoords(fromText);
      setSummaryMapMessage('Ubicacion tomada del destino registrado.');
      setLoadingSummaryMap(false);
      return;
    }

    let cancelled = false;
    setLoadingSummaryMap(true);
    setSummaryMapMessage('Buscando ubicacion del destino...');

    const resolveMapLocation = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=${encodeURIComponent(destination)}`
        );
        if (!response.ok) {
          throw new Error('No se pudo buscar la ubicacion.');
        }
        const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
        if (cancelled) {
          return;
        }

        const first = data[0];
        const lat = Number(first?.lat);
        const lon = Number(first?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setSummaryMapCoords([lat, lon]);
          setSummaryMapMessage('Ubicacion estimada con base en la direccion.');
        } else {
          setSummaryMapCoords(null);
          setSummaryMapMessage('Mostrando vista aproximada del destino.');
        }
      } catch {
        if (!cancelled) {
          setSummaryMapCoords(null);
          setSummaryMapMessage('Mostrando vista aproximada del destino.');
        }
      } finally {
        if (!cancelled) {
          setLoadingSummaryMap(false);
        }
      }
    };

    void resolveMapLocation();
    return () => {
      cancelled = true;
    };
  }, [summaryDestination]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRequestId || !selectedVehicleId) {
      setShowErrors(true);
      return;
    }
    const label = selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model} - ${selectedVehicle.plates}` : '';
    const montoGasolina = Number(solicitudGasolina);
    const fuelRequest = Number.isFinite(montoGasolina) && montoGasolina > 0
      ? {
          monto: montoGasolina,
          tag: selectedTag || undefined,
          fuelSource: selectedFuelSource || undefined,
          comentarios: comentarios || undefined,
        }
      : undefined;
    setSubmitting(true);
    try {
      await onAssign(selectedRequestId, selectedVehicleId, label, fuelRequest);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3 z-50">
      <div className="bg-white rounded-xl shadow-[0_24px_70px_-40px_rgba(15,23,42,0.8)] max-w-[97vw] 2xl:max-w-7xl w-full max-h-[95vh] border border-slate-200/70 overflow-hidden flex flex-col">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />
        <div className="relative border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-4 pb-2 pt-2 overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-blue-200/60 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-10 h-24 w-24 rounded-full bg-indigo-200/50 blur-3xl" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-sm">
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Asignar Vehículo</h2>
                <p className="text-xs text-slate-600">Relaciona una solicitud pendiente con un vehículo disponible.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 rounded-full p-1 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form
          className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/40 lg:overflow-y-hidden"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="space-y-2 p-2 sm:p-2.5 pb-2">
            {requests.length === 0 ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                No hay solicitudes pendientes de asignación.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-2 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Selección</h3>
                      <p className="text-xs text-slate-500">Elige la solicitud y el vehículo disponibles.</p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Paso 1</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Solicitud pendiente</label>
                      <select
                        value={selectedRequestId}
                        onChange={(event) => setSelectedRequestId(event.target.value)}
                        className={`w-full px-3 py-1.5 border rounded-xl bg-white/90 text-sm text-slate-900 shadow-sm transition focus:ring-2 ${
                          requestError
                            ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                            : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      >
                        <option value="">Seleccionar solicitud...</option>
                        {requests.map((request) => (
                          <option key={request.id} value={request.id}>
                            {request.userName} - {request.destino || 'Sin destino'}
                          </option>
                        ))}
                      </select>
                      {requestError && (
                        <p className="mt-1 text-xs text-rose-600">{requestError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Vehículo disponible</label>
                      <select
                        value={selectedVehicleId}
                        onChange={(event) => setSelectedVehicleId(event.target.value)}
                        className={`w-full px-3 py-1.5 border rounded-xl bg-white/90 text-sm text-slate-900 shadow-sm transition focus:ring-2 ${
                          vehicleError
                            ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                            : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      >
                        <option value="">Seleccionar vehículo...</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.brand} {v.model} - {v.plates}</option>
                        ))}
                      </select>
                      {vehicleError && (
                        <p className="mt-1 text-xs text-rose-600">{vehicleError}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-2 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Datos de combustible</h3>
                      <p className="text-xs text-slate-500">Completa tag, método y monto de la solicitud.</p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Paso 2</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tag</label>
                      <select
                        value={selectedTag}
                        onChange={(event) => setSelectedTag(event.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white/90 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar tag...</option>
                        <option value="26453476-7">26453476-7</option>
                        <option value="26536342-9 Rodrigo R.">26536342-9 Rodrigo R.</option>
                        <option value="26536342-9">26536342-9</option>
                        <option value="26328071-4">26328071-4</option>
                        <option value="26328072-2">26328072-2</option>
                        <option value="22308251-1">22308251-1</option>
                        <option value="26536344-5">26536344-5</option>
                        <option value="26328148-5">26328148-5</option>
                        <option value="26454043-5">26454043-5</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tarjeta de combustible</label>
                      <select
                        value={selectedFuelSource}
                        onChange={(event) => setSelectedFuelSource(event.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white/90 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Tarjeta de combustible">Tarjeta de combustible</option>
                        <option value="Tarjeta de viáticos">Tarjeta de viáticos</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Solicitud de Gasolina</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={solicitudGasolina}
                        onChange={(event) => setSolicitudGasolina(event.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white/90 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Monto"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Se registrara automaticamente en gasolina usando la solicitud y los kilometros de la asignacion.
                      </p>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Comentarios</label>
                      <textarea
                        rows={1}
                        value={comentarios}
                        onChange={(event) => setComentarios(event.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white/90 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Agregar comentarios..."
                      />
                    </div>
                  </div>
                </div>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-2 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Resumen de solicitud</h3>
                    <span className="text-xs text-slate-500">Vista previa</span>
                  </div>
                  {selectedRequest ? (
                    <>
                    <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-700 md:grid-cols-3">
                      <div>
                        <span className="text-slate-500">Usuario:</span> {selectedRequest.userName}
                      </div>
                      <div>
                        <span className="text-slate-500">Proyecto:</span> {projectLabel}
                      </div>
                      <div>
                        <span className="text-slate-500">Vehículo:</span>{' '}
                        {selectedVehicle
                          ? `${selectedVehicle.brand} ${selectedVehicle.model} - ${selectedVehicle.plates}`
                          : 'Sin seleccionar'}
                      </div>
                      <div>
                        <span className="text-slate-500">Origen:</span> {selectedRequest.origen || 'No especificado'}
                      </div>
                      <div>
                        <span className="text-slate-500">Destino:</span> {selectedRequest.destino || 'No especificado'}
                      </div>
                      <div>
                        <span className="text-slate-500">Fechas:</span> {formatDate(selectedRequest.fechaInicio)} - {selectedRequest.fechaFin ? formatDate(selectedRequest.fechaFin) : 'N/A'}
                      </div>
                      <div>
                        <span className="text-slate-500">Propósito:</span> {selectedRequest.proposito}
                      </div>
                      <div className="md:col-span-3">
                        <span className="text-slate-500">Motivo:</span> {selectedRequest.motivo}
                      </div>
                      <div className="md:col-span-3 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1 text-xs">
                        <span className="font-semibold text-slate-700">Destino final del usuario:</span>{' '}
                        <span className="text-slate-700">{summaryDestination || 'No especificado'}</span>
                      </div>
                    </div>
                    <div className="mt-1 rounded-xl border border-slate-200 bg-white/80 p-1.5">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">Mapa del destino</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">
                            {loadingSummaryMap ? 'Cargando...' : summaryMapMessage}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowExpandedMap(true)}
                            disabled={!hasMapPreview}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title={hasMapPreview ? 'Ampliar mapa' : 'No hay mapa disponible'}
                            aria-label="Ampliar mapa"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3H5a2 2 0 00-2 2v3m16-5h-3m3 0v3M3 16v3a2 2 0 002 2h3m11-5v3a2 2 0 01-2 2h-3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="mb-1 text-[11px] text-slate-500">
                        Vista tipo Google: usa el selector para Mapa, Satelite, Hibrido y Relieve. En Satelite/Hibrido se muestran etiquetas de lugares.
                      </p>
                      {!showExpandedMap ? (
                        summaryMapCoords ? (
                          <div className="h-16 overflow-hidden rounded-lg border border-slate-200">
                            <DestinationLayeredMap
                              coords={summaryMapCoords}
                              destinationLabel={summaryDestination}
                              compact
                            />
                          </div>
                        ) : summaryDestinationEmbedUrl ? (
                          <div className="h-16 overflow-hidden rounded-lg border border-slate-200">
                            <iframe
                              title={`Mapa de destino ${summaryDestination}`}
                              src={summaryDestinationEmbedUrl}
                              className="h-full w-full"
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-500">
                            No hay destino disponible para mostrar en el mapa.
                          </div>
                        )
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                          Mapa ampliado abierto.
                        </div>
                      )}
                    </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">Selecciona una solicitud para ver los detalles.</p>
                  )}
                  <div className="mt-1.5 border-t border-slate-200 pt-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Resumen de combustible</h4>
                      <span className="text-xs text-slate-500">Vista rápida</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-1.5">
                        <p className="text-slate-500">Tag</p>
                        <p className="text-xs font-semibold text-slate-900">{selectedTag || 'Sin seleccionar'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-1.5">
                        <p className="text-slate-500">Tarjeta</p>
                        <p className="text-xs font-semibold text-slate-900">{selectedFuelSource || 'Sin seleccionar'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-1.5">
                        <p className="text-slate-500">Monto</p>
                        <p className="text-xs font-semibold text-slate-900">
                          {solicitudGasolina ? formatCurrency(Number(solicitudGasolina)) : '$0.00'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1 rounded-xl border border-slate-200 bg-white/80 p-1.5 text-xs">
                      <p className="text-slate-500">Comentarios</p>
                      <p className="text-xs text-slate-700">{comentarios || 'Sin comentarios'}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white/95 px-3 py-1.5">
            <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-1 text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={requests.length === 0 || submitting}
                  className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 px-4 py-1 text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none"
                >
                  {submitting ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
          </div>
        </form>
      </div>

      {showExpandedMap && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
          <div className="flex h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-900">Mapa ampliado del destino</h3>
              <button
                type="button"
                onClick={() => setShowExpandedMap(false)}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar mapa ampliado"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-2">
              {summaryMapCoords ? (
                <div className="h-full overflow-hidden rounded-lg border border-slate-200">
                  <DestinationLayeredMap coords={summaryMapCoords} destinationLabel={summaryDestination} />
                </div>
              ) : summaryDestinationEmbedUrl ? (
                <div className="h-full overflow-hidden rounded-lg border border-slate-200">
                  <iframe
                    title={`Mapa ampliado de destino ${summaryDestination}`}
                    src={summaryDestinationEmbedUrl}
                    className="h-full w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                  No hay destino disponible para mostrar en el mapa.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal de Detalles del Vehículo
interface DetalleVehiculoModalProps {
  vehicle: Vehicle;
  assignments: VehicleAssignment[];
  alerts: VehicleAlert[];
  onClose: () => void;
}

function DetalleVehiculoModal({ vehicle, assignments, alerts, onClose }: DetalleVehiculoModalProps) {
  useEscapeKey(onClose);

  const activeAssignment = assignments.find(a => a.status === 'activo' || a.status === 'asignado');
  const normalizedStatus = toCanonicalVehicleStatus(vehicle.status);
  const uploadedImage = vehicle.foto ? (toApiAssetUrl(vehicle.foto) ?? vehicle.foto) : '';
  const referenceImage = useVehicleReferenceImage(vehicle.brand, vehicle.model);
  const fallbackImage = getVehicleFallbackImage(vehicle.brand, vehicle.model);
  const imageSources = useMemo(
    () => getVehicleImageSources(uploadedImage, referenceImage, fallbackImage),
    [uploadedImage, referenceImage, fallbackImage]
  );
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [imageSources]);

  const vehicleImage = imageSources[Math.min(imageIndex, imageSources.length - 1)] || fallbackImage;
  const isPlaceholderImage = vehicleImage.startsWith('data:image/svg+xml');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Detalles del Vehículo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          {/* Imagen del Vehículo */}
          <div className="relative h-44 overflow-hidden rounded-lg bg-gray-200 sm:h-52">
            <img
              src={vehicleImage}
              alt={`${vehicle.brand} ${vehicle.model}`}
              className={`h-full w-full ${isPlaceholderImage ? 'object-contain bg-slate-100 p-2' : 'object-cover bg-slate-50'}`}
              loading="lazy"
              onError={() => {
                setImageIndex((prev) => (prev < imageSources.length - 1 ? prev + 1 : prev));
              }}
            />
          </div>

          {/* Información General */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-gray-900">Información General</h3>
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-gray-600">Marca y Modelo</p>
                <p className="text-sm font-medium text-gray-900">{vehicle.brand} {vehicle.model} {vehicle.year}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Placas</p>
                <p className="text-sm font-medium text-gray-900">{vehicle.plates}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Número de Serie</p>
                <p className="text-sm font-medium text-gray-900">{vehicle.serialNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Color</p>
                <p className="text-sm font-medium text-gray-900">{vehicle.color}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Kilometraje actual</p>
                <p className="text-sm font-medium text-gray-900">{vehicle.currentKm.toLocaleString()} km</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Estado</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  normalizedStatus === 'available' ? 'bg-green-100 text-green-800' :
                  normalizedStatus === 'assigned' ? 'bg-blue-100 text-blue-800' :
                  normalizedStatus === 'in_shop' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  <span className="text-xs">{getVehicleStatusIcon(normalizedStatus)}</span>
                  {getVehicleStatusLabel(normalizedStatus)}
                </span>
              </div>
            </div>
          </div>

          {/* Seguro */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-gray-900">Seguro</h3>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-600">Compañía</p>
                  <p className="text-sm font-medium text-gray-900">{vehicle.insurance.company || 'Sin capturar'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Póliza</p>
                  <p className="text-sm font-medium text-gray-900">{vehicle.insurance.policyNumber || 'Sin capturar'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Vigencia</p>
                  <p className="text-sm font-medium text-gray-900">{vehicle.insurance.expirationDate ? formatDate(vehicle.insurance.expirationDate) : 'Sin capturar'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Mantenimiento */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-gray-900">Mantenimiento</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-xs text-gray-600">Último Servicio</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(vehicle.maintenance.lastServiceDate)}</p>
                <p className="text-xs text-gray-600">{vehicle.maintenance.lastServiceKm.toLocaleString()} km</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-xs text-gray-600">Próximo Servicio</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(vehicle.maintenance.nextServiceDate)}</p>
                <p className="text-xs text-gray-600">{vehicle.maintenance.nextServiceKm.toLocaleString()} km</p>
              </div>
            </div>
          </div>

          {/* Asignación Actual */}
          {activeAssignment && (
            <div>
              <h3 className="mb-3 text-base font-semibold text-gray-900">Asignación Actual</h3>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Asignado a:</span>
                    <span className="text-sm font-medium text-gray-900">{activeAssignment.userName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Motivo:</span>
                    <span className="text-sm text-gray-900">{activeAssignment.motivo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Desde:</span>
                    <span className="text-sm text-gray-900">{formatDate(activeAssignment.fechaInicio)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">KM Inicial:</span>
                    <span className="text-sm text-gray-900">{activeAssignment.kmInicial.toLocaleString()} km</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alertas Pendientes */}
          {alerts.length > 0 && (
            <div>
              <h3 className="mb-3 text-base font-semibold text-gray-900">Alertas Pendientes</h3>
              <div className="space-y-2.5">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-lg border p-3 ${
                      alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                      alert.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                      alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900">{alert.type}</h4>
                        <p className="mt-1 text-xs text-gray-700">{alert.message}</p>
                        <div className="mt-2 flex items-center space-x-4 text-[11px] text-gray-600">
                          <span>Vence: {alert.dueDate ? formatDate(alert.dueDate) : 'Sin fecha'}</span>
                          {alert.costoEstimado && (
                            <span>Costo Est: {formatCurrency(alert.costoEstimado)}</span>
                          )}
                        </div>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                        alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {alert.severity === 'critical' ? 'Crítico' :
                         alert.severity === 'high' ? 'Alto' :
                         alert.severity === 'medium' ? 'Medio' : 'Bajo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
          <button
            onClick={onClose}
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm text-white hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
interface HistorialVehiculoModalProps {
  vehicle: Vehicle;
  maintenanceHistory: MaintenanceRecord[];
  cargasGasolina: CargaGasolina[];
  onClose: () => void;
}

function HistorialVehiculoModal({ vehicle, maintenanceHistory, cargasGasolina, onClose }: HistorialVehiculoModalProps) {
  useEscapeKey(onClose);

  const [activeTab, setActiveTab] = useState<'mantenimiento' | 'gasolina'>('mantenimiento');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Historial de {vehicle.brand} {vehicle.model}</h2>
              <p className="text-sm text-gray-600">{vehicle.plates}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('mantenimiento')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'mantenimiento'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Mantenimientos ({maintenanceHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('gasolina')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'gasolina'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Cargas de Gasolina ({cargasGasolina.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'mantenimiento' && (
            <div className="space-y-4">
              {maintenanceHistory.length > 0 ? (
                maintenanceHistory.map((record) => (
                  <div key={record.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            record.tipo === 'preventivo' ? 'bg-blue-100 text-blue-800' :
                            record.tipo === 'predictivo' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {record.tipo === 'preventivo' ? 'Preventivo' :
                             record.tipo === 'predictivo' ? 'Predictivo' : 'Correctivo'}
                          </span>
                          <span className="text-sm text-gray-600">{formatDate(record.fecha)}</span>
                        </div>
                        <h4 className="font-semibold text-gray-900">{record.descripcion}</h4>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                          <span>KM: {record.km ? record.km.toLocaleString() : 'N/A'}</span>
                          <span>Proveedor: {record.proveedor}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(record.costo)}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500">No hay registros de mantenimiento</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'gasolina' && (
            <div className="space-y-4">
              {cargasGasolina.length > 0 ? (
                <>
                  {/* Resumen */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total Litros</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {cargasGasolina.reduce((sum, c) => sum + c.litros, 0).toFixed(1)} L
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total Gastado</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(cargasGasolina.reduce((sum, c) => sum + c.total, 0))}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Precio Promedio/L</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(cargasGasolina.reduce((sum, c) => sum + c.precioLitro, 0) / cargasGasolina.length)}
                      </p>
                    </div>
                  </div>

                  {/* Lista de Cargas */}
                  {cargasGasolina.map((carga) => (
                    <div key={carga.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="text-sm font-medium text-gray-900">{formatDate(carga.fecha)}</span>
                            <span className="text-sm text-gray-600">{carga.estacion}</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Litros</p>
                              <p className="font-medium text-gray-900">{carga.litros.toFixed(1)} L</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Precio/L</p>
                              <p className="font-medium text-gray-900">{formatCurrency(carga.precioLitro)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Odómetro</p>
                              <p className="font-medium text-gray-900">{carga.odometro.toLocaleString()} km</p>
                            </div>
                            {carga.facturaId && (
                              <div>
                                <p className="text-gray-600">Factura</p>
                                <p className="font-medium text-blue-600">{carga.facturaId}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(carga.total)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-gray-500">No hay registros de gasolina</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
