import type {
  AlertaConciliacion,
  CargaGasolina,
  Consumo,
  DashboardMetrics,
  Dispersion,
  Factura,
  MaintenanceRecord,
  Proyecto,
  SolicitudViaje,
  TicketAMEX,
  Vehicle,
  VehicleAlert,
  VehicleAssignment,
  Viatico,
} from '../types';
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

const mapFacturaFromApi = (raw: RawRecord): Factura => ({
  id: toStringId(raw.id),
  viaticoId: toNullableString(raw.viatico ? toStringId(raw.viatico) : undefined),
  userId: toStringId(raw.user),
  folio: parseString(raw.folio),
  uuid: parseString(raw.uuid),
  rfc: parseString(raw.rfc),
  razonSocial: parseString(raw.razon_social),
  fecha: parseString(raw.fecha),
  subtotal: parseNumber(raw.subtotal),
  iva: parseNumber(raw.iva),
  total: parseNumber(raw.total),
  formaPago: parseString(raw.forma_pago),
  metodoPago: parseString(raw.metodo_pago),
  conceptos: Array.isArray(raw.conceptos) ? (raw.conceptos as Factura['conceptos']) : [],
  status: (parseString(raw.status) || 'pendiente') as Factura['status'],
  archivoXML: toNullableString(raw.archivo_xml),
  archivoPDF: toNullableString(raw.archivo_pdf),
  validacionCFDI:
    raw.validacion_cfdi && typeof raw.validacion_cfdi === 'object'
      ? (raw.validacion_cfdi as Factura['validacionCFDI'])
      : undefined,
  matchConsumo: parseBoolean(raw.match_consumo),
  createdAt: parseString(raw.created_at),
});

const mapConsumoFromApi = (raw: RawRecord): Consumo => ({
  id: toStringId(raw.id),
  userId: toStringId(raw.user),
  viaticoId: toNullableString(raw.viatico ? toStringId(raw.viatico) : undefined),
  fecha: parseString(raw.fecha),
  comercio: parseString(raw.comercio),
  monto: parseNumber(raw.monto),
  categoria: parseString(raw.categoria),
  facturaId: toNullableString(raw.factura ? toStringId(raw.factura) : undefined),
  facturaPdfName: toNullableString(raw.factura_pdf_name),
  facturaXmlName: toNullableString(raw.factura_xml_name),
  facturaNotas: toNullableString(raw.factura_notas),
  matched: parseBoolean(raw.matched),
  autorizado: parseBoolean(raw.autorizado),
});

const mapAlertaConciliacionFromApi = (raw: RawRecord): AlertaConciliacion => ({
  tipo: (parseString(raw.tipo) || 'monto_diferente') as AlertaConciliacion['tipo'],
  descripcion: parseString(raw.descripcion),
  gravedad: (parseString(raw.gravedad) || 'media') as AlertaConciliacion['gravedad'],
  facturaId: toNullableString(raw.factura ? toStringId(raw.factura) : undefined),
  consumoId: toNullableString(raw.consumo ? toStringId(raw.consumo) : undefined),
});

const mapTicketAmexFromApi = (raw: RawRecord): TicketAMEX => ({
  id: toStringId(raw.id),
  userId: toStringId(raw.user),
  cardNumber: parseString(raw.card_number),
  cardHolder: parseString(raw.card_holder),
  fecha: parseString(raw.fecha),
  comercio: parseString(raw.comercio),
  monto: parseNumber(raw.monto),
  montoUSD: toNullableNumber(raw.monto_usd),
  tipoCambio: toNullableNumber(raw.tipo_cambio),
  categoria: parseString(raw.categoria),
  cuentaContable: parseString(raw.cuenta_contable),
  proyectoId: toNullableString(raw.proyecto ? toStringId(raw.proyecto) : undefined),
  proyectoNombre: toNullableString(raw.proyecto_nombre),
  gsActivityId: toNullableNumber(raw.gs_activity_id),
  paisComercio: parseString(raw.pais_comercio),
  facturaId: toNullableString(raw.factura ? toStringId(raw.factura) : undefined),
  facturaPdfName: toNullableString(raw.factura_pdf_name),
  facturaXmlName: toNullableString(raw.factura_xml_name),
  facturaNotas: toNullableString(raw.factura_notas),
  matched: parseBoolean(raw.matched),
  autorizado: parseBoolean(raw.autorizado),
  duplicado: parseBoolean(raw.duplicado),
  clasificacionAuto: parseBoolean(raw.clasificacion_auto),
  observaciones: toNullableString(raw.observaciones),
});

