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
  VehicleExpense,
  Viatico,
} from '../types';
import { apiFetch } from './api';
import { sanitizeProyectoMontos } from './proyectoMetrics';
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

const normalizeVehicleStatus = (value: unknown): Vehicle['status'] => {
  const status = parseString(value).trim();
  if (status === 'disponible' || status === 'activo' || status === 'available') return 'available';
  if (status === 'asignado' || status === 'assigned') return 'assigned';
  if (status === 'en_taller' || status === 'in_shop') return 'in_shop';
  if (status === 'baja' || status === 'de_baja' || status === 'out_of_service') return 'out_of_service';
  return 'available';
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

const asArrayRecords = (value: unknown): RawRecord[] => {
  if (Array.isArray(value)) {
    return value as RawRecord[];
  }
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    if (Array.isArray(payload.results)) {
      return payload.results as RawRecord[];
    }
  }
  return [];
};

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
  userName: toNullableString(raw.user_name),
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
  status: normalizeVehicleStatus(raw.status),
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
  vehicleId: toStringId(raw.vehicle ?? raw.vehicle_id ?? raw.vehicleId),
  assignmentId: toNullableString(
    raw.assignment
      ? toStringId(raw.assignment)
      : raw.assignment_id
        ? toStringId(raw.assignment_id)
        : raw.assignmentId
          ? toStringId(raw.assignmentId)
          : undefined
  ),
  userId: toNullableString(
    raw.user
      ? toStringId(raw.user)
      : raw.user_id
        ? toStringId(raw.user_id)
        : raw.userId
          ? toStringId(raw.userId)
          : undefined
  ),
  userName: toNullableString(raw.user_name ?? raw.userName),
  fecha: parseString(raw.fecha ?? raw.date),
  litros: parseNumber(raw.litros ?? raw.liters),
  precioLitro: parseNumber(raw.precio_litro ?? raw.precioLitro),
  total: parseNumber(raw.total ?? raw.monto),
  odometro: parseNumber(raw.odometro ?? raw.odometer),
  estacion: parseString(raw.estacion ?? raw.proveedor ?? raw.station),
  facturaId: toNullableString(raw.factura_id ?? raw.facturaId),
  eficiencia: toNullableNumber(raw.eficiencia),
});

const mapVehicleExpenseFromApi = (raw: RawRecord): VehicleExpense => ({
  id: toStringId(raw.id),
  vehicleId: toStringId(raw.vehicle),
  assignmentId: toNullableString(raw.assignment ? toStringId(raw.assignment) : undefined),
  tipo: (parseString(raw.tipo) || 'otro') as VehicleExpense['tipo'],
  fecha: parseString(raw.fecha),
  monto: parseNumber(raw.monto),
  descripcion: parseString(raw.descripcion),
  facturaId: toNullableString(raw.factura_id),
  odometro: toNullableNumber(raw.odometro),
  proveedor: toNullableString(raw.proveedor),
});

const DEFAULT_GAS_PRICE_PER_LITER = 23;

const parseLitrosFromText = (value: string): number | undefined => {
  const text = parseString(value).trim();
  if (!text) return undefined;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litro|litros)\b/i);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const toCargaFromExpense = (expense: VehicleExpense): CargaGasolina => {
  const litrosFromDesc = parseLitrosFromText(expense.descripcion);
  const estimatedLiters = expense.monto > 0 ? expense.monto / DEFAULT_GAS_PRICE_PER_LITER : 0;
  const litros = litrosFromDesc ?? Number(estimatedLiters.toFixed(2));
  const precioLitro = litros > 0 ? Number((expense.monto / litros).toFixed(2)) : DEFAULT_GAS_PRICE_PER_LITER;

  return {
    id: `expense-${expense.id}`,
    vehicleId: expense.vehicleId,
    assignmentId: expense.assignmentId,
    fecha: expense.fecha,
    litros,
    precioLitro,
    total: expense.monto,
    odometro: expense.odometro ?? 0,
    estacion: expense.proveedor || expense.descripcion || 'Gasto de gasolina',
    facturaId: expense.facturaId,
  };
};

