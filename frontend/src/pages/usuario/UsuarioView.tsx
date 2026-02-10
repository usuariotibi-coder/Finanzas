import { useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Viatico, DestinoPais, VehicleAssignment, VehicleConditionChecklist, Vehicle, SolicitudViaje } from '../../types';
import { getProyectos } from '../../components/common/ProyectoSelector';
import ProyectoSelector from '../../components/common/ProyectoSelector';
import GSActivitySelector from '../../components/common/GSActivitySelector';
import { GS_ACTIVITY_OTHER_ID, getActivityById } from '../../data/gsActivities';
import { createViaje, createViatico, syncCoreAppData } from '../../utils/backendSync';
import { formatProyectoLabel } from '../../utils/proyectoLabel';
import { clearAppStorage } from '../../utils/storage';

const VEHICLE_ASSIGNMENTS_STORAGE_KEY = 'vehicle_assignments_data';
const MS_POR_DIA = 1000 * 60 * 60 * 24;

const calcularDiasViaje = (fechaInicio: string, fechaFin: string) => {
  if (!fechaInicio || !fechaFin) {
    return 0;
  }

  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) {
    return 0;
  }

  return Math.floor((fin.getTime() - inicio.getTime()) / MS_POR_DIA) + 1;
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
export default function UsuarioView() {
  const { user } = useAuth();
  const [viaticos, setViaticos] = useLocalStorageState<Viatico[]>('usuario:viaticos', []);
  const [viaticoSeleccionado, setViaticoSeleccionado] = useLocalStorageState<string | null>('usuario:viaticoSeleccionado', null);
  const [filtro, setFiltro] = useLocalStorageState<'todos' | 'activos' | 'completados'>('usuario:filtro', 'activos');
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [ticketFile, setTicketFile] = useState<File | null>(null);

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

  const saveVehicleAssignments = (assignments: VehicleAssignment[]) => {
    setVehicleAssignments(assignments);
    localStorage.setItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
    window.dispatchEvent(new CustomEvent('app-storage-change', { detail: { key: VEHICLE_ASSIGNMENTS_STORAGE_KEY } }));
  };

  const [formSolicitudVehiculo, setFormSolicitudVehiculo] = useLocalStorageState('usuario:formSolicitudVehiculo', {
    proyectoId: '',
    origen: '',
    destino: '',
    motivo: '',
    fechaInicio: '',
    fechaFin: '',
    proposito: 'operaciones' as 'operaciones' | 'visita' | 'viaje',
    requiereGasolina: false,
  });

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

  const [fotoRecepcion, setFotoRecepcion] = useState<File | null>(null);
  const [fotoEntrega, setFotoEntrega] = useState<File | null>(null);
  const [kmInicial, setKmInicial] = useLocalStorageState<number>('usuario:kmInicial', 0);
  const [kmFinal, setKmFinal] = useLocalStorageState<number>('usuario:kmFinal', 0);

  const proyectos = getProyectos();
  const totalAlimentos =
    formNuevoViatico.desayunos * 150 +
    formNuevoViatico.comidas * 200 +
    formNuevoViatico.cenas * 250;
  const diasViajeSugeridos = calcularDiasViaje(formNuevoViatico.fechaInicio, formNuevoViatico.fechaFin);
  const placeholderAlimentos = diasViajeSugeridos > 0 ? String(diasViajeSugeridos) : '0';
  const actividadSeleccionada = formNuevoViatico.gsActivityId ? getActivityById(formNuevoViatico.gsActivityId) : undefined;
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
      foto: !fotoEntrega ? 'Agrega al menos una foto.' : '',
    }
    : {};
  const gastoArchivoError = showGastoDocumentoErrors && !pdfFile && !ticketFile
    ? 'Agrega el PDF o el ticket.'
    : '';
  const subirDocumentosError = showSubirDocumentosErrors && gastos.length === 0
    ? 'Agrega al menos un gasto.'
    : '';

  useEscapeKey(() => setShowModalNuevoViatico(false), showModalNuevoViatico);
  useEscapeKey(() => setShowModalSolicitarVehiculo(false), showModalSolicitarVehiculo);
  useEscapeKey(() => setShowModalRecibirVehiculo(false), showModalRecibirVehiculo);
  useEscapeKey(() => setShowModalDevolverVehiculo(false), showModalDevolverVehiculo);
  useEscapeKey(() => setShowModalSolicitarViaje(false), showModalSolicitarViaje);
  useEscapeKey(() => setShowModalExtenderViaje(false), showModalExtenderViaje);
  useEscapeKey(() => setShowVehicleReturnSuccess(false), showVehicleReturnSuccess);

  const openDatePicker = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };

  // Filtrar viáticos
  const viaticosFiltrados = viaticos.filter(v => {
    if (filtro === 'activos') {
      return ['aprobado', 'dispersado', 'en_viaje'].includes(v.status);
    }
    if (filtro === 'completados') {
      return v.status === 'completado';
    }
    return true;
  });
  const getEstadoInfo = (status: Viatico['status']) => {
    const configs = {
      pendiente: { label: 'Pendiente de Aprobación', color: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
      aprobado: { label: 'Esperando dispersión', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
      rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: '❌' },
      dispersado: { label: 'Dispersado', color: 'bg-green-100 text-green-700', icon: '✅' },
      en_viaje: { label: 'En Viaje', color: 'bg-purple-100 text-purple-700', icon: '✈️' },
      viaje_finalizado: { label: 'Viaje Finalizado', color: 'bg-indigo-100 text-indigo-700', icon: '🏁' },
      en_recuperacion: { label: 'Pendiente Recuperación', color: 'bg-orange-100 text-orange-700', icon: '💰' },
      completado: { label: 'Completado', color: 'bg-gray-100 text-gray-700', icon: '✅' },
    };
    return configs[status] || configs.pendiente;
  };

  const getAccionBoton = (viatico: Viatico) => {
    if (viatico.status === 'dispersado' || viatico.status === 'viaje_finalizado') {
      const facturasCompletas = (viatico.montoGastado || 0) >= (viatico.montoDispersado || 0) * 0.9;
      return facturasCompletas
        ? { label: 'Documentos completos', color: 'bg-green-100 text-green-700', icon: '✅', accion: 'ver' }
        : { label: 'Pendiente por subir facturas', color: 'bg-yellow-100 text-yellow-700', icon: '📄', accion: 'subir' };
    }
    if (viatico.status === 'aprobado') {
      return { label: 'Esperando dispersión', color: 'bg-blue-100 text-blue-700', icon: '⏳', accion: 'none' };
    }
    if (viatico.status === 'completado') {
      return { label: 'Documentos completos', color: 'bg-green-100 text-green-700', icon: '✅', accion: 'ver' };
    }
    return { label: 'Ver detalles', color: 'bg-gray-100 text-gray-700', icon: 'ℹ️', accion: 'ver' };
  };

  const getVehiculoStatusIcon = (status: VehicleAssignment['status']) => {
    const icons: Record<VehicleAssignment['status'], string> = {
      solicitado: '⏳',
      asignado: '📌',
      activo: '🚗',
      completado: '🏁',
      rechazado: '⛔',
    };
    return icons[status] ?? '🚗';
  };

  const getViajeStatusIcon = (status: SolicitudViaje['status']) => {
    const icons = {
      pendiente: '⏳',
      en_proceso: '🧭',
      confirmado: '✅',
      rechazado: '⛔',
      cancelado: '⛔',
      completado: '🏁',
    };
    return icons[status] || '🧭';
  };

  const handleAccionClick = (viatico: Viatico, accion: string) => {
    if (accion === 'subir') {
      setViaticoSeleccionado(viatico.id);
      setShowSubirDocumentosErrors(false);
      setShowGastoDocumentoErrors(false);
    }
  };

  const handleAgregarGasto = () => {
    if (!pdfFile && !ticketFile) {
      setShowGastoDocumentoErrors(true);
      return;
    }

    const nuevoGasto: GastoDocumento = {
      id: `GASTO-${Date.now()}`,
      viaticoId: viaticoSeleccionado!,
      tipo: xmlFile ? 'completo' : 'sin_xml',
      descripcion: pdfFile?.name || ticketFile?.name || 'Sin descripcion',
      monto: 0,
      pdfName: pdfFile?.name,
      xmlName: xmlFile?.name,
      ticketName: ticketFile?.name,
      fecha: new Date().toISOString(),
    };

    setGastos([...gastos, nuevoGasto]);
    setShowGastoDocumentoErrors(false);
    setShowSubirDocumentosErrors(false);

    // Limpiar campos
    setPdfFile(null);
    setXmlFile(null);
    setTicketFile(null);
  };

  const handleSubirDocumentos = () => {
    if (gastos.length === 0) {
      setShowSubirDocumentosErrors(true);
      return;
    }

    // Aquí iría la lógica para subir al backend
    console.log('Subiendo gastos:', gastos);
    alert(`${gastos.length} gasto(s) subido(s) exitosamente`);

    // Limpiar y volver a la lista
    setGastos([]);
    setViaticoSeleccionado(null);
    setShowSubirDocumentosErrors(false);
  };

  const eliminarGasto = (gastoId: string) => {
    setGastos(gastos.filter(g => g.id !== gastoId));
  };

  const viaticoActual = viaticos.find(v => v.id === viaticoSeleccionado);
  const proyectoActual = proyectos.find(p => p.id === viaticoActual?.proyectoId);

  const handleCrearNuevoViatico = async () => {
    if (!isFormValid) {
      setShowNuevoViaticoErrors(true);
      return;
    }

    const currentUserId = user ? String(user.id) : '';

    try {
      const nuevoViatico = await createViatico({
        userId: currentUserId || undefined,
        proyectoId: formNuevoViatico.proyectoId || undefined,
        gsActivityId: formNuevoViatico.gsActivityId || undefined,
        motivo: formNuevoViatico.motivo,
        origen: formNuevoViatico.origen,
        destino: formNuevoViatico.destino,
        destinoPais: formNuevoViatico.destinoPais,
        tipoViatico: formNuevoViatico.tipoViatico,
        fechaInicio: formNuevoViatico.fechaInicio,
        fechaFin: formNuevoViatico.fechaFin,
        montoSolicitado: totalAlimentos,
        status: 'pendiente',
      });

      setViaticos((prev) => [...prev, nuevoViatico]);
      await syncCoreAppData({ userId: currentUserId || undefined });
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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el viatico.');
    }
  };

  // Funciones para vehículos (solo coches)
  const handleSolicitarVehiculo = () => {
    if (!formSolicitudVehiculo.proyectoId || !formSolicitudVehiculo.origen || !formSolicitudVehiculo.destino || !formSolicitudVehiculo.motivo || !formSolicitudVehiculo.fechaInicio) {
      setShowSolicitarVehiculoErrors(true);
      return;
    }

    console.log('Solicitud de vehículo:', {
      ...formSolicitudVehiculo,
      requiereGasolina: formSolicitudVehiculo.requiereGasolina,
    });

    const nuevaSolicitud: VehicleAssignment = {
      id: `ASG-${String(vehicleAssignments.length + 1).padStart(3, '0')}`,
      vehicleId: '',
      userId: 'user1',
      userName: 'Juan Pérez',
      proyectoId: formSolicitudVehiculo.proyectoId,
      proyectoNombre: formatProyectoLabel(
        proyectos.find(p => p.id === formSolicitudVehiculo.proyectoId)?.nombre,
        formSolicitudVehiculo.proyectoId
      ),
      origen: formSolicitudVehiculo.origen,
      destino: formSolicitudVehiculo.destino,
      fechaInicio: formSolicitudVehiculo.fechaInicio,
      fechaFin: formSolicitudVehiculo.fechaFin,
      motivo: formSolicitudVehiculo.motivo,
      proposito: formSolicitudVehiculo.proposito,
      kmInicial: 0,
      status: 'solicitado',
      createdAt: new Date().toISOString(),
    };

    saveVehicleAssignments([...vehicleAssignments, nuevaSolicitud]);
    alert('Solicitud de vehículo enviada. El administrador asignará un coche disponible.');

    setShowModalSolicitarVehiculo(false);
    setFormSolicitudVehiculo({
      proyectoId: '',
      origen: '',
      destino: '',
      motivo: '',
      fechaInicio: '',
      fechaFin: '',
      proposito: 'operaciones',
      requiereGasolina: false,
    });
    setShowSolicitarVehiculoErrors(false);
  };

  // Función para solicitar viaje (avión, camión, hotel)
  const handleSolicitarViaje = async () => {
    if (!formSolicitudViaje.proyectoId || !formSolicitudViaje.motivo || !formSolicitudViaje.origen || !formSolicitudViaje.destino || !formSolicitudViaje.fechaInicio || !formSolicitudViaje.fechaFin) {
      setShowSolicitarViajeErrors(true);
      return;
    }

    if (!formSolicitudViaje.necesitaAvion && !formSolicitudViaje.necesitaCamion && !formSolicitudViaje.necesitaHotel) {
      setShowSolicitarViajeErrors(true);
      return;
    }

    const currentUserId = user ? String(user.id) : '';
    const proyectoLabel = formatProyectoLabel(
      proyectos.find((p) => p.id === formSolicitudViaje.proyectoId)?.nombre,
      formSolicitudViaje.proyectoId
    );

    try {
      const nuevaSolicitud = await createViaje({
        userId: currentUserId || undefined,
        proyectoId: formSolicitudViaje.proyectoId,
        proyectoNombre: proyectoLabel,
        origen: formSolicitudViaje.origen,
        destino: formSolicitudViaje.destino,
        fechaInicio: formSolicitudViaje.fechaInicio,
        fechaFin: formSolicitudViaje.fechaFin,
        motivo: formSolicitudViaje.motivo,
        necesitaAvion: formSolicitudViaje.necesitaAvion,
        necesitaCamion: formSolicitudViaje.necesitaCamion,
        necesitaHotel: formSolicitudViaje.necesitaHotel,
        detallesAvion: formSolicitudViaje.detallesAvion || undefined,
        detallesCamion: formSolicitudViaje.detallesCamion || undefined,
        detallesHotel: formSolicitudViaje.detallesHotel || undefined,
        status: 'pendiente',
        statusAvion: formSolicitudViaje.necesitaAvion ? 'pendiente' : undefined,
        statusCamion: formSolicitudViaje.necesitaCamion ? 'pendiente' : undefined,
        statusHotel: formSolicitudViaje.necesitaHotel ? 'pendiente' : undefined,
      });

      setSolicitudesViaje((prev) => [...prev, nuevaSolicitud]);
      await syncCoreAppData({ userId: currentUserId || undefined });
      alert('Solicitud de viaje enviada. El administrador te contactará para coordinar los servicios.');

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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear la solicitud de viaje.');
    }
  };

  const handleRecibirVehiculo = () => {
    if (kmInicial <= 0) {
      setShowRecibirErrors(true);
      return;
    }

    const assignment = vehicleAssignments.find(a => a.id === assignmentSeleccionado);
    if (!assignment) return;

    const updatedAssignments = vehicleAssignments.map(a => {
      if (a.id === assignmentSeleccionado) {
        return {
          ...a,
          kmInicial,
          checklistRecepcion: { ...checklistRecepcion, foto: fotoRecepcion?.name },
          status: 'activo' as const,
        };
      }
      return a;
    });

    saveVehicleAssignments(updatedAssignments);
    alert('Vehículo recibido correctamente');
    setShowModalRecibirVehiculo(false);
    setAssignmentSeleccionado(null);
    setKmInicial(0);
    setFotoRecepcion(null);
    setShowRecibirErrors(false);
  };

  const handleDevolverVehiculo = () => {
    const assignment = vehicleAssignments.find(a => a.id === assignmentSeleccionado);
    if (!assignment || !assignment.kmInicial) return;

    if (kmFinal <= 0 || !fotoEntrega || kmFinal < assignment.kmInicial) {
      setShowDevolverErrors(true);
      return;
    }

    const updatedAssignments = vehicleAssignments.map(a => {
      if (a.id === assignmentSeleccionado) {
        return {
          ...a,
          kmFinal,
          checklistEntrega: { ...checklistEntrega, foto: fotoEntrega?.name },
          fechaFin: new Date().toISOString().split('T')[0],
          status: 'completado' as const,
        };
      }
      return a;
    });

    saveVehicleAssignments(updatedAssignments);
    setShowVehicleReturnSuccess(true);
    setShowModalDevolverVehiculo(false);
    setShowDevolverErrors(false);
    setAssignmentSeleccionado(null);
    setKmFinal(0);
    setFotoEntrega(null);
  };

  const handleClearLocalData = () => {
    const shouldClear = window.confirm('Esto borrara los datos guardados localmente. ?Deseas continuar?');
    if (!shouldClear) {
      return;
    }
    clearAppStorage();
    window.location.reload();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {!viaticoSeleccionado ? (
        <>
          <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
              <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
              <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-3xl" />
              <div className="relative space-y-2">
                {/* Vista Principal: Lista de Viáticos y Vehículos */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Usuario</p>
                    <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Mi Portal</h1>
                    <p className="text-[11px] text-slate-600">Gestiona tus viáticos, vehículos, viajes y comprobantes.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 w-full sm:w-auto sm:justify-end">
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
                  Todos
                </button>
                <button
                  onClick={() => setFiltro('activos')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    filtro === 'activos'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Activos
                </button>
                <button
                  onClick={() => setFiltro('completados')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    filtro === 'completados'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Completados
                </button>
              </div>
              </div>
            </div>
          </div>

          {/* Lista de Viáticos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {viaticosFiltrados.length > 0 ? (
              viaticosFiltrados.map((viatico) => {
                const estadoInfo = getEstadoInfo(viatico.status);
                const accionBoton = getAccionBoton(viatico);
                const proyecto = proyectos.find(p => p.id === viatico.proyectoId);
                const proyectoLabel = formatProyectoLabel(proyecto?.nombre || viatico.proyectoNombre, viatico.proyectoId);

                return (
                  <div key={viatico.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4 hover:shadow transition-shadow">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2 leading-tight">
                            <span className="text-base">{estadoInfo.icon}</span>
                            <span className="truncate">{viatico.destino} - {proyectoLabel}</span>
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                            <span>{new Date(viatico.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viatico.fechaFin).toLocaleDateString('es-MX')}</span>
                            <span className="font-semibold text-gray-900">${viatico.montoAprobado?.toLocaleString() || viatico.montoSolicitado.toLocaleString()} MXN</span>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${estadoInfo.color}`}>
                          {estadoInfo.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {accionBoton.accion !== 'none' && (
                          <button
                            onClick={() => handleAccionClick(viatico, accionBoton.accion)}
                            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${accionBoton.color} hover:opacity-90`}
                            type="button"
                          >
                            <span>{accionBoton.icon}</span>
                            <span>{accionBoton.label}</span>
                          </button>
                        )}

                        {(viatico.status === 'dispersado' || viatico.status === 'en_viaje') && (
                          <button
                            onClick={() => {
                              setViaticoParaExtender(viatico);
                              setNuevaFechaFin(viatico.fechaFin);
                              setShowModalExtenderViaje(true);
                            }}
                            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                            type="button"
                          >
                            🔄 <span>Extender Viaje</span>
                          </button>
                        )}

                        {viatico.saldoRestante && viatico.saldoRestante > 0 && (
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                            <span>Pendiente por recuperar:</span> ${viatico.saldoRestante.toLocaleString()} MXN
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center w-full lg:col-span-2">
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
              </div>
            )}
          </div>

          {/* Sección de Vehículos Asignados */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Mis Vehículos</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {vehicleAssignments.length > 0 ? (
                vehicleAssignments.map((assignment) => {
                  const vehicle = vehicles.find(v => v.id === assignment.vehicleId);
                  const proyecto = proyectos.find(p => p.id === assignment.proyectoId);
                  const proyectoLabel = formatProyectoLabel(proyecto?.nombre || assignment.proyectoNombre, assignment.proyectoId);
                  const vehiculoStatusIcon = getVehiculoStatusIcon(assignment.status);

                  return (
                    <div key={assignment.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4 hover:shadow transition-shadow">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                            <span className="text-base">{vehiculoStatusIcon}</span>{' '}
                            {vehicle
                              ? `${vehicle.marca} ${vehicle.modelo} (${vehicle.placas})`
                              : assignment.vehiculoLabel || 'Vehículo pendiente de asignación'}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5">
                          {assignment.status === 'solicitado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                              ⏳ Pendiente de Asignación
                            </span>
                          )}
                          {assignment.status === 'asignado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              📌 Asignado - Pendiente Recepción
                            </span>
                          )}
                          {assignment.status === 'activo' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              🚗 En Uso
                            </span>
                          )}
                          {assignment.status === 'completado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                              🏁 Completado
                            </span>
                          )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span><span className="font-medium">Proyecto:</span> {proyectoLabel}</span>
                          {assignment.destino && (
                            <span><span className="font-medium">Destino:</span> {assignment.destino}</span>
                          )}
                          <span><span className="font-medium">Motivo:</span> {assignment.motivo}</span>
                          <span><span className="font-medium">Desde:</span> {new Date(assignment.fechaInicio).toLocaleDateString('es-MX')}</span>
                          {assignment.fechaFin && (
                            <span><span className="font-medium">Hasta:</span> {new Date(assignment.fechaFin).toLocaleDateString('es-MX')}</span>
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
                              ✓ Checklist recepción completado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center w-full lg:col-span-2">
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
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Mis Solicitudes de Viaje</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {solicitudesViaje.length > 0 ? (
                solicitudesViaje.map((solicitud) => {
                  const proyecto = proyectos.find(p => p.id === solicitud.proyectoId);
                  const proyectoLabel = formatProyectoLabel(proyecto?.nombre || solicitud.proyectoNombre, solicitud.proyectoId);
                  const confirmacionesAvion = solicitud.confirmaciones?.avion ?? [];
                  const confirmacionesCamion = solicitud.confirmaciones?.camion ?? [];
                  const confirmacionesHotel = solicitud.confirmaciones?.hotel ?? [];
                  const tieneConfirmaciones = confirmacionesAvion.length > 0 || confirmacionesCamion.length > 0 || confirmacionesHotel.length > 0;
                  const viajeStatusIcon = getViajeStatusIcon(solicitud.status);

                  return (
                    <div key={solicitud.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4 hover:shadow transition-shadow">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                            <span className="text-base">{viajeStatusIcon}</span> {solicitud.destino}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            solicitud.status === 'pendiente' ? 'bg-yellow-100 text-yellow-800' :
                            solicitud.status === 'en_proceso' ? 'bg-blue-100 text-blue-800' :
                            solicitud.status === 'confirmado' ? 'bg-green-100 text-green-800' :
                            solicitud.status === 'rechazado' ? 'bg-red-100 text-red-800' :
                            solicitud.status === 'cancelado' ? 'bg-red-100 text-red-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {solicitud.status === 'pendiente' ? '⏳ Pendiente' :
                             solicitud.status === 'en_proceso' ? '🧭 En Proceso' :
                             solicitud.status === 'confirmado' ? '✅ Confirmado' :
                             solicitud.status === 'rechazado' ? '⛔ Rechazado' :
                             solicitud.status === 'cancelado' ? '⛔ Cancelado' : '🏁 Completado'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span><span className="font-medium">Proyecto:</span> {proyectoLabel}</span>
                          <span><span className="font-medium">Motivo:</span> {solicitud.motivo}</span>
                          <span><span className="font-medium">Fechas:</span> {new Date(solicitud.fechaInicio).toLocaleDateString('es-MX')} - {new Date(solicitud.fechaFin).toLocaleDateString('es-MX')}</span>
                        </div>

                        {/* Servicios solicitados con sus estados */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {solicitud.necesitaAvion && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                ✈️ Avión
                              </span>
                              {solicitud.statusAvion && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  solicitud.statusAvion === 'pendiente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  solicitud.statusAvion === 'gestionando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                  {solicitud.statusAvion === 'pendiente' ? 'Pendiente' :
                                   solicitud.statusAvion === 'gestionando' ? 'Gestionando' : '✓ Confirmado'}
                                </span>
                              )}
                            </div>
                          )}
                          {solicitud.necesitaCamion && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                🚛 Camión
                              </span>
                              {solicitud.statusCamion && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  solicitud.statusCamion === 'pendiente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  solicitud.statusCamion === 'gestionando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                  {solicitud.statusCamion === 'pendiente' ? 'Pendiente' :
                                   solicitud.statusCamion === 'gestionando' ? 'Gestionando' : '✓ Confirmado'}
                                </span>
                              )}
                            </div>
                          )}
                          {solicitud.necesitaHotel && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                🏨 Hotel
                              </span>
                              {solicitud.statusHotel && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  solicitud.statusHotel === 'pendiente' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  solicitud.statusHotel === 'gestionando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-green-50 text-green-700 border border-green-200'
                                }`}>
                                  {solicitud.statusHotel === 'pendiente' ? 'Pendiente' :
                                   solicitud.statusHotel === 'gestionando' ? 'Gestionando' : '✓ Confirmado'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Confirmaciones */}
                        {tieneConfirmaciones && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-xs font-medium text-gray-700 mb-1">Confirmaciones:</p>
                            <div className="space-y-1 text-xs text-gray-600">
                              {confirmacionesAvion.map((confirmacion, index) => (
                                <p key={`avion-${solicitud.id}-${index}`}>✈️ {confirmacion.aerolinea} - Conf: {confirmacion.confirmacion}</p>
                              ))}
                              {confirmacionesCamion.map((confirmacion, index) => (
                                <p key={`camion-${solicitud.id}-${index}`}>🚛 {confirmacion.proveedor} - Conf: {confirmacion.confirmacion}</p>
                              ))}
                              {confirmacionesHotel.map((confirmacion, index) => (
                                <p key={`hotel-${solicitud.id}-${index}`}>🏨 {confirmacion.nombre} - Conf: {confirmacion.confirmacion}</p>
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
              <div className="bg-white rounded-lg shadow p-12 text-center w-full lg:col-span-2">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No tienes solicitudes de viaje</h3>
                  <p className="text-gray-600">Solicita un viaje usando el botón de arriba</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Vista de Carga de Documentos */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => {
                setViaticoSeleccionado(null);
                setGastos([]);
              }}
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
                  {new Date(viaticoActual!.fechaInicio).toLocaleDateString('es-MX')} -{' '}
                  {new Date(viaticoActual!.fechaFin).toLocaleDateString('es-MX')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monto</p>
                <p className="text-base font-semibold text-gray-900">
                  ${viaticoActual?.montoDispersado?.toLocaleString() || viaticoActual?.montoAprobado?.toLocaleString()} MXN
                </p>
              </div>
            </div>

            {viaticoActual?.montoGastado !== undefined && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Monto Comprobado:</span>
                  <span className="font-semibold text-gray-900">${viaticoActual.montoGastado.toLocaleString()} MXN</span>
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
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Subir Documentos</h2>

            <div className="space-y-6">
              {/* 1. Factura PDF */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  1️⃣ Factura PDF
                </label>
                <div className="flex items-center space-x-4">
                  <label className={`flex-1 px-4 py-3 border-2 border-dashed rounded-lg hover:border-primary-500 cursor-pointer transition-colors ${
                    gastoArchivoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}>
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm text-gray-600">Seleccionar archivo PDF</span>
                    </div>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {pdfFile && (
                    <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                      <span className="text-sm font-medium text-green-700">{pdfFile.name}</span>
                      <button onClick={() => setPdfFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Factura XML */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  2️⃣ Factura XML
                </label>
                <div className="flex items-center space-x-4">
                  <label className={`flex-1 px-4 py-3 border-2 border-dashed rounded-lg hover:border-primary-500 cursor-pointer transition-colors ${
                    gastoArchivoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                  }`}>
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm text-gray-600">Seleccionar archivo XML</span>
                    </div>
                    <input
                      type="file"
                      accept=".xml"
                      onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {xmlFile && (
                    <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                      <span className="text-sm font-medium text-green-700">{xmlFile.name}</span>
                      <button onClick={() => setXmlFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Ticket/Foto */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  3️⃣ Ticket / Comprobante (Foto)
                </label>
                <div className="flex items-center space-x-4">
                  <label className="flex-1 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 cursor-pointer transition-colors">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm text-gray-600">Tomar foto o seleccionar</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setTicketFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {ticketFile && (
                    <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                      <span className="text-sm font-medium text-green-700">{ticketFile.name}</span>
                      <button onClick={() => setTicketFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón agregar gasto */}
              <div className="flex justify-end">
                <button
                  onClick={handleAgregarGasto}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  + Agregar Gasto
                </button>
              </div>
              {gastoArchivoError && (
                <p className="text-xs text-rose-600 mt-2">{gastoArchivoError}</p>
              )}

              {/* Lista de gastos agregados */}
              {gastos.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Gastos agregados ({gastos.length})
                  </h3>
                  <div className="space-y-2">
                    {gastos.map((gasto) => (
                      <div key={gasto.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{gasto.descripcion}</p>
                            <div className="flex items-center space-x-2 mt-1">
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
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón final de subir */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => {
                    setViaticoSeleccionado(null);
                    setGastos([]);
                    setShowGastoDocumentoErrors(false);
                    setShowSubirDocumentosErrors(false);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubirDocumentos}
                  disabled={gastos.length === 0}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  Subir Documentos ({gastos.length})
                </button>
              </div>
              {subirDocumentosError && (
                <p className="text-xs text-rose-600 mt-2">{subirDocumentosError}</p>
              )}
            </div>
          </div>

          {/* Ayuda */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-blue-800 mb-1">Ayuda</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• El PDF y XML deben ser de la misma factura</li>
                  <li>• Si solo tienes un ticket (sin factura), solo sube la foto en la sección 3</li>
                  <li>• Puedes agregar múltiples gastos para un mismo viático</li>
                  <li>• Asegúrate de que las fotos sean legibles</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal para crear nuevo viático */}
      {showModalNuevoViatico && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Solicitar Nuevo Viático</h2>
                <button
                  onClick={() => {
                    setShowModalNuevoViatico(false);
                    setShowNuevoViaticoErrors(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 space-y-4">
              {/* Proyecto - OBLIGATORIO */}
              <ProyectoSelector
                value={formNuevoViatico.proyectoId}
                onChange={(proyectoId) => setFormNuevoViatico({ ...formNuevoViatico, proyectoId })}
                required={proyectoRequeridoViatico}
                label="Proyecto"
                inputClassName={nuevoViaticoErrors.proyectoId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
              />
              {nuevoViaticoErrors.proyectoId && (
                <p className="text-xs text-rose-600">{nuevoViaticoErrors.proyectoId}</p>
              )}

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
                inputClassName={nuevoViaticoErrors.gsActivityId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
              />
              {nuevoViaticoErrors.gsActivityId && (
                <p className="text-xs text-rose-600">{nuevoViaticoErrors.gsActivityId}</p>
              )}

              {/* Motivo */}
              <div>
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

              {/* Fechas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Inicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formNuevoViatico.fechaInicio}
                    onChange={(e) => setFormNuevoViatico({ ...formNuevoViatico, fechaInicio: e.target.value })}
                    onFocus={openDatePicker}
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
                    onFocus={openDatePicker}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alimentos (MXN) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-600">Total estimado</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ${totalAlimentos.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => {
                  setShowModalNuevoViatico(false);
                  setShowNuevoViaticoErrors(false);
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearNuevoViatico}
                className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm ${
                  isFormValid
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
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
      {showModalSolicitarVehiculo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Solicitar Vehículo (Coche)</h2>
                <button
                  onClick={() => {
                    setShowModalSolicitarVehiculo(false);
                    setShowSolicitarVehiculoErrors(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 space-y-4">
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
                  onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, destino: e.target.value })}
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
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Inicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formSolicitudVehiculo.fechaInicio}
                    onChange={(e) => setFormSolicitudVehiculo({ ...formSolicitudVehiculo, fechaInicio: e.target.value })}
                    onFocus={openDatePicker}
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
                    onFocus={openDatePicker}
                    onClick={openDatePicker}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              </div>

              {/* Motivo */}
              <div>
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
                  rows={3}
                  placeholder="Describe el motivo de la solicitud..."
                />
                {solicitarVehiculoErrors.motivo && (
                  <p className="mt-1 text-xs text-rose-600">{solicitarVehiculoErrors.motivo}</p>
                )}
              </div>

              {/* Requiere Gasolina */}
              <div className="flex items-center">
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

            <div className="sticky bottom-0 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => {
                  setShowModalSolicitarVehiculo(false);
                  setShowSolicitarVehiculoErrors(false);
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSolicitarVehiculo}
                className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Solicitar Vehículo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para solicitar viaje (avión, camión, hotel) */}
      {showModalSolicitarViaje && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Solicitar Viaje</h2>
                <button
                  onClick={() => {
                    setShowModalSolicitarViaje(false);
                    setShowSolicitarViajeErrors(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 space-y-6">
              {/* Información General */}
              <div className="space-y-4">
                <h3 className="text-md font-semibold text-gray-900">Información General</h3>

                {/* Proyecto */}
                <ProyectoSelector
                  value={formSolicitudViaje.proyectoId}
                  onChange={(proyectoId) => setFormSolicitudViaje({ ...formSolicitudViaje, proyectoId })}
                  required={true}
                  showCreateOption={true}
                  label="Proyecto"
                  inputClassName={solicitarViajeErrors.proyectoId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
                />
                {solicitarViajeErrors.proyectoId && (
                  <p className="text-xs text-rose-600">{solicitarViajeErrors.proyectoId}</p>
                )}

                {/* Origen */}
                <div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de Inicio <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formSolicitudViaje.fechaInicio}
                      onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, fechaInicio: e.target.value })}
                      onFocus={openDatePicker}
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
                      onFocus={openDatePicker}
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
                    rows={3}
                    placeholder="Describe el motivo del viaje..."
                  />
                  {solicitarViajeErrors.motivo && (
                    <p className="mt-1 text-xs text-rose-600">{solicitarViajeErrors.motivo}</p>
                  )}
                </div>
              </div>

              {/* Servicios Requeridos */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-md font-semibold text-gray-900">Servicios Requeridos</h3>
                <p className="text-sm text-gray-600">Selecciona los servicios que necesitas (al menos uno)</p>
                {solicitarViajeErrors.servicios && (
                  <p className="text-xs text-rose-600">{solicitarViajeErrors.servicios}</p>
                )}

                {/* Avión */}
                <div className="border border-gray-200 rounded-lg p-4">
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
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detalles del Vuelo
                      </label>
                      <textarea
                        value={formSolicitudViaje.detallesAvion}
                        onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, detallesAvion: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows={2}
                        placeholder="Ej: Vuelo redondo desde Guadalajara, preferencia de horarios, escalas..."
                      />
                    </div>
                  )}
                </div>

                {/* Camión */}
                <div className="border border-gray-200 rounded-lg p-4">
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
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detalles del Transporte
                      </label>
                      <textarea
                        value={formSolicitudViaje.detallesCamion}
                        onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, detallesCamion: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows={2}
                        placeholder="Ej: Camión de carga, tipo de vehículo, capacidad necesaria..."
                      />
                    </div>
                  )}
                </div>

                {/* Hotel */}
                <div className="border border-gray-200 rounded-lg p-4">
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
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detalles del Hospedaje
                      </label>
                      <textarea
                        value={formSolicitudViaje.detallesHotel}
                        onChange={(e) => setFormSolicitudViaje({ ...formSolicitudViaje, detallesHotel: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        rows={2}
                        placeholder="Ej: Hotel cerca del aeropuerto, habitación sencilla, 3 noches..."
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => {
                  setShowModalSolicitarViaje(false);
                  setShowSolicitarViajeErrors(false);
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSolicitarViaje}
                className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
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
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
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
      {showModalExtenderViaje && viaticoParaExtender && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">🔄 Extender Viaje</h2>
                <button
                  onClick={() => {
                    setShowModalExtenderViaje(false);
                    setViaticoParaExtender(null);
                    setNuevaFechaFin('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Información del viático */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Viático</p>
                <p className="font-semibold text-gray-900">{viaticoParaExtender.destino}</p>
                <p className="text-sm text-gray-600 mt-2">Fecha fin actual</p>
                <p className="font-semibold text-gray-900">{new Date(viaticoParaExtender.fechaFin).toLocaleDateString('es-MX')}</p>
              </div>

              {/* Nueva fecha fin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nueva Fecha de Fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={nuevaFechaFin}
                  onChange={(e) => setNuevaFechaFin(e.target.value)}
                  onFocus={openDatePicker}
                  onClick={openDatePicker}
                  min={viaticoParaExtender.fechaFin}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Nota informativa */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Nota:</strong> La extensión del viaje será enviada para aprobación del Project Manager.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => {
                  setShowModalExtenderViaje(false);
                  setViaticoParaExtender(null);
                  setNuevaFechaFin('');
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  console.log('Extender viaje:', {
                    viaticoId: viaticoParaExtender.id,
                    fechaFinActual: viaticoParaExtender.fechaFin,
                    nuevaFechaFin: nuevaFechaFin,
                  });
                  alert('Solicitud de extensión enviada para aprobación');
                  setShowModalExtenderViaje(false);
                  setViaticoParaExtender(null);
                  setNuevaFechaFin('');
                }}
                disabled={!nuevaFechaFin || nuevaFechaFin <= viaticoParaExtender.fechaFin}
                className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Solicitar Extensión
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
  foto: File | null;
  setFoto: (foto: File | null) => void;
  errors?: {
    km?: string;
    foto?: string;
    combustible?: string;
  };
  onSubmit: () => void;
  onCancel: () => void;
  requireAllFields?: boolean;
}

function VehicleChecklistModal({ title, checklist, setChecklist, km, setKm, foto: _foto, setFoto, errors, onSubmit, onCancel, requireAllFields = false }: VehicleChecklistModalProps) {
  useEscapeKey(onCancel);
  const kmError = errors?.km;
  const fotoError = errors?.foto;
  const combustibleError = errors?.combustible;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-4 sm:px-6 py-4 border-b border-gray-200 bg-white z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-6">
          {/* Kilometraje */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kilometraje <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={km}
              onChange={(e) => setKm(Number(e.target.value))}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                kmError
                  ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                  : 'border-gray-300 focus:ring-primary-500'
              }`}
              placeholder="0"
              min="0"
              required={requireAllFields}
            />
            {kmError && (
              <p className="mt-1 text-xs text-rose-600">{kmError}</p>
            )}
          </div>

          {/* Checklist - Exterior */}
          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">
              Exterior {requireAllFields && <span className="text-red-500">*</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklist.exterior).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                    {key.replace('_', ' ')}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => setChecklist({
                      ...checklist,
                      exterior: { ...checklist.exterior, [key]: e.target.value as 'bueno' | 'regular' | 'malo' }
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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

          {/* Checklist - Interior */}
          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">
              Interior {requireAllFields && <span className="text-red-500">*</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklist.interior).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                    {key.replace('_', ' ')}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => setChecklist({
                      ...checklist,
                      interior: { ...checklist.interior, [key]: e.target.value as 'bueno' | 'regular' | 'malo' }
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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

          {/* Checklist - Mecánico */}
          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">
              Mecánico {requireAllFields && <span className="text-red-500">*</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklist.mecanico).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                    {key.replace('_', ' ')}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => setChecklist({
                      ...checklist,
                      mecanico: { ...checklist.mecanico, [key]: e.target.value as 'bueno' | 'regular' | 'malo' }
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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

          {/* Checklist - Accesorios */}
          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">
              Accesorios {requireAllFields && <span className="text-red-500">*</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklist.accesorios).map(([key, value]) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setChecklist({
                      ...checklist,
                      accesorios: { ...checklist.accesorios, [key]: e.target.checked }
                    })}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 capitalize">{key.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Nivel de Combustible */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nivel de Combustible {requireAllFields && <span className="text-red-500">*</span>}
            </label>
            <select
              value={checklist.nivelCombustible}
              onChange={(e) => setChecklist({ ...checklist, nivelCombustible: e.target.value as '1/4' | '1/2' | '3/4' | 'lleno' })}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                combustibleError
                  ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                  : 'border-gray-300 focus:ring-primary-500'
              }`}
              required={requireAllFields}
            >
              <option value="1/4">1/4</option>
              <option value="1/2">1/2</option>
              <option value="3/4">3/4</option>
              <option value="lleno">Lleno</option>
            </select>
            {combustibleError && (
              <p className="mt-1 text-xs text-rose-600">{combustibleError}</p>
            )}
          </div>

          {/* Fotos (hasta 3) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fotos (hasta 3) {requireAllFields && <span className="text-red-500">*</span>}
            </label>
            <p className="text-xs text-gray-500 mb-3">Estas fotos se usan aleatoriamente en la portada de la cita.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((index) => (
                <label
                  key={index}
                  className={`aspect-square border-2 border-dashed rounded-lg hover:border-primary-500 cursor-pointer transition-colors flex flex-col items-center justify-center ${
                    fotoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-gray-500 text-center px-2">Agregar foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setFoto(selected);
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

          {/* Observaciones */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              value={checklist.observaciones}
              onChange={(e) => setChecklist({ ...checklist, observaciones: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              rows={3}
              placeholder="Notas adicionales sobre el estado del vehículo..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
