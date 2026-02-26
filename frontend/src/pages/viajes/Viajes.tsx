import { useMemo, useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { SolicitudViaje } from '../../types';
import { syncCoreAppData, updateViaje } from '../../utils/backendSync';
import { formatProyectoLabel } from '../../utils/proyectoLabel';


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
export default function Viajes() {
  const [solicitudes, setSolicitudes] = useLocalStorageState<SolicitudViaje[]>('viajes:solicitudes', []);
  const [, setSolicitudesUsuario] = useLocalStorageState<SolicitudViaje[]>('usuario:solicitudesViaje', []);
  const [filter, setFilter] = useLocalStorageState<'todos' | 'pendiente' | 'en_proceso' | 'confirmado' | 'completado' | 'rechazado'>('viajes:filter', 'todos');
  const [selectedSolicitud, setSelectedSolicitud] = useLocalStorageState<SolicitudViaje | null>('viajes:selectedSolicitud', null);

  const filteredSolicitudes = filter === 'todos'
    ? solicitudes
    : filter === 'rechazado'
      ? solicitudes.filter(s => s.status === 'rechazado' || s.status === 'cancelado')
      : solicitudes.filter(s => s.status === filter);
  const isSingleSolicitud = filteredSolicitudes.length === 1;

  const statusSummary = useMemo(() => {
    const summary = {
      total: solicitudes.length,
      pendientes: 0,
      enProceso: 0,
      confirmados: 0,
      completados: 0,
      rechazados: 0,
    };
    solicitudes.forEach((solicitud) => {
      switch (solicitud.status) {
        case 'pendiente':
          summary.pendientes += 1;
          break;
        case 'en_proceso':
          summary.enProceso += 1;
          break;
        case 'confirmado':
          summary.confirmados += 1;
          break;
        case 'completado':
          summary.completados += 1;
          break;
        case 'rechazado':
        case 'cancelado':
          summary.rechazados += 1;
          break;
        default:
          break;
      }
    });
    return summary;
  }, [solicitudes]);

  const pmApprovalBadge = (status: SolicitudViaje['status']) => {
    if (status === 'pendiente') {
      return { label: 'PM: Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    if (status === 'rechazado' || status === 'cancelado') {
      return { label: 'PM: Rechazado', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
    return { label: 'PM: Aprobado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Viajes</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Solicitudes de Viaje</h1>
                <p className="text-[11px] text-slate-600">Gestión de solicitudes de avión, camión y hotel.</p>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">
                    Fuente: Mi Portal
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">
                    Actualización en tiempo real
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-sm">✈️</span>
                <div>
                  <p className="font-semibold text-slate-900">Vista operativa</p>
                  <p>Aprueba y gestiona confirmaciones.</p>
                </div>
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <StatCard
                label="Total"
                value={statusSummary.total}
                icon="📊"
                active={filter === 'todos'}
                onClick={() => setFilter('todos')}
              />
              <StatCard
                label="Pendientes"
                value={statusSummary.pendientes}
                color="yellow"
                icon="⏳"
                active={filter === 'pendiente'}
                onClick={() => setFilter('pendiente')}
              />
              <StatCard
                label="En Proceso"
                value={statusSummary.enProceso}
                color="blue"
                icon="🧭"
                active={filter === 'en_proceso'}
                onClick={() => setFilter('en_proceso')}
              />
              <StatCard
                label="Confirmados"
                value={statusSummary.confirmados}
                color="green"
                icon="✅"
                active={filter === 'confirmado'}
                onClick={() => setFilter('confirmado')}
              />
              <StatCard
                label="Completados"
                value={statusSummary.completados}
                color="slate"
                icon="🏁"
                active={filter === 'completado'}
                onClick={() => setFilter('completado')}
              />
              <StatCard
                label="Rechazados"
                value={statusSummary.rechazados}
                color="rose"
                icon="⛔"
                active={filter === 'rechazado'}
                onClick={() => setFilter('rechazado')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Solicitudes */}
      <div className={`grid gap-2 ${isSingleSolicitud ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {filteredSolicitudes.length > 0 ? (
          filteredSolicitudes.map((solicitud) => {
            const statusIcon = getViajeStatusIcon(solicitud.status);

            return (
              <div
                key={solicitud.id}
                className={`w-full bg-white rounded-lg border border-gray-200 shadow-sm p-2 sm:p-2.5 hover:shadow transition-shadow ${isSingleSolicitud ? 'max-w-xl' : ''}`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-700">
                        {solicitud.userName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{solicitud.userName}</p>
                        <p className="text-[11px] text-gray-500">ID: {solicitud.id}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <StatusBadge status={solicitud.status} />
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pmApprovalBadge(solicitud.status).color}`}
                      >
                        {pmApprovalBadge(solicitud.status).label}
                      </span>
                      <button
                        onClick={() => setSelectedSolicitud(solicitud)}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[9px] font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-900 hover:text-white"
                        type="button"
                      >
                        Ver detalles
                      </button>
                    </div>
                  </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600 lg:grid-cols-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-gray-400">Proyecto</p>
                    <p className="text-xs font-semibold text-gray-900 truncate">
                      {formatProyectoLabel(solicitud.proyectoNombre, solicitud.proyectoId)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-gray-400">Destino</p>
                    <p className="text-xs font-semibold text-gray-900 flex items-center gap-1">
                      <span className="text-sm">{statusIcon}</span>
                      <span className="truncate">{solicitud.destino}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-gray-400">Fechas</p>
                    <p className="text-xs font-semibold text-gray-900">{solicitud.fechaInicio}</p>
                    <p className="text-[10px] text-gray-500">al {solicitud.fechaFin}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-gray-400">Servicios</p>
                    <div className="flex flex-wrap gap-1">
                      {solicitud.necesitaAvion && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          ✈️ Avión
                        </span>
                      )}
                      {solicitud.necesitaCamion && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          🚛 Camión
                        </span>
                      )}
                      {solicitud.necesitaHotel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          🏨 Hotel
                        </span>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-10 text-center">
            <p className="text-sm font-semibold text-slate-700">No hay solicitudes con este filtro.</p>
            <p className="mt-1 text-xs text-slate-500">Prueba con otro estado para ver resultados.</p>
          </div>
        )}
      </div>

      {/* Modal de Detalles */}
      {selectedSolicitud && (
        <DetallesSolicitudModal
          solicitud={selectedSolicitud}
          onClose={() => setSelectedSolicitud(null)}
          onSave={async (updatedSolicitud) => {
            try {
              const persisted = await updateViaje(updatedSolicitud.id, updatedSolicitud);
              setSolicitudes((prev) => {
                const map = new Map(prev.map((solicitud) => [solicitud.id, solicitud]));
                map.set(persisted.id, persisted);
                return Array.from(map.values());
              });
              setSolicitudesUsuario((prev) => {
                const map = new Map(prev.map((solicitud) => [solicitud.id, solicitud]));
                if (map.has(persisted.id)) {
                  map.set(persisted.id, persisted);
                }
                return Array.from(map.values());
              });
              await syncCoreAppData({ userId: persisted.userId });
              setSelectedSolicitud(null);
            } catch (error) {
              window.alert(error instanceof Error ? error.message : 'No se pudo guardar la solicitud.');
            }
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color?: 'gray' | 'yellow' | 'green' | 'blue' | 'slate' | 'rose';
  icon?: string;
  active?: boolean;
  onClick?: () => void;
}

function StatCard({ label, value, color = 'gray', icon, active, onClick }: StatCardProps) {
  const colorClasses = {
    gray: { accent: 'bg-slate-500', soft: 'bg-slate-100 text-slate-700', ring: 'ring-slate-200/70' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-800', ring: 'ring-amber-200/70' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-800', ring: 'ring-emerald-200/70' },
    blue: { accent: 'bg-sky-500', soft: 'bg-sky-100 text-sky-800', ring: 'ring-sky-200/70' },
    slate: { accent: 'bg-slate-700', soft: 'bg-slate-100 text-slate-700', ring: 'ring-slate-200/70' },
    rose: { accent: 'bg-rose-500', soft: 'bg-rose-100 text-rose-800', ring: 'ring-rose-200/70' },
  };
  const palette = colorClasses[color];

  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-lg border p-2 text-left transition ${
        active
          ? 'border-slate-300 bg-white shadow-md'
          : 'border-slate-200 bg-white/80 hover:-translate-y-0.5 hover:bg-white hover:shadow-sm'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.accent}`} />
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
        </div>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${palette.soft} ${
            active ? `ring-2 ${palette.ring}` : ''
          }`}
        >
          <span className="text-sm">{icon || '•'}</span>
        </div>
      </div>
      <div className="mt-1.5 h-0.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-1 rounded-full ${palette.accent} transition-all ${
            active ? 'w-full' : 'w-1/3 group-hover:w-2/3'
          }`}
        />
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
    en_proceso: { label: 'En Proceso', color: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
    confirmado: { label: 'Confirmado', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
    cancelado: { label: 'Cancelado', color: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
    rechazado: { label: 'Rechazado', color: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
    completado: { label: 'Completado', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendiente;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

interface DetallesSolicitudModalProps {
  solicitud: SolicitudViaje;
  onClose: () => void;
  onSave: (updatedSolicitud: SolicitudViaje) => Promise<void> | void;
}

type ConfirmacionAvionDraft = { aerolinea: string; confirmacion: string; costo: number | '' };
type ConfirmacionCamionDraft = { proveedor: string; confirmacion: string; costo: number | '' };
type ConfirmacionHotelDraft = { nombre: string; confirmacion: string; costo: number | '' };

const normalizeConfirmaciones = <T,>(value?: T[]) => (Array.isArray(value) ? value : []);
const allowedGestionStatuses: SolicitudViaje['status'][] = ['en_proceso', 'cancelado', 'completado'];
const normalizeGestionStatus = (value: SolicitudViaje['status']): SolicitudViaje['status'] => (
  allowedGestionStatuses.includes(value) ? value : 'en_proceso'
);

function DetallesSolicitudModal({ solicitud, onClose, onSave }: DetallesSolicitudModalProps) {
  useEscapeKey(onClose);

  const disableConfirmaciones = false;
  const disableServiceStatus = false;
  const disableGestion = false;
  const readOnlyFieldClass = 'disabled:bg-white disabled:text-gray-700 disabled:opacity-100 disabled:cursor-default';

  const [status, setStatus] = useState<SolicitudViaje['status']>(normalizeGestionStatus(solicitud.status));
  const [notas, setNotas] = useState(solicitud.notas || '');
  const [statusAvion, setStatusAvion] = useState(solicitud.statusAvion || 'pendiente');
  const [statusCamion, setStatusCamion] = useState(solicitud.statusCamion || 'pendiente');
  const [statusHotel, setStatusHotel] = useState(solicitud.statusHotel || 'pendiente');
  const [confirmacionesAvion, setConfirmacionesAvion] = useState<ConfirmacionAvionDraft[]>(
    normalizeConfirmaciones(solicitud.confirmaciones?.avion).map((item) => ({
      ...item,
      costo: item.costo ?? '',
    }))
  );
  const [confirmacionesCamion, setConfirmacionesCamion] = useState<ConfirmacionCamionDraft[]>(
    normalizeConfirmaciones(solicitud.confirmaciones?.camion).map((item) => ({
      ...item,
      costo: item.costo ?? '',
    }))
  );
  const [confirmacionesHotel, setConfirmacionesHotel] = useState<ConfirmacionHotelDraft[]>(
    normalizeConfirmaciones(solicitud.confirmaciones?.hotel).map((item) => ({
      ...item,
      costo: item.costo ?? '',
    }))
  );

  const getStatusColor = (serviceStatus: string) => {
    switch (serviceStatus) {
      case 'pendiente':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'gestionando':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'confirmado':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusLabel = (serviceStatus: string) => {
    switch (serviceStatus) {
      case 'pendiente':
        return 'Pendiente';
      case 'gestionando':
        return 'Gestionando';
      case 'confirmado':
        return 'Confirmado';
      default:
        return 'Desconocido';
    }
  };

  const getDiasHospedaje = () => {
    const inicio = new Date(solicitud.fechaInicio);
    const fin = new Date(solicitud.fechaFin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return null;
    }
    const diffMs = fin.getTime() - inicio.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  };

  const handleAddAvion = () => {
    setConfirmacionesAvion((prev) => [...prev, { aerolinea: '', confirmacion: '', costo: '' }]);
  };

  const handleAddCamion = () => {
    setConfirmacionesCamion((prev) => [...prev, { proveedor: '', confirmacion: '', costo: '' }]);
  };

  const handleAddHotel = () => {
    setConfirmacionesHotel((prev) => [...prev, { nombre: '', confirmacion: '', costo: '' }]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Detalles de Solicitud - {solicitud.id}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Información General */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Solicitante</p>
                <p className="text-base font-medium text-gray-900">{solicitud.userName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Proyecto</p>
                <p className="text-base font-medium text-gray-900">
                  {formatProyectoLabel(solicitud.proyectoNombre, solicitud.proyectoId)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Destino</p>
                <p className="text-base font-medium text-gray-900">{solicitud.destino}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fechas</p>
                <p className="text-base font-medium text-gray-900">
                  {new Date(solicitud.fechaInicio).toLocaleDateString('es-MX')} - {new Date(solicitud.fechaFin).toLocaleDateString('es-MX')}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600">Motivo</p>
                <p className="text-base font-medium text-gray-900">{solicitud.motivo}</p>
              </div>
            </div>
          </div>

          {/* Servicios Solicitados */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Servicios Solicitados</h3>
            <div className="space-y-4">
              {solicitud.necesitaAvion && (
                <div className="relative border border-blue-200 bg-blue-50 rounded-lg p-4 pb-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <span className="text-2xl">✈️</span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">Avión</h4>
                        <p className="text-sm text-gray-700 mt-1">{solicitud.detallesAvion || 'Sin detalles adicionales'}</p>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-blue-800">Confirmaciones</p>
                          </div>
                          {confirmacionesAvion.length === 0 ? (
                            <p className="text-xs text-blue-700">Sin confirmaciones registradas.</p>
                          ) : (
                            <div className="space-y-2">
                              {confirmacionesAvion.map((confirmacion, index) => (
                                <div
                                  key={`avion-${solicitud.id}-${index}`}
                                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_0.8fr_auto] gap-2 bg-white p-2 rounded border border-blue-200"
                                >
                                  <input
                                    value={confirmacion.aerolinea}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setConfirmacionesAvion((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, aerolinea: value } : item)
                                      ));
                                    }}
                                    disabled={disableConfirmaciones}
                                    placeholder="Aerolinea"
                                    className={`px-2 py-1 text-xs border border-blue-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  <input
                                    value={confirmacion.confirmacion}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setConfirmacionesAvion((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, confirmacion: value } : item)
                                      ));
                                    }}
                                    disabled={disableConfirmaciones}
                                    placeholder="Confirmacion"
                                    className={`px-2 py-1 text-xs border border-blue-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  <input
                                    type="number"
                                    value={confirmacion.costo}
                                    onChange={(e) => {
                                      const rawValue = e.target.value;
                                      const value = rawValue === '' ? '' : Number(rawValue);
                                      setConfirmacionesAvion((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, costo: value } : item)
                                      ));
                                    }}
                                    placeholder="Costo (MXN)"
                                    min="0"
                                    step="0.01"
                                    disabled={disableConfirmaciones}
                                    className={`px-2 py-1 text-xs border border-blue-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  {!disableConfirmaciones && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmacionesAvion((prev) => prev.filter((_, idx) => idx !== index));
                                      }}
                                      className="text-xs text-red-600 hover:text-red-700"
                                    >
                                      Quitar
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!disableConfirmaciones && (
                            <button
                              type="button"
                              onClick={handleAddAvion}
                              className="absolute bottom-3 right-4 text-xs text-blue-700 hover:text-blue-900"
                            >
                              + Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-center gap-2 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(statusAvion)}`}>
                        {getStatusLabel(statusAvion)}
                      </span>
                      <select
                        value={statusAvion}
                        onChange={(e) => setStatusAvion(e.target.value as typeof statusAvion)}
                        disabled={disableServiceStatus}
                        className={`px-2 py-1 text-xs border border-blue-300 rounded text-center focus:ring-2 focus:ring-blue-500 ${readOnlyFieldClass}`}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="gestionando">Gestionando</option>
                        <option value="confirmado">Confirmado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {solicitud.necesitaCamion && (
                <div className="relative border border-orange-200 bg-orange-50 rounded-lg p-4 pb-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <span className="text-2xl">🚛</span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">Camión / Transporte</h4>
                        <p className="text-sm text-gray-700 mt-1">{solicitud.detallesCamion || 'Sin detalles adicionales'}</p>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-orange-800">Confirmaciones</p>
                          </div>
                          {confirmacionesCamion.length === 0 ? (
                            <p className="text-xs text-orange-700">Sin confirmaciones registradas.</p>
                          ) : (
                            <div className="space-y-2">
                              {confirmacionesCamion.map((confirmacion, index) => (
                                <div
                                  key={`camion-${solicitud.id}-${index}`}
                                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_0.8fr_auto] gap-2 bg-white p-2 rounded border border-orange-200"
                                >
                                  <input
                                    value={confirmacion.proveedor}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setConfirmacionesCamion((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, proveedor: value } : item)
                                      ));
                                    }}
                                    disabled={disableConfirmaciones}
                                    placeholder="Proveedor"
                                    className={`px-2 py-1 text-xs border border-orange-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  <input
                                    value={confirmacion.confirmacion}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setConfirmacionesCamion((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, confirmacion: value } : item)
                                      ));
                                    }}
                                    disabled={disableConfirmaciones}
                                    placeholder="Confirmacion"
                                    className={`px-2 py-1 text-xs border border-orange-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  <input
                                    type="number"
                                    value={confirmacion.costo}
                                    onChange={(e) => {
                                      const rawValue = e.target.value;
                                      const value = rawValue === '' ? '' : Number(rawValue);
                                      setConfirmacionesCamion((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, costo: value } : item)
                                      ));
                                    }}
                                    placeholder="Costo (MXN)"
                                    min="0"
                                    step="0.01"
                                    disabled={disableConfirmaciones}
                                    className={`px-2 py-1 text-xs border border-orange-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  {!disableConfirmaciones && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmacionesCamion((prev) => prev.filter((_, idx) => idx !== index));
                                      }}
                                      className="text-xs text-red-600 hover:text-red-700"
                                    >
                                      Quitar
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!disableConfirmaciones && (
                            <button
                              type="button"
                              onClick={handleAddCamion}
                              className="absolute bottom-3 right-4 text-xs text-orange-700 hover:text-orange-900"
                            >
                              + Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-center gap-2 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(statusCamion)}`}>
                        {getStatusLabel(statusCamion)}
                      </span>
                      <select
                        value={statusCamion}
                        onChange={(e) => setStatusCamion(e.target.value as typeof statusCamion)}
                        disabled={disableServiceStatus}
                        className={`px-2 py-1 text-xs border border-orange-300 rounded text-center focus:ring-2 focus:ring-orange-500 ${readOnlyFieldClass}`}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="gestionando">Gestionando</option>
                        <option value="confirmado">Confirmado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {solicitud.necesitaHotel && (
                <div className="relative border border-green-200 bg-green-50 rounded-lg p-4 pb-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <span className="text-2xl">🏨</span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">Hotel</h4>
                        <p className="text-sm text-gray-700 mt-1">{solicitud.detallesHotel || 'Sin detalles adicionales'}</p>
                        {getDiasHospedaje() !== null && (
                          <p className="mt-1 text-xs font-medium text-green-800">
                            Dias de hospedaje: {getDiasHospedaje()} {getDiasHospedaje() === 1 ? 'dia' : 'dias'}
                          </p>
                        )}
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-green-800">Confirmaciones</p>
                          </div>
                          {confirmacionesHotel.length === 0 ? (
                            <p className="text-xs text-green-700">Sin confirmaciones registradas.</p>
                          ) : (
                            <div className="space-y-2">
                              {confirmacionesHotel.map((confirmacion, index) => (
                                <div
                                  key={`hotel-${solicitud.id}-${index}`}
                                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_0.8fr_auto] gap-2 bg-white p-2 rounded border border-green-200"
                                >
                                  <input
                                    value={confirmacion.nombre}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setConfirmacionesHotel((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, nombre: value } : item)
                                      ));
                                    }}
                                    disabled={disableConfirmaciones}
                                    placeholder="Hotel"
                                    className={`px-2 py-1 text-xs border border-green-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  <input
                                    value={confirmacion.confirmacion}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setConfirmacionesHotel((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, confirmacion: value } : item)
                                      ));
                                    }}
                                    disabled={disableConfirmaciones}
                                    placeholder="Confirmacion"
                                    className={`px-2 py-1 text-xs border border-green-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  <input
                                    type="number"
                                    value={confirmacion.costo}
                                    onChange={(e) => {
                                      const rawValue = e.target.value;
                                      const value = rawValue === '' ? '' : Number(rawValue);
                                      setConfirmacionesHotel((prev) => (
                                        prev.map((item, idx) => idx === index ? { ...item, costo: value } : item)
                                      ));
                                    }}
                                    placeholder="Costo (MXN)"
                                    min="0"
                                    step="0.01"
                                    disabled={disableConfirmaciones}
                                    className={`px-2 py-1 text-xs border border-green-200 rounded ${readOnlyFieldClass}`}
                                  />
                                  {!disableConfirmaciones && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmacionesHotel((prev) => prev.filter((_, idx) => idx !== index));
                                      }}
                                      className="text-xs text-red-600 hover:text-red-700"
                                    >
                                      Quitar
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!disableConfirmaciones && (
                            <button
                              type="button"
                              onClick={handleAddHotel}
                              className="absolute bottom-3 right-4 text-xs text-green-700 hover:text-green-900"
                            >
                              + Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-center gap-2 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(statusHotel)}`}>
                        {getStatusLabel(statusHotel)}
                      </span>
                      <select
                        value={statusHotel}
                        onChange={(e) => setStatusHotel(e.target.value as typeof statusHotel)}
                        disabled={disableServiceStatus}
                        className={`px-2 py-1 text-xs border border-green-300 rounded text-center focus:ring-2 focus:ring-green-500 ${readOnlyFieldClass}`}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="gestionando">Gestionando</option>
                        <option value="confirmado">Confirmado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Estado y Notas */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Gestión</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  disabled={disableGestion}
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 ${readOnlyFieldClass}`}
                >
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                  <option value="en_proceso">En Proceso</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas del Administrador
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={4}
                  disabled={disableGestion}
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 ${readOnlyFieldClass}`}
                  placeholder="Agrega notas sobre la coordinación de los servicios..."
                />
              </div>

              {solicitud.costoEstimado && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Costo Estimado</p>
                    <p className="text-lg font-semibold text-gray-900">${solicitud.costoEstimado.toLocaleString()}</p>
                  </div>
                  {solicitud.costoFinal && (
                    <div>
                      <p className="text-sm text-gray-600">Costo Final</p>
                      <p className="text-lg font-semibold text-green-600">${solicitud.costoFinal.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
          {!disableGestion && (
            <button
              onClick={() => {
                const sanitizeConfirmaciones = <T extends { costo: number | '' }>(items: T[]) => {
                  const mapped = items.map((item) => {
                    const costoValue = typeof item.costo === 'number' ? item.costo : undefined;
                    return {
                      ...item,
                      costo: costoValue,
                    };
                  });
                  return mapped.filter((item) => (
                    Object.values(item).some((value) => value !== undefined && value !== null && String(value).trim() !== '')
                  ));
                };

                const avionConfirmaciones = sanitizeConfirmaciones(confirmacionesAvion);
                const camionConfirmaciones = sanitizeConfirmaciones(confirmacionesCamion);
                const hotelConfirmaciones = sanitizeConfirmaciones(confirmacionesHotel);

                const updatedSolicitud: SolicitudViaje = {
                  ...solicitud,
                  status,
                  notas,
                  statusAvion: solicitud.necesitaAvion ? statusAvion : undefined,
                  statusCamion: solicitud.necesitaCamion ? statusCamion : undefined,
                  statusHotel: solicitud.necesitaHotel ? statusHotel : undefined,
                  confirmaciones: {
                    avion: avionConfirmaciones.length > 0 ? avionConfirmaciones : undefined,
                    camion: camionConfirmaciones.length > 0 ? camionConfirmaciones : undefined,
                    hotel: hotelConfirmaciones.length > 0 ? hotelConfirmaciones : undefined,
                  },
                };
                onSave(updatedSolicitud);
              }}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Guardar Cambios
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