const mapVehicleFromApi = (raw: RawRecord): Vehicle => ({
  id: toStringId(raw.id),
  brand: parseString(raw.marca),
  model: parseString(raw.modelo),
  year: parseNumber(raw.anio),
  plates: parseString(raw.placas),
  serialNumber: parseString(raw.numero_serie),
  color: parseString(raw.color),
  insurance: {
    company: parseString(raw.seguro_compania),
    policyNumber: parseString(raw.seguro_poliza),
    expirationDate: parseString(raw.seguro_vigencia),
  },
  maintenance: {
    lastServiceDate: parseString(raw.mantenimiento_ultimo_servicio),
    lastServiceKm: parseNumber(raw.mantenimiento_km_ultimo),
    nextServiceDate: parseString(raw.mantenimiento_proximo_servicio),
    nextServiceKm: parseNumber(raw.mantenimiento_km_proximo),
  },
  currentKm: parseNumber(raw.km_actual),
  marca: parseString(raw.marca),
  modelo: parseString(raw.modelo),
  anio: parseNumber(raw.anio),
  placas: parseString(raw.placas),
  numeroSerie: parseString(raw.numero_serie),
  seguro: {
    compania: parseString(raw.seguro_compania),
    poliza: parseString(raw.seguro_poliza),
    vigencia: parseString(raw.seguro_vigencia),
  },
  mantenimiento: {
    ultimoServicio: parseString(raw.mantenimiento_ultimo_servicio),
    kmUltimoServicio: parseNumber(raw.mantenimiento_km_ultimo),
    proximoServicio: parseString(raw.mantenimiento_proximo_servicio),
    kmProximoServicio: parseNumber(raw.mantenimiento_km_proximo),
  },
  kmActual: parseNumber(raw.km_actual),
  status: (parseString(raw.status) || 'disponible') as Vehicle['status'],
  foto: toNullableString(raw.foto),
  createdAt: parseString(raw.created_at),
});

const mapVehicleAssignmentFromApi = (raw: RawRecord): VehicleAssignment => ({
  id: toStringId(raw.id),
  vehicleId: toStringId(raw.vehicle),
  vehiculoLabel: toNullableString(raw.vehicle_label),
  userId: toStringId(raw.user),
  userName: parseString(raw.user_name) || toStringId(raw.user),
  viaticoId: toNullableString(raw.viatico ? toStringId(raw.viatico) : undefined),
  proyectoId: toNullableString(raw.proyecto ? toStringId(raw.proyecto) : undefined),
  proyectoNombre: toNullableString(raw.proyecto_nombre),
  origen: toNullableString(raw.origen),
  destino: toNullableString(raw.destino),
  fechaInicio: parseString(raw.fecha_inicio),
  fechaFin: toNullableString(raw.fecha_fin),
  motivo: parseString(raw.motivo),
  proposito: (parseString(raw.proposito) || 'operaciones') as VehicleAssignment['proposito'],
  kmInicial: parseNumber(raw.km_inicial),
  kmFinal: toNullableNumber(raw.km_final),
  fotoOdometroInicial: toNullableString(raw.foto_odometro_inicial),
  fotoOdometroFinal: toNullableString(raw.foto_odometro_final),
  checklistRecepcion:
    raw.checklist_recepcion && typeof raw.checklist_recepcion === 'object'
      ? (raw.checklist_recepcion as VehicleAssignment['checklistRecepcion'])
      : undefined,
  checklistEntrega:
    raw.checklist_entrega && typeof raw.checklist_entrega === 'object'
      ? (raw.checklist_entrega as VehicleAssignment['checklistEntrega'])
      : undefined,
  status: (parseString(raw.status) || 'solicitado') as VehicleAssignment['status'],
  incidentes: Array.isArray(raw.incidentes) ? (raw.incidentes as string[]) : undefined,
  createdAt: parseString(raw.created_at),
});

const mapPriorityToSeverity = (priority: string): VehicleAlert['severity'] => {
  if (priority === 'alta') return 'high';
  if (priority === 'baja') return 'low';
  return 'medium';
};

const mapVehicleAlertFromApi = (raw: RawRecord): VehicleAlert => ({
  id: toStringId(raw.id),
  vehicleId: toStringId(raw.vehicle),
  tipoMantenimiento: (parseString(raw.tipo_mantenimiento) || 'otro') as VehicleAlert['tipoMantenimiento'],
  tipoAlerta: (parseString(raw.tipo_alerta) || 'servicio') as VehicleAlert['tipoAlerta'],
  descripcion: parseString(raw.descripcion),
  fechaVencimiento: parseString(raw.fecha_vencimiento),
  prioridad: (parseString(raw.prioridad) || 'media') as VehicleAlert['prioridad'],
  type: parseString(raw.tipo_alerta),
  message: parseString(raw.descripcion),
  dueDate: parseString(raw.fecha_vencimiento),
  severity: mapPriorityToSeverity(parseString(raw.prioridad)),
  costoEstimado: toNullableNumber(raw.costo_estimado),
  proveedorSugerido: toNullableString(raw.proveedor_sugerido),
  atendido: parseBoolean(raw.atendido),
  attended: parseBoolean(raw.atendido),
});

