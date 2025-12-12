import { useMemo } from 'react';
import type { CargaGasolina, Vehicle } from '../../types';
import { formatCurrency } from '../../utils/exportExcel';

interface GasolinaKPIProps {
  cargas: CargaGasolina[];
  vehicles: Vehicle[];
}

export default function GasolinaKPI({ cargas, vehicles }: GasolinaKPIProps) {
  // Calcular métricas
  const metrics = useMemo(() => {
    const totalLitros = cargas.reduce((sum, c) => sum + c.litros, 0);
    const totalGasto = cargas.reduce((sum, c) => sum + c.total, 0);

    // Eficiencia por vehículo
    const eficienciaPorVehiculo = vehicles.map(vehicle => {
      const cargasVehiculo = cargas.filter(c => c.vehicleId === vehicle.id);
      if (cargasVehiculo.length === 0) return null;

      const totalLitrosVehiculo = cargasVehiculo.reduce((sum, c) => sum + c.litros, 0);
      const totalGastoVehiculo = cargasVehiculo.reduce((sum, c) => sum + c.total, 0);

      // Calcular KM recorridos entre cargas
      let kmRecorridos = 0;
      if (cargasVehiculo.length > 1) {
        const cargasOrdenadas = [...cargasVehiculo].sort((a, b) =>
          new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        );
        kmRecorridos = cargasOrdenadas[cargasOrdenadas.length - 1].odometro - cargasOrdenadas[0].odometro;
      }

      const eficiencia = kmRecorridos > 0 ? kmRecorridos / totalLitrosVehiculo : 0;

      return {
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.brand} ${vehicle.model} (${vehicle.plates})`,
        litros: totalLitrosVehiculo,
        gasto: totalGastoVehiculo,
        eficiencia: eficiencia,
        numCargas: cargasVehiculo.length,
      };
    }).filter(v => v !== null);

    // Ordenar por gasto (de mayor a menor)
    const ranking = [...eficienciaPorVehiculo].sort((a, b) => b!.gasto - a!.gasto);

    // Calcular promedio de eficiencia
    const eficienciaPromedio = eficienciaPorVehiculo.length > 0
      ? eficienciaPorVehiculo.reduce((sum, v) => sum + (v?.eficiencia || 0), 0) / eficienciaPorVehiculo.length
      : 0;

    // Detectar consumos anormales (>20% sobre promedio de gasto)
    const gastoPromedio = eficienciaPorVehiculo.length > 0
      ? eficienciaPorVehiculo.reduce((sum, v) => sum + (v?.gasto || 0), 0) / eficienciaPorVehiculo.length
      : 0;

    const alertasConsumo = eficienciaPorVehiculo.filter(v => {
      if (!v) return false;
      return v.gasto > gastoPromedio * 1.2;
    });

    return {
      totalLitros,
      totalGasto,
      eficienciaPromedio,
      ranking: ranking as typeof eficienciaPorVehiculo,
      alertasConsumo: alertasConsumo as typeof eficienciaPorVehiculo,
    };
  }, [cargas, vehicles]);

  return (
    <div className="space-y-6">
      {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard
          label="Consumo Total del Mes"
          value={`${metrics.totalLitros.toFixed(1)} L`}
          subtitle={formatCurrency(metrics.totalGasto)}
          color="blue"
          icon="fuel"
        />
        <MetricCard
          label="Eficiencia Promedio"
          value={`${metrics.eficienciaPromedio.toFixed(2)} km/L`}
          subtitle="Promedio de flotilla"
          color="green"
          icon="chart"
        />
        <MetricCard
          label="Total de Cargas"
          value={cargas.length}
          subtitle="Cargas este mes"
          color="purple"
          icon="count"
        />
        <MetricCard
          label="Alertas de Consumo"
          value={metrics.alertasConsumo.length}
          subtitle=">20% sobre promedio"
          color={metrics.alertasConsumo.length > 0 ? 'red' : 'green'}
          icon="alert"
        />
      </div>

      {/* Alertas de Consumo Anormal */}
      {metrics.alertasConsumo.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-semibold text-red-800 mb-2">
                Alertas de Consumo Anormal Detectadas
              </h3>
              <ul className="space-y-1">
                {metrics.alertasConsumo.map((alerta) => (
                  <li key={alerta.vehicleId} className="text-sm text-red-700">
                    • <strong>{alerta.vehicleName}</strong>: {formatCurrency(alerta.gasto)}
                    ({alerta.litros.toFixed(1)} L, {alerta.numCargas} cargas)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking por Gasto */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Ranking por Gasto</h3>
            <p className="text-sm text-gray-600 mt-1">Vehículos ordenados por consumo de gasolina</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {metrics.ranking.map((item, index) => (
                <div key={item!.vehicleId} className="flex items-center">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-700">#{index + 1}</span>
                  </div>
                  <div className="ml-4 flex-1">
                    <p className="text-sm font-medium text-gray-900">{item!.vehicleName}</p>
                    <div className="flex items-center space-x-4 mt-1">
                      <p className="text-xs text-gray-500">
                        {item!.litros.toFixed(1)} L
                      </p>
                      <p className="text-xs text-gray-500">
                        {item!.numCargas} cargas
                      </p>
                      <p className="text-xs text-gray-500">
                        {item!.eficiencia > 0 ? `${item!.eficiencia.toFixed(2)} km/L` : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(item!.gasto)}</p>
                  </div>
                </div>
              ))}
              {metrics.ranking.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No hay datos de consumo registrados</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gráfica de Barras (Simulada con CSS) */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Consumo por Vehículo</h3>
            <p className="text-sm text-gray-600 mt-1">Comparativa visual de litros consumidos</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {metrics.ranking.map((item) => {
                const maxLitros = Math.max(...metrics.ranking.map(r => r!.litros));
                const porcentaje = (item!.litros / maxLitros) * 100;

                return (
                  <div key={item!.vehicleId}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">
                        {item!.vehicleName.split('(')[0].trim()}
                      </p>
                      <p className="text-xs text-gray-600">{item!.litros.toFixed(1)} L</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                        style={{ width: `${porcentaje}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              {metrics.ranking.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No hay datos para mostrar</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabla Detallada de Cargas */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Detalle de Cargas de Gasolina</h3>
          <p className="text-sm text-gray-600 mt-1">Historial completo de cargas del mes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehículo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estación
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Litros
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio/L
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Odómetro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Factura
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cargas.map((carga) => {
                const vehicle = vehicles.find(v => v.id === carga.vehicleId);
                return (
                  <tr key={carga.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">
                        {new Date(carga.fecha).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Desconocido'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {vehicle?.plates}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{carga.estacion}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-900">{carga.litros.toFixed(2)} L</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700">{formatCurrency(carga.precioLitro)}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(carga.total)}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700">{carga.odometro.toLocaleString()} km</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {carga.facturaId ? (
                        <div className="flex items-center text-green-600">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-xs">Sí</span>
                        </div>
                      ) : (
                        <span className="text-xs text-yellow-600">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  icon: string;
}

function MetricCard({ label, value, subtitle, color }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600">{label}</p>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className={`w-10 h-10 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <div className="w-2 h-2 bg-current rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