const normalizeStoredCarga = (item: unknown): CargaGasolina | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const raw = item as Record<string, unknown>;
  const id = parseString(raw.id).trim();
  const vehicleId = parseString(raw.vehicleId).trim();
  if (!id || !vehicleId) {
    return null;
  }

  return {
    id,
    vehicleId,
    assignmentId: toNullableString(raw.assignmentId),
    userId: toNullableString(raw.userId),
    userName: toNullableString(raw.userName),
    fecha: parseString(raw.fecha),
    litros: parseNumber(raw.litros),
    precioLitro: parseNumber(raw.precioLitro),
    total: parseNumber(raw.total),
    odometro: parseNumber(raw.odometro),
    estacion: parseString(raw.estacion),
    facturaId: toNullableString(raw.facturaId),
    eficiencia: toNullableNumber(raw.eficiencia),
  };
};

const isUsableCargaGasolina = (item: CargaGasolina) => {
  const id = String(item.id || '').trim();
  const vehicleId = String(item.vehicleId || '').trim();
  const fecha = String(item.fecha || '').trim();
  return Boolean(id && vehicleId && fecha) && (item.litros > 0 || item.total > 0);
};

const fetchFlotillaGastos = async (): Promise<VehicleExpense[]> => {
  const data = await apiFetch('/flotilla/gastos/');
  return asArrayRecords(data).map(mapVehicleExpenseFromApi);
};

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

const toFacturaPayload = (value: Partial<Factura>) => {
  const payload: RawRecord = {};

  if ('viaticoId' in value) payload.viatico = toApiId(value.viaticoId) ?? null;
  if ('status' in value) payload.status = value.status || 'pendiente';
  if ('matchConsumo' in value) payload.match_consumo = Boolean(value.matchConsumo);
  if ('validacionCFDI' in value) payload.validacion_cfdi = value.validacionCFDI || {};

  return payload;
};

const toConsumoPayload = (value: Partial<Consumo>) => {
  const payload: RawRecord = {};

  if ('userId' in value) payload.user = toApiId(value.userId) ?? null;
  if ('viaticoId' in value) payload.viatico = toApiId(value.viaticoId) ?? null;
  if ('facturaId' in value) payload.factura = toApiId(value.facturaId) ?? null;
  if ('fecha' in value) payload.fecha = parseString(value.fecha);
  if ('comercio' in value) payload.comercio = parseString(value.comercio);
  if ('monto' in value) payload.monto = parseNumber(value.monto);
  if ('categoria' in value) payload.categoria = parseString(value.categoria);
  if ('facturaPdfName' in value) payload.factura_pdf_name = parseString(value.facturaPdfName);
  if ('facturaXmlName' in value) payload.factura_xml_name = parseString(value.facturaXmlName);
  if ('facturaNotas' in value) payload.factura_notas = parseString(value.facturaNotas);
  if ('matched' in value) payload.matched = Boolean(value.matched);
  if ('autorizado' in value) payload.autorizado = Boolean(value.autorizado);

  return payload;
};

