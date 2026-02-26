import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  appendViaticoComment,
  getPendingViaticoExtension,
  removePendingViaticoExtension,
} from '../../utils/viaticoExtensions';
import {
  formatProyectoMontoCompacto,
  getProyectoUsoPorcentaje,
  sanitizeProyectoMontos,
} from '../../utils/proyectoMetrics';

type PortalToastType = 'success' | 'error' | 'info';

interface PortalToast {
  id: number;
  text: string;
  type: PortalToastType;
}

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
  const toastTimeoutRef = useRef<number | null>(null);
  const [toast, setToast] = useState<PortalToast | null>(null);

  const viaticosPendientes = useMemo(() => {
    return viaticosUsuario
      .filter((viatico) => {
        const hasExtensionRequest = Boolean(getPendingViaticoExtension(viatico.comentarios));
        const isSolicitudInicial = viatico.status === 'pendiente' && !viaticosResueltos.includes(viatico.id);
        return hasExtensionRequest || isSolicitudInicial;
      });
  }, [viaticosUsuario, viaticosResueltos]);

  const extensionSeleccionada = useMemo(
    () => (viaticoSeleccionado ? getPendingViaticoExtension(viaticoSeleccionado.comentarios) : null),
    [viaticoSeleccionado]
  );

  const showToast = (text: string, type: PortalToastType = 'info') => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }

    const id = Date.now();
    setToast({ id, text, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      toastTimeoutRef.current = null;
    }, 4000);
  };

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
        setProyectos(remoteProyectos.map(sanitizeProyectoMontos));
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

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

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
      cliente: !nuevoProyecto.cliente.trim() ? 'Ingresa el cliente o descripcion.' : '',
      responsable: !nuevoProyecto.responsable.trim() ? 'Ingresa el responsable.' : '',
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
    const nombreProyecto = nuevoProyecto.cliente.trim();
    const requiredFields = [
      nuevoProyecto.codigo,
      nuevoProyecto.cliente,
      nuevoProyecto.responsable,
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
        nombre: nombreProyecto,
        cliente: nuevoProyecto.cliente.trim(),
        estado: 'activo',
        presupuesto: presupuestoValue,
        gastado: 0,
        fechaInicio: nuevoProyecto.fechaInicio,
        fechaFinEstimada: nuevoProyecto.fechaFinEstimada,
        responsable: nuevoProyecto.responsable.trim(),
        departamento: user?.department?.trim() || 'operaciones',
        descripcion: nuevoProyecto.cliente.trim(),
        notas: nuevoProyecto.notas.trim() || undefined,
      });

      setProyectos((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]));
        map.set(nuevo.id, sanitizeProyectoMontos(nuevo));
        return Array.from(map.values());
      });
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      setShowModalCrearProyecto(false);
      resetNuevoProyecto();
      setShowProyectoErrors(false);
      showToast('Proyecto creado correctamente.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo crear el proyecto.', 'error');
    }
  };

  const handleAprobarViatico = async (viaticoId: string) => {
    const selected = viaticoSeleccionado;
    if (!selected) {
      setShowModalViaticoDetalle(false);
      return;
    }

    try {
      const pendingExtension = getPendingViaticoExtension(selected.comentarios);
      if (pendingExtension) {
        const comentariosSinExtension = removePendingViaticoExtension(selected.comentarios);
        const fechaResolucion = new Date().toLocaleString('es-MX');
        const montoBase = selected.montoAprobado ?? selected.montoSolicitado;
        const montoExtra = Math.max(0, pendingExtension.montoCapturado || 0);
        const requiereDispersionAdicional = montoExtra > 0;
        const comentarioResolucion = appendViaticoComment(
          comentariosSinExtension,
          `Extension aprobada (${fechaResolucion}) por ${user?.full_name || 'Project Manager'}: ${new Date(pendingExtension.fechaFinActual).toLocaleDateString('es-MX')} -> ${new Date(pendingExtension.nuevaFechaFin).toLocaleDateString('es-MX')}.${requiereDispersionAdicional ? ` Monto adicional aprobado: $${montoExtra.toLocaleString()} MXN.` : ''}`
        );

        const payloadActualizacion: Partial<Viatico> = {
          fechaFin: pendingExtension.nuevaFechaFin,
          comentarios: comentarioResolucion,
          aprobadoPor: user?.full_name || 'Project Manager',
        };

        if (requiereDispersionAdicional) {
          payloadActualizacion.status = 'aprobado';
          payloadActualizacion.montoAprobado = montoBase + montoExtra;
        }

        const updatedRecord = await updateViatico(viaticoId, {
          ...payloadActualizacion,
        });

        setViaticosUsuario((prev) => {
          const map = new Map(prev.map((viatico) => [viatico.id, viatico]));
          map.set(updatedRecord.id, { ...map.get(updatedRecord.id), ...updatedRecord });
          return Array.from(map.values());
        });
        await syncCoreAppData({ userId: user ? String(user.id) : undefined });
        setShowModalViaticoDetalle(false);
        setViaticoSeleccionado(null);
        showToast(
          requiereDispersionAdicional
            ? 'Extension aprobada. Se envio a dispersion para el monto adicional.'
            : 'Extension aprobada y aplicada al viatico.',
          'success'
        );
        return;
      }

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
      showToast('Viatico aprobado correctamente.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo aprobar el viatico.', 'error');
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
      const pendingExtension = getPendingViaticoExtension(selected.comentarios);
      if (pendingExtension) {
        const comentariosSinExtension = removePendingViaticoExtension(selected.comentarios);
        const fechaResolucion = new Date().toLocaleString('es-MX');
        const comentarioResolucion = appendViaticoComment(
          comentariosSinExtension,
          `Extension rechazada (${fechaResolucion}) por ${user?.full_name || 'Project Manager'}: ${new Date(pendingExtension.fechaFinActual).toLocaleDateString('es-MX')} -> ${new Date(pendingExtension.nuevaFechaFin).toLocaleDateString('es-MX')}.`
        );

        const updatedRecord = await updateViatico(viaticoId, {
          comentarios: comentarioResolucion,
          aprobadoPor: user?.full_name || 'Project Manager',
        });

        setViaticosUsuario((prev) => {
          const map = new Map(prev.map((viatico) => [viatico.id, viatico]));
          map.set(updatedRecord.id, { ...map.get(updatedRecord.id), ...updatedRecord });
          return Array.from(map.values());
        });
        await syncCoreAppData({ userId: user ? String(user.id) : undefined });
        setShowModalViaticoDetalle(false);
        setViaticoSeleccionado(null);
        showToast('Extension rechazada. El viatico mantiene su estado actual.', 'info');
        return;
      }

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
      showToast('Viatico rechazado.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo rechazar el viatico.', 'error');
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
      showToast('Viaje aprobado y enviado a gestion.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo aprobar el viaje.', 'error');
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
      showToast('Viaje rechazado.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo rechazar el viaje.', 'error');
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
      showToast('Proyecto eliminado correctamente.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar el proyecto.', 'error');
    }
  };

  const handleGuardarProyectoCambios = async () => {
    if (!proyectoForm) {
      return;
    }

    try {
      const clienteDescripcion = proyectoForm.cliente.trim();
      const updatedProyecto = await updateProyecto(proyectoForm.id, {
        ...proyectoForm,
        nombre: clienteDescripcion || proyectoForm.nombre,
        descripcion: clienteDescripcion,
        updatedAt: new Date().toISOString(),
      });
      const proyectoSanitizado = sanitizeProyectoMontos(updatedProyecto);
      setProyectos((prev) =>
        prev.map((item) =>
          item.id === updatedProyecto.id ? proyectoSanitizado : item
        )
      );
      setProyectoSeleccionado(proyectoSanitizado);
      setIsEditingProyecto(false);
      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      showToast('Proyecto actualizado correctamente.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar el proyecto.', 'error');
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

  const calcularPorcentajeGastado = (gastado: number, presupuesto: number) =>
    getProyectoUsoPorcentaje(gastado, presupuesto);

  return (
    <div className="h-full min-h-0 w-full px-2 sm:px-3 lg:px-4 py-2 flex flex-col gap-3">
      {toast && (
        <div className="fixed right-4 top-20 z-[80] w-full max-w-sm">
          <div
            className={`rounded-lg border px-4 py-3 shadow-lg ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : toast.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-sky-200 bg-sky-50 text-sky-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-5">{toast.text}</p>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-xs font-semibold opacity-70 hover:opacity-100"
                aria-label="Cerrar notificacion"
              >
                x
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="pt-0 pb-1">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 sm:p-5 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel PM</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Portal de Project Manager</h1>
                <p className="text-[11px] text-slate-600">Gestiona proyectos, aprueba viáticos y viajes de tu equipo.</p>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <p className="text-xs text-gray-600">Viáticos Pendientes</p>
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

      <div className="grid flex-1 min-h-0 grid-cols-1 xl:grid-cols-12 gap-3 items-start">
      {/* Viáticos Pendientes de Aprobación */}
      <div className="xl:col-span-4 h-full rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4 shadow-sm space-y-3 flex flex-col min-h-0">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Viáticos Pendientes de Aprobación</h2>
        {viaticosPendientes.length > 0 ? (
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
            {viaticosPendientes.map((viatico) => {
              const viaticoStatusIcon = getViaticoStatusIcon(viatico.status);
              const extensionPendiente = getPendingViaticoExtension(viatico.comentarios);
              const isExtensionRequest = Boolean(extensionPendiente);

              return (
                <div key={viatico.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 hover:shadow-md transition-shadow w-full">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                       <h3 className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                        <span className="text-xs">{viaticoStatusIcon}</span>
                        <span className="truncate">{viatico.userName}</span>
                      </h3>
                      <p className="text-[11px] text-gray-500">{viatico.id}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${isExtensionRequest ? 'bg-amber-100 text-amber-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {isExtensionRequest ? 'Extension pendiente' : 'Pendiente'}
                    </span>
                  </div>

                <div className="space-y-1 mb-1.5 text-[11px] text-gray-600">
                  <div>
                    <p className="text-[10px] text-gray-500">Proyecto</p>
                    <p className="text-[11px] text-gray-900 truncate">
                      {formatProyectoLabel(viatico.proyectoNombre, viatico.proyectoId)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">
                      {viatico.destino}
                      {viatico.destinoPais ? `, ${viatico.destinoPais}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {new Date(viatico.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viatico.fechaFin).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                  {extensionPendiente && (
                     <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                      Ext: {new Date(extensionPendiente.fechaFinActual).toLocaleDateString('es-MX')}{' -> '}{new Date(extensionPendiente.nuevaFechaFin).toLocaleDateString('es-MX')}
                    </div>
                  )}
                   <p className="text-[11px] text-gray-700 line-clamp-2">{viatico.motivo}</p>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
                  <div className="text-[11px]">
                    <span className="text-gray-600">Monto: </span>
                    <span className="font-semibold text-gray-900">${viatico.montoSolicitado.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-500 ml-1">{viatico.tipoViatico}</span>
                  </div>
                  <button
                    onClick={() => {
                      setViaticoSeleccionado(viatico);
                      setShowModalViaticoDetalle(true);
                    }}
                    className="px-2.5 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-[11px]"
                  >
                    Revisar
                  </button>
                </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 h-full min-h-[220px] p-6 text-center flex flex-col items-center justify-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay viáticos pendientes</h3>
            <p className="text-gray-600">Todos los viáticos han sido revisados</p>
          </div>
        )}
      </div>

      {/* Viajes Pendientes */}
      <div className="xl:col-span-4 h-full rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4 shadow-sm space-y-3 flex flex-col min-h-0">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Solicitudes de Viaje Pendientes</h2>
        {viajesPendientes.length > 0 ? (
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
            {viajesPendientes.map((viaje) => {
              const viajeStatusIcon = getViajeStatusIcon(viaje.status);

              return (
                <div key={viaje.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 hover:shadow-md transition-shadow w-full">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                        <span className="text-xs">{viajeStatusIcon}</span>
                        <span className="truncate">{viaje.userName}</span>
                      </h3>
                      <p className="text-[11px] text-gray-600 truncate">
                        {formatProyectoLabel(viaje.proyectoNombre, viaje.proyectoId)}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 text-yellow-800">
                      Pendiente
                    </span>
                  </div>

                <div className="space-y-1 mb-1.5 text-[11px] text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{viaje.destino}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{new Date(viaje.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viaje.fechaFin).toLocaleDateString('es-MX')}</span>
                  </div>
                  <p className="text-[11px] text-gray-700 line-clamp-2">{viaje.motivo}</p>
                </div>

                <div className="flex flex-wrap gap-1 mb-1.5">
                  {viaje.necesitaAvion && (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">
                      ✈️ Avión
                    </span>
                  )}
                  {viaje.necesitaCamion && (
                    <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px] font-medium">
                      🚌 Camión
                    </span>
                  )}
                  {viaje.necesitaHotel && (
                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[10px] font-medium">
                      🏨 Hotel
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
                  <div className="text-[11px]">
                    <span className="text-gray-600">Costo estimado: </span>
                    <span className="font-semibold text-gray-900">${viaje.costoEstimado?.toLocaleString()}</span>
                  </div>
                  <button
                    onClick={() => {
                      setViajeSeleccionado(viaje);
                      setShowModalViajeDetalle(true);
                    }}
                    className="px-2.5 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-[11px]"
                  >
                    Revisar
                  </button>
                </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 h-full min-h-[220px] p-6 text-center flex flex-col items-center justify-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay viajes pendientes</h3>
            <p className="text-gray-600">Todas las solicitudes de viaje han sido procesadas</p>
          </div>
        )}
      </div>

      {/* Mis Proyectos */}
      <div className="xl:col-span-4 h-full rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4 shadow-sm space-y-3 flex flex-col min-h-0">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Mis Proyectos</h2>
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          {proyectos.map((proyecto) => {
            const porcentajeGastado = calcularPorcentajeGastado(proyecto.gastado, proyecto.presupuesto);
            const proyectoEstadoIcon = getProyectoEstadoIcon(proyecto.estado);
            const nombreProyecto = (proyecto.nombre || '').trim();
            const clienteProyecto = (proyecto.cliente || '').trim();
            const descripcionProyecto = (proyecto.descripcion || '').trim();
            const sameNombreCliente =
              nombreProyecto.length > 0 &&
              clienteProyecto.length > 0 &&
              nombreProyecto.toLowerCase() === clienteProyecto.toLowerCase();
            const showCliente = Boolean(clienteProyecto) && !sameNombreCliente;
            const showDescripcion =
              Boolean(descripcionProyecto) &&
              descripcionProyecto.toLowerCase() !== nombreProyecto.toLowerCase() &&
              descripcionProyecto.toLowerCase() !== clienteProyecto.toLowerCase();

            return (
              <div key={proyecto.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 hover:shadow-md transition-shadow w-full">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                        <span className="text-sm">{proyectoEstadoIcon}</span>
                        <span className="truncate">{nombreProyecto || 'Proyecto sin nombre'}</span>
                      </h3>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${getEstadoColor(proyecto.estado)}`}>
                        {proyecto.estado === 'activo' ? 'Activo' :
                         proyecto.estado === 'en_pausa' ? 'En Pausa' :
                         proyecto.estado === 'completado' ? 'Completado' : 'Cancelado'}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-600">{proyecto.codigo}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
                      <span className="font-semibold text-gray-800">Proyecto: {nombreProyecto || 'N/A'}</span>
                      {showCliente && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-600">Cliente: {clienteProyecto}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {showDescripcion && (
                  <p className="text-[10px] text-gray-700 mb-1.5 line-clamp-1">{descripcionProyecto}</p>
                )}

                <div className="space-y-0.5">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-gray-600">Presupuesto ejecutado</span>
                      <span className="font-semibold text-gray-900">{porcentajeGastado.toFixed(1)}%</span>
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

                  <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-gray-200">
                    <div>
                      <p className="text-[10px] text-gray-500">Presupuesto</p>
                      <p className="text-[10px] font-semibold text-gray-900">{formatProyectoMontoCompacto(proyecto.presupuesto)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500">Gastado</p>
                      <p className="text-[10px] font-semibold text-gray-900">{formatProyectoMontoCompacto(proyecto.gastado)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-gray-200">
                    <div>
                      <p className="text-[10px] text-gray-500">Inicio</p>
                      <p className="text-[10px] text-gray-900">{new Date(proyecto.fechaInicio).toLocaleDateString('es-MX')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500">Fin estimado</p>
                      <p className="text-[10px] text-gray-900">{new Date(proyecto.fechaFinEstimada).toLocaleDateString('es-MX')}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 pt-1.5 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setProyectoSeleccionado(proyecto);
                      setProyectoForm(proyecto);
                      setIsEditingProyecto(false);
                      setShowModalProyectoDetalle(true);
                    }}
                    className="w-full px-2 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-[10px] font-semibold flex items-center justify-center gap-1.5"
                  >
                    <span>Ver Detalles del Proyecto</span>
                    <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Modal: Detalle de Viático */}
      {showModalViaticoDetalle && viaticoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 p-6 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  {extensionSeleccionada ? 'Revisar Solicitud de Extension' : 'Revisar Solicitud de Viático'}
                </h2>
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

              {extensionSeleccionada && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-900">Detalle de extension solicitada</p>
                  <p className="text-sm text-amber-900">
                    Fecha fin actual: <span className="font-semibold">{new Date(extensionSeleccionada.fechaFinActual).toLocaleDateString('es-MX')}</span>
                  </p>
                  <p className="text-sm text-amber-900">
                    Nueva fecha solicitada: <span className="font-semibold">{new Date(extensionSeleccionada.nuevaFechaFin).toLocaleDateString('es-MX')}</span>
                  </p>
                  <p className="text-sm text-amber-900">
                    Alimentos capturados: D {extensionSeleccionada.desayunos} / C {extensionSeleccionada.comidas} / Ce {extensionSeleccionada.cenas}
                  </p>
                  <p className="text-sm text-amber-900">
                    Monto capturado: <span className="font-semibold">${extensionSeleccionada.montoCapturado.toLocaleString()} MXN</span>
                  </p>
                  <p className="text-xs text-amber-800">
                    {extensionSeleccionada.montoCapturado > 0
                      ? 'Si apruebas, este monto adicional pasara al flujo de dispersion.'
                      : 'Si apruebas, solo se actualizara la fecha fin del viaje.'}
                  </p>
                </div>
              )}

              {!extensionSeleccionada && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monto a Aprobar (opcional - dejar vacio para aprobar el monto solicitado)
                  </label>
                  <input
                    type="number"
                    placeholder={`${viaticoSeleccionado.montoSolicitado}`}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

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
                {extensionSeleccionada ? 'Rechazar extension' : 'Rechazar'}
              </button>
              <button
                onClick={() => {
                  void handleAprobarViatico(viaticoSeleccionado.id);
                }}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                {extensionSeleccionada ? 'Aprobar extension' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle de Viaje */}
      {showModalViajeDetalle && viajeSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 p-6 border-b border-gray-200 bg-white">
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
            <div className="sticky top-0 z-10 p-6 border-b border-gray-200 bg-white">
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
                    Cliente / Descripción *
                  </label>
                  <input
                    type="text"
                    placeholder="Cliente o descripción breve del proyecto"
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

              <div className="grid grid-cols-1 gap-4">
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
              <div className="sticky top-0 z-10 p-5 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-4">
                <div>
                  {isEditingProyecto ? (
                    <>
                      <p className="text-xs text-gray-500">Código</p>
                      <input
                        value={proyectoDetalle.codigo}
                        onChange={(e) => updateProyectoForm({ codigo: e.target.value })}
                        className="mt-1 w-full text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1"
                        placeholder="Codigo del proyecto"
                      />
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-gray-900">{proyectoDetalle.cliente}</h2>
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
                  <p className="text-xs text-gray-500">Cliente / Descripción</p>
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
                    {calcularPorcentajeGastado(proyectoDetalle.gastado, proyectoDetalle.presupuesto).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-primary-600"
                    style={{
                      width: `${Math.min(
                        calcularPorcentajeGastado(proyectoDetalle.gastado, proyectoDetalle.presupuesto),
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
                      <p className="text-sm font-semibold text-gray-900">{formatProyectoMontoCompacto(proyectoDetalle.presupuesto)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Gastado</p>
                    <p className="text-sm font-semibold text-gray-900">{formatProyectoMontoCompacto(proyectoDetalle.gastado)}</p>
                    {isEditingProyecto && (
                      <p className="mt-1 text-[10px] text-gray-400">Campo automatico, no editable.</p>
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


