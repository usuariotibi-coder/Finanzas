import { useState } from 'react';
import type { VehicleAlert, MaintenanceRecord } from '../../types';
import { formatCurrency } from '../../utils/exportExcel';

interface MenuMantenimientoProps {
  alerts: VehicleAlert[];
  maintenanceHistory: MaintenanceRecord[];
  onScheduleService: (alertId: string) => void;
  onCompleteService: (alertId: string) => void;
}

type TabType = 'preventivo' | 'predictivo' | 'correctivo' | 'otros';

export default function MenuMantenimiento({
  alerts,
  maintenanceHistory,
  onScheduleService,
  onCompleteService,
}: MenuMantenimientoProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preventivo');

  // Filtrar alertas por tipo de mantenimiento
  const alertasPreventivas = alerts.filter(a => a.tipoMantenimiento === 'preventivo');
  const alertasPredictivas = alerts.filter(a => a.tipoMantenimiento === 'predictivo');
  const alertasCorrectivas = alerts.filter(a => a.tipoMantenimiento === 'correctivo');
  const alertasOtros = alerts.filter(
    a => ['seguro', 'verificacion', 'placas'].includes(a.tipoAlerta)
  );

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <TabButton
              label="Preventivo"
              count={alertasPreventivas.length}
              isActive={activeTab === 'preventivo'}
              onClick={() => setActiveTab('preventivo')}
              color="blue"
            />
            <TabButton
              label="Predictivo"
              count={alertasPredictivas.length}
              isActive={activeTab === 'predictivo'}
              onClick={() => setActiveTab('predictivo')}
              color="purple"
            />
            <TabButton
              label="Correctivo"
              count={alertasCorrectivas.length}
              isActive={activeTab === 'correctivo'}
              onClick={() => setActiveTab('correctivo')}
              color="red"
            />
            <TabButton
              label="Otros"
              count={alertasOtros.length}
              isActive={activeTab === 'otros'}
              onClick={() => setActiveTab('otros')}
              color="gray"
            />
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'preventivo' && (
            <MantenimientoPreventivo
              alertas={alertasPreventivas}
              historial={maintenanceHistory.filter(h => h.tipo === 'preventivo')}
              onSchedule={onScheduleService}
              onComplete={onCompleteService}
            />
          )}
          {activeTab === 'predictivo' && (
            <MantenimientoPredictivo
              alertas={alertasPredictivas}
              historial={maintenanceHistory.filter(h => h.tipo === 'predictivo')}
              onSchedule={onScheduleService}
              onComplete={onCompleteService}
            />
          )}
          {activeTab === 'correctivo' && (
            <MantenimientoCorrectivo
              alertas={alertasCorrectivas}
              historial={maintenanceHistory.filter(h => h.tipo === 'correctivo')}
              onSchedule={onScheduleService}
              onComplete={onCompleteService}
            />
          )}
          {activeTab === 'otros' && (
            <MantenimientoOtros
              alertas={alertasOtros}
              onSchedule={onScheduleService}
              onComplete={onCompleteService}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  color: 'blue' | 'purple' | 'red' | 'gray';
}

function TabButton({ label, count, isActive, onClick, color }: TabButtonProps) {
  const colorClasses = {
    blue: isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
    purple: isActive ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
    red: isActive ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
    gray: isActive ? 'border-gray-500 text-gray-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
  };

  const badgeColorClasses = {
    blue: isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600',
    purple: isActive ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600',
    red: isActive ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600',
    gray: isActive ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600',
  };

  return (
    <button
      onClick={onClick}
      className={`${colorClasses[color]} whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className={`${badgeColorClasses[color]} px-2 py-0.5 rounded-full text-xs font-semibold`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Mantenimiento Preventivo
interface MantenimientosProp {
  alertas: VehicleAlert[];
  historial: MaintenanceRecord[];
  onSchedule: (alertId: string) => void;
  onComplete: (alertId: string) => void;
}

function MantenimientoPreventivo({ alertas, historial, onSchedule, onComplete }: MantenimientosProp) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-blue-800">Mantenimiento Preventivo</h4>
            <p className="text-sm text-blue-700 mt-1">
              Servicios programados cada X kilómetros o meses según el fabricante.
              Incluye cambios de aceite, filtros, balatas, afinaciones, etc.
            </p>
          </div>
        </div>
      </div>

      {/* Próximos Servicios */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Próximos Servicios</h3>
        {alertas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertas.map(alerta => (
              <AlertCard
                key={alerta.id}
                alerta={alerta}
                onSchedule={onSchedule}
                onComplete={onComplete}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500">No hay servicios preventivos pendientes</p>
          </div>
        )}
      </div>

      {/* Historial */}
      <HistorialMantenimiento historial={historial} />
    </div>
  );
}

// Mantenimiento Predictivo
function MantenimientoPredictivo({ alertas, historial, onSchedule, onComplete }: MantenimientosProp) {
  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-purple-800">Mantenimiento Predictivo</h4>
            <p className="text-sm text-purple-700 mt-1">
              Basado en sensores, indicadores y análisis del estado actual del vehículo.
              Incluye alertas de desgaste de frenos, batería baja, llantas, vibraciones, etc.
            </p>
          </div>
        </div>
      </div>

      {/* Alertas Activas */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Alertas Activas</h3>
        {alertas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertas.map(alerta => (
              <AlertCard
                key={alerta.id}
                alerta={alerta}
                onSchedule={onSchedule}
                onComplete={onComplete}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500">No hay alertas predictivas activas</p>
          </div>
        )}
      </div>

      {/* Historial */}
      <HistorialMantenimiento historial={historial} />
    </div>
  );
}

// Mantenimiento Correctivo
function MantenimientoCorrectivo({ alertas, historial, onSchedule, onComplete }: MantenimientosProp) {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-red-800">Mantenimiento Correctivo</h4>
            <p className="text-sm text-red-700 mt-1">
              Reparaciones por fallas o averías. Incluye reparación de motor, transmisión,
              suspensión, sistema eléctrico, aire acondicionado, etc.
            </p>
          </div>
        </div>
      </div>

      {/* Reparaciones Pendientes */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reparaciones Pendientes</h3>
        {alertas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertas.map(alerta => (
              <AlertCard
                key={alerta.id}
                alerta={alerta}
                onSchedule={onSchedule}
                onComplete={onComplete}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500">No hay reparaciones correctivas pendientes</p>
          </div>
        )}
      </div>

      {/* Historial de Fallas */}
      <HistorialMantenimiento historial={historial} title="Historial de Fallas" />
    </div>
  );
}

// Mantenimiento Otros
interface MantenimientoOtrosProps {
  alertas: VehicleAlert[];
  onSchedule: (alertId: string) => void;
  onComplete: (alertId: string) => void;
}

function MantenimientoOtros({ alertas, onSchedule, onComplete }: MantenimientoOtrosProps) {
  const alertasSeguro = alertas.filter(a => a.tipoAlerta === 'seguro');
  const alertasVerificacion = alertas.filter(a => a.tipoAlerta === 'verificacion');
  const alertasPlacas = alertas.filter(a => a.tipoAlerta === 'placas');

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-gray-800">Otros Trámites y Renovaciones</h4>
            <p className="text-sm text-gray-700 mt-1">
              Trámites administrativos: seguros, verificación vehicular, renovación de placas, etc.
            </p>
          </div>
        </div>
      </div>

      {/* Seguros */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Seguros ({alertasSeguro.length})
        </h3>
        {alertasSeguro.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertasSeguro.map(alerta => (
              <AlertCard key={alerta.id} alerta={alerta} onSchedule={onSchedule} onComplete={onComplete} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4">No hay renovaciones de seguro pendientes</p>
        )}
      </div>

      {/* Verificación */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Verificación Vehicular ({alertasVerificacion.length})
        </h3>
        {alertasVerificacion.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertasVerificacion.map(alerta => (
              <AlertCard key={alerta.id} alerta={alerta} onSchedule={onSchedule} onComplete={onComplete} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4">No hay verificaciones pendientes</p>
        )}
      </div>

      {/* Placas */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Renovación de Placas ({alertasPlacas.length})
        </h3>
        {alertasPlacas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertasPlacas.map(alerta => (
              <AlertCard key={alerta.id} alerta={alerta} onSchedule={onSchedule} onComplete={onComplete} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4">No hay renovaciones de placas pendientes</p>
        )}
      </div>
    </div>
  );
}

// Alert Card
interface AlertCardProps {
  alerta: VehicleAlert;
  onSchedule: (alertId: string) => void;
  onComplete: (alertId: string) => void;
}

function AlertCard({ alerta, onSchedule, onComplete }: AlertCardProps) {
  const severity = alerta.severity ?? 'low';
  const getSeverityColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'high':
        return 'bg-orange-50 border-orange-200';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getSeverityColor(severity)}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h4 className="text-sm font-semibold text-gray-900">{alerta.type}</h4>
            <span className={`px-2 py-0.5 text-xs rounded ${
              severity === 'critical'
                ? 'bg-red-200 text-red-800'
                : severity === 'high'
                ? 'bg-orange-200 text-orange-800'
                : severity === 'medium'
                ? 'bg-yellow-200 text-yellow-800'
                : 'bg-blue-200 text-blue-800'
            }`}>
              {severity === 'critical'
                ? 'Crítico'
                : severity === 'high'
                ? 'Alto'
                : severity === 'medium'
                ? 'Medio'
                : 'Bajo'}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">{alerta.message}</p>
          {alerta.dueDate && (
            <p className="text-xs text-gray-600 mt-1">
              Vence: {new Date(alerta.dueDate).toLocaleDateString('es-MX')}
            </p>
          )}
          {alerta.costoEstimado && (
            <p className="text-xs text-gray-600 mt-1">
              Costo estimado: {formatCurrency(alerta.costoEstimado)}
            </p>
          )}
          {alerta.proveedorSugerido && (
            <p className="text-xs text-gray-600">
              Proveedor sugerido: {alerta.proveedorSugerido}
            </p>
          )}
        </div>
        <div className="ml-4 flex space-x-2">
          <button
            onClick={() => onSchedule(alerta.id)}
            className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
          >
            Agendar
          </button>
          <button
            onClick={() => onComplete(alerta.id)}
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded transition-colors"
          >
            Completar
          </button>
        </div>
      </div>
    </div>
  );
}

// Historial Component
interface HistorialMantenimientoProps {
  historial: MaintenanceRecord[];
  title?: string;
}

function HistorialMantenimiento({ historial, title = 'Historial' }: HistorialMantenimientoProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {historial.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {historial.slice(0, 5).map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {new Date(record.fecha).toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{record.descripcion}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {formatCurrency(record.costo)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{record.proveedor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">No hay historial registrado</p>
        </div>
      )}
    </div>
  );
}