const toAmexTicketPayload = (value: Partial<TicketAMEX>) => {
  const payload: RawRecord = {};

  if ('userId' in value) payload.user = toApiId(value.userId) ?? null;
  if ('cardNumber' in value) payload.card_number = parseString(value.cardNumber);
  if ('cardHolder' in value) payload.card_holder = parseString(value.cardHolder);
  if ('fecha' in value) payload.fecha = parseString(value.fecha);
  if ('comercio' in value) payload.comercio = parseString(value.comercio);
  if ('monto' in value) payload.monto = parseNumber(value.monto);
  if ('montoUSD' in value) payload.monto_usd = toNullableNumber(value.montoUSD) ?? null;
  if ('tipoCambio' in value) payload.tipo_cambio = toNullableNumber(value.tipoCambio) ?? null;
  if ('categoria' in value) payload.categoria = parseString(value.categoria);
  if ('cuentaContable' in value) payload.cuenta_contable = parseString(value.cuentaContable);
  if ('proyectoId' in value) payload.proyecto = toApiId(value.proyectoId) ?? null;
  if ('gsActivityId' in value) payload.gs_activity_id = toNullableNumber(value.gsActivityId) ?? null;
  if ('paisComercio' in value) payload.pais_comercio = parseString(value.paisComercio);
  if ('facturaId' in value) payload.factura = toApiId(value.facturaId) ?? null;
  if ('facturaPdfName' in value) payload.factura_pdf_name = parseString(value.facturaPdfName);
  if ('facturaXmlName' in value) payload.factura_xml_name = parseString(value.facturaXmlName);
  if ('facturaNotas' in value) payload.factura_notas = parseString(value.facturaNotas);
  if ('matched' in value) payload.matched = Boolean(value.matched);
  if ('autorizado' in value) payload.autorizado = Boolean(value.autorizado);
  if ('duplicado' in value) payload.duplicado = Boolean(value.duplicado);
  if ('clasificacionAuto' in value) payload.clasificacion_auto = Boolean(value.clasificacionAuto);
  if ('observaciones' in value) payload.observaciones = parseString(value.observaciones);

  return payload;
};

const toVehicleAssignmentPayload = (value: Partial<VehicleAssignment>) => {
  const payload: RawRecord = {};

  if ('vehicleId' in value) payload.vehicle = toApiId(value.vehicleId) ?? null;
  if ('userId' in value) payload.user = toApiId(value.userId) ?? null;
  if ('viaticoId' in value) payload.viatico = toApiId(value.viaticoId) ?? null;
  if ('proyectoId' in value) payload.proyecto = toApiId(value.proyectoId) ?? null;
  if ('origen' in value) payload.origen = parseString(value.origen);
  if ('destino' in value) payload.destino = parseString(value.destino);
  if ('fechaInicio' in value) payload.fecha_inicio = parseString(value.fechaInicio);
  if ('fechaFin' in value) payload.fecha_fin = toNullableString(value.fechaFin) ?? null;
  if ('motivo' in value) payload.motivo = parseString(value.motivo);
  if ('proposito' in value) payload.proposito = value.proposito || 'operaciones';
  if ('kmInicial' in value) payload.km_inicial = parseNumber(value.kmInicial);
  if ('kmFinal' in value) payload.km_final = toNullableNumber(value.kmFinal) ?? null;
  if ('fotoOdometroInicial' in value) payload.foto_odometro_inicial = parseString(value.fotoOdometroInicial);
  if ('fotoOdometroFinal' in value) payload.foto_odometro_final = parseString(value.fotoOdometroFinal);
  if ('checklistRecepcion' in value) payload.checklist_recepcion = value.checklistRecepcion || {};
  if ('checklistEntrega' in value) payload.checklist_entrega = value.checklistEntrega || {};
  if ('status' in value) payload.status = value.status || 'solicitado';
  if ('incidentes' in value) payload.incidentes = value.incidentes || [];

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
  return Array.isArray(data) ? data.map(mapProyectoFromApi).map(sanitizeProyectoMontos) : [];
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
  const data = await apiFetch('/flotilla/vehiculos/');
  return asArrayRecords(data).map(mapVehicleFromApi);
};

export const fetchFlotillaAsignaciones = async (): Promise<VehicleAssignment[]> => {
  const data = await apiFetch('/flotilla/asignaciones/');
  return asArrayRecords(data).map(mapVehicleAssignmentFromApi);
};

