import { useEffect, useMemo, useState, type FormEvent } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { AuthUser, Viatico } from '../../types';
import ProyectoSelector from '../../components/common/ProyectoSelector';
import GSActivitySelector from '../../components/common/GSActivitySelector';
import { GS_ACTIVITY_OTHER_ID, getActivityById } from '../../data/gsActivities';
import type { GSActivity } from '../../data/gsActivities';
import { createViatico, syncCoreAppData } from '../../utils/backendSync';
import { formatProyectoLabel } from '../../utils/proyectoLabel';
import { getViaticoGastadoKpi } from '../../utils/viaticoMetrics';


const normalizeViaticoStatus = (status: string) => (status === 'completado' ? 'dispersado' : status);

const getDerivedViaticoStatus = (viatico: Viatico) => {
  const baseStatus = normalizeViaticoStatus(viatico.status);

  if (baseStatus === 'rechazado') {
    return 'rechazado';
  }

  if (baseStatus === 'aprobado') {
    return 'aprobado';
  }

  if (baseStatus === 'dispersado') {
    return 'dispersado';
  }

  if (typeof viatico.montoDispersado === 'number' && viatico.montoDispersado > 0) {
    return 'dispersado';
  }

  if (typeof viatico.montoAprobado === 'number' && viatico.montoAprobado > 0) {
    return 'aprobado';
  }

  return 'pendiente';
};

const getViaticoStatusIcon = (status: string) => {
  const icons = {
    pendiente: '⏳',
    aprobado: '✅',
    rechazado: '⛔',
    dispersado: '💸',
    completado: '🏁',
  };

  const normalizedStatus = normalizeViaticoStatus(status);

  return icons[normalizedStatus as keyof typeof icons] || icons.pendiente;
};

