import type { DashboardMetrics } from '../types';

const mockMetrics: DashboardMetrics = {
  viaticosActivos: 12,
  viaticosAprobacionPendiente: 3,
  totalDispersado: 456000,
  totalRecuperar: 23400,
  facturasPendientes: 8,
  alertasConciliacion: 5,
  vehiculosDisponibles: 4,
  vehiculosAsignados: 8,
  alertasMantenimiento: 2,
  gastosAMEXPendientes: 6,
};

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Vista general del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Viáticos Activos"
          value={mockMetrics.viaticosActivos}
          icon="money"
          color="blue"
          subtitle="en proceso"
        />
        <MetricCard
          title="Aprobación Pendiente"
          value={mockMetrics.viaticosAprobacionPendiente}
          icon="clock"
          color="yellow"
          subtitle="solicitudes"
        />
        <MetricCard
          title="Total Dispersado"
          value={`$${mockMetrics.totalDispersado.toLocaleString()}`}
          icon="chart"
          color="green"
          subtitle="este mes"
        />
        <MetricCard
          title="Total a Recuperar"
          value={`$${mockMetrics.totalRecuperar.toLocaleString()}`}
          icon="return"
          color="orange"
          subtitle="pendiente"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Conciliación</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Alertas de Conciliación</p>
                  <p className="text-sm text-gray-600">{mockMetrics.alertasConciliacion} discrepancias encontradas</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-red-600">{mockMetrics.alertasConciliacion}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Facturas Pendientes</p>
                  <p className="text-sm text-gray-600">Por validar</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-yellow-600">{mockMetrics.facturasPendientes}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Gastos AMEX Pendientes</p>
                  <p className="text-sm text-gray-600">Sin conciliar</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-purple-600">{mockMetrics.gastosAMEXPendientes}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Flotilla</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Vehículos Disponibles</p>
                  <p className="text-sm text-gray-600">Listos para asignar</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-green-600">{mockMetrics.vehiculosDisponibles}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Vehículos Asignados</p>
                  <p className="text-sm text-gray-600">En uso actualmente</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-blue-600">{mockMetrics.vehiculosAsignados}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Alertas de Mantenimiento</p>
                  <p className="text-sm text-gray-600">Requieren atención</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-orange-600">{mockMetrics.alertasMantenimiento}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actividad Reciente</h2>
          <div className="space-y-3">
            <ActivityItem
              icon="check"
              color="green"
              title="Viático aprobado"
              description="Juan Pérez - Viaje a Guadalajara"
              time="Hace 10 minutos"
            />
            <ActivityItem
              icon="money"
              color="blue"
              title="Dispersión realizada"
              description="$12,500 - María González"
              time="Hace 1 hora"
            />
            <ActivityItem
              icon="alert"
              color="red"
              title="Alerta de conciliación"
              description="Factura sin consumo asociado"
              time="Hace 2 horas"
            />
            <ActivityItem
              icon="car"
              color="purple"
              title="Vehículo asignado"
              description="Toyota Corolla - ABC-123"
              time="Hace 3 horas"
            />
            <ActivityItem
              icon="document"
              color="yellow"
              title="Nueva factura cargada"
              description="CFDI validado correctamente"
              time="Hace 4 horas"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h2>
          <div className="space-y-2">
            <QuickActionButton icon="plus" label="Nueva Solicitud de Viático" />
            <QuickActionButton icon="upload" label="Cargar Facturas" />
            <QuickActionButton icon="send" label="Realizar Dispersión" />
            <QuickActionButton icon="car" label="Asignar Vehículo" />
            <QuickActionButton icon="document" label="Generar Reporte" />
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className={`w-10 h-10 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

interface ActivityItemProps {
  icon: string;
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
    <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className={`w-8 h-8 rounded-full ${colorClasses[color]} flex items-center justify-center flex-shrink-0`}>
        <div className="w-2 h-2 bg-current rounded-full"></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{title}</p>
        <p className="text-sm text-gray-600 truncate">{description}</p>
        <p className="text-xs text-gray-500 mt-1">{time}</p>
      </div>
    </div>
  );
}

interface QuickActionButtonProps {
  icon: string;
  label: string;
}

function QuickActionButton({ label }: QuickActionButtonProps) {
  return (
    <button className="w-full flex items-center space-x-3 px-4 py-3 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 rounded-lg transition-colors text-left">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}