export const fetchFlotillaAlertas = async (): Promise<VehicleAlert[]> => {
  const data = await apiFetch('/flotilla/alertas/');
  return asArrayRecords(data).map(mapVehicleAlertFromApi);
};

export const fetchFlotillaCargasGasolina = async (): Promise<CargaGasolina[]> => {
  let cargasFromApi: CargaGasolina[] = [];
  try {
    const data = await apiFetch('/flotilla/gasolina/');
    cargasFromApi = asArrayRecords(data).map(mapCargaGasolinaFromApi).filter(isUsableCargaGasolina);
  } catch {
    // If the endpoint is unavailable, continue with local and expense-based fallbacks.
  }

  if (cargasFromApi.length > 0) {
    return cargasFromApi;
  }

  const legacyStored = readStorageList<unknown>('flotilla:cargasGasolina', { legacy: true })
    .map(normalizeStoredCarga)
    .filter((item): item is CargaGasolina => Boolean(item))
    .filter(isUsableCargaGasolina);
  if (legacyStored.length > 0) {
    return legacyStored;
  }

  try {
    const gastos = await fetchFlotillaGastos();
    return gastos
      .filter((item) => item.tipo === 'gasolina')
      .map(toCargaFromExpense)
      .filter(isUsableCargaGasolina);
  } catch {
    return [];
  }
};

export const fetchFlotillaMantenimiento = async (): Promise<MaintenanceRecord[]> => {
  const data = await apiFetch('/flotilla/mantenimiento/');
  return asArrayRecords(data).map(mapMaintenanceRecordFromApi);
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

export const deleteViatico = async (id: string): Promise<void> => {
  await apiFetch(`/viaticos/${id}/`, { method: 'DELETE' });
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

export const deleteViaje = async (id: string): Promise<void> => {
  await apiFetch(`/viajes/${id}/`, { method: 'DELETE' });
};

export const createFactura = async (payload: {
  viaticoId?: string;
  folio: string;
  uuid: string;
  rfc: string;
  razonSocial: string;
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  formaPago?: string;
  metodoPago?: string;
  archivoPdf?: File | null;
  archivoXml?: File | null;
}) => {
  const body = new FormData();
  if (payload.viaticoId) {
    const viaticoApiId = toApiId(payload.viaticoId);
    if (viaticoApiId !== undefined) {
      body.append('viatico', String(viaticoApiId));
    }
  }
  body.append('folio', payload.folio);
  body.append('uuid', payload.uuid);
  body.append('rfc', payload.rfc);
  body.append('razon_social', payload.razonSocial);
  body.append('fecha', payload.fecha);
  body.append('subtotal', String(payload.subtotal));
  body.append('iva', String(payload.iva));
  body.append('total', String(payload.total));
  body.append('forma_pago', payload.formaPago || 'NA');
  body.append('metodo_pago', payload.metodoPago || 'NA');
  if (payload.archivoPdf) {
    body.append('archivo_pdf', payload.archivoPdf);
  }
  if (payload.archivoXml) {
    body.append('archivo_xml', payload.archivoXml);
  }

  const data = (await apiFetch('/conciliacion/facturas/', {
    method: 'POST',
    body,
  })) as RawRecord;
  return mapFacturaFromApi(data);
};

export const updateFactura = async (id: string, payload: Partial<Factura>): Promise<Factura> => {
  const data = (await apiFetch(`/conciliacion/facturas/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toFacturaPayload(payload)),
  })) as RawRecord;
  return mapFacturaFromApi(data);
};

export const updateConsumo = async (id: string, payload: Partial<Consumo>): Promise<Consumo> => {
  const data = (await apiFetch(`/conciliacion/consumos/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toConsumoPayload(payload)),
  })) as RawRecord;
  return mapConsumoFromApi(data);
};

