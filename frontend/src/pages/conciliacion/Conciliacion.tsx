import { useState } from 'react';
import type { Factura, AlertaConciliacion } from '../../types';

const mockFacturas: Factura[] = [
  {
    id: 'f1',
    userId: 'user1',
    folio: 'A-1234',
    uuid: 'ABC123-456DEF-789GHI',
    rfc: 'ABC123456XYZ',
    razonSocial: 'Hotel Fiesta Inn',
    fecha: '2025-12-11',
    subtotal: 2500,
    iva: 400,
    total: 2900,
    formaPago: '03',
    metodoPago: 'PUE',
    conceptos: [
      {
        claveProdServ: '90101501',
        descripcion: 'Servicio de hospedaje',
        cantidad: 2,
        valorUnitario: 1250,
        importe: 2500,
      },
    ],
    status: 'validada',
    matchConsumo: true,
    createdAt: '2025-12-11',
    validacionCFDI: {
      rfcValido: true,
      formaPagoValida: true,
      conceptosValidos: true,
      articulosPersonales: [],
      propinaExcedida: false,
      errores: [],
    },
  },
  {
    id: 'f2',
    userId: 'user2',
    folio: 'B-5678',
    uuid: 'DEF456-789GHI-012JKL',
    rfc: 'XYZ987654ABC',
    razonSocial: 'Restaurante La Casa',
    fecha: '2025-12-10',
    subtotal: 850,
    iva: 136,
    total: 986,
    formaPago: '01',
    metodoPago: 'PUE',
    conceptos: [
      {
        claveProdServ: '90101600',
        descripcion: 'Servicio de restaurante',
        cantidad: 1,
        valorUnitario: 750,
        importe: 750,
      },
      {
        claveProdServ: '90101600',
        descripcion: 'Propina',
        cantidad: 1,
        valorUnitario: 100,
        importe: 100,
      },
    ],
    status: 'pendiente',
    matchConsumo: false,
    createdAt: '2025-12-10',
    validacionCFDI: {
      rfcValido: true,
      formaPagoValida: true,
      conceptosValidos: true,
      articulosPersonales: [],
      propinaExcedida: true,
      propinaDetalle: {
        monto: 100,
        porcentaje: 13.3,
      },
      errores: ['Propina excede el 10% permitido'],
    },
  },
  {
    id: 'f3',
    userId: 'user3',
    folio: 'C-9012',
    uuid: 'GHI789-012JKL-345MNO',
    rfc: 'LMN456789PQR',
    razonSocial: 'Liverpool',
    fecha: '2025-12-09',
    subtotal: 1200,
    iva: 192,
    total: 1392,
    formaPago: '04',
    metodoPago: 'PUE',
    conceptos: [
      {
        claveProdServ: '50202301',
        descripcion: 'Ropa casual',
        cantidad: 2,
        valorUnitario: 600,
        importe: 1200,
      },
    ],
    status: 'rechazada',
    matchConsumo: true,
    createdAt: '2025-12-09',
    validacionCFDI: {
      rfcValido: true,
      formaPagoValida: true,
      conceptosValidos: false,
      articulosPersonales: ['Ropa casual'],
      propinaExcedida: false,
      errores: ['Artículos personales detectados'],
    },
  },
];

const mockAlertas: AlertaConciliacion[] = [
  {
    tipo: 'propina_excedida',
    descripcion: 'Propina del 13.3% excede el límite del 10%',
    gravedad: 'media',
    facturaId: 'f2',
  },
  {
    tipo: 'articulo_personal',
    descripcion: 'Artículo personal detectado: Ropa casual',
    gravedad: 'alta',
    facturaId: 'f3',
  },
  {
    tipo: 'factura_sin_consumo',
    descripcion: 'Factura sin consumo asociado en Efectifintech',
    gravedad: 'alta',
    facturaId: 'f2',
  },
  {
    tipo: 'monto_diferente',
    descripcion: 'Diferencia de $50 entre factura y consumo',
    gravedad: 'media',
    facturaId: 'f1',
  },
];

