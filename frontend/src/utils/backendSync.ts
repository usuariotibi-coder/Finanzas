import type { DashboardMetrics, Dispersion, Proyecto, SolicitudViaje, Viatico } from '../types';
import { apiFetch } from './api';
import { toStorageKey } from './storage';

const STORAGE_EVENT = 'app-storage-change';

const parseNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const parseString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const toStringId = (value: unknown) => String(value ?? '');

const toNullableString = (value: unknown) => {
  const normalized = parseString(value).trim();
  return normalized || undefined;
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toApiId = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

const readStorageList = <T,>(key: string, { legacy = false }: { legacy?: boolean } = {}): T[] => {
  if (typeof window === 'undefined') return [];
  const storageKey = legacy ? key : toStorageKey(key);
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const writeStorageList = <T,>(
  key: string,
  value: T[],
  { legacy = false, sourceId = 'backend-sync' }: { legacy?: boolean; sourceId?: string } = {}
) => {
  if (typeof window === 'undefined') return;
  const storageKey = legacy ? key : toStorageKey(key);
  localStorage.setItem(storageKey, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key: storageKey, sourceId } }));
};

type RawRecord = Record<string, unknown>;

const mapProyectoFromApi = (raw: RawRecord): Proyecto => ({
  id: toStringId(raw.id),
  codigo: parseString(raw.codigo),
  nombre: parseString(raw.nombre),
  cliente: parseString(raw.cliente),
  estado: (parseString(raw.estado) || 'activo') as Proyecto['estado'],
  presupuesto: parseNumber(raw.presupuesto),
  gastado: parseNumber(raw.gastado),
  fechaInicio: parseString(raw.fecha_inicio),
  fechaFinEstimada: parseString(raw.fecha_fin_estimada),
  fechaFinReal: toNullableString(raw.fecha_fin_real),
  responsable: parseString(raw.responsable),
  departamento: parseString(raw.departamento),
  descripcion: parseString(raw.descripcion),
  notas: toNullableString(raw.notas),
  createdAt: parseString(raw.created_at),
  updatedAt: parseString(raw.updated_at),
});

const mapViaticoFromApi = (raw: RawRecord): Viatico => {
  const userId = toStringId(raw.user);
  return {
    id: toStringId(raw.id),
    userId,
    userName: parseString(raw.user_name) || userId,
    proyectoId: toNullableString(raw.proyecto ? toStringId(raw.proyecto) : undefined),
    proyectoNombre: toNullableString(raw.proyecto_nombre),
    motivo: parseString(raw.motivo),
    origen: toNullableString(raw.origen),
    destino: parseString(raw.destino),
    destinoPais: (parseString(raw.destino_pais) || 'Mexico') as Viatico['destinoPais'],
    tipoViatico: (parseString(raw.tipo_viatico) || 'efectifintech') as Viatico['tipoViatico'],
    fechaInicio: parseString(raw.fecha_inicio),
    fechaFin: parseString(raw.fecha_fin),
    fechaInicioReal: toNullableString(raw.fecha_inicio_real),
    fechaFinReal: toNullableString(raw.fecha_fin_real),
    montoSolicitado: parseNumber(raw.monto_solicitado),
    montoAprobado: toNullableNumber(raw.monto_aprobado),
    montoDispersado: toNullableNumber(raw.monto_dispersado),
    montoGastado: toNullableNumber(raw.monto_gastado),
    saldoRestante: toNullableNumber(raw.saldo_restante),
    status: (parseString(raw.status) || 'pendiente') as Viatico['status'],
    vehiculoAsignado: toNullableString(raw.vehiculo_asignado),
    gsActivityId: toNullableNumber(raw.gs_activity_id),
    gastoFuente: toNullableString(raw.gasto_fuente) as Viatico['gastoFuente'],
    efectifintechId: toNullableString(raw.efectifintech_id),
    efectifintechStatus: toNullableString(raw.efectifintech_status) as Viatico['efectifintechStatus'],
    efectifintechLastSyncAt: toNullableString(raw.efectifintech_last_sync_at),
    diasSinRecuperar: toNullableNumber(raw.dias_sin_recuperar),
    createdAt: parseString(raw.created_at),
    aprobadoPor: toNullableString(raw.aprobado_por_nombre),
    comentarios: toNullableString(raw.comentarios),
  };
};