export const createAmexTicket = async (payload: Partial<TicketAMEX>): Promise<TicketAMEX> => {
  const data = (await apiFetch('/amex/tickets/', {
    method: 'POST',
    body: JSON.stringify(toAmexTicketPayload(payload)),
  })) as RawRecord;
  return mapTicketAmexFromApi(data);
};

export const updateAmexTicket = async (id: string, payload: Partial<TicketAMEX>): Promise<TicketAMEX> => {
  const data = (await apiFetch(`/amex/tickets/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toAmexTicketPayload(payload)),
  })) as RawRecord;
  return mapTicketAmexFromApi(data);
};

export const createFlotillaAsignacion = async (payload: Partial<VehicleAssignment>): Promise<VehicleAssignment> => {
  const data = (await apiFetch('/flotilla/asignaciones/', {
    method: 'POST',
    body: JSON.stringify(toVehicleAssignmentPayload(payload)),
  })) as RawRecord;
  return mapVehicleAssignmentFromApi(data);
};

export const createFlotillaGasto = async (payload: {
  vehicleId: string;
  assignmentId?: string;
  tipo: VehicleExpense['tipo'];
  fecha: string;
  monto: number;
  descripcion: string;
  facturaId?: string;
  odometro?: number;
  proveedor?: string;
}): Promise<VehicleExpense> => {
  const data = (await apiFetch('/flotilla/gastos/', {
    method: 'POST',
    body: JSON.stringify({
      vehicle: toApiId(payload.vehicleId),
      assignment: payload.assignmentId ? toApiId(payload.assignmentId) ?? null : null,
      tipo: payload.tipo,
      fecha: payload.fecha,
      monto: parseNumber(payload.monto),
      descripcion: parseString(payload.descripcion),
      factura_id: payload.facturaId || '',
      odometro: payload.odometro ?? null,
      proveedor: payload.proveedor || '',
    }),
  })) as RawRecord;

  return mapVehicleExpenseFromApi(data);
};

export const createFlotillaVehiculo = async (payload: {
  brand: string;
  model: string;
  year: number;
  plates: string;
  serialNumber: string;
  color: string;
  currentKm?: number;
  insuranceCompany?: string;
  insurancePolicyNumber?: string;
  insuranceExpirationDate?: string;
  foto?: File | null;
}) => {
  const body = new FormData();
  body.append('marca', payload.brand);
  body.append('modelo', payload.model);
  body.append('anio', String(payload.year));
  body.append('placas', payload.plates);
  body.append('numero_serie', payload.serialNumber);
  body.append('color', payload.color);
  if (payload.currentKm !== undefined) {
    body.append('km_actual', String(payload.currentKm));
  }
  if (payload.insuranceCompany !== undefined) {
    body.append('seguro_compania', payload.insuranceCompany);
  }
  if (payload.insurancePolicyNumber !== undefined) {
    body.append('seguro_poliza', payload.insurancePolicyNumber);
  }
  if (payload.insuranceExpirationDate !== undefined && payload.insuranceExpirationDate.trim()) {
    body.append('seguro_vigencia', payload.insuranceExpirationDate.trim());
  }
  if (payload.foto) {
    body.append('foto', payload.foto);
  }

  const data = (await apiFetch('/flotilla/vehiculos/', {
    method: 'POST',
    body,
  })) as RawRecord;
  return mapVehicleFromApi(data);
};

export const updateFlotillaVehiculo = async (
  id: string,
  payload: Partial<{
    brand: string;
    model: string;
    year: number;
    plates: string;
    serialNumber: string;
    color: string;
    currentKm: number;
    insuranceCompany: string;
    insurancePolicyNumber: string;
    insuranceExpirationDate: string;
    foto: File | null;
  }>
) => {
  const body = new FormData();
  if (payload.brand !== undefined) body.append('marca', payload.brand);
  if (payload.model !== undefined) body.append('modelo', payload.model);
  if (payload.year !== undefined) body.append('anio', String(payload.year));
  if (payload.plates !== undefined) body.append('placas', payload.plates);
  if (payload.serialNumber !== undefined) body.append('numero_serie', payload.serialNumber);
  if (payload.color !== undefined) body.append('color', payload.color);
  if (payload.currentKm !== undefined) body.append('km_actual', String(payload.currentKm));
  if (payload.insuranceCompany !== undefined) body.append('seguro_compania', payload.insuranceCompany);
  if (payload.insurancePolicyNumber !== undefined) body.append('seguro_poliza', payload.insurancePolicyNumber);
  if (payload.insuranceExpirationDate !== undefined && payload.insuranceExpirationDate.trim()) {
    body.append('seguro_vigencia', payload.insuranceExpirationDate.trim());
  }
  if (payload.foto instanceof File) {
    body.append('foto', payload.foto);
  }

  const data = (await apiFetch(`/flotilla/vehiculos/${id}/`, {
    method: 'PATCH',
    body,
  })) as RawRecord;
  return mapVehicleFromApi(data);
};

export const updateFlotillaAsignacion = async (
  id: string,
  payload: Partial<VehicleAssignment>
): Promise<VehicleAssignment> => {
  const data = (await apiFetch(`/flotilla/asignaciones/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(toVehicleAssignmentPayload(payload)),
  })) as RawRecord;
  return mapVehicleAssignmentFromApi(data);
};

