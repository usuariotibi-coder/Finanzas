import { useState, useMemo } from 'react';
import type { TicketAMEX, TarjetaAMEX, Proyecto } from '../../types';
import type { GSActivity } from '../../data/gsActivities';
import { TARJETAS_AMEX } from '../../data/tarjetasAMEX';
import { CUENTAS_CONTABLES } from '../../data/cuentasContables';
import { clasificarGastoAuto, aprenderPatron } from '../../utils/clasificadorContable';
import { exportToExcel, formatCurrency, formatDate } from '../../utils/exportExcel';
import ProyectoSelector from '../../components/common/ProyectoSelector';
import GSActivitySelector from '../../components/common/GSActivitySelector';

// Mock data con todos los campos nuevos
const mockTickets: TicketAMEX[] = [
  {
    id: 't1',
    userId: 'user1',
    fecha: '2025-11-28',
    comercio: 'Marriott Cancun',
    monto: 12500,
    categoria: 'Hospedaje',
    matched: true,
    autorizado: true,
    duplicado: false,
    facturaId: 'f10',
    cardNumber: '1001',
    cardHolder: 'Francisco Aguilar',
    cuentaContable: '5450',
    proyectoId: 'PRJ-001',
    proyectoNombre: 'Obra Aeropuerto TLM',
    gsActivityId: 1,
    proyecto: 'Obra Aeropuerto TLM',
    paisComercio: 'México',
    clasificacionAuto: true,
  },
  {
    id: 't2',
    userId: 'user2',
    fecha: '2025-12-05',
    comercio: 'Uber USA',
    monto: 850,
    categoria: 'Transporte',
    matched: false,
    autorizado: true,
    duplicado: false,
    cardNumber: '1002',
    cardHolder: 'Luis Kuara',
    cuentaContable: '5450',
    proyectoId: 'PRJ-002',
    proyectoNombre: 'Proyecto Houston',
    gsActivityId: 1,
    proyecto: 'Proyecto Houston',
    paisComercio: 'USA',
    clasificacionAuto: true,
    montoUSD: 45.50,
    tipoCambio: 18.68,
    observaciones: 'Sin factura asociada',
  },
  {
    id: 't3',
    userId: 'user1',
    fecha: '2025-12-10',
    comercio: 'Office Depot',
    monto: 2800,
    categoria: 'Suministros',
    matched: true,
    autorizado: true,
    duplicado: false,
    cardNumber: '1003',
    cardHolder: 'María González',
    cuentaContable: '6090',
    gsActivityId: 19,
    paisComercio: 'México',
    clasificacionAuto: true,
    facturaId: 'f11',
  },
  {
    id: 't4',
    userId: 'user3',
    fecha: '2025-12-08',
    comercio: 'Shell Gas Station',
    monto: 800,
    categoria: 'Gasolina',
    matched: true,
    autorizado: true,
    duplicado: false,
    cardNumber: '1004',
    cardHolder: 'Carlos Mendoza',
    cuentaContable: '5450',
    proyectoId: 'PRJ-003',
    proyectoNombre: 'Supervisión Obra GDL',
    gsActivityId: 1,
    proyecto: 'Supervisión Obra GDL',
    paisComercio: 'México',
    clasificacionAuto: true,
    facturaId: 'f12',
  },
  {
    id: 't5',
    userId: 'user4',
    fecha: '2025-12-11',
    comercio: 'Amazon Business',
    monto: 3200,
    categoria: 'Electrónica',
    matched: false,
    autorizado: true,
    duplicado: false,
    cardNumber: '1005',
    cardHolder: 'Ana Martínez',
    cuentaContable: '6200',
    paisComercio: 'USA',
    clasificacionAuto: false,
    montoUSD: 170,
    tipoCambio: 18.82,
  },
  {
    id: 't6',
    userId: 'user5',
    fecha: '2025-12-09',
    comercio: 'Restaurante La Nacional',
    monto: 1450,
    categoria: 'Alimentos',
    matched: true,
    autorizado: true,
    duplicado: false,
    cardNumber: '1006',
    cardHolder: 'Roberto Sánchez',
    cuentaContable: '5450',
    proyecto: 'Reunión Cliente MTY',
    paisComercio: 'México',
    clasificacionAuto: true,
    facturaId: 'f13',
  },
];