type ViajeConfirmaciones = NonNullable<SolicitudViaje['confirmaciones']>;
type ViajeConfirmacionesAvion = NonNullable<ViajeConfirmaciones['avion']>;
type ViajeConfirmacionesCamion = NonNullable<ViajeConfirmaciones['camion']>;
type ViajeConfirmacionesHotel = NonNullable<ViajeConfirmaciones['hotel']>;

const mapViajeFromApi = (raw: RawRecord): SolicitudViaje => {
  const confirmacionesAvion = Array.isArray(raw.confirmaciones_avion)
    ? (raw.confirmaciones_avion as ViajeConfirmacionesAvion)
    : [];
  const confirmacionesCamion = Array.isArray(raw.confirmaciones_camion)
    ? (raw.confirmaciones_camion as ViajeConfirmacionesCamion)
    : [];
  const confirmacionesHotel = Array.isArray(raw.confirmaciones_hotel)
    ? (raw.confirmaciones_hotel as ViajeConfirmacionesHotel)
    : [];

  return {
    id: toStringId(raw.id),
    userId: toStringId(raw.user),
    userName: parseString(raw.user_name),
    proyectoId: toNullableString(raw.proyecto ? toStringId(raw.proyecto) : undefined) || '',
    proyectoNombre: toNullableString(raw.proyecto_nombre) || '',
    origen: toNullableString(raw.origen),
    destino: parseString(raw.destino),
    fechaInicio: parseString(raw.fecha_inicio),
    fechaFin: parseString(raw.fecha_fin),
    motivo: parseString(raw.motivo),
    necesitaAvion: parseBoolean(raw.necesita_avion),
    necesitaCamion: parseBoolean(raw.necesita_camion),
    necesitaHotel: parseBoolean(raw.necesita_hotel),
    detallesAvion: toNullableString(raw.detalles_avion),
    detallesCamion: toNullableString(raw.detalles_camion),
    detallesHotel: toNullableString(raw.detalles_hotel),
    status: (parseString(raw.status) || 'pendiente') as SolicitudViaje['status'],
    statusAvion: toNullableString(raw.status_avion) as SolicitudViaje['statusAvion'],
    statusCamion: toNullableString(raw.status_camion) as SolicitudViaje['statusCamion'],
    statusHotel: toNullableString(raw.status_hotel) as SolicitudViaje['statusHotel'],
    notas: toNullableString(raw.notas),
    costoEstimado: toNullableNumber(raw.costo_estimado),
    costoFinal: toNullableNumber(raw.costo_final),
    confirmaciones: {
      avion: confirmacionesAvion.length ? confirmacionesAvion : undefined,
      camion: confirmacionesCamion.length ? confirmacionesCamion : undefined,
      hotel: confirmacionesHotel.length ? confirmacionesHotel : undefined,
    },
    createdAt: parseString(raw.created_at),
    atendidoPor: toNullableString(raw.atendido_por),
  };
};

const mapDispersionFromApi = (raw: RawRecord): Dispersion => ({
  id: toStringId(raw.id),
  viaticoId: toStringId(raw.viatico),
  monto: parseNumber(raw.monto),
  montoUSD: toNullableNumber(raw.monto_usd),
  tipoCambio: toNullableNumber(raw.tipo_cambio),
  moneda: (parseString(raw.moneda) || 'MXN') as Dispersion['moneda'],
  fecha: parseString(raw.fecha),
  metodoPago: (parseString(raw.metodo_pago) || 'transferencia') as Dispersion['metodoPago'],
  referencia: toNullableString(raw.referencia),
  confirmado: parseBoolean(raw.confirmado, true),
  dispersadoPor: parseString(raw.dispersado_por),
});