const mapCargaGasolinaFromApi = (raw: RawRecord): CargaGasolina => ({
  id: toStringId(raw.id),
  vehicleId: toStringId(raw.vehicle),
  assignmentId: toNullableString(raw.assignment ? toStringId(raw.assignment) : undefined),
  userId: toNullableString(raw.user ? toStringId(raw.user) : undefined),
  userName: toNullableString(raw.user_name),
  fecha: parseString(raw.fecha),
  litros: parseNumber(raw.litros),
  precioLitro: parseNumber(raw.precio_litro),
  total: parseNumber(raw.total),
  odometro: parseNumber(raw.odometro),
  estacion: parseString(raw.estacion),
  facturaId: toNullableString(raw.factura_id),
  eficiencia: toNullableNumber(raw.eficiencia),
});

const mapMaintenanceRecordFromApi = (raw: RawRecord): MaintenanceRecord => ({
  id: toStringId(raw.id),
  vehicleId: toStringId(raw.vehicle),
  fecha: parseString(raw.fecha),
  tipo: (parseString(raw.tipo) || 'otro') as MaintenanceRecord['tipo'],
  descripcion: parseString(raw.descripcion),
  costo: parseNumber(raw.costo),
  km: toNullableNumber(raw.km),
  proveedor: toNullableString(raw.proveedor),
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
  viaticos.filter((item) => {
    if (item.status !== 'aprobado') {
      return false;
    }
    const montoAprobado = item.montoAprobado ?? item.montoSolicitado;
    const montoDispersado = item.montoDispersado ?? 0;
    return montoAprobado > montoDispersado;
  });

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

export const fetchFacturas = async (): Promise<Factura[]> => {
  const data = (await apiFetch('/conciliacion/facturas/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapFacturaFromApi) : [];
};

export const fetchConsumos = async (): Promise<Consumo[]> => {
  const data = (await apiFetch('/conciliacion/consumos/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapConsumoFromApi) : [];
};

export const fetchAlertasConciliacion = async (): Promise<AlertaConciliacion[]> => {
  const data = (await apiFetch('/conciliacion/alertas/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapAlertaConciliacionFromApi) : [];
};

export const fetchAmexTickets = async (): Promise<TicketAMEX[]> => {
  const data = (await apiFetch('/amex/tickets/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapTicketAmexFromApi) : [];
};

export const fetchFlotillaVehiculos = async (): Promise<Vehicle[]> => {
  const data = (await apiFetch('/flotilla/vehiculos/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapVehicleFromApi) : [];
};

export const fetchFlotillaAsignaciones = async (): Promise<VehicleAssignment[]> => {
  const data = (await apiFetch('/flotilla/asignaciones/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapVehicleAssignmentFromApi) : [];
};

export const fetchFlotillaAlertas = async (): Promise<VehicleAlert[]> => {
  const data = (await apiFetch('/flotilla/alertas/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapVehicleAlertFromApi) : [];
};

export const fetchFlotillaCargasGasolina = async (): Promise<CargaGasolina[]> => {
  const data = (await apiFetch('/flotilla/gasolina/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapCargaGasolinaFromApi) : [];
};

export const fetchFlotillaMantenimiento = async (): Promise<MaintenanceRecord[]> => {
  const data = (await apiFetch('/flotilla/mantenimiento/')) as RawRecord[];
  return Array.isArray(data) ? data.map(mapMaintenanceRecordFromApi) : [];
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
  const facturas = await loadOptional(fetchFacturas, [] as Factura[]);
  const consumos = await loadOptional(fetchConsumos, [] as Consumo[]);
  const alertasConciliacion = await loadOptional(fetchAlertasConciliacion, [] as AlertaConciliacion[]);
  const amexTickets = await loadOptional(fetchAmexTickets, [] as TicketAMEX[]);
  const flotillaVehiculos = await loadOptional(fetchFlotillaVehiculos, [] as Vehicle[]);
  const flotillaAsignaciones = await loadOptional(fetchFlotillaAsignaciones, [] as VehicleAssignment[]);
  const flotillaAlertas = await loadOptional(fetchFlotillaAlertas, [] as VehicleAlert[]);
  const flotillaCargasGasolina = await loadOptional(fetchFlotillaCargasGasolina, [] as CargaGasolina[]);
  const flotillaMantenimiento = await loadOptional(fetchFlotillaMantenimiento, [] as MaintenanceRecord[]);

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

  writeStorageList('conciliacion:facturas', facturas);
  writeStorageList('conciliacion:consumos', consumos);
  writeStorageList('conciliacion:alertas', alertasConciliacion);
  writeStorageList('conciliacion:amex', amexTickets);

  writeStorageList('amex:tickets', amexTickets);

  writeStorageList('flotilla:vehiculos', flotillaVehiculos);
  writeStorageList('flotilla:alertas', flotillaAlertas);
  writeStorageList('flotilla:cargasGasolina', flotillaCargasGasolina);
  writeStorageList('flotilla:maintenanceHistory', flotillaMantenimiento);
  writeStorageList('vehicle_assignments_data', flotillaAsignaciones, { legacy: true });
  writeStorageList('usuario:vehicles', flotillaVehiculos);
};

export const getCachedProyectos = () => {
  const prefixed = readStorageList<Proyecto>('proyectos_data');
  if (prefixed.length > 0) return prefixed;
  return readStorageList<Proyecto>('proyectos_data', { legacy: true });
};
