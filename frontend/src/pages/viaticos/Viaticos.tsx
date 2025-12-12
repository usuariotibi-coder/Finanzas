import { useState } from 'react';
import type { Viatico, Proyecto } from '../../types';
import type { GSActivity } from '../../data/gsActivities';
import ProyectoSelector from '../../components/common/ProyectoSelector';
import GSActivitySelector from '../../components/common/GSActivitySelector';

const mockViaticos: Viatico[] = [
  {
    id: '1',
    userId: 'user1',
    userName: 'Juan Pérez',
    proyectoId: 'PRJ-001',
    proyectoNombre: 'Obra Aeropuerto TLM',
    gsActivityId: 1,
    motivo: 'Reunión con clientes',
    destino: 'Guadalajara, Jalisco',
    fechaInicio: '2025-12-15',
    fechaFin: '2025-12-17',
    montoSolicitado: 15000,
    montoAprobado: 14000,
    montoDispersado: 14000,
    montoGastado: 12500,
    saldoRestante: 1500,
    status: 'dispersado',
    createdAt: '2025-12-10',
    aprobadoPor: 'María González',
  },
  {
    id: '2',
    userId: 'user2',
    userName: 'Ana Martínez',
    proyectoId: 'PRJ-002',
    proyectoNombre: 'Proyecto Houston',
    gsActivityId: 13,
    motivo: 'Capacitación técnica',
    destino: 'Monterrey, N.L.',
    fechaInicio: '2025-12-20',
    fechaFin: '2025-12-22',
    montoSolicitado: 18000,
    status: 'pendiente',
    createdAt: '2025-12-11',
  },
  {
    id: '3',
    userId: 'user3',
    userName: 'Carlos López',
    proyectoId: 'PRJ-003',
    proyectoNombre: 'Proyecto GDL',
    gsActivityId: 1,
    motivo: 'Auditoría de sucursal',
    destino: 'Puebla, Puebla',
    fechaInicio: '2025-12-13',
    fechaFin: '2025-12-15',
    montoSolicitado: 12000,
    montoAprobado: 12000,
    status: 'aprobado',
    createdAt: '2025-12-09',
    aprobadoPor: 'María González',
  },
];

export default function Viaticos() {
  const [showNewForm, setShowNewForm] = useState(false);
  const [filter, setFilter] = useState<'todos' | 'pendiente' | 'aprobado' | 'dispersado' | 'completado'>('todos');

  const filteredViaticos = filter === 'todos'
    ? mockViaticos
    : mockViaticos.filter(v => v.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Viáticos</h1>
          <p className="text-gray-600 mt-1">Gestión de solicitudes de viáticos</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Nueva Solicitud</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          label="Total"
          value={mockViaticos.length}
          active={filter === 'todos'}
          onClick={() => setFilter('todos')}
        />
        <StatCard
          label="Pendientes"
          value={mockViaticos.filter(v => v.status === 'pendiente').length}
          color="yellow"
          active={filter === 'pendiente'}
          onClick={() => setFilter('pendiente')}
        />
        <StatCard
          label="Aprobados"
          value={mockViaticos.filter(v => v.status === 'aprobado').length}
          color="green"
          active={filter === 'aprobado'}
          onClick={() => setFilter('aprobado')}
        />
        <StatCard
          label="Dispersados"
          value={mockViaticos.filter(v => v.status === 'dispersado').length}
          color="blue"
          active={filter === 'dispersado'}
          onClick={() => setFilter('dispersado')}
        />
        <StatCard
          label="Completados"
          value={mockViaticos.filter(v => v.status === 'completado').length}
          color="purple"
          active={filter === 'completado'}
          onClick={() => setFilter('completado')}
        />
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
              {filteredViaticos.map((viatico) => (
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
                    <p className="text-sm font-medium text-gray-900">{viatico.proyectoNombre}</p>
                    <p className="text-xs text-gray-500">{viatico.proyectoId}</p>
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
                    <StatusBadge status={viatico.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-primary-600 hover:text-primary-900 mr-3">
                      Ver
                    </button>
                    {viatico.status === 'pendiente' && (
                      <>
                        <button className="text-green-600 hover:text-green-900 mr-3">
                          Aprobar
                        </button>
                        <button className="text-red-600 hover:text-red-900">
                          Rechazar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNewForm && (
        <NewViaticoModal onClose={() => setShowNewForm(false)} />
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
    gray: active ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200',
    yellow: active ? 'bg-yellow-100 border-yellow-300' : 'bg-white border-gray-200',
    green: active ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200',
    blue: active ? 'bg-blue-100 border-blue-300' : 'bg-white border-gray-200',
    purple: active ? 'bg-purple-100 border-purple-300' : 'bg-white border-gray-200',
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${colorClasses[color]}`}
    >
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
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

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendiente;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      {config.label}
    </span>
  );
}

interface NewViaticoModalProps {
  onClose: () => void;
}

function NewViaticoModal({ onClose }: NewViaticoModalProps) {
  const [selectedProyectoId, setSelectedProyectoId] = useState<string>('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  const handleProyectoChange = (proyectoId: string, proyecto: Proyecto | null) => {
    setSelectedProyectoId(proyectoId);
  };

  const handleActivityChange = (activityId: number, activity: GSActivity) => {
    setSelectedActivityId(activityId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Nueva Solicitud de Viático</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form className="p-6 space-y-6">
          {/* Proyecto (OBLIGATORIO) */}
          <div className="col-span-2">
            <ProyectoSelector
              value={selectedProyectoId}
              onChange={handleProyectoChange}
              required={true}
              label="Proyecto"
            />
          </div>

          {/* GS Activity */}
          <div className="col-span-2">
            <GSActivitySelector
              value={selectedActivityId}
              onChange={handleActivityChange}
              filterByCategory="travel"
              required={true}
              label="Tipo de Actividad"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo del Viaje
              </label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Ej: Reunión con clientes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destino
              </label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Ciudad, Estado"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Inicio
              </label>
              <input
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Fin
              </label>
              <input
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto Solicitado
              </label>
              <input
                type="number"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Requiere Vehículo
              </label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Descripción detallada del viaje..."
            ></textarea>
          </div>

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
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Enviar Solicitud
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