const toProyectoPayload = (value: Partial<Proyecto>) => {
  const payload: RawRecord = {};

  if ('codigo' in value) payload.codigo = parseString(value.codigo).trim();
  if ('nombre' in value) payload.nombre = parseString(value.nombre).trim();
  if ('cliente' in value) payload.cliente = parseString(value.cliente).trim();
  if ('estado' in value) payload.estado = value.estado || 'activo';
  if ('presupuesto' in value) payload.presupuesto = parseNumber(value.presupuesto);
  if ('gastado' in value) payload.gastado = parseNumber(value.gastado);
  if ('fechaInicio' in value) payload.fecha_inicio = parseString(value.fechaInicio);
  if ('fechaFinEstimada' in value) payload.fecha_fin_estimada = toNullableString(value.fechaFinEstimada) ?? null;
  if ('fechaFinReal' in value) payload.fecha_fin_real = toNullableString(value.fechaFinReal) ?? null;
  if ('responsable' in value) payload.responsable = parseString(value.responsable).trim();
  if ('departamento' in value) payload.departamento = parseString(value.departamento);
  if ('descripcion' in value) payload.descripcion = parseString(value.descripcion);
  if ('notas' in value) payload.notas = parseString(value.notas);

  return payload;
};

const toViaticoPayload = (value: Partial<Viatico>) => {
  const payload: RawRecord = {};

  if ('userId' in value) payload.user = toApiId(value.userId) ?? null;
  if ('proyectoId' in value) payload.proyecto = toApiId(value.proyectoId) ?? null;
  if ('gsActivityId' in value) payload.gs_activity_id = toNullableNumber(value.gsActivityId) ?? null;
  if ('motivo' in value) payload.motivo = parseString(value.motivo);
  if ('origen' in value) payload.origen = parseString(value.origen);
  if ('destino' in value) payload.destino = parseString(value.destino);
  if ('destinoPais' in value) payload.destino_pais = value.destinoPais || 'Mexico';
  if ('tipoViatico' in value) payload.tipo_viatico = value.tipoViatico || 'efectifintech';
  if ('fechaInicio' in value) payload.fecha_inicio = parseString(value.fechaInicio);
  if ('fechaFin' in value) payload.fecha_fin = parseString(value.fechaFin);
  if ('fechaInicioReal' in value) payload.fecha_inicio_real = toNullableString(value.fechaInicioReal) ?? null;
  if ('fechaFinReal' in value) payload.fecha_fin_real = toNullableString(value.fechaFinReal) ?? null;
  if ('montoSolicitado' in value) payload.monto_solicitado = parseNumber(value.montoSolicitado);
  if ('montoAprobado' in value) payload.monto_aprobado = toNullableNumber(value.montoAprobado) ?? null;
  if ('montoDispersado' in value) payload.monto_dispersado = toNullableNumber(value.montoDispersado) ?? null;
  if ('montoGastado' in value) payload.monto_gastado = toNullableNumber(value.montoGastado) ?? null;
  if ('saldoRestante' in value) payload.saldo_restante = toNullableNumber(value.saldoRestante) ?? null;
  if ('status' in value) payload.status = value.status || 'pendiente';
  if ('comentarios' in value) payload.comentarios = parseString(value.comentarios);
  if ('vehiculoAsignado' in value) payload.vehiculo_asignado = parseString(value.vehiculoAsignado);
  if ('gastoFuente' in value) payload.gasto_fuente = parseString(value.gastoFuente);
  if ('efectifintechId' in value) payload.efectifintech_id = parseString(value.efectifintechId);
  if ('efectifintechStatus' in value) payload.efectifintech_status = parseString(value.efectifintechStatus);
  if ('diasSinRecuperar' in value) payload.dias_sin_recuperar = toNullableNumber(value.diasSinRecuperar) ?? null;

  return payload;
};

