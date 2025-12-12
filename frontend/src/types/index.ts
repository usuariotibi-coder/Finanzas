// Tipos de Usuario y Roles
export type UserRole = 'admin' | 'finanzas' | 'gerente_servicios' | 'usuario';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  avatar?: string;
}

// Tipos de Proyectos
export type ProyectoEstado = 'activo' | 'en_pausa' | 'completado' | 'cancelado';

export interface Proyecto {
  id: string;
  codigo: string;              // "PRJ-2025-001"
  nombre: string;              // "Obra Aeropuerto TLM"
  cliente: string;
  estado: ProyectoEstado;
  presupuesto: number;
  gastado: number;
  fechaInicio: string;
  fechaFinEstimada: string;
  fechaFinReal?: string;
  responsable: string;         // Project Manager
  departamento: string;
  descripcion: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// Tipos de Viáticos
export type ViaticoStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'dispersado' | 'en_viaje' | 'viaje_finalizado' | 'en_recuperacion' | 'completado';
export type TipoViatico = 'efectifintech' | 'amex' | 'mixto';
export type DestinoPais = 'Mexico' | 'USA' | 'Otro';

export interface Viatico {
  id: string;
  userId: string;
  userName: string;
  proyectoId: string;          // OBLIGATORIO - vinculado a proyecto
  proyectoNombre: string;      // Para mostrar en tabla
  motivo: string;
  destino: string;
  destinoPais: DestinoPais;
  tipoViatico: TipoViatico;
  fechaInicio: string;
  fechaFin: string;
  fechaInicioReal?: string;
  fechaFinReal?: string;
  montoSolicitado: number;
  montoAprobado?: number;
  montoDispersado?: number;
  montoGastado?: number;
  saldoRestante?: number;
  status: ViaticoStatus;
  vehiculoAsignado?: string;
  gsActivityId?: number;       // GS Activity asociado
  createdAt: string;
  aprobadoPor?: string;
  comentarios?: string;
  diasSinRecuperar?: number;
}

// Tipos de Dispersión
export interface Dispersion {
  id: string;
  viaticoId: string;
  monto: number;
  fecha: string;
  metodoPago: 'transferencia' | 'efectivo' | 'tarjeta';
  referencia?: string;
  confirmado: boolean;
  dispersadoPor: string;
}

// Tipos de Recuperación
export interface Recuperacion {
  id: string;
  viaticoId: string;
  montoRecuperado: number;
  fecha: string;
  metodoPago: 'transferencia' | 'efectivo' | 'tarjeta';
  referencia?: string;
  registradoPor: string;
  notas?: string;
}

// Tipos de Facturas y CFDI
export type FacturaStatus = 'pendiente' | 'validada' | 'rechazada' | 'conciliada';

export interface Factura {
  id: string;
  viaticoId?: string;
  userId: string;
  folio: string;
  uuid: string;
  rfc: string;
  razonSocial: string;
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  formaPago: string;
  metodoPago: string;
  conceptos: ConceptoFactura[];
  status: FacturaStatus;
  archivoXML?: string;
  archivoPDF?: string;
  validacionCFDI?: ValidacionCFDI;
  matchConsumo?: boolean;
  createdAt: string;
}

export interface ConceptoFactura {
  claveProdServ: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  importe: number;
}

export interface ValidacionCFDI {
  rfcValido: boolean;
  formaPagoValida: boolean;
  conceptosValidos: boolean;
  articulosPersonales: string[];
  propinaExcedida: boolean;
  propinaDetalle?: {
    monto: number;
    porcentaje: number;
  };
  errores: string[];
}

// Tipos de Consumos (Efectifintech)
export interface Consumo {
  id: string;
  userId: string;
  viaticoId?: string;
  fecha: string;
  comercio: string;
  monto: number;
  categoria: string;
  facturaId?: string;
  matched: boolean;
  autorizado: boolean;
}

// Tipos de AMEX
export interface TicketAMEX {
  id: string;
  userId: string;
  cardNumber: string;          // Últimos 4 dígitos
  cardHolder: string;          // Nombre del titular
  fecha: string;
  comercio: string;
  monto: number;
  montoUSD?: number;           // Si aplica
  tipoCambio?: number;
  categoria: string;
  cuentaContable: string;      // Ej: 5450, 6090, 6200
  proyectoId?: string;         // Obligatorio si cuentaContable es 5450
  proyectoNombre?: string;     // Nombre del proyecto si aplica
  gsActivityId?: number;       // GS Activity asociado
  paisComercio: string;        // México, USA, etc.
  facturaId?: string;
  matched: boolean;
  autorizado: boolean;
  duplicado: boolean;
  clasificacionAuto: boolean;  // Si fue clasificada automáticamente
  observaciones?: string;
}

// Tarjetas AMEX disponibles
export interface TarjetaAMEX {
  id: string;
  cardNumber: string;
  cardHolder: string;
  department: string;
  activa: boolean;
}

// Tipos de Conciliación
export type PeriodoConciliacion = '1-15' | '16-30';

export interface Conciliacion {
  id: string;
  periodo: PeriodoConciliacion;
  mes: number;
  anio: number;
  facturas: number;
  consumos: number;
  matched: number;
  discrepancias: number;
  status: 'en_proceso' | 'completada' | 'revisada';
  alertas: AlertaConciliacion[];
  createdAt: string;
  completedAt?: string;
}

export interface AlertaConciliacion {
  tipo: 'consumo_sin_factura' | 'factura_sin_consumo' | 'monto_diferente' | 'articulo_personal' | 'propina_excedida' | 'duplicado';
  descripcion: string;
  gravedad: 'alta' | 'media' | 'baja';
  facturaId?: string;
  consumoId?: string;
}

// Tipos de Flotilla (Vehículos)
export type VehicleStatus = 'disponible' | 'asignado' | 'en_taller' | 'baja';

export interface Vehicle {
  id: string;
  marca: string;
  modelo: string;
  anio: number;
  placas: string;
  numeroSerie: string;
  color: string;
  seguro: {
    compania: string;
    poliza: string;
    vigencia: string;
  };
  mantenimiento: {
    ultimoServicio: string;
    kmUltimoServicio: number;
    proximoServicio: string;
    kmProximoServicio: number;
  };
  kmActual: number;
  status: VehicleStatus;
  foto?: string;
  createdAt: string;
}

export interface VehicleAssignment {
  id: string;
  vehicleId: string;
  userId: string;
  userName: string;
  viaticoId?: string;
  proyectoId?: string;         // Opcional pero recomendado
  proyectoNombre?: string;
  fechaInicio: string;
  fechaFin?: string;
  motivo: string;
  proposito: 'operaciones' | 'visita' | 'viaje';
  kmInicial: number;
  kmFinal?: number;
  fotoOdometroInicial?: string;
  fotoOdometroFinal?: string;
  status: 'activo' | 'completado';
  incidentes?: string[];
}

export interface VehicleExpense {
  id: string;
  vehicleId: string;
  assignmentId?: string;
  tipo: 'gasolina' | 'mantenimiento' | 'seguro' | 'verificacion' | 'otro';
  fecha: string;
  monto: number;
  descripcion: string;
  facturaId?: string;
  odometro?: number;
  proveedor?: string;
}

export interface VehicleAlert {
  id: string;
  vehicleId: string;
  tipoMantenimiento: 'preventivo' | 'predictivo' | 'correctivo' | 'otro';
  tipoAlerta: 'servicio' | 'seguro' | 'verificacion' | 'placas' | 'reparacion';
  descripcion: string;
  fechaVencimiento: string;
  prioridad: 'alta' | 'media' | 'baja';
  costoEstimado?: number;
  proveedorSugerido?: string;
  atendido: boolean;
}

// Carga de Gasolina
export interface CargaGasolina {
  id: string;
  vehicleId: string;
  assignmentId?: string;
  userId: string;
  userName: string;
  fecha: string;
  litros: number;
  precioLitro: number;
  total: number;
  odometro: number;
  estacion: string;
  facturaId?: string;
  eficiencia?: number; // KM recorridos / litros
}

// Tipos de Reportes
export interface ReporteContable {
  id: string;
  periodo: string;
  mes: number;
  anio: number;
  totalViaticos: number;
  totalGastos: number;
  totalRecuperado: number;
  viaticosActivos: number;
  viaticosCompletados: number;
  facturasProcesadas: number;
  conciliacionesCompletadas: number;
  gastosFlotilla: number;
  generadoAt: string;
  archivoExcel?: string;
  archivoPDF?: string;
}

// Tipos de Dashboard
export interface DashboardMetrics {
  viaticosActivos: number;
  viaticosAprobacionPendiente: number;
  totalDispersado: number;
  totalRecuperar: number;
  facturasPendientes: number;
  alertasConciliacion: number;
  vehiculosDisponibles: number;
  vehiculosAsignados: number;
  alertasMantenimiento: number;
  gastosAMEXPendientes: number;
}

// Tipos de Notificaciones
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  userId: string;
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  leida: boolean;
  link?: string;
  createdAt: string;
}