type ViaticoFilter = 'todos' | 'pendiente' | 'aprobado' | 'dispersado';
type StoredViaticoFilter = ViaticoFilter | 'completado';
export default function Viaticos() {
  const { user } = useAuth();
  const [viaticos, setViaticos] = useLocalStorageState<Viatico[]>('viaticos:list', []);
  const [viaticosUsuario] = useLocalStorageState<Viatico[]>('usuario:viaticos', []);
  const [showNewForm, setShowNewForm] = useLocalStorageState('viaticos:showNewForm', false);
  const [filter, setFilter] = useLocalStorageState<StoredViaticoFilter>('viaticos:filter', 'todos');
  const [selectedViatico, setSelectedViatico] = useLocalStorageState<Viatico | null>('viaticos:selectedViatico', null);
  const [showStatusModal, setShowStatusModal] = useLocalStorageState('viaticos:showStatusModal', false);

  useEffect(() => {
    if (viaticosUsuario.length === 0) {
      return;
    }

    const adminIds = new Set(viaticos.map((viatico) => viatico.id));
    const missing = viaticosUsuario.filter((viatico) => !adminIds.has(viatico.id));
    if (missing.length === 0) {
      return;
    }

    setViaticos([...viaticos, ...missing]);
  }, [setViaticos, viaticos, viaticosUsuario]);

  const allViaticos = useMemo(() => {
    const map = new Map<string, Viatico>();
    viaticos.forEach((viatico) => map.set(viatico.id, viatico));
    viaticosUsuario.forEach((viatico) => {
      if (!map.has(viatico.id)) {
        map.set(viatico.id, viatico);
      }
    });
    return Array.from(map.values());
  }, [viaticos, viaticosUsuario]);

  const normalizedFilter: ViaticoFilter = filter === 'completado' ? 'dispersado' : filter;
  const pendientesCount = allViaticos.filter(v => getDerivedViaticoStatus(v) === 'pendiente').length;
  const aprobadosCount = allViaticos.filter(v => getDerivedViaticoStatus(v) === 'aprobado').length;
  const dispersadosCount = allViaticos.filter(v => getDerivedViaticoStatus(v) === 'dispersado').length;

  const filteredViaticos = normalizedFilter === 'todos'
    ? allViaticos
    : allViaticos.filter(v => getDerivedViaticoStatus(v) === normalizedFilter);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-amber-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Viáticos</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Solicitudes de Viáticos</h1>
                <p className="text-[11px] text-slate-600">Gestión y aprobación de solicitudes de viáticos.</p>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">
                    Fuente: Mi Portal
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">
                    Ultimo paso: Dispersado
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                  MX
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Operacion diaria</p>
                  <p>Aprueba y dispersa viáticos.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatCard
                label="Total"
                value={allViaticos.length}
                active={normalizedFilter === 'todos'}
                onClick={() => setFilter('todos')}
              />
              <StatCard
                label="Pendientes por aprobar por el PM"
                value={pendientesCount}
                color="yellow"
                active={normalizedFilter === 'pendiente'}
                onClick={() => setFilter('pendiente')}
              />
              <StatCard
                label="Aprobados por PM"
                value={aprobadosCount}
                color="green"
                active={normalizedFilter === 'aprobado'}
                onClick={() => setFilter('aprobado')}
              />
              <StatCard
                label="Dispersados"
                value={dispersadosCount}
                color="blue"
                active={normalizedFilter === 'dispersado'}
                onClick={() => setFilter('dispersado')}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Solicitante
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proyecto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Motivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destino
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fechas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredViaticos.map((viatico) => {
                const displayStatus = getDerivedViaticoStatus(viatico);

                return (
                  <tr key={viatico.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold">
                        {viatico.userName.charAt(0)}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{viatico.userName}</p>
                        <p className="text-xs text-gray-500">ID: {viatico.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      <span className="text-sm">{getViaticoStatusIcon(displayStatus)}</span>
                      <span>{formatProyectoLabel(viatico.proyectoNombre, viatico.proyectoId)}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatProyectoLabel(undefined, viatico.proyectoId)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{viatico.motivo}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{viatico.destino}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">{viatico.fechaInicio}</p>
                    <p className="text-xs text-gray-500">al {viatico.fechaFin}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm font-semibold text-gray-900">
                      ${viatico.montoSolicitado.toLocaleString()}
                    </p>
                    {viatico.montoAprobado && (
                      <p className="text-xs text-green-600">
                        Aprobado: ${viatico.montoAprobado.toLocaleString()}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={displayStatus} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedViatico(viatico);
                        setShowStatusModal(true);
                      }}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      Ver informacion
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showNewForm && (
        <NewViaticoModal
          currentUser={user}
          onClose={() => setShowNewForm(false)}
          onCreated={(createdViatico) => {
            setViaticos((prev) => {
              const map = new Map(prev.map((item) => [item.id, item]));
              map.set(createdViatico.id, createdViatico);
              return Array.from(map.values());
            });
          }}
        />
      )}

      {showStatusModal && selectedViatico && (
        <StatusModal
          viatico={selectedViatico}
          onClose={() => {
            setShowStatusModal(false);
            setSelectedViatico(null);
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color?: 'gray' | 'yellow' | 'green' | 'blue' | 'purple';
  active?: boolean;
  onClick?: () => void;
}

function StatCard({ label, value, color = 'gray', active, onClick }: StatCardProps) {
  const colorClasses = {
    gray: { accent: 'bg-slate-500', soft: 'bg-slate-100 text-slate-700', ring: 'ring-slate-200/70' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-800', ring: 'ring-amber-200/70' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-800', ring: 'ring-emerald-200/70' },
    blue: { accent: 'bg-sky-500', soft: 'bg-sky-100 text-sky-800', ring: 'ring-sky-200/70' },
    purple: { accent: 'bg-violet-500', soft: 'bg-violet-100 text-violet-800', ring: 'ring-violet-200/70' },
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
          <span className="text-[10px] font-semibold">{label.charAt(0)}</span>
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
    pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
    aprobado: { label: 'Aprobado', color: 'bg-green-100 text-green-800' },
    rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-800' },
    dispersado: { label: 'Dispersado', color: 'bg-blue-100 text-blue-800' },
    completado: { label: 'Completado', color: 'bg-purple-100 text-purple-800' },
  };

  const normalizedStatus = normalizeViaticoStatus(status);
  const config = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.pendiente;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      {config.label}
    </span>
  );
}

interface NewViaticoModalProps {
  currentUser: AuthUser | null;
  onCreated: (viatico: Viatico) => void;
  onClose: () => void;
}

function NewViaticoModal({ currentUser, onCreated, onClose }: NewViaticoModalProps) {
  useEscapeKey(onClose);

  const [selectedProyectoId, setSelectedProyectoId] = useLocalStorageState<string>('viaticos:newForm:selectedProyectoId', '');
  const [selectedActivityId, setSelectedActivityId] = useLocalStorageState<number | null>('viaticos:newForm:selectedActivityId', null);
  const [formData, setFormData] = useState({
    motivo: '',
    destino: '',
    fechaInicio: '',
    fechaFin: '',
    montoSolicitado: '',
    requiereVehiculo: 'no',
    comentarios: '',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedActivity = selectedActivityId ? getActivityById(selectedActivityId) : undefined;
  const proyectoRequerido = selectedActivity?.proyectoRequerido ?? true;
  const isOtherActivitySelected = selectedActivityId === GS_ACTIVITY_OTHER_ID;
  const montoValue = Number(formData.montoSolicitado);
  const montoInvalid = !formData.montoSolicitado || Number.isNaN(montoValue) || montoValue <= 0;
  const computedErrors = {
    proyectoId: proyectoRequerido && !selectedProyectoId ? 'Selecciona el proyecto.' : '',
    actividadId: selectedActivityId === null ? 'Selecciona el tipo de actividad.' : '',
    motivo: !formData.motivo.trim() ? 'Describe el motivo del viaje.' : '',
    destino: !formData.destino.trim() ? 'Indica el destino.' : '',
    fechaInicio: !formData.fechaInicio ? 'Selecciona la fecha de inicio.' : '',
    fechaFin: !formData.fechaFin ? 'Selecciona la fecha de fin.' : '',
    montoSolicitado: montoInvalid ? 'Ingresa un monto válido.' : '',
  };
  const errors: Partial<typeof computedErrors> = showErrors ? computedErrors : {};
  const hasErrors = Object.values(computedErrors).some(Boolean);

  const handleProyectoChange = (proyectoId: string) => {
    setSelectedProyectoId(proyectoId);
  };

  const handleActivityChange = (activityId: number, activity: GSActivity) => {
    setSelectedActivityId(activityId);
    setFormData((prev) => ({
      ...prev,
      motivo: activity.id === GS_ACTIVITY_OTHER_ID ? '' : activity.label,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (hasErrors) {
      setShowErrors(true);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createViatico({
        userId: currentUser ? String(currentUser.id) : undefined,
        proyectoId: selectedProyectoId || undefined,
        gsActivityId: selectedActivityId ?? undefined,
        motivo: formData.motivo.trim(),
        destino: formData.destino.trim(),
        fechaInicio: formData.fechaInicio,
        fechaFin: formData.fechaFin,
        montoSolicitado: montoValue,
        status: 'pendiente',
        comentarios: formData.comentarios.trim(),
      });

      await syncCoreAppData({ userId: currentUser ? String(currentUser.id) : undefined });
      onCreated({
        ...created,
        userName: created.userName || currentUser?.full_name || created.userId,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo crear el viatico.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 p-6 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Nueva Solicitud de Viático</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form className="p-6 space-y-4" onSubmit={handleSubmit}>
          {/* Proyecto (OBLIGATORIO) */}
          <div className="col-span-2">
            <ProyectoSelector
              value={selectedProyectoId}
              onChange={handleProyectoChange}
              required={proyectoRequerido}
              showCreateOption={false}
              label="Proyecto"
              inputClassName={errors.proyectoId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
            />
            {errors.proyectoId && (
              <p className="mt-1 text-xs text-rose-600">{errors.proyectoId}</p>
            )}
          </div>

          {/* GS Activity */}
          <div className="col-span-2">
            <GSActivitySelector
              value={selectedActivityId}
              onChange={handleActivityChange}
              filterByCategory="travel"
              required={true}
              label="Tipo de Actividad"
              inputClassName={errors.actividadId ? 'border-rose-300 bg-rose-50 ring-rose-200' : ''}
            />
            {errors.actividadId && (
              <p className="mt-1 text-xs text-rose-600">{errors.actividadId}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo del Viaje
              </label>
              <input
                type="text"
                value={formData.motivo}
                onChange={(event) => setFormData((prev) => ({ ...prev, motivo: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.motivo
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder={isOtherActivitySelected ? 'Escribe otro motivo...' : 'Se llena según el tipo de actividad'}
              />
              <p className="mt-1 text-xs text-gray-500">
                Selecciona "Otro" para capturar un motivo personalizado.
              </p>
              {errors.motivo && (
                <p className="mt-1 text-xs text-rose-600">{errors.motivo}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destino
              </label>
              <input
                type="text"
                value={formData.destino}
                onChange={(event) => setFormData((prev) => ({ ...prev, destino: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.destino
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder="Ciudad, Estado"
              />
              {errors.destino && (
                <p className="mt-1 text-xs text-rose-600">{errors.destino}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Inicio
              </label>
              <input
                type="date"
                value={formData.fechaInicio}
                onChange={(event) => setFormData((prev) => ({ ...prev, fechaInicio: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.fechaInicio
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.fechaInicio && (
                <p className="mt-1 text-xs text-rose-600">{errors.fechaInicio}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Fin
              </label>
              <input
                type="date"
                value={formData.fechaFin}
                onChange={(event) => setFormData((prev) => ({ ...prev, fechaFin: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.fechaFin
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.fechaFin && (
                <p className="mt-1 text-xs text-rose-600">{errors.fechaFin}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto Solicitado
              </label>
              <input
                type="number"
                value={formData.montoSolicitado}
                onChange={(event) => setFormData((prev) => ({ ...prev, montoSolicitado: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.montoSolicitado
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder="0.00"
              />
              {errors.montoSolicitado && (
                <p className="mt-1 text-xs text-rose-600">{errors.montoSolicitado}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Requiere Vehículo
              </label>
              <select
                value={formData.requiereVehiculo}
                onChange={(event) => setFormData((prev) => ({ ...prev, requiereVehiculo: event.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="no">No</option>
                <option value="si">Sí</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Detalles / Comentarios
            </label>
            <textarea
              rows={4}
              value={formData.comentarios}
              onChange={(event) => setFormData((prev) => ({ ...prev, comentarios: event.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Descripción detallada del viaje..."
            ></textarea>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface StatusModalProps {
  viatico: Viatico;
  onClose: () => void;
}

function StatusModal({ viatico, onClose }: StatusModalProps) {
  useEscapeKey(onClose);

  const getStatusInfo = (status: string) => {
    const statusInfo = {
      pendiente: {
        color: 'yellow',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        textColor: 'text-yellow-800',
        icon: (
          <svg className="w-12 h-12 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: 'Pendiente de Aprobación',
        description: 'El viático está pendiente de ser revisado y aprobado por el Project Manager.',
      },
      aprobado: {
        color: 'green',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-800',
        icon: (
          <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: 'Aprobado',
        description: 'El viático ha sido aprobado y está listo para dispersión.',
      },
      rechazado: {
        color: 'red',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-800',
        icon: (
          <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: 'Rechazado',
        description: 'El viático fue rechazado por el Project Manager.',
      },
      dispersado: {
        color: 'blue',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-800',
        icon: (
          <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: 'Dispersado',
        description: 'El monto ha sido dispersado al usuario.',
      },
      completado: {
        color: 'purple',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        textColor: 'text-purple-800',
        icon: (
          <svg className="w-12 h-12 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ),
        title: 'Completado',
        description: 'El viático ha sido completado y todos los procesos finalizados.',
      },
    };

    return statusInfo[status as keyof typeof statusInfo] || statusInfo.pendiente;
  };

  const derivedStatus = getDerivedViaticoStatus(viatico);
  const statusInfo = getStatusInfo(derivedStatus);
  const montoGastadoKpi = getViaticoGastadoKpi(viatico);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 p-6 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Informacion del viatico</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Status Actual */}
          <div className={`${statusInfo.bgColor} border ${statusInfo.borderColor} rounded-lg p-6`}>
            <div className="flex items-center space-x-4">
              {statusInfo.icon}
              <div className="flex-1">
                <h3 className={`text-xl font-bold ${statusInfo.textColor}`}>{statusInfo.title}</h3>
                <p className="text-[11px] text-gray-600 mt-0.5">{statusInfo.description}</p>
              </div>
            </div>
          </div>

          {/* Información del Viático */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Viático</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">ID</p>
                <p className="font-semibold text-gray-900">{viatico.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Usuario</p>
                <p className="font-semibold text-gray-900">{viatico.userName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Proyecto</p>
                <p className="font-semibold text-gray-900">
                  {formatProyectoLabel(viatico.proyectoNombre, viatico.proyectoId)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Tipo</p>
                <p className="font-semibold text-gray-900 capitalize">{viatico.tipoViatico}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Destino</p>
                <p className="font-semibold text-gray-900">{viatico.destino}, {viatico.destinoPais}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fechas</p>
                <p className="font-semibold text-gray-900">{viatico.fechaInicio} - {viatico.fechaFin}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Motivo</p>
                <p className="font-semibold text-gray-900">{viatico.motivo}</p>
              </div>
            </div>
          </div>

          {/* Información de Montos */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Montos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Monto Solicitado</p>
                <p className="text-lg font-bold text-gray-900">${viatico.montoSolicitado.toLocaleString()}</p>
              </div>
              {viatico.montoAprobado && (
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Monto Aprobado</p>
                  <p className="text-2xl font-bold text-green-700">${viatico.montoAprobado.toLocaleString()}</p>
                </div>
              )}
              {viatico.montoDispersado && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Monto Dispersado</p>
                  <p className="text-2xl font-bold text-blue-700">${viatico.montoDispersado.toLocaleString()}</p>
                </div>
              )}
              {montoGastadoKpi > 0 && (
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Monto Gastado</p>
                  <p className="text-2xl font-bold text-purple-700">${montoGastadoKpi.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Información de Aprobación */}
          {viatico.aprobadoPor && (
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Aprobación</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div>
                  <p className="text-sm text-gray-600">Aprobado por</p>
                  <p className="font-semibold text-gray-900">{viatico.aprobadoPor}</p>
                </div>
                {viatico.comentarios && (
                  <div>
                    <p className="text-sm text-gray-600">Comentarios</p>
                    <p className="text-gray-900">{viatico.comentarios}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
            <div className="space-y-3">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 mr-3"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Solicitud creada</p>
                  <p className="text-xs text-gray-500">{viatico.createdAt}</p>
                </div>
              </div>
              {derivedStatus !== 'pendiente' && (
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {derivedStatus === 'rechazado' ? 'Rechazado' : 'Aprobado'}
                    </p>
                    <p className="text-xs text-gray-500">Por {viatico.aprobadoPor}</p>
                  </div>
                </div>
              )}
              {derivedStatus === 'dispersado' && (
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Dispersado</p>
                    <p className="text-xs text-gray-500">Monto transferido al usuario</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}