const toViajePayload = (value: Partial<SolicitudViaje>) => {
  const payload: RawRecord = {};

  if ('userId' in value) payload.user = toApiId(value.userId) ?? null;
  if ('proyectoId' in value) payload.proyecto = toApiId(value.proyectoId) ?? null;
  if ('origen' in value) payload.origen = parseString(value.origen);
  if ('destino' in value) payload.destino = parseString(value.destino);
  if ('fechaInicio' in value) payload.fecha_inicio = parseString(value.fechaInicio);
  if ('fechaFin' in value) payload.fecha_fin = parseString(value.fechaFin);
  if ('motivo' in value) payload.motivo = parseString(value.motivo);
  if ('necesitaAvion' in value) payload.necesita_avion = Boolean(value.necesitaAvion);
  if ('necesitaCamion' in value) payload.necesita_camion = Boolean(value.necesitaCamion);
  if ('necesitaHotel' in value) payload.necesita_hotel = Boolean(value.necesitaHotel);
  if ('detallesAvion' in value) payload.detalles_avion = parseString(value.detallesAvion);
  if ('detallesCamion' in value) payload.detalles_camion = parseString(value.detallesCamion);
  if ('detallesHotel' in value) payload.detalles_hotel = parseString(value.detallesHotel);
  if ('status' in value) payload.status = value.status || 'pendiente';
  if ('statusAvion' in value) payload.status_avion = toNullableString(value.statusAvion) ?? '';
  if ('statusCamion' in value) payload.status_camion = toNullableString(value.statusCamion) ?? '';
  if ('statusHotel' in value) payload.status_hotel = toNullableString(value.statusHotel) ?? '';
  if ('notas' in value) payload.notas = parseString(value.notas);
  if ('costoEstimado' in value) payload.costo_estimado = toNullableNumber(value.costoEstimado) ?? null;
  if ('costoFinal' in value) payload.costo_final = toNullableNumber(value.costoFinal) ?? null;
  if ('confirmaciones' in value) {
    payload.confirmaciones_avion = value.confirmaciones?.avion || [];
    payload.confirmaciones_camion = value.confirmaciones?.camion || [];
    payload.confirmaciones_hotel = value.confirmaciones?.hotel || [];
  }
  if ('atendidoPor' in value) payload.atendido_por = parseString(value.atendidoPor);

  return payload;
};

const loadOptional = async <T,>(loader: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await loader();
  } catch {
    return fallback;
  }
};

const deriveDispersionPendientes = (viaticos: Viatico[]) =>
  viaticos.filter((item) => item.status === 'aprobado');

const deriveRecuperacionPendientes = (viaticos: Viatico[]) =>
  viaticos.filter((item) =>
    ['dispersado', 'en_viaje', 'viaje_finalizado', 'en_recuperacion', 'completado'].includes(item.status)
  );

