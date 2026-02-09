import { useEffect, useMemo, useState } from 'react';
import useAuth from '../../hooks/useAuth';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Viatico, Proyecto, SolicitudViaje } from '../../types';
import { formatProyectoLabel } from '../../utils/proyectoLabel';
import {
  createProyecto,
  deleteProyecto,
  fetchProyectos,
  fetchViajes,
  fetchViaticos,
  syncCoreAppData,
  updateProyecto,
  updateViaje,
  updateViatico,
} from '../../utils/backendSync';
export default function PMPortal() {
  const { user } = useAuth();
  const [viaticosUsuario, setViaticosUsuario] = useLocalStorageState<Viatico[]>('usuario:viaticos', []);
  const [viaticosResueltos, setViaticosResueltos] = useLocalStorageState<string[]>('pm-portal:viaticosResueltos', []);
  const [viajesPendientes, setViajesPendientes] = useLocalStorageState<SolicitudViaje[]>('pm-portal:viajesPendientes', []);
  const [proyectos, setProyectos] = useLocalStorageState<Proyecto[]>('pm-portal:proyectos', []);
  const [showModalViaticoDetalle, setShowModalViaticoDetalle] = useLocalStorageState('pm-portal:showModalViaticoDetalle', false);
  const [showModalViajeDetalle, setShowModalViajeDetalle] = useLocalStorageState('pm-portal:showModalViajeDetalle', false);
  const [showModalCrearProyecto, setShowModalCrearProyecto] = useLocalStorageState('pm-portal:showModalCrearProyecto', false);
  const [showModalProyectoDetalle, setShowModalProyectoDetalle] = useLocalStorageState('pm-portal:showModalProyectoDetalle', false);
  const [viaticoSeleccionado, setViaticoSeleccionado] = useLocalStorageState<Viatico | null>('pm-portal:viaticoSeleccionado', null);
  const [viajeSeleccionado, setViajeSeleccionado] = useLocalStorageState<SolicitudViaje | null>('pm-portal:viajeSeleccionado', null);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useLocalStorageState<Proyecto | null>('pm-portal:proyectoSeleccionado', null);
  const [isEditingProyecto, setIsEditingProyecto] = useState(false);
  const [proyectoForm, setProyectoForm] = useState<Proyecto | null>(null);
  const [nuevoProyecto, setNuevoProyecto] = useState({
    codigo: '',
    nombre: '',
    cliente: '',
    responsable: '',
    descripcion: '',
    departamento: '',
    presupuesto: '',
    fechaInicio: '',
    fechaFinEstimada: '',
    notas: '',
  });
  const [showProyectoErrors, setShowProyectoErrors] = useState(false);

  const viaticosPendientes = useMemo(() => {
    return viaticosUsuario
      .filter((viatico) => viatico.status === 'pendiente')
      .filter((viatico) => !viaticosResueltos.includes(viatico.id));
  }, [viaticosUsuario, viaticosResueltos]);

  useEscapeKey(() => setShowModalViaticoDetalle(false), showModalViaticoDetalle);
  useEscapeKey(() => setShowModalViajeDetalle(false), showModalViajeDetalle);
  useEscapeKey(() => setShowModalCrearProyecto(false), showModalCrearProyecto);
  useEscapeKey(() => setShowModalProyectoDetalle(false), showModalProyectoDetalle);

  useEffect(() => {
    let isActive = true;

    const loadPortalData = async () => {
      try {
        const [remoteProyectos, remoteViaticos, remoteViajes] = await Promise.all([
          fetchProyectos(),
          fetchViaticos(),
          fetchViajes(),
        ]);
        if (!isActive) {
          return;
        }
        setProyectos(remoteProyectos);
        setViaticosUsuario(remoteViaticos);
        setViajesPendientes(remoteViajes.filter((viaje) => viaje.status === 'pendiente'));
      } catch {
        if (!isActive) {
          return;
        }
        setProyectos((prev) => prev);
        setViaticosUsuario((prev) => prev);
        setViajesPendientes((prev) => prev);
      }
    };

    void loadPortalData();
    return () => {
      isActive = false;
    };
  }, [setProyectos, setViaticosUsuario, setViajesPendientes]);

  const resetNuevoProyecto = () => {
    setNuevoProyecto({
      codigo: '',
      nombre: '',
      cliente: '',
      responsable: '',
      descripcion: '',
      departamento: '',
      presupuesto: '',
      fechaInicio: '',
      fechaFinEstimada: '',
      notas: '',
    });
  };
  const presupuestoValue = Number(nuevoProyecto.presupuesto);
  const presupuestoInvalid = !nuevoProyecto.presupuesto || Number.isNaN(presupuestoValue) || presupuestoValue <= 0;
  const proyectoErrors = showProyectoErrors
    ? {
      codigo: !nuevoProyecto.codigo.trim() ? 'Ingresa el job.' : '',
      cliente: !nuevoProyecto.cliente.trim() ? 'Ingresa el cliente.' : '',
      responsable: !nuevoProyecto.responsable.trim() ? 'Ingresa el responsable.' : '',
      nombre: !nuevoProyecto.nombre.trim() ? 'Ingresa el nombre del proyecto.' : '',
      descripcion: !nuevoProyecto.descripcion.trim() ? 'Ingresa la descripcion.' : '',
      departamento: !nuevoProyecto.departamento.trim() ? 'Selecciona el departamento.' : '',
      presupuesto: presupuestoInvalid ? 'Ingresa un presupuesto valido.' : '',
      fechaInicio: !nuevoProyecto.fechaInicio.trim() ? 'Selecciona la fecha de inicio.' : '',
      fechaFinEstimada: !nuevoProyecto.fechaFinEstimada.trim() ? 'Selecciona la fecha de fin.' : '',
    }
    : {};

  const openDatePicker = (event: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    if (typeof target.showPicker === 'function') {
      target.showPicker();
    }
  };

  const handleCrearProyecto = async () => {
    const requiredFields = [
      nuevoProyecto.codigo,
      nuevoProyecto.nombre,
      nuevoProyecto.cliente,
      nuevoProyecto.responsable,
      nuevoProyecto.descripcion,
      nuevoProyecto.departamento,
      nuevoProyecto.presupuesto,
      nuevoProyecto.fechaInicio,
      nuevoProyecto.fechaFinEstimada,
    ];

    if (requiredFields.some((field) => !field.trim()) || presupuestoInvalid) {
      setShowProyectoErrors(true);
      return;
    }

    try {
      const nuevo = await createProyecto({
        codigo: nuevoProyecto.codigo.trim(),
        nombre: nuevoProyecto.nombre.trim(),
        cliente: nuevoProyecto.cliente.trim(),
        estado: 'activo',
        presupuesto: presupuestoValue,
        gastado: 0,
        fechaInicio: nuevoProyecto.fechaInicio,
        fechaFinEstimada: nuevoProyecto.fechaFinEstimada,
        responsable: nuevoProyecto.responsable.trim(),
        departamento: nuevoProyecto.departamento,
        descripcion: nuevoProyecto.descripcion.trim(),
        notas: nuevoProyecto.notas.trim() || undefined,
      });

      setProyectos((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]));
        map.set(nuevo.id, nuevo);
        return Array.from(map.values());
      });
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalCrearProyecto(false);
      resetNuevoProyecto();
      setShowProyectoErrors(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el proyecto.');
    }
  };

  const handleAprobarViatico = async (viaticoId: string) => {
    const selected = viaticoSeleccionado;
    if (!selected) {
      setShowModalViaticoDetalle(false);
      return;
    }

    try {
      const updatedRecord = await updateViatico(viaticoId, {
        status: 'aprobado',
        montoAprobado: selected.montoAprobado ?? selected.montoSolicitado,
        aprobadoPor: user?.full_name || 'Project Manager',
      });

      setViaticosUsuario((prev) => {
        const map = new Map(prev.map((viatico) => [viatico.id, viatico]));
        map.set(updatedRecord.id, { ...map.get(updatedRecord.id), ...updatedRecord });
        return Array.from(map.values());
      });
      setViaticosResueltos((prev) => (prev.includes(viaticoId) ? prev : [...prev, viaticoId]));
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalViaticoDetalle(false);
      setViaticoSeleccionado(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo aprobar el viatico.');
    }
  };

  const handleRechazarViatico = async (viaticoId: string) => {
    const selected = viaticoSeleccionado ?? viaticosUsuario.find((viatico) => viatico.id === viaticoId);
    if (!selected) {
      setShowModalViaticoDetalle(false);
      setViaticoSeleccionado(null);
      return;
    }

    try {
      const updatedRecord = await updateViatico(viaticoId, {
        status: 'rechazado',
        aprobadoPor: user?.full_name || 'Project Manager',
      });

      setViaticosUsuario((prev) => {
        const map = new Map(prev.map((viatico) => [viatico.id, viatico]));
        map.set(updatedRecord.id, { ...map.get(updatedRecord.id), ...updatedRecord });
        return Array.from(map.values());
      });
      setViaticosResueltos((prev) => (prev.includes(viaticoId) ? prev : [...prev, viaticoId]));
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalViaticoDetalle(false);
      setViaticoSeleccionado(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo rechazar el viatico.');
    }
  };

  const handleAprobarViaje = async (viajeId: string) => {
    const selected = viajeSeleccionado ?? viajesPendientes.find((viaje) => viaje.id === viajeId);
    if (!selected) {
      setShowModalViajeDetalle(false);
      setViajeSeleccionado(null);
      return;
    }

    try {
      const updatedViaje = await updateViaje(viajeId, {
        status: 'en_proceso',
        statusAvion: selected.necesitaAvion ? (selected.statusAvion === 'confirmado' ? 'confirmado' : 'gestionando') : undefined,
        statusCamion: selected.necesitaCamion ? (selected.statusCamion === 'confirmado' ? 'confirmado' : 'gestionando') : undefined,
        statusHotel: selected.necesitaHotel ? (selected.statusHotel === 'confirmado' ? 'confirmado' : 'gestionando') : undefined,
      });

      setViajesPendientes((prev) => {
        const next = prev.filter((viaje) => viaje.id !== viajeId);
        if (updatedViaje.status === 'pendiente') {
          next.push(updatedViaje);
        }
        return next;
      });
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalViajeDetalle(false);
      setViajeSeleccionado(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo aprobar el viaje.');
    }
  };

  const handleRechazarViaje = async (viajeId: string) => {
    const selected = viajeSeleccionado ?? viajesPendientes.find((viaje) => viaje.id === viajeId);
    if (!selected) {
      setShowModalViajeDetalle(false);
      setViajeSeleccionado(null);
      return;
    }

    try {
      await updateViaje(viajeId, { status: 'rechazado' });
      setViajesPendientes((prev) => prev.filter((viaje) => viaje.id !== viajeId));
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalViajeDetalle(false);
      setViajeSeleccionado(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo rechazar el viaje.');
    }
  };

  const handleEliminarProyecto = async (proyectoId: string) => {
    if (!window.confirm('Eliminar proyecto seleccionado?')) {
      return;
    }

    try {
      await deleteProyecto(proyectoId);
      setProyectos((prev) => prev.filter((item) => item.id !== proyectoId));
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalProyectoDetalle(false);
      setIsEditingProyecto(false);
      setProyectoForm(null);
      setProyectoSeleccionado(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo eliminar el proyecto.');
    }
  };

  const handleGuardarProyectoCambios = async () => {
    if (!proyectoForm) {
      return;
    }

    try {
      const updatedProyecto = await updateProyecto(proyectoForm.id, {
        ...proyectoForm,
        updatedAt: new Date().toISOString(),
      });
      setProyectos((prev) => prev.map((item) => (item.id === updatedProyecto.id ? updatedProyecto : item)));
      setProyectoSeleccionado(updatedProyecto);
      setIsEditingProyecto(false);
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar el proyecto.');
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-green-100 text-green-800';
      case 'en_pausa': return 'bg-yellow-100 text-yellow-800';
      case 'completado': return 'bg-blue-100 text-blue-800';
      case 'cancelado': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getViaticoStatusIcon = (status: string) => {
    const icons = {
      pendiente: '⏳',
      aprobado: '✅',
      rechazado: '⛔',
      dispersado: '💸',
      completado: '🏁',
    };

    return icons[status as keyof typeof icons] || '⏳';
  };

  const getViajeStatusIcon = (status: string) => {
    const icons = {
      pendiente: '⏳',
      en_proceso: '🧭',
      confirmado: '✅',
      rechazado: '⛔',
      cancelado: '⛔',
      completado: '🏁',
    };

    return icons[status as keyof typeof icons] || '⏳';
  };

  const getProyectoEstadoIcon = (estado: string) => {
    const icons = {
      activo: '✅',
      en_pausa: '⏸️',
      completado: '🏁',
      cancelado: '⛔',
    };

    return icons[estado as keyof typeof icons] || '📁';
  };

  const calcularPorcentajeGastado = (gastado: number, presupuesto: number) => {
    return ((gastado / presupuesto) * 100).toFixed(1);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel PM</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Portal de Project Manager</h1>
                <p className="text-[11px] text-slate-600">Gestiona proyectos, aprueba vi\u00e1ticos y viajes de tu equipo.</p>
              </div>
              <button
                onClick={() => {
                  setShowProyectoErrors(false);
                  setShowModalCrearProyecto(true);
                }}
                className="px-3 py-1.5 text-[11px] bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                + Crear Proyecto
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="bg-white rounded-lg shadow p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Proyectos Activos</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {proyectos.filter(p => p.estado === 'activo').length}
                    </p>
                  </div>
                  <div className="bg-green-100 p-2 rounded-lg">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Vi\u00e1ticos Pendientes</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{viaticosPendientes.length}</p>
                  </div>
                  <div className="bg-yellow-100 p-2 rounded-lg">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Viajes Pendientes</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{viajesPendientes.length}</p>
                  </div>
                  <div className="bg-indigo-100 p-2 rounded-lg">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9.5L9 3m0 0l7 7M9 3v11.5M9 21l4.5-4.5M15 9l6 3-6 3m0-6v6m0-6l-6 3" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Proyectos en Riesgo</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{proyectos.filter(p => p.estado === 'en_pausa').length}</p>
                  </div>
                  <div className="bg-red-100 p-2 rounded-lg">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.73 7.73l6.27-6.27 6.27 6.27M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Viáticos Pendientes de Aprobación */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Viáticos Pendientes de Aprobación</h2>
        {viaticosPendientes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 justify-items-start">
            {viaticosPendientes.map((viatico) => {
              const viaticoStatusIcon = getViaticoStatusIcon(viatico.status);

              return (
                <div key={viatico.id} className="bg-white rounded-lg shadow-sm p-3 sm:p-4 hover:shadow transition-shadow w-full max-w-[340px]">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate flex items-center gap-2">
                        <span className="text-sm">{viaticoStatusIcon}</span>
                        <span className="truncate">{viatico.userName}</span>
                      </h3>
                      <p className="text-xs text-gray-500">{viatico.id}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                      Pendiente
                    </span>
                  </div>

                <div className="space-y-1.5 mb-2 text-xs text-gray-600">
                  <div>
                    <p className="text-[11px] text-gray-500">Proyecto</p>
                    <p className="text-xs text-gray-900 truncate">
                      {formatProyectoLabel(viatico.proyectoNombre, viatico.proyectoId)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">
                      {viatico.destino}
                      {viatico.destinoPais ? `, ${viatico.destinoPais}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {new Date(viatico.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viatico.fechaFin).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 line-clamp-2">{viatico.motivo}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <div className="text-xs">
                    <span className="text-gray-600">Monto: </span>
                    <span className="font-semibold text-gray-900">${viatico.montoSolicitado.toLocaleString()}</span>
                    <span className="text-[11px] text-gray-500 ml-1">{viatico.tipoViatico}</span>
                  </div>
                  <button
                    onClick={() => {
                      setViaticoSeleccionado(viatico);
                      setShowModalViaticoDetalle(true);
                    }}
                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs"
                  >
                    Revisar
                  </button>
                </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay viáticos pendientes</h3>
            <p className="text-gray-600">Todos los viáticos han sido revisados</p>
          </div>
        )}
      </div>

      {/* Viajes Pendientes */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Solicitudes de Viaje Pendientes</h2>
        {viajesPendientes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 justify-items-start">
            {viajesPendientes.map((viaje) => {
              const viajeStatusIcon = getViajeStatusIcon(viaje.status);

              return (
                <div key={viaje.id} className="bg-white rounded-lg shadow-sm p-3 sm:p-4 hover:shadow transition-shadow w-full max-w-[340px]">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate flex items-center gap-2">
                        <span className="text-sm">{viajeStatusIcon}</span>
                        <span className="truncate">{viaje.userName}</span>
                      </h3>
                      <p className="text-xs text-gray-600 truncate">
                        {formatProyectoLabel(viaje.proyectoNombre, viaje.proyectoId)}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                      Pendiente
                    </span>
                  </div>

                <div className="space-y-1.5 mb-2 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{viaje.destino}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{new Date(viaje.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viaje.fechaFin).toLocaleDateString('es-MX')}</span>
                  </div>
                  <p className="text-xs text-gray-700 line-clamp-2">{viaje.motivo}</p>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {viaje.necesitaAvion && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium">
                      ✈️ Avión
                    </span>
                  )}
                  {viaje.necesitaCamion && (
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[11px] font-medium">
                      🚌 Camión
                    </span>
                  )}
                  {viaje.necesitaHotel && (
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">
                      🏨 Hotel
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <div className="text-xs">
                    <span className="text-gray-600">Costo estimado: </span>
                    <span className="font-semibold text-gray-900">${viaje.costoEstimado?.toLocaleString()}</span>
                  </div>
                  <button
                    onClick={() => {
                      setViajeSeleccionado(viaje);
                      setShowModalViajeDetalle(true);
                    }}
                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs"
                  >
                    Revisar
                  </button>
                </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay viajes pendientes</h3>
            <p className="text-gray-600">Todas las solicitudes de viaje han sido procesadas</p>
          </div>
        )}
      </div>

      {/* Mis Proyectos */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">Mis Proyectos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 justify-items-start">
          {proyectos.map((proyecto) => {
            const porcentajeGastado = parseFloat(calcularPorcentajeGastado(proyecto.gastado, proyecto.presupuesto));
            const proyectoEstadoIcon = getProyectoEstadoIcon(proyecto.estado);

            return (
              <div key={proyecto.id} className="bg-white rounded-lg shadow-sm p-3 hover:shadow transition-shadow w-full max-w-[340px]">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span className="text-sm">{proyectoEstadoIcon}</span>
                        <span>{proyecto.nombre}</span>
                      </h3>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${getEstadoColor(proyecto.estado)}`}>
                        {proyecto.estado === 'activo' ? 'Activo' :
                         proyecto.estado === 'en_pausa' ? 'En Pausa' :
                         proyecto.estado === 'completado' ? 'Completado' : 'Cancelado'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600">{proyecto.codigo}</p>
                    <p className="text-[11px] text-gray-600">{proyecto.cliente}</p>
                  </div>
                </div>

                <p className="text-[11px] text-gray-700 mb-2 line-clamp-1">{proyecto.descripcion}</p>

                <div className="space-y-1">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-600">Presupuesto ejecutado</span>
                      <span className="font-semibold text-gray-900">{porcentajeGastado}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div
                        className={`h-1 rounded-full transition-all ${
                          porcentajeGastado > 90 ? 'bg-red-600' :
                          porcentajeGastado > 75 ? 'bg-yellow-600' :
                          'bg-green-600'
                        }`}
                        style={{ width: `${Math.min(porcentajeGastado, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                    <div>
                      <p className="text-[11px] text-gray-500">Presupuesto</p>
                      <p className="text-[11px] font-semibold text-gray-900">${(proyecto.presupuesto / 1000000).toFixed(1)}M</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500">Gastado</p>
                      <p className="text-[11px] font-semibold text-gray-900">${(proyecto.gastado / 1000000).toFixed(1)}M</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                    <div>
                      <p className="text-[11px] text-gray-500">Inicio</p>
                      <p className="text-[11px] text-gray-900">{new Date(proyecto.fechaInicio).toLocaleDateString('es-MX')}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500">Fin estimado</p>
                      <p className="text-[11px] text-gray-900">{new Date(proyecto.fechaFinEstimada).toLocaleDateString('es-MX')}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setProyectoSeleccionado(proyecto);
                      setProyectoForm(proyecto);
                      setIsEditingProyecto(false);
                      setShowModalProyectoDetalle(true);
                    }}
                    className="w-full px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-[11px] font-medium"
                  >
                    Ver Detalles del Proyecto
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Detalle de Viático */}
      {showModalViaticoDetalle && viaticoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Revisar Solicitud de Viático</h2>
                <button
                  onClick={() => setShowModalViaticoDetalle(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">ID</p>
                  <p className="font-semibold">{viaticoSeleccionado.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Solicitante</p>
                  <p className="font-semibold">{viaticoSeleccionado.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Proyecto</p>
                  <p className="font-semibold">
                    {formatProyectoLabel(viaticoSeleccionado.proyectoNombre, viaticoSeleccionado.proyectoId)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Tipo de Viático</p>
                  <p className="font-semibold capitalize">{viaticoSeleccionado.tipoViatico}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Destino</p>
                  <p className="font-semibold">{viaticoSeleccionado.destino}, {viaticoSeleccionado.destinoPais}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Fechas</p>
                  <p className="font-semibold">
                    {new Date(viaticoSeleccionado.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viaticoSeleccionado.fechaFin).toLocaleDateString('es-MX')}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Motivo</p>
                  <p className="font-semibold">{viaticoSeleccionado.motivo}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Monto Solicitado</p>
                  <p className="text-2xl font-bold text-primary-600">${viaticoSeleccionado.montoSolicitado.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Fecha de Solicitud</p>
                  <p className="font-semibold">{new Date(viaticoSeleccionado.createdAt).toLocaleString('es-MX')}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto a Aprobar (opcional - dejar vacío para aprobar el monto solicitado)
                </label>
                <input
                  type="number"
                  placeholder={`${viaticoSeleccionado.montoSolicitado}`}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    proyectoErrors.nombre
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comentarios (opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Agrega comentarios sobre la aprobación o rechazo..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  void handleRechazarViatico(viaticoSeleccionado.id);
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Rechazar
              </button>
              <button
                onClick={() => {
                  void handleAprobarViatico(viaticoSeleccionado.id);
                }}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle de Viaje */}
      {showModalViajeDetalle && viajeSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Revisar Solicitud de Viaje</h2>
                <button
                  onClick={() => setShowModalViajeDetalle(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">ID</p>
                  <p className="font-semibold">{viajeSeleccionado.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Solicitante</p>
                  <p className="font-semibold">{viajeSeleccionado.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Proyecto</p>
                  <p className="font-semibold">
                    {formatProyectoLabel(viajeSeleccionado.proyectoNombre, viajeSeleccionado.proyectoId)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Destino</p>
                  <p className="font-semibold">{viajeSeleccionado.destino}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Fechas</p>
                  <p className="font-semibold">
                    {new Date(viajeSeleccionado.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viajeSeleccionado.fechaFin).toLocaleDateString('es-MX')}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Motivo</p>
                  <p className="font-semibold">{viajeSeleccionado.motivo}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Servicios Solicitados</h3>
                <div className="space-y-3">
                  {viajeSeleccionado.necesitaAvion && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">✈️</span>
                        <h4 className="font-semibold text-blue-900">Avión</h4>
                      </div>
                      <p className="text-sm text-blue-800">{viajeSeleccionado.detallesAvion}</p>
                    </div>
                  )}
                  {viajeSeleccionado.necesitaCamion && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">🚌</span>
                        <h4 className="font-semibold text-green-900">Camión</h4>
                      </div>
                      <p className="text-sm text-green-800">{viajeSeleccionado.detallesCamion}</p>
                    </div>
                  )}
                  {viajeSeleccionado.necesitaHotel && (
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">🏨</span>
                        <h4 className="font-semibold text-purple-900">Hotel</h4>
                      </div>
                      <p className="text-sm text-purple-800">{viajeSeleccionado.detallesHotel}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">Costo Estimado</p>
                  <p className="text-2xl font-bold text-primary-600">${viajeSeleccionado.costoEstimado?.toLocaleString()}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comentarios (opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Agrega comentarios sobre la aprobación o rechazo..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  void handleRechazarViaje(viajeSeleccionado.id);
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Rechazar
              </button>
              <button
                onClick={() => {
                  void handleAprobarViaje(viajeSeleccionado.id);
                }}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Aprobar y Enviar a Gerente de Servicios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear Proyecto */}
      {showModalCrearProyecto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Crear Nuevo Proyecto</h2>
                <button
                  onClick={() => {
                    setShowModalCrearProyecto(false);
                    resetNuevoProyecto();
                    setShowProyectoErrors(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job *
                  </label>
                  <input
                    type="text"
                    placeholder="JOB-2025-004"
                    value={nuevoProyecto.codigo}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, codigo: e.target.value }))}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.codigo
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {proyectoErrors.codigo && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.codigo}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente *
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre del cliente"
                    value={nuevoProyecto.cliente}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, cliente: e.target.value }))}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.cliente
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {proyectoErrors.cliente && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.cliente}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Responsable *
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre del responsable"
                    value={nuevoProyecto.responsable}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, responsable: e.target.value }))}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.responsable
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {proyectoErrors.responsable && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.responsable}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Proyecto *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Modernización de Infraestructura"
                  value={nuevoProyecto.nombre}
                  onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, nombre: e.target.value }))}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    proyectoErrors.nombre
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500'
                  }`}
                />
                {proyectoErrors.nombre && (
                  <p className="mt-1 text-xs text-rose-600">{proyectoErrors.nombre}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción *
                </label>
                <textarea
                  rows={3}
                  placeholder="Descripción detallada del proyecto..."
                  value={nuevoProyecto.descripcion}
                  onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, descripcion: e.target.value }))}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    proyectoErrors.descripcion
                      ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                      : 'border-gray-300 focus:ring-primary-500'
                  }`}
                />
                {proyectoErrors.descripcion && (
                  <p className="mt-1 text-xs text-rose-600">{proyectoErrors.descripcion}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Departamento *
                  </label>
                  <select
                    value={nuevoProyecto.departamento}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, departamento: e.target.value }))}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.departamento
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}>
                    <option value="">Seleccionar...</option>
                    <option value="Infraestructura">Infraestructura</option>
                    <option value="Internacional">Internacional</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Comercial">Comercial</option>
                  </select>
                  {proyectoErrors.departamento && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.departamento}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Presupuesto *
                  </label>
                  <input
                    type="number"
                    placeholder="5000000"
                    value={nuevoProyecto.presupuesto}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, presupuesto: e.target.value }))}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.presupuesto
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {proyectoErrors.presupuesto && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.presupuesto}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Inicio *
                  </label>
                  <input
                    type="date"
                    value={nuevoProyecto.fechaInicio}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, fechaInicio: e.target.value }))}
                    onFocus={openDatePicker}
                    onClick={openDatePicker}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.fechaInicio
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {proyectoErrors.fechaInicio && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.fechaInicio}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Fin Estimada *
                  </label>
                  <input
                    type="date"
                    value={nuevoProyecto.fechaFinEstimada}
                    onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, fechaFinEstimada: e.target.value }))}
                    onFocus={openDatePicker}
                    onClick={openDatePicker}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      proyectoErrors.fechaFinEstimada
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {proyectoErrors.fechaFinEstimada && (
                    <p className="mt-1 text-xs text-rose-600">{proyectoErrors.fechaFinEstimada}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionales sobre el proyecto..."
                  value={nuevoProyecto.notas}
                  onChange={(e) => setNuevoProyecto((prev) => ({ ...prev, notas: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowModalCrearProyecto(false);
                  resetNuevoProyecto();
                  setShowProyectoErrors(false);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearProyecto}
                className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Crear Proyecto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle de Proyecto */}
      {showModalProyectoDetalle && proyectoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {(() => {
              const proyectoDetalle = proyectoForm ?? proyectoSeleccionado;

              if (!proyectoDetalle) {
                return null;
              }

              const updateProyectoForm = (updates: Partial<Proyecto>) => {
                setProyectoForm((prev) => (prev ? { ...prev, ...updates } : prev));
              };

              return (
            <>
              <div className="p-5 border-b border-gray-200">
              <div className="flex items-center justify-between gap-4">
                <div>
                  {isEditingProyecto ? (
                    <>
                      <input
                        value={proyectoDetalle.nombre}
                        onChange={(e) => updateProyectoForm({ nombre: e.target.value })}
                        className="w-full text-lg font-semibold text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                        placeholder="Nombre del proyecto"
                      />
                      <input
                        value={proyectoDetalle.codigo}
                        onChange={(e) => updateProyectoForm({ codigo: e.target.value })}
                        className="mt-2 w-full text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1"
                        placeholder="Codigo del proyecto"
                      />
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-gray-900">{proyectoDetalle.nombre}</h2>
                      <p className="text-xs text-gray-600">{proyectoDetalle.codigo}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (isEditingProyecto) {
                        setProyectoForm(proyectoSeleccionado);
                        setIsEditingProyecto(false);
                        return;
                      }
                      setIsEditingProyecto(true);
                    }}
                    className="px-3 py-1 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
                    type="button"
                  >
                    {isEditingProyecto ? 'Cancelar edicion' : 'Editar'}
                  </button>
                  <button
                    onClick={() => {
                      setShowModalProyectoDetalle(false);
                      setIsEditingProyecto(false);
                      setProyectoForm(null);
                      setProyectoSeleccionado(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Cliente</p>
                  {isEditingProyecto ? (
                    <input
                      value={proyectoDetalle.cliente}
                      onChange={(e) => updateProyectoForm({ cliente: e.target.value })}
                      className="w-full text-sm font-medium text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{proyectoDetalle.cliente}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Estado</p>
                  {isEditingProyecto ? (
                    <select
                      value={proyectoDetalle.estado}
                      onChange={(e) => updateProyectoForm({ estado: e.target.value as Proyecto['estado'] })}
                      className="w-full text-sm font-medium text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                    >
                      <option value="activo">Activo</option>
                      <option value="en_pausa">En Pausa</option>
                      <option value="completado">Completado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{proyectoDetalle.estado}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Responsable</p>
                  {isEditingProyecto ? (
                    <input
                      value={proyectoDetalle.responsable}
                      onChange={(e) => updateProyectoForm({ responsable: e.target.value })}
                      className="w-full text-sm font-medium text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{proyectoDetalle.responsable}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Departamento</p>
                  {isEditingProyecto ? (
                    <input
                      value={proyectoDetalle.departamento}
                      onChange={(e) => updateProyectoForm({ departamento: e.target.value })}
                      className="w-full text-sm font-medium text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{proyectoDetalle.departamento}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Inicio</p>
                  {isEditingProyecto ? (
                    <input
                      type="date"
                      value={proyectoDetalle.fechaInicio}
                      onChange={(e) => updateProyectoForm({ fechaInicio: e.target.value })}
                      className="w-full text-sm text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                    />
                  ) : (
                    <p className="text-sm text-gray-900">{new Date(proyectoDetalle.fechaInicio).toLocaleDateString('es-MX')}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fin estimado</p>
                  {isEditingProyecto ? (
                    <input
                      type="date"
                      value={proyectoDetalle.fechaFinEstimada}
                      onChange={(e) => updateProyectoForm({ fechaFinEstimada: e.target.value })}
                      className="w-full text-sm text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                    />
                  ) : (
                    <p className="text-sm text-gray-900">{new Date(proyectoDetalle.fechaFinEstimada).toLocaleDateString('es-MX')}</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500">Descripción</p>
                {isEditingProyecto ? (
                  <textarea
                    value={proyectoDetalle.descripcion}
                    onChange={(e) => updateProyectoForm({ descripcion: e.target.value })}
                    rows={3}
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1"
                  />
                ) : (
                  <p className="text-sm text-gray-700">{proyectoDetalle.descripcion}</p>
                )}
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">Presupuesto ejecutado</span>
                  <span className="font-semibold text-gray-900">
                    {calcularPorcentajeGastado(proyectoDetalle.gastado, proyectoDetalle.presupuesto)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-primary-600"
                    style={{
                      width: `${Math.min(
                        parseFloat(calcularPorcentajeGastado(proyectoDetalle.gastado, proyectoDetalle.presupuesto)),
                        100
                      )}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div>
                    <p className="text-[11px] text-gray-500">Presupuesto</p>
                    {isEditingProyecto ? (
                      <input
                        type="number"
                        value={proyectoDetalle.presupuesto}
                        onChange={(e) => updateProyectoForm({ presupuesto: Number(e.target.value) })}
                        className="w-full text-sm font-semibold text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">${(proyectoDetalle.presupuesto / 1000000).toFixed(1)}M</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Gastado</p>
                    {isEditingProyecto ? (
                      <input
                        type="number"
                        value={proyectoDetalle.gastado}
                        onChange={(e) => updateProyectoForm({ gastado: Number(e.target.value) })}
                        className="w-full text-sm font-semibold text-gray-900 border border-gray-200 rounded-md px-2 py-1"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">${(proyectoDetalle.gastado / 1000000).toFixed(1)}M</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  void handleEliminarProyecto(proyectoDetalle.id);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                type="button"
              >
                Eliminar
              </button>
              <button
                onClick={() => {
                  setShowModalProyectoDetalle(false);
                  setIsEditingProyecto(false);
                  setProyectoForm(null);
                  setProyectoSeleccionado(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cerrar
              </button>
              {isEditingProyecto && (
                <button
                  onClick={() => {
                    void handleGuardarProyectoCambios();
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                  Guardar cambios
                </button>
              )}
            </div>
            </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}