// Cuentas Contables
export interface CuentaContable {
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  proyectoRequerido: boolean;
  keywords: string[];
  activa: boolean;
}

// Daily Report
export interface DailyReportEntry {
  id: string;
  fecha: string;
  viaticoId: string;
  userId: string;
  userName: string;
  montoDispersado: number;
  metodoPago: string;
  referencia: string;
  registradoPor: string;
}

// Reservaciones
export interface SolicitudHospedaje {
  id: string;
  userId: string;
  userName: string;
  viaticoId?: string;
  destino: string;
  fechaCheckIn: string;
  fechaCheckOut: string;
  hotelSugerido?: string;
  presupuesto: number;
  noches: number;
  status: 'solicitado' | 'cotizando' | 'reservado' | 'cancelado';
  reservaConfirmada?: {
    hotel: string;
    confirmacion: string;
    costo: number;
  };
  createdAt: string;
}

export interface SolicitudVuelo {
  id: string;
  userId: string;
  userName: string;
  viaticoId?: string;
  origen: string;
  destino: string;
  fechaIda: string;
  fechaVuelta?: string;
  presupuesto: number;
  status: 'solicitado' | 'cotizando' | 'reservado' | 'cancelado';
  createdAt: string;
}

export interface SolicitudRentaAuto {
  id: string;
  userId: string;
  userName: string;
  destino: string;
  fechaInicio: string;
  fechaFin: string;
  tipoVehiculo: 'compacto' | 'sedan' | 'suv';
  presupuesto: number;
  status: 'solicitado' | 'cotizando' | 'reservado' | 'cancelado';
  createdAt: string;
}

// Períodos Configurables
export interface PeriodoConfig {
  tipo: 'amex' | 'efectifintech';
  diaInicio: number;
  diaFin: number;
  descripcion: string;
}