export const deleteFlotillaAsignacion = async (id: string): Promise<void> => {
  await apiFetch(`/flotilla/asignaciones/${id}/`, { method: 'DELETE' });
};

export const uploadFlotillaEntregaFotos = async (
  id: string,
  fotos: File[]
): Promise<VehicleAssignment> => {
  const body = new FormData();
  fotos.slice(0, 3).forEach((foto) => {
    if (foto) {
      body.append('fotos', foto);
    }
  });
  const data = (await apiFetch(`/flotilla/asignaciones/${id}/upload-entrega-fotos/`, {
    method: 'POST',
    body,
  })) as RawRecord;
  return mapVehicleAssignmentFromApi(data);
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
  const [
    proyectos,
    viaticos,
    viajes,
    dispersiones,
    facturas,
    consumos,
    alertasConciliacion,
    amexTickets,
    flotillaVehiculos,
    flotillaAsignaciones,
    flotillaAlertas,
    flotillaCargasGasolina,
    flotillaMantenimiento,
  ] = await Promise.all([
    loadOptional(fetchProyectos, [] as Proyecto[]),
    loadOptional(fetchViaticos, [] as Viatico[]),
    loadOptional(fetchViajes, [] as SolicitudViaje[]),
    loadOptional(fetchDispersiones, [] as Dispersion[]),
    loadOptional(fetchFacturas, [] as Factura[]),
    loadOptional(fetchConsumos, [] as Consumo[]),
    loadOptional(fetchAlertasConciliacion, [] as AlertaConciliacion[]),
    loadOptional(fetchAmexTickets, [] as TicketAMEX[]),
    loadOptional(fetchFlotillaVehiculos, readStorageList<Vehicle>('flotilla:vehiculos')),
    loadOptional(fetchFlotillaAsignaciones, readStorageList<VehicleAssignment>('vehicle_assignments_data', { legacy: true })),
    loadOptional(fetchFlotillaAlertas, readStorageList<VehicleAlert>('flotilla:alertas')),
    loadOptional(fetchFlotillaCargasGasolina, readStorageList<CargaGasolina>('flotilla:cargasGasolina')),
    loadOptional(fetchFlotillaMantenimiento, readStorageList<MaintenanceRecord>('flotilla:maintenanceHistory')),
  ]);

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
  const prefixed = readStorageList<Proyecto>('proyectos_data').map(sanitizeProyectoMontos);
  if (prefixed.length > 0) return prefixed;
  return readStorageList<Proyecto>('proyectos_data', { legacy: true }).map(sanitizeProyectoMontos);
};
