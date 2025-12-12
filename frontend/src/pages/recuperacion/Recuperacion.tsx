import { useState } from 'react';
import type { Viatico } from '../../types';

const mockViaticosPendientes: Viatico[] = [
  {
    id: '1',
    userId: 'user1',
    userName: 'Juan Pérez',
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
  },
];

export default function Recuperacion() {
  const [showRecuperacionForm, setShowRecuperacionForm] = useState(false);
  const [selectedViatico, setSelectedViatico] = useState<Viatico | null>(null);

  const handleRecuperar = (viatico: Viatico) => {
    setSelectedViatico(viatico);
    setShowRecuperacionForm(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Recuperación de Saldos</h1>
        <p className="text-gray-600 mt-1">Gestión de recuperación de fondos no utilizados</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pendientes de Recuperar</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{mockViaticosPendientes.length}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total a Recuperar</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                ${mockViaticosPendientes.reduce((sum, v) => sum + (v.saldoRestante || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Recuperado Este Mes</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">$8,400</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Viáticos con Saldo Pendiente</h2>
          <p className="text-sm text-gray-600 mt-1">Viajes finalizados con fondos por recuperar</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Viático
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Dispersado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Gastado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo a Recuperar
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
                    <p className="text-xs text-gray-500">{viatico.destino}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">${viatico.montoDispersado?.toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">${viatico.montoGastado?.toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm font-bold text-orange-600">${viatico.saldoRestante?.toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleRecuperar(viatico)}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                    >
                      Recuperar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showRecuperacionForm && selectedViatico && (
        <RecuperacionModal
          viatico={selectedViatico}
          onClose={() => {
            setShowRecuperacionForm(false);
            setSelectedViatico(null);
          }}
        />
      )}
    </div>
  );
}

interface RecuperacionModalProps {
  viatico: Viatico;
  onClose: () => void;
}

function RecuperacionModal({ viatico, onClose }: RecuperacionModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Recuperar Saldo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">Resumen del Viático</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Usuario:</p>
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

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-600">Dispersado</p>
                  <p className="text-lg font-bold text-blue-600">${viatico.montoDispersado?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Gastado</p>
                  <p className="text-lg font-bold text-green-600">${viatico.montoGastado?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">A Recuperar</p>
                  <p className="text-lg font-bold text-orange-600">${viatico.saldoRestante?.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto a Recuperar
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  defaultValue={viatico.saldoRestante}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Recuperación
              </label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="transferencia">Transferencia Bancaria</option>
                <option value="efectivo">Efectivo</option>
                <option value="descuento_nomina">Descuento en Nómina</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Referencia / Comprobante
              </label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Número de referencia"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas
              </label>
              <textarea
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Detalles sobre la recuperación..."
              ></textarea>
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
            className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
          >
            Confirmar Recuperación
          </button>
        </div>
      </div>
    </div>
  );
}
