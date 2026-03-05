import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useLocalStorageState from '../hooks/useLocalStorageState';
import type { DashboardMetrics, Dispersion, Factura, Viatico } from '../types';
import { fetchDashboardMetrics } from '../utils/backendSync';

const emptyMetrics: DashboardMetrics = {
  viaticosActivos: 0,
  viaticosAprobacionPendiente: 0,
  totalDispersado: 0,
  totalRecuperar: 0,
  facturasPendientes: 0,
  alertasConciliacion: 0,
  vehiculosDisponibles: 0,
  vehiculosAsignados: 0,
  alertasMantenimiento: 0,
  gastosAMEXPendientes: 0,
};

type ActivityColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow';

interface DashboardActivity {
  id: string;
  color: ActivityColor;
  title: string;
  description: string;
  timestamp: number;
}

const parseDateToTimestamp = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const formatRelativeTime = (timestamp: number) => {
  if (!timestamp) {
    return 'Sin fecha';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Hace unos segundos';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} dia${days === 1 ? '' : 's'}`;

  return new Date(timestamp).toLocaleDateString('es-MX');
};

const viaticoMetaByStatus: Record<Viatico['status'], { title: string; color: ActivityColor }> = {
  pendiente: { title: 'Viatico solicitado', color: 'blue' },
  aprobado: { title: 'Viatico aprobado', color: 'green' },
  rechazado: { title: 'Viatico rechazado', color: 'red' },
  dispersado: { title: 'Viatico dispersado', color: 'purple' },
  en_viaje: { title: 'Viatico en viaje', color: 'yellow' },
  viaje_finalizado: { title: 'Viaje finalizado', color: 'yellow' },
  en_recuperacion: { title: 'Viatico en recuperacion', color: 'yellow' },
  completado: { title: 'Viatico completado', color: 'green' },
};

const facturaMetaByStatus: Record<Factura['status'], { title: string; color: ActivityColor }> = {
  pendiente: { title: 'Factura pendiente', color: 'yellow' },
  validada: { title: 'Factura validada', color: 'green' },
  rechazada: { title: 'Factura rechazada', color: 'red' },
  conciliada: { title: 'Factura conciliada', color: 'blue' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [viaticos] = useLocalStorageState<Viatico[]>('viaticos:list', []);
  const [dispersiones] = useLocalStorageState<Dispersion[]>('dispersion:dispersiones', []);
  const [facturas] = useLocalStorageState<Factura[]>('conciliacion:facturas', []);
  const canViewRestrictedQuickActions = user?.department === 'finanzas' || user?.department === 'business_intelligence';

  useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      try {
        const data = await fetchDashboardMetrics();
        if (active) {
          setMetrics(data);
        }
      } catch {
        // Keep zeroed metrics if backend is unavailable.
      }
    };

    void loadMetrics();

    return () => {
      active = false;
    };
  }, []);

  const recentActivity = useMemo<DashboardActivity[]>(() => {
    const viaticosActivity = viaticos.map((viatico) => {
      const meta = viaticoMetaByStatus[viatico.status] ?? viaticoMetaByStatus.pendiente;
      return {
        id: `viatico-${viatico.id}`,
        color: meta.color,
        title: meta.title,
        description: `${viatico.userName || 'Usuario'} - ${viatico.destino || 'Sin destino'}`,
        timestamp: parseDateToTimestamp(viatico.createdAt || viatico.fechaInicio),
      };
    });

    const dispersionesActivity = dispersiones.map((dispersion) => ({
      id: `dispersion-${dispersion.id}`,
      color: 'blue' as const,
      title: 'Dispersion realizada',
      description: `$${dispersion.monto.toLocaleString()} - ${dispersion.dispersadoPor || 'Tesoreria'}`,
      timestamp: parseDateToTimestamp(dispersion.fecha),
    }));

    const facturasActivity = facturas.map((factura) => {
      const meta = facturaMetaByStatus[factura.status] ?? facturaMetaByStatus.pendiente;
      return {
        id: `factura-${factura.id}`,
        color: meta.color,
        title: meta.title,
        description: `${factura.razonSocial || 'Sin razon social'} - ${factura.total.toLocaleString()}`,
        timestamp: parseDateToTimestamp(factura.createdAt || factura.fecha),
      };
    });

    return [...viaticosActivity, ...dispersionesActivity, ...facturasActivity]
      .filter((item) => item.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
  }, [dispersiones, facturas, viaticos]);

  return (
    <div className="space-y-2 lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="space-y-2 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-2 lg:space-y-0">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="relative space-y-1">
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel Principal</p>
              <h1 className="text-base sm:text-lg font-semibold text-slate-900">Dashboard</h1>
              <p className="text-[10px] text-slate-600">Vista general del sistema.</p>
            </div>

            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Viaticos Activos"
                value={metrics.viaticosActivos}
                icon="money"
                color="blue"
                subtitle="en proceso"
              />
              <MetricCard
                title="Aprobacion Pendiente"
                value={metrics.viaticosAprobacionPendiente}
                icon="clock"
                color="yellow"
                subtitle="solicitudes"
              />
              <MetricCard
                title="Total Dispersado"
                value={`$${metrics.totalDispersado.toLocaleString()}`}
                icon="chart"
                color="green"
                subtitle="este mes"
              />
              <MetricCard
                title="Total a Recuperar"
                value={`$${metrics.totalRecuperar.toLocaleString()}`}
                icon="return"
                color="orange"
                subtitle="pendiente"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:min-h-0 lg:grid-cols-2">
          <div className="bg-white rounded-lg shadow p-2.5 lg:min-h-0 lg:flex lg:flex-col">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Conciliacion</h2>
            <div className="space-y-1.5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <div className="flex items-center justify-between p-2 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Alertas de Conciliacion</p>
                    <p className="text-xs text-gray-600">{metrics.alertasConciliacion} discrepancias encontradas</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-red-600">{metrics.alertasConciliacion}</span>
              </div>

              <div className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Facturas Pendientes</p>
                    <p className="text-xs text-gray-600">Por validar</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-yellow-600">{metrics.facturasPendientes}</span>
              </div>

              <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Gastos AMEX Pendientes</p>
                    <p className="text-xs text-gray-600">Sin conciliar</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-purple-600">{metrics.gastosAMEXPendientes}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-2.5 lg:min-h-0 lg:flex lg:flex-col">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Flotilla</h2>
            <div className="space-y-1.5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Vehiculos Disponibles</p>
                    <p className="text-xs text-gray-600">Listos para asignar</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-green-600">{metrics.vehiculosDisponibles}</span>
              </div>

              <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Vehiculos Asignados</p>
                    <p className="text-xs text-gray-600">En uso actualmente</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-blue-600">{metrics.vehiculosAsignados}</span>
              </div>

              <div className="flex items-center justify-between p-2 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Alertas de Mantenimiento</p>
                    <p className="text-xs text-gray-600">Requieren atencion</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-orange-600">{metrics.alertasMantenimiento}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-2 lg:grid-cols-3">
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-2.5 lg:min-h-0 lg:flex lg:flex-col">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Actividad Reciente</h2>
            <div className="space-y-1.5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              {recentActivity.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-600">
                  No hay actividad reciente registrada en la base de datos.
                </div>
              ) : (
                recentActivity.map((activity) => (
                  <ActivityItem
                    key={activity.id}
                    color={activity.color}
                    title={activity.title}
                    description={activity.description}
                    time={formatRelativeTime(activity.timestamp)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-2.5 lg:min-h-0 lg:flex lg:flex-col">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Acciones Rapidas</h2>
            <div className="space-y-1.5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <QuickActionButton icon="plus" label="Nueva Solicitud de Viatico" onClick={() => navigate('/mi-portal')} />
              <QuickActionButton icon="upload" label="Cargar Facturas" onClick={() => navigate('/conciliacion')} />
              {canViewRestrictedQuickActions && (
                <>
                  <QuickActionButton icon="send" label="Realizar Dispersion" onClick={() => navigate('/dispersion')} />
                  <QuickActionButton icon="car" label="Asignar Vehiculo" onClick={() => navigate('/flotilla')} />
                  <QuickActionButton icon="document" label="Generar Reporte" onClick={() => navigate('/reportes')} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'orange' | 'red';
  subtitle?: string;
}

function MetricCard({ title, value, color, subtitle }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <button
      type="button"
      className="w-full text-left bg-white rounded-lg shadow p-2 transition hover:-translate-y-0.5 hover:shadow-md select-none"
    >
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium text-gray-600">{title}</h3>
        <div className={`w-7 h-7 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </button>
  );
}

interface ActivityItemProps {
  color: string;
  title: string;
  description: string;
  time: string;
}

function ActivityItem({ color, title, description, time }: ActivityItemProps) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
    yellow: 'bg-yellow-100 text-yellow-600',
  };

  return (
    <div className="flex items-start space-x-2 p-1.5 hover:bg-gray-50 rounded-lg transition-colors">
      <div className={`w-6 h-6 rounded-full ${colorClasses[color]} flex items-center justify-center flex-shrink-0`}>
        <div className="w-1.5 h-1.5 bg-current rounded-full"></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-xs">{title}</p>
        <p className="text-xs text-gray-600 truncate">{description}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{time}</p>
      </div>
    </div>
  );
}

interface QuickActionButtonProps {
  icon: string;
  label: string;
  onClick?: () => void;
}

function QuickActionButton({ label, onClick }: QuickActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center space-x-2 px-3 py-1.5 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 rounded-lg transition-colors text-left"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="font-medium text-xs">{label}</span>
    </button>
  );
}