export default function Conciliacion() {
  const [selectedPeriodo, setSelectedPeriodo] = useState<'1-15' | '16-30'>('1-15');

  const facturasValidadas = mockFacturas.filter(f => f.status === 'validada').length;
  const facturasRechazadas = mockFacturas.filter(f => f.status === 'rechazada').length;
  const facturasPendientes = mockFacturas.filter(f => f.status === 'pendiente').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conciliación de Facturas</h1>
          <p className="text-gray-600 mt-1">Validación de CFDI y matching con consumos</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedPeriodo}
            onChange={(e) => setSelectedPeriodo(e.target.value as '1-15' | '16-30')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="1-15">Periodo 1-15</option>
            <option value="16-30">Periodo 16-30</option>
          </select>
          <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>Cargar Facturas</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard label="Total Facturas" value={mockFacturas.length} color="blue" />
        <MetricCard label="Validadas" value={facturasValidadas} color="green" />
        <MetricCard label="Pendientes" value={facturasPendientes} color="yellow" />
        <MetricCard label="Rechazadas" value={facturasRechazadas} color="red" />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alertas de Conciliación</h2>
              <p className="text-sm text-gray-600 mt-1">{mockAlertas.length} discrepancias detectadas</p>
            </div>
            <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Ver todas
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {mockAlertas.map((alerta, index) => (
              <AlertaCard key={index} alerta={alerta} />
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Facturas Cargadas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Folio / UUID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Razón Social
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Validación
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
              {mockFacturas.map((factura) => (
                <tr key={factura.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{factura.folio}</p>
                    <p className="text-xs text-gray-500 font-mono">{factura.uuid.substring(0, 20)}...</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{factura.razonSocial}</p>
                    <p className="text-xs text-gray-500">{factura.rfc}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">{factura.fecha}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm font-semibold text-gray-900">${factura.total.toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <ValidacionBadges validacion={factura.validacionCFDI} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={factura.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-primary-600 hover:text-primary-900">
                      Ver Detalles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red';
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600">{label}</p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <div className={`w-10 h-10 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <div className="w-2 h-2 bg-current rounded-full"></div>
        </div>
      </div>
    </div>
  );
}

function AlertaCard({ alerta }: { alerta: AlertaConciliacion }) {
  const iconMap = {
    propina_excedida: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    articulo_personal: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    factura_sin_consumo: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    monto_diferente: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    consumo_sin_factura: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    duplicado: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  };

  const colorMap = {
    alta: 'bg-red-50 border-red-200',
    media: 'bg-yellow-50 border-yellow-200',
    baja: 'bg-blue-50 border-blue-200',
  };

  const iconColorMap = {
    alta: 'text-red-600',
    media: 'text-yellow-600',
    baja: 'text-blue-600',
  };

  return (
    <div className={`flex items-start p-4 rounded-lg border ${colorMap[alerta.gravedad]}`}>
      <svg
        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColorMap[alerta.gravedad]}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconMap[alerta.tipo]} />
      </svg>
      <div className="ml-3 flex-1">
        <p className="text-sm font-medium text-gray-900">{alerta.descripcion}</p>
        {alerta.facturaId && (
          <p className="text-xs text-gray-600 mt-1">Factura: {alerta.facturaId}</p>
        )}
      </div>
      <button className="ml-3 text-sm font-medium text-primary-600 hover:text-primary-700">
        Revisar
      </button>
    </div>
  );
}

function ValidacionBadges({ validacion }: { validacion?: any }) {
  if (!validacion) return <span className="text-xs text-gray-500">Sin validar</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {validacion.rfcValido && (
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">RFC ✓</span>
      )}
      {validacion.formaPagoValida && (
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Pago ✓</span>
      )}
      {!validacion.conceptosValidos && (
        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">Conceptos ✗</span>
      )}
      {validacion.propinaExcedida && (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">Propina !</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
    validada: { label: 'Validada', color: 'bg-green-100 text-green-800' },
    rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-800' },
    conciliada: { label: 'Conciliada', color: 'bg-blue-100 text-blue-800' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendiente;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      {config.label}
    </span>
  );
}