export default function Amex() {
  const [selectedCard, setSelectedCard] = useState<string>('all');
  const [tickets, setTickets] = useState<TicketAMEX[]>(mockTickets);
  const [showExportModal, setShowExportModal] = useState(false);

  // Calcular período actual (del 26 del mes pasado al 25 del mes actual)
  const getCurrentPeriod = () => {
    const today = new Date();
    const currentDay = today.getDate();

    let startDate: Date;
    let endDate: Date;

    if (currentDay >= 26) {
      // Estamos en el período actual
      startDate = new Date(today.getFullYear(), today.getMonth(), 26);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 25);
    } else {
      // Estamos en el período anterior
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 26);
      endDate = new Date(today.getFullYear(), today.getMonth(), 25);
    }

    const formatMonth = (date: Date) => {
      return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
    };

    const daysUntilClose = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      label: `${formatMonth(startDate)} - ${formatMonth(endDate)}`,
      daysUntilClose: daysUntilClose > 0 ? daysUntilClose : 0,
      isClosed: daysUntilClose <= 0
    };
  };

  const period = getCurrentPeriod();

  // Filtrar tickets por tarjeta seleccionada
  const filteredTickets = useMemo(() => {
    if (selectedCard === 'all') return tickets;
    return tickets.filter(t => t.cardNumber === selectedCard);
  }, [tickets, selectedCard]);

  // Métricas
  const totalPeriodo = filteredTickets.reduce((sum, t) => sum + t.monto, 0);
  const ticketsMatched = filteredTickets.filter(t => t.matched).length;
  const ticketsSinMatch = filteredTickets.filter(t => !t.matched).length;
  const gastosNoAutorizados = filteredTickets.filter(t => !t.autorizado).length;
  const duplicados = filteredTickets.filter(t => t.duplicado).length;

  // Actualizar cuenta contable de un ticket
  const handleUpdateCuentaContable = (ticketId: string, nuevaCuenta: string) => {
    setTickets(prevTickets =>
      prevTickets.map(t => {
        if (t.id === ticketId) {
          // Aprender el patrón para clasificaciones futuras
          aprenderPatron(t.comercio, t.categoria, nuevaCuenta);

          return {
            ...t,
            cuentaContable: nuevaCuenta,
            clasificacionAuto: false // Ya no es automático porque el usuario lo cambió
          };
        }
        return t;
      })
    );
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const excelData = filteredTickets.map(t => ({
      Fecha: formatDate(t.fecha),
      Tarjeta: t.cardNumber,
      Titular: t.cardHolder,
      Comercio: t.comercio,
      Categoria: t.categoria,
      'Monto MXN': formatCurrency(t.monto),
      'Monto USD': t.montoUSD ? `$${t.montoUSD.toFixed(2)}` : 'N/A',
      'Tipo Cambio': t.tipoCambio ? t.tipoCambio.toFixed(2) : 'N/A',
      País: t.paisComercio,
      'Cuenta Contable': t.cuentaContable,
      Proyecto: t.proyecto || 'N/A',
      Factura: t.matched ? 'Sí' : 'No',
      Estado: !t.autorizado ? 'No Autorizado' : t.duplicado ? 'Duplicado' : 'Autorizado',
      Observaciones: t.observaciones || ''
    }));

    exportToExcel(
      [
        {
          name: 'Tickets AMEX',
          columns: [
            { header: 'Fecha', key: 'Fecha', width: 12 },
            { header: 'Tarjeta', key: 'Tarjeta', width: 10 },
            { header: 'Titular', key: 'Titular', width: 20 },
            { header: 'Comercio', key: 'Comercio', width: 25 },
            { header: 'Categoría', key: 'Categoria', width: 15 },
            { header: 'Monto MXN', key: 'Monto MXN', width: 15 },
            { header: 'Monto USD', key: 'Monto USD', width: 12 },
            { header: 'Tipo Cambio', key: 'Tipo Cambio', width: 12 },
            { header: 'País', key: 'País', width: 12 },
            { header: 'Cuenta Contable', key: 'Cuenta Contable', width: 15 },
            { header: 'Proyecto', key: 'Proyecto', width: 20 },
            { header: 'Factura', key: 'Factura', width: 10 },
            { header: 'Estado', key: 'Estado', width: 15 },
            { header: 'Observaciones', key: 'Observaciones', width: 30 },
          ],
          data: excelData,
        },
      ],
      `AMEX_${period.label.replace(/\s/g, '_')}_${selectedCard === 'all' ? 'Todas' : selectedCard}`
    );

    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AMEX - Tarjetas Empresariales</h1>
          <p className="text-gray-600 mt-1">
            Período: <span className="font-semibold">{period.label}</span>
            {!period.isClosed && (
              <span className="ml-2 text-sm text-blue-600">
                • {period.daysUntilClose} {period.daysUntilClose === 1 ? 'día' : 'días'} para cierre
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Exportar Excel</span>
        </button>
      </div>

      {/* Filtro de Tarjetas */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filtrar por Tarjeta
        </label>
        <select
          value={selectedCard}
          onChange={(e) => setSelectedCard(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="all">Todas las tarjetas</option>
          {TARJETAS_AMEX.filter(t => t.activa).map(tarjeta => (
            <option key={tarjeta.id} value={tarjeta.cardNumber}>
              {tarjeta.cardNumber} - {tarjeta.cardHolder} ({tarjeta.department})
            </option>
          ))}
        </select>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <MetricCard
          label="Total del Período"
          value={formatCurrency(totalPeriodo)}
          color="blue"
          icon="currency"
        />
        <MetricCard
          label="Total Tickets"
          value={filteredTickets.length}
          color="purple"
          icon="document"
        />
        <MetricCard
          label="Con Factura"
          value={ticketsMatched}
          color="green"
          icon="check"
        />
        <MetricCard
          label="Sin Factura"
          value={ticketsSinMatch}
          color="yellow"
          icon="alert"
        />
        <MetricCard
          label="No Autorizados"
          value={gastosNoAutorizados}
          color="red"
          icon="ban"
        />
      </div>

      {/* Tabla de Tickets */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Tickets AMEX</h2>
              <p className="text-sm text-gray-600 mt-1">
                {filteredTickets.length} consumos registrados
                {selectedCard !== 'all' && ` para tarjeta ${selectedCard}`}
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tarjeta
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comercio
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Categoría
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  País
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cuenta Contable
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proyecto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Factura
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">{formatDate(ticket.fecha)}</p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ticket.cardNumber}</p>
                      <p className="text-xs text-gray-500">{ticket.cardHolder}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">{ticket.comercio}</p>
                    {ticket.observaciones && (
                      <p className="text-xs text-gray-500">{ticket.observaciones}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {ticket.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(ticket.monto)}
                    </p>
                    {ticket.montoUSD && (
                      <p className="text-xs text-gray-500">
                        ${ticket.montoUSD.toFixed(2)} USD
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded ${
                      ticket.paisComercio === 'USA'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {ticket.paisComercio}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center space-x-2">
                      <select
                        value={ticket.cuentaContable}
                        onChange={(e) => handleUpdateCuentaContable(ticket.id, e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        {CUENTAS_CONTABLES.filter(c => c.activa).map(cuenta => (
                          <option key={cuenta.codigo} value={cuenta.codigo}>
                            {cuenta.codigo} - {cuenta.nombre}
                          </option>
                        ))}
                      </select>
                      {ticket.clasificacionAuto && (
                        <span className="text-xs text-blue-600" title="Clasificación automática">
                          🤖
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-700">
                      {ticket.proyecto || (
                        <span className="text-gray-400 italic">N/A</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {ticket.matched ? (
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
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      {!ticket.autorizado && (
                        <span className="block px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                          No Autorizado
                        </span>
                      )}
                      {ticket.duplicado && (
                        <span className="block px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                          Duplicado
                        </span>
                      )}
                      {ticket.autorizado && !ticket.duplicado && (
                        <span className="block px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                          Autorizado
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Exportación */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Exportar a Excel</h3>
            <p className="text-sm text-gray-600 mb-6">
              Se exportará el reporte AMEX del período <strong>{period.label}</strong>
              {selectedCard !== 'all' && (
                <> para la tarjeta <strong>{selectedCard}</strong></>
              )}.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-6">
              <p className="text-sm text-blue-800">
                📊 Se incluirán <strong>{filteredTickets.length} tickets</strong> con todas las columnas:
                Fecha, Tarjeta, Titular, Comercio, Categoría, Montos, País, Cuenta Contable, Proyecto, Factura y Estado.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  icon: string;
}

function MetricCard({ label, value, color }: MetricCardProps) {
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
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <div className={`w-10 h-10 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <div className="w-2 h-2 bg-current rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