export const fetchProyectos = async (): Promise<Proyecto[]> => {
  const data = (await apiFetch('/proyectos/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapProyectoFromApi) : [];
};

export const fetchViaticos = async (): Promise<Viatico[]> => {
  const data = (await apiFetch('/viaticos/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapViaticoFromApi) : [];
};

export const fetchViajes = async (): Promise<SolicitudViaje[]> => {
  const data = (await apiFetch('/viajes/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapViajeFromApi) : [];
};

export const fetchDispersiones = async (): Promise<Dispersion[]> => {
  const data = (await apiFetch('/dispersiones/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapDispersionFromApi) : [];
};

export const fetchDashboardMetrics = async (): Promise<DashboardMetrics> => {
  const data = (await apiFetch('/dashboard/metrics/')) as RawRecord;
  return {
    viaticosActivos: parseNumber(data.viaticosActivos),
    viaticosAprobacionPendiente: parseNumber(data.viaticosAprobacionPendiente),
    totalDispersado: parseNumber(data.totalDispersado),
    totalRecuperar: parseNumber(data.totalRecuperar),
    facturasPendientes: parseNumber(data.facturasPendientes),
    alertasConciliacion: parseNumber(data.alertasConciliacion),
    vehiculosDisponibles: parseNumber(data.vehiculosDisponibles),
    vehiculosAsignados: parseNumber(data.vehiculosAsignados),
    alertasMantenimiento: parseNumber(data.alertasMantenimiento),
    gastosAMEXPendientes: parseNumber(data.gastosAMEXPendientes),
  };
};

export const createProyecto = async (payload: Partial<Proyecto>): Promise<Proyecto> => {
  const data = (await apiFetch('/proyectos/', {
    method: 'POST',
    body: JSON.stringify(toProyectoPayload(payload)),
  })) as RawRecord;
  return mapProyectoFromApi(data);
};

export const updateProyecto = async (id: string, payload: Partial<Proyecto>): Promise<Proyecto> => {
  const data = (await apiFetch(`/proyectos/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toProyectoPayload(payload)),
  })) as RawRecord;
  return mapProyectoFromApi(data);
};

export const deleteProyecto = async (id: string): Promise<void> => {
  await apiFetch(`/proyectos/${id}/`, { method: 'DELETE' });
};

export const createViatico = async (payload: Partial<Viatico>): Promise<Viatico> => {
  const data = (await apiFetch('/viaticos/', {
    method: 'POST',
    body: JSON.stringify(toViaticoPayload(payload)),
  })) as RawRecord;
  return mapViaticoFromApi(data);
};

export const updateViatico = async (id: string, payload: Partial<Viatico>): Promise<Viatico> => {
  const data = (await apiFetch(`/viaticos/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toViaticoPayload(payload)),
  })) as RawRecord;
  return mapViaticoFromApi(data);
};

export const createViaje = async (payload: Partial<SolicitudViaje>): Promise<SolicitudViaje> => {
  const data = (await apiFetch('/viajes/', {
    method: 'POST',
    body: JSON.stringify(toViajePayload(payload)),
  })) as RawRecord;
  return mapViajeFromApi(data);
};

export const updateViaje = async (id: string, payload: Partial<SolicitudViaje>): Promise<SolicitudViaje> => {
  const data = (await apiFetch(`/viajes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toViajePayload(payload)),
  })) as RawRecord;
  return mapViajeFromApi(data);
};

export const createDispersion = async (payload: {
  viaticoId: string;
  monto: number;
  metodoPago: 'transferencia' | 'efectivo' | 'tarjeta';
  referencia?: string;
  moneda?: 'MXN' | 'USD';
  tipoCambio?: number;
  montoUSD?: number;
  confirmado?: boolean;
  dispersadoPor?: string;
  notas?: string;
}) => {
  const data = (await apiFetch('/dispersiones/', {
    method: 'POST',
    body: JSON.stringify({
      viatico: toApiId(payload.viaticoId),
      monto: payload.monto,
      metodo_pago: payload.metodoPago,
      referencia: payload.referencia || '',
      moneda: payload.moneda || 'MXN',
      tipo_cambio: payload.tipoCambio ?? null,
      monto_usd: payload.montoUSD ?? null,
      confirmado: payload.confirmado ?? true,
      fecha: new Date().toISOString().slice(0, 10),
      dispersado_por: payload.dispersadoPor || '',
      notas: payload.notas || '',
    }),
  })) as RawRecord;
  return mapDispersionFromApi(data);
};

export const createRecuperacion = async (payload: {
  viaticoId: string;
  montoRecuperado: number;
  metodoPago: 'transferencia' | 'efectivo' | 'tarjeta';
  referencia?: string;
  registradoPor?: string;
  notas?: string;
}) =>
  apiFetch('/recuperaciones/', {
    method: 'POST',
    body: JSON.stringify({
      viatico: toApiId(payload.viaticoId),
      monto_recuperado: payload.montoRecuperado,
      metodo_pago: payload.metodoPago,
      fecha: new Date().toISOString().slice(0, 10),
      referencia: payload.referencia || '',
      registrado_por: payload.registradoPor || '',
      notas: payload.notas || '',
    }),
  });

export const syncCoreAppData = async ({ userId }: { userId?: string } = {}) => {
  const proyectos = await loadOptional(fetchProyectos, [] as Proyecto[]);
  const viaticos = await loadOptional(fetchViaticos, [] as Viatico[]);
  const viajes = await loadOptional(fetchViajes, [] as SolicitudViaje[]);
  const dispersiones = await loadOptional(fetchDispersiones, [] as Dispersion[]);

  writeStorageList('proyectos_data', proyectos);
  writeStorageList('proyectos_data', proyectos, { legacy: true });
  writeStorageList('pm-portal:proyectos', proyectos);

  writeStorageList('viaticos:list', viaticos);
  writeStorageList('usuario:viaticos', userId ? viaticos.filter((item) => item.userId === userId) : viaticos);
  writeStorageList('dispersion:viaticosPendientes', deriveDispersionPendientes(viaticos));
  writeStorageList('recuperacion:viaticosPendientes', deriveRecuperacionPendientes(viaticos));

  writeStorageList('viajes:solicitudes', viajes);
  writeStorageList('usuario:solicitudesViaje', userId ? viajes.filter((item) => item.userId === userId) : viajes);
  writeStorageList('pm-portal:viajesPendientes', viajes.filter((item) => item.status === 'pendiente'));

  writeStorageList('dispersion:dispersiones', dispersiones);
};

export const getCachedProyectos = () => {
  const prefixed = readStorageList<Proyecto>('proyectos_data');
  if (prefixed.length > 0) return prefixed;
  return readStorageList<Proyecto>('proyectos_data', { legacy: true });
};
