import { useState } from 'react';
import type { Dispersion as DispersionType, Viatico } from '../../types';

const mockViaticosPendientes: Viatico[] = [
  {
    id: '3',
    userId: 'user3',
    userName: 'Carlos López',
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
  {
    id: '4',
    userId: 'user4',
    userName: 'Laura Sánchez',
    motivo: 'Visita a proveedor',
    destino: 'Querétaro, Qro',
    fechaInicio: '2025-12-16',
    fechaFin: '2025-12-17',
    montoSolicitado: 8000,
    montoAprobado: 8000,
    status: 'aprobado',
    createdAt: '2025-12-10',
    aprobadoPor: 'María González',
  },
];

const mockDispersiones: DispersionType[] = [
  {
    id: 'd1',
    viaticoId: '1',
    monto: 14000,
    fecha: '2025-12-11',
    metodoPago: 'transferencia',
    referencia: 'TRANS-2025-001',
    confirmado: true,
    dispersadoPor: 'María González',
  },
  {
    id: 'd2',
    viaticoId: '5',
    monto: 10000,
    fecha: '2025-12-10',
    metodoPago: 'transferencia',
    referencia: 'TRANS-2025-002',
    confirmado: true,
    dispersadoPor: 'María González',
  },
];

export default function Dispersion() {
  const [showDispersionForm, setShowDispersionForm] = useState(false);
  const [selectedViatico, setSelectedViatico] = useState<Viatico | null>(null);

  const handleDisperse = (viatico: Viatico) => {
    setSelectedViatico(viatico);
    setShowDispersionForm(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dispersión de Viáticos</h1>
        <p className="text-gray-600 mt-1">Gestión de dispersión de fondos aprobados</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          label="Pendientes de Dispersar"
          value={mockViaticosPendientes.length}
          color="yellow"
          icon="clock"
        />
        <MetricCard
          label="Dispersados Hoy"
          value={1}
          color="green"
          icon="check"
        />
        <MetricCard
          label="Total Dispersado"
          value={`$${mockDispersiones.reduce((sum, d) => sum + d.monto, 0).toLocaleString()}`}
          color="blue"
          icon="money"
        />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Viáticos Pendientes de Dispersar</h2>
          <p className="text-sm text-gray-600 mt-1">Viáticos aprobados listos para dispersión</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Solicitante
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Motivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destino
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Aprobado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha Viaje
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockViaticosPendientes.map((viatico) => (
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
                    <p className="text-sm text-gray-900">{viatico.motivo}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{viatico.destino}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm font-semibold text-green-600">
                      ${viatico.montoAprobado?.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">{viatico.fechaInicio}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleDisperse(viatico)}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                    >
                      Dispersar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Historial de Dispersiones</h2>
          <p className="text-sm text-gray-600 mt-1">Últimas dispersiones realizadas</p>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {mockDispersiones.map((dispersion) => (
              <DispersionCard key={dispersion.id} dispersion={dispersion} />
            ))}
          </div>
        </div>
      </div>

      {showDispersionForm && selectedViatico && (
        <DispersionModal
          viatico={selectedViatico}
          onClose={() => {
            setShowDispersionForm(false);
            setSelectedViatico(null);
          }}
        />
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  color: 'yellow' | 'green' | 'blue';
  icon: string;
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

interface DispersionCardProps {
  dispersion: DispersionType;
}

function DispersionCard({ dispersion }: DispersionCardProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-gray-900">Dispersión #{dispersion.id}</p>
          <p className="text-sm text-gray-600">Viático ID: {dispersion.viaticoId}</p>
          <p className="text-xs text-gray-500 mt-1">
            {dispersion.metodoPago.toUpperCase()} - {dispersion.referencia}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-green-600">${dispersion.monto.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{dispersion.fecha}</p>
        <p className="text-xs text-gray-600 mt-1">Por: {dispersion.dispersadoPor}</p>
      </div>
    </div>
  );
}

interface DispersionModalProps {
  viatico: Viatico;
  onClose: () => void;
}

function DispersionModal({ viatico, onClose }: DispersionModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Dispersar Viático</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">Información del Viático</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Solicitante:</p>
                <p className="font-medium text-gray-900">{viatico.userName}</p>
              </div>
              <div>
                <p className="text-gray-600">ID Viático:</p>
                <p className="font-medium text-gray-900">{viatico.id}</p>
              </div>
              <div>
                <p className="text-gray-600">Motivo:</p>
                <p className="font-medium text-gray-900">{viatico.motivo}</p>
              </div>
              <div>
                <p className="text-gray-600">Destino:</p>
                <p className="font-medium text-gray-900">{viatico.destino}</p>
              </div>
            </div>
          </div>

          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto a Dispersar
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  defaultValue={viatico.montoAprobado}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  readOnly
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Pago
              </label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="transferencia">Transferencia Bancaria</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta Empresarial</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Referencia / Número de Operación
              </label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Ej: TRANS-2025-003"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas Adicionales
              </label>
              <textarea
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Comentarios sobre la dispersión..."
              ></textarea>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-yellow-800">
                    Se enviará una notificación automática al usuario una vez confirmada la dispersión.
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            Confirmar Dispersión
          </button>
        </div>
      </div>
    </div>
  );
}
