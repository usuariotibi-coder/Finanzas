import { useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Factura, AlertaConciliacion, Consumo, TicketAMEX, FacturaStatus } from '../../types';
import { formatProyectoLabel } from '../../utils/proyectoLabel';

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

const mockConsumos: Consumo[] = [
  {
    id: 'c1',
    userId: 'user1',
    viaticoId: 'v1',
    fecha: '2025-12-11',
    comercio: 'Hotel Fiesta Inn',
    monto: 2900,
    categoria: 'Hospedaje',
    facturaId: 'f1',
    matched: true,
    autorizado: true,
  },
  {
    id: 'c2',
    userId: 'user2',
    viaticoId: 'v2',
    fecha: '2025-12-10',
    comercio: 'Restaurante La Casa',
    monto: 986,
    categoria: 'Alimentos',
    matched: false,
    autorizado: true,
  },
  {
    id: 'c3',
    userId: 'user1',
    viaticoId: 'v1',
    fecha: '2025-12-09',
    comercio: 'Gasolina PEMEX',
    monto: 850,
    categoria: 'Transporte',
    matched: false,
    autorizado: true,
  },
];

const mockTicketsAMEX: TicketAMEX[] = [
  {
    id: 'a1',
    userId: 'user3',
    cardNumber: '1234',
    cardHolder: 'Carlos López',
    fecha: '2025-12-09',
    comercio: 'Liverpool',
    monto: 1392,
    categoria: 'Otros',
    cuentaContable: '6090',
    paisComercio: 'México',
    facturaId: 'f3',
    matched: true,
    autorizado: false,
    duplicado: false,
    clasificacionAuto: false,
    observaciones: 'Compra personal - rechazar',
  },
  {
    id: 'a2',
    userId: 'user2',
    cardNumber: '5678',
    cardHolder: 'Ana Martínez',
    fecha: '2025-12-08',
    comercio: 'United Airlines',
    monto: 8500,
    montoUSD: 500,
    tipoCambio: 17.0,
    categoria: 'Viajes',
    cuentaContable: '5450',
    proyectoId: 'PRJ-001',
    proyectoNombre: 'Obra Aeropuerto TLM',
    gsActivityId: 13,
    paisComercio: 'USA',
    matched: false,
    autorizado: true,
    duplicado: false,
    clasificacionAuto: true,
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
    descripcion: 'Factura f2 sin consumo asociado en Efectifintech',
    gravedad: 'alta',
    facturaId: 'f2',
  },
  {
    tipo: 'consumo_sin_factura',
    descripcion: 'Consumo c3 (PEMEX $850) sin factura cargada',
    gravedad: 'alta',
    consumoId: 'c3',
  },
  {
    tipo: 'consumo_sin_factura',
    descripcion: 'Ticket AMEX a2 (United Airlines $8,500) sin factura',
    gravedad: 'media',
    consumoId: 'a2',
  },
];

export default function Conciliacion() {
  const [facturas, setFacturas] = useLocalStorageState<Factura[]>('conciliacion:facturas', mockFacturas);
  const [consumos, setConsumos] = useLocalStorageState<Consumo[]>('conciliacion:consumos', mockConsumos);
  const [ticketsAMEX, setTicketsAMEX] = useLocalStorageState<TicketAMEX[]>('conciliacion:amex', mockTicketsAMEX);
  const [selectedFacturaId, setSelectedFacturaId] = useLocalStorageState<string | null>('conciliacion:selectedFacturaId', null);
  const [selectedAlertaIndex, setSelectedAlertaIndex] = useLocalStorageState<number | null>('conciliacion:selectedAlertaIndex', null);
  const [showDetalleModal, setShowDetalleModal] = useLocalStorageState('conciliacion:showDetalleModal', false);
  const [showAlertaModal, setShowAlertaModal] = useLocalStorageState('conciliacion:showAlertaModal', false);
  const [showUploadModal, setShowUploadModal] = useLocalStorageState('conciliacion:showUploadModal', false);
  const [uploadTarget, setUploadTarget] = useLocalStorageState<{ type: 'consumo' | 'amex'; id: string } | null>(
    'conciliacion:uploadTarget',
    null
  );
  const [uploadPdfFile, setUploadPdfFile] = useState<File | null>(null);
  const [uploadXmlFile, setUploadXmlFile] = useState<File | null>(null);
  const [uploadNotas, setUploadNotas] = useState('');
  const [showUploadErrors, setShowUploadErrors] = useState(false);
  const [selectedMes, setSelectedMes] = useLocalStorageState('conciliacion:selectedMes', 'todos');
  const [vistaActiva, setVistaActiva] = useLocalStorageState<'facturas' | 'consumos' | 'amex'>('conciliacion:vistaActiva', 'facturas');
  const [alertas] = useLocalStorageState<AlertaConciliacion[]>('conciliacion:alertas', mockAlertas);

  const monthLabels = {
    '01': 'Enero',
    '02': 'Febrero',
    '03': 'Marzo',
    '04': 'Abril',
    '05': 'Mayo',
    '06': 'Junio',
    '07': 'Julio',
    '08': 'Agosto',
    '09': 'Septiembre',
    '10': 'Octubre',
    '11': 'Noviembre',
    '12': 'Diciembre',
  };
  const getMesKey = (value: string) => {
    if (!value) {
      return '';
    }
    const parts = value.split('-');
    return parts.length >= 2 ? parts[1] : '';
  };
  const filtraPorMes = (fecha: string) => selectedMes === 'todos' || getMesKey(fecha) === selectedMes;
  const mesesDisponibles = Array.from(
    new Set(
      [...facturas, ...consumos, ...ticketsAMEX]
        .map((item) => getMesKey(item.fecha))
        .filter(Boolean)
    )
  ).sort();

  const facturasFiltradas = facturas.filter((factura) => filtraPorMes(factura.fecha));
  const consumosFiltrados = consumos.filter((consumo) => filtraPorMes(consumo.fecha));
  const ticketsAMEXFiltrados = ticketsAMEX.filter((ticket) => filtraPorMes(ticket.fecha));

  const facturasValidadas = facturasFiltradas.filter(f => f.status === 'validada').length;
  const facturasPendientes = facturasFiltradas.filter(f => f.status === 'pendiente').length;

  const consumosSinMatch = consumosFiltrados.filter(c => !c.matched).length;
  const amexSinMatch = ticketsAMEXFiltrados.filter(a => !a.matched).length;
  const totalFacturasEsperadas = consumosFiltrados.length + ticketsAMEXFiltrados.length;
  const uploadErrors = showUploadErrors
    ? {
      pdf: !uploadPdfFile ? 'Agrega el PDF.' : '',
      xml: !uploadXmlFile ? 'Agrega el XML.' : '',
    }
    : {};

  const handleVerDetalles = (facturaId: string) => {
    setSelectedFacturaId(facturaId);
    setShowDetalleModal(true);
  };

  const openUploadModal = (type: 'consumo' | 'amex', id: string) => {
    setUploadTarget({ type, id });
    setUploadPdfFile(null);
    setUploadXmlFile(null);
    setUploadNotas('');
    setShowUploadErrors(false);
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadTarget(null);
    setUploadPdfFile(null);
    setUploadXmlFile(null);
    setUploadNotas('');
    setShowUploadErrors(false);
  };

  const upsertFactura = (factura: Factura) => {
    setFacturas((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      map.set(factura.id, { ...map.get(factura.id), ...factura });
      return Array.from(map.values());
    });
  };

  const buildFacturaFromConsumo = (consumo: Consumo, facturaId: string, pdfName: string, xmlName: string): Factura => {
    return {
      id: facturaId,
      userId: consumo.userId,
      folio: facturaId,
      uuid: `PEND-${facturaId}`,
      rfc: 'PENDIENTE',
      razonSocial: consumo.comercio,
      fecha: consumo.fecha,
      subtotal: consumo.monto,
      iva: 0,
      total: consumo.monto,
      formaPago: 'NA',
      metodoPago: 'NA',
      conceptos: [
        {
          claveProdServ: '00000000',
          descripcion: consumo.categoria || 'Gasto',
          cantidad: 1,
          valorUnitario: consumo.monto,
          importe: consumo.monto,
        },
      ],
      status: 'pendiente',
      matchConsumo: true,
      archivoPDF: pdfName,
      archivoXML: xmlName,
      createdAt: new Date().toISOString(),
    };
  };

  const buildFacturaFromAMEX = (ticket: TicketAMEX, facturaId: string, pdfName: string, xmlName: string): Factura => {
    return {
      id: facturaId,
      userId: ticket.userId,
      folio: facturaId,
      uuid: `PEND-${facturaId}`,
      rfc: 'PENDIENTE',
      razonSocial: ticket.comercio,
      fecha: ticket.fecha,
      subtotal: ticket.monto,
      iva: 0,
      total: ticket.monto,
      formaPago: 'NA',
      metodoPago: 'NA',
      conceptos: [
        {
          claveProdServ: '00000000',
          descripcion: ticket.categoria || 'Gasto',
          cantidad: 1,
          valorUnitario: ticket.monto,
          importe: ticket.monto,
        },
      ],
      status: 'pendiente',
      matchConsumo: true,
      archivoPDF: pdfName,
      archivoXML: xmlName,
      createdAt: new Date().toISOString(),
    };
  };

  const handleGuardarFactura = () => {
    if (!uploadTarget) {
      return;
    }
    if (!uploadPdfFile || !uploadXmlFile) {
      setShowUploadErrors(true);
      return;
    }
    const facturaId = `FAC-${Date.now()}`;
    const pdfName = uploadPdfFile.name;
    const xmlName = uploadXmlFile.name;
    if (uploadTarget.type === 'consumo') {
      const consumo = consumos.find((item) => item.id === uploadTarget.id);
      setConsumos((prev) => prev.map((consumo) => (
        consumo.id === uploadTarget.id
          ? {
            ...consumo,
            facturaId,
            facturaPdfName: pdfName,
            facturaXmlName: xmlName,
            facturaNotas: uploadNotas.trim() || undefined,
            matched: false,
          }
          : consumo
      )));
      if (consumo) {
        upsertFactura(buildFacturaFromConsumo(consumo, facturaId, pdfName, xmlName));
      }
    } else {
      const ticket = ticketsAMEX.find((item) => item.id === uploadTarget.id);
      setTicketsAMEX((prev) => prev.map((ticket) => (
        ticket.id === uploadTarget.id
          ? {
            ...ticket,
            facturaId,
            facturaPdfName: pdfName,
            facturaXmlName: xmlName,
            facturaNotas: uploadNotas.trim() || undefined,
            matched: false,
          }
          : ticket
      )));
      if (ticket) {
        upsertFactura(buildFacturaFromAMEX(ticket, facturaId, pdfName, xmlName));
      }
    }
    closeUploadModal();
  };

  const handleRevisarAlerta = (index: number) => {
    setSelectedAlertaIndex(index);
    setShowAlertaModal(true);
  };

  const handlePreviewArchivo = (tipo: 'PDF' | 'XML', nombre?: string) => {
    if (!nombre) {
      return;
    }
    alert(`Archivo ${tipo}: ${nombre}. Descarga disponible cuando exista backend.`);
  };

  useEscapeKey(() => closeUploadModal(), showUploadModal);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-purple-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Conciliacion</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Conciliacion de Facturas</h1>
                <p className="text-[11px] text-slate-600">Control de facturas y consumos asociados por gasto.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedMes}
                  onChange={(e) => setSelectedMes(e.target.value)}
                  className="px-2.5 py-1.5 text-[11px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="todos">Todos los meses</option>
                  {mesesDisponibles.map((mes) => (
                    <option key={mes} value={mes}>
                      {monthLabels[mes as keyof typeof monthLabels] ?? mes}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <MetricCard label="Facturas" value={totalFacturasEsperadas} color="blue" icon="F" />
              <MetricCard label="Consumos" value={consumos.length} color="purple" icon="C" />
              <MetricCard label="AMEX" value={ticketsAMEX.length} color="indigo" icon="AX" />
              <MetricCard label="Conciliadas" value={facturasValidadas} color="green" icon="OK" />
              <MetricCard label="Pendientes" value={facturasPendientes + consumosSinMatch + amexSinMatch} color="yellow" icon="P" />
              <MetricCard label="Alertas" value={alertas.length} color="red" icon="!" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alertas de Conciliación</h2>
              <p className="text-sm text-gray-600 mt-1">{alertas.length} discrepancias detectadas</p>
            </div>
            <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Ver todas
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {alertas.map((alerta, index) => (
              <AlertaCard key={index} alerta={alerta} onRevisar={() => handleRevisarAlerta(index)} />
            ))}
          </div>
        </div>
      </div>

      {/* Tabs para cambiar entre Facturas, Consumos y AMEX */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setVistaActiva('facturas')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                vistaActiva === 'facturas'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📄 Facturas ({totalFacturasEsperadas})
            </button>
            <button
              onClick={() => setVistaActiva('consumos')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                vistaActiva === 'consumos'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              💳 Efectifintech ({consumos.length})
            </button>
            <button
              onClick={() => setVistaActiva('amex')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                vistaActiva === 'amex'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🏦 AMEX ({ticketsAMEX.length})
            </button>
          </nav>
        </div>

        {/* Tabla de Facturas */}
        {vistaActiva === 'facturas' && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
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
                    Match
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Archivos
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
                {facturas.map((factura) => (
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      {factura.matchConsumo ? (
                        <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Matched</span>
                      ) : (
                        <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">Sin match</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePreviewArchivo('PDF', factura.archivoPDF)}
                          disabled={!factura.archivoPDF}
                          className={`px-2 py-1 text-xs rounded-md border ${
                            factura.archivoPDF
                              ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                              : 'border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreviewArchivo('XML', factura.archivoXML)}
                          disabled={!factura.archivoXML}
                          className={`px-2 py-1 text-xs rounded-md border ${
                            factura.archivoXML
                              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              : 'border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          XML
                        </button>
                      </div>
                      {!factura.archivoPDF && !factura.archivoXML && (
                        <p className="mt-1 text-[10px] text-gray-400">Sin archivos</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={factura.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleVerDetalles(factura.id)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        Ver Detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabla de Consumos Efectifintech */}
        {vistaActiva === 'consumos' && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comercio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Factura Match
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
                {consumos.map((consumo) => (
                  <tr key={consumo.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{consumo.id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{consumo.comercio}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">{consumo.fecha}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                        {consumo.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-900">${consumo.monto.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      {consumo.matched ? (
                        <div>
                          <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Matched</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {consumo.facturaId}</p>
                        </div>
                      ) : consumo.facturaId ? (
                        <div>
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Factura cargada</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {consumo.facturaId}</p>
                          {(consumo.facturaPdfName || consumo.facturaXmlName) && (
                            <p className="text-[10px] text-gray-400 mt-1 break-all">
                              {consumo.facturaPdfName ? `PDF: ${consumo.facturaPdfName}` : ''}
                              {consumo.facturaPdfName && consumo.facturaXmlName ? ' · ' : ''}
                              {consumo.facturaXmlName ? `XML: ${consumo.facturaXmlName}` : ''}
                            </p>
                          )}
                          {(consumo.facturaPdfName || consumo.facturaXmlName) && (
                            <div className="mt-1 flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('PDF', consumo.facturaPdfName)}
                                disabled={!consumo.facturaPdfName}
                                className={`px-2 py-0.5 rounded border ${
                                  consumo.facturaPdfName
                                    ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('XML', consumo.facturaXmlName)}
                                disabled={!consumo.facturaXmlName}
                                className={`px-2 py-0.5 rounded border ${
                                  consumo.facturaXmlName
                                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                XML
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Sin factura</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {consumo.autorizado ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">Autorizado</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium">Pendiente</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openUploadModal('consumo', consumo.id)}
                        className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {consumo.facturaId ? 'Actualizar factura' : 'Subir factura'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabla de Tickets AMEX */}
        {vistaActiva === 'amex' && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID / Tarjeta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comercio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proyecto / Cuenta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Factura Match
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
                {ticketsAMEX.map((ticket) => {
                  const proyectoLabel = formatProyectoLabel(ticket.proyectoNombre, ticket.proyectoId);
                  return (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{ticket.id}</p>
                      <p className="text-xs text-gray-500">**** {ticket.cardNumber} - {ticket.cardHolder}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{ticket.comercio}</p>
                      <p className="text-xs text-gray-500">{ticket.paisComercio}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">{ticket.fecha}</p>
                    </td>
                    <td className="px-6 py-4">
                      {proyectoLabel ? (
                        <div>
                          <p className="text-sm text-gray-900">{proyectoLabel}</p>
                          <p className="text-xs text-gray-500">Cuenta: {ticket.cuentaContable}</p>
                        </div>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          Cuenta: {ticket.cuentaContable}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-900">${ticket.monto.toLocaleString()}</p>
                      {ticket.montoUSD && (
                        <p className="text-xs text-gray-500">USD ${ticket.montoUSD} (TC: {ticket.tipoCambio})</p>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {ticket.matched ? (
                        <div>
                          <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Matched</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {ticket.facturaId}</p>
                        </div>
                      ) : ticket.facturaId ? (
                        <div>
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Factura cargada</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {ticket.facturaId}</p>
                          {(ticket.facturaPdfName || ticket.facturaXmlName) && (
                            <p className="text-[10px] text-gray-400 mt-1 break-all">
                              {ticket.facturaPdfName ? `PDF: ${ticket.facturaPdfName}` : ''}
                              {ticket.facturaPdfName && ticket.facturaXmlName ? ' · ' : ''}
                              {ticket.facturaXmlName ? `XML: ${ticket.facturaXmlName}` : ''}
                            </p>
                          )}
                          {(ticket.facturaPdfName || ticket.facturaXmlName) && (
                            <div className="mt-1 flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('PDF', ticket.facturaPdfName)}
                                disabled={!ticket.facturaPdfName}
                                className={`px-2 py-0.5 rounded border ${
                                  ticket.facturaPdfName
                                    ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('XML', ticket.facturaXmlName)}
                                disabled={!ticket.facturaXmlName}
                                className={`px-2 py-0.5 rounded border ${
                                  ticket.facturaXmlName
                                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                XML
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Sin factura</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {ticket.autorizado ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">Autorizado</span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium">Rechazado</span>
                      )}
                      {ticket.observaciones && (
                        <p className="text-xs text-gray-600 mt-1">{ticket.observaciones}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openUploadModal('amex', ticket.id)}
                        className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {ticket.facturaId ? 'Actualizar factura' : 'Subir factura'}
                      </button>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales */}
      {showDetalleModal && selectedFacturaId && (
        <DetalleFacturaModal
          factura={facturas.find(f => f.id === selectedFacturaId)!}
          consumos={consumos}
          onClose={() => setShowDetalleModal(false)}
          onUpdateStatus={(facturaId, status) => {
            setFacturas((prev) => prev.map((item) => (
              item.id === facturaId ? { ...item, status } : item
            )));
          }}
        />
      )}

      {showAlertaModal && selectedAlertaIndex !== null && (
        <AlertaDetalleModal
          alerta={alertas[selectedAlertaIndex]}
          facturas={facturas}
          consumos={consumos}
          onClose={() => setShowAlertaModal(false)}
        />
      )}

      {showUploadModal && uploadTarget && (
        <SubirFacturaModal
          tipo={uploadTarget.type}
          consumo={uploadTarget.type === 'consumo' ? consumos.find((item) => item.id === uploadTarget.id) ?? null : null}
          ticket={uploadTarget.type === 'amex' ? ticketsAMEX.find((item) => item.id === uploadTarget.id) ?? null : null}
          pdfFile={uploadPdfFile}
          xmlFile={uploadXmlFile}
          notas={uploadNotas}
          errors={uploadErrors}
          onChangePdf={setUploadPdfFile}
          onChangeXml={setUploadXmlFile}
          onChangeNotas={setUploadNotas}
          onClose={closeUploadModal}
          onSave={handleGuardarFactura}
        />
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
  icon: string;
}

function MetricCard({ label, value, color, icon }: MetricCardProps) {
  const colorClasses = {
    blue: { accent: 'bg-blue-500', soft: 'bg-blue-100 text-blue-700' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-700' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-800' },
    red: { accent: 'bg-rose-500', soft: 'bg-rose-100 text-rose-700' },
    purple: { accent: 'bg-purple-500', soft: 'bg-purple-100 text-purple-700' },
    indigo: { accent: 'bg-indigo-500', soft: 'bg-indigo-100 text-indigo-700' },
  };
  const palette = colorClasses[color];

  return (
    <button
      type="button"
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white/90 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md select-none"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.accent}`} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${palette.soft} text-sm`}>
          {icon}
        </div>
      </div>
    </button>
  );
}

function AlertaCard({ alerta, onRevisar }: { alerta: AlertaConciliacion; onRevisar: () => void }) {
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
      <button
        onClick={onRevisar}
        className="ml-3 text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        Revisar
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
    validada: { label: 'Validada', color: 'bg-green-100 text-green-800', icon: '✅' },
    rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-800', icon: '⛔' },
    conciliada: { label: 'Conciliada', color: 'bg-blue-100 text-blue-800', icon: '🔗' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendiente;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      <span className="text-xs">{config.icon}</span>
      {config.label}
    </span>
  );
}

// Modal de Detalle de Factura
interface DetalleFacturaModalProps {
  factura: Factura;
  consumos: Consumo[];
  onClose: () => void;
  onUpdateStatus: (facturaId: string, status: FacturaStatus) => void;
}

interface SubirFacturaModalProps {
  tipo: 'consumo' | 'amex';
  consumo: Consumo | null;
  ticket: TicketAMEX | null;
  pdfFile: File | null;
  xmlFile: File | null;
  notas: string;
  errors?: {
    pdf?: string;
    xml?: string;
  };
  onChangePdf: (file: File | null) => void;
  onChangeXml: (file: File | null) => void;
  onChangeNotas: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

function DetalleFacturaModal({ factura, consumos, onClose, onUpdateStatus }: DetalleFacturaModalProps) {
  useEscapeKey(onClose);

  const [statusLocal, setStatusLocal] = useState(factura.status);
  const consumoMatch = consumos.find(c => c.facturaId === factura.id);
  const pdfName = factura.archivoPDF ?? consumoMatch?.facturaPdfName;
  const xmlName = factura.archivoXML ?? consumoMatch?.facturaXmlName;
  const handleDescargarArchivo = (tipo: 'PDF' | 'XML', nombre?: string) => {
    if (!nombre) {
      return;
    }
    alert(`Archivo ${tipo}: ${nombre}. Descarga disponible cuando exista backend.`);
  };

  const handleStatusChange = (status: FacturaStatus) => {
    setStatusLocal(status);
    onUpdateStatus(factura.id, status);
    onClose();
  };

  const getStatusButtonStyles = (status: FacturaStatus, baseStyles: string) => {
    const isActive = statusLocal === status;
    return `${baseStyles}${isActive ? ' ring-2 ring-offset-1 ring-slate-300' : ''}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Detalle de Factura - {factura.folio}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Información General */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Información General</h3>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Lugar donde se realizo el consumo</p>
                <p className="text-sm font-semibold text-gray-900">{factura.razonSocial}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="text-sm text-gray-900">{factura.fecha}</p>
              </div>
            </div>
          </div>

          {/* Montos */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Desglose de Montos</h3>
            <div className="bg-blue-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Subtotal:</span>
                <span className="text-sm font-semibold text-gray-900">${factura.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">IVA:</span>
                <span className="text-sm font-semibold text-gray-900">${factura.iva.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-2">
                <span className="text-base font-semibold text-gray-900">Total:</span>
                <span className="text-base font-bold text-primary-600">${factura.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Conceptos */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Conceptos</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Clave</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Descripción</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cantidad</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">P. Unitario</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Importe</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {factura.conceptos.map((concepto, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-gray-900">{concepto.claveProdServ}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{concepto.descripcion}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{concepto.cantidad}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">${concepto.valorUnitario.toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900">${concepto.importe.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Archivos de Factura</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-800">PDF</p>
                <p className="text-xs text-slate-500 mt-1">{pdfName ?? 'Sin archivo'}</p>
                <button
                  type="button"
                  onClick={() => handleDescargarArchivo('PDF', pdfName)}
                  disabled={!pdfName}
                  className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                    pdfName
                      ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                      : 'border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-3-3m3 3l3-3" />
                  </svg>
                  Descargar PDF
                </button>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-800">XML</p>
                <p className="text-xs text-slate-500 mt-1">{xmlName ?? 'Sin archivo'}</p>
                <button
                  type="button"
                  onClick={() => handleDescargarArchivo('XML', xmlName)}
                  disabled={!xmlName}
                  className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                    xmlName
                      ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      : 'border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-3-3m3 3l3-3" />
                  </svg>
                  Descargar XML
                </button>
              </div>
            </div>
          </div>

        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
          <button
            onClick={() => handleStatusChange('pendiente')}
            className={getStatusButtonStyles('pendiente', 'px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600')}
          >
            Pendiente
          </button>
          <button
            onClick={() => handleStatusChange('rechazada')}
            className={getStatusButtonStyles('rechazada', 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700')}
          >
            Rechazar Factura
          </button>
          <button
            onClick={() => handleStatusChange('validada')}
            className={getStatusButtonStyles('validada', 'px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700')}
          >
            Aprobar Factura
          </button>
        </div>
      </div>
    </div>
  );
}

function SubirFacturaModal({
  tipo,
  consumo,
  ticket,
  pdfFile,
  xmlFile,
  notas,
  errors,
  onChangePdf,
  onChangeXml,
  onChangeNotas,
  onClose,
  onSave,
}: SubirFacturaModalProps) {
  useEscapeKey(onClose);
  const titulo = tipo === 'consumo' ? 'Efectifintech' : 'AMEX';
  const comercio = consumo?.comercio ?? ticket?.comercio ?? 'Sin comercio';
  const fecha = consumo?.fecha ?? ticket?.fecha ?? '';
  const monto = consumo?.monto ?? ticket?.monto ?? 0;
  const categoria = consumo?.categoria ?? ticket?.categoria ?? '';
  const referencia = consumo?.id ?? ticket?.id ?? '';
  const pdfError = errors?.pdf;
  const xmlError = errors?.xml;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Subir factura - {titulo}</h2>
              <p className="text-xs text-gray-500">Vincula la factura al gasto seleccionado</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                ID: {referencia}
              </span>
              {categoria && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                  {categoria}
                </span>
              )}
              {fecha && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                  {fecha}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <p className="text-base font-semibold text-slate-900">{comercio}</p>
              <p className="text-sm text-slate-600">Monto: ${monto.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Archivo PDF</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(event) => onChangePdf(event.target.files?.[0] ?? null)}
                className={`w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 ${
                  pdfError ? 'rounded-lg border border-rose-300 bg-rose-50' : ''
                }`}
              />
              {pdfFile && <p className="mt-2 text-xs text-slate-500">Seleccionado: {pdfFile.name}</p>}
              {pdfError && <p className="mt-1 text-xs text-rose-600">{pdfError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Archivo XML</label>
              <input
                type="file"
                accept=".xml"
                onChange={(event) => onChangeXml(event.target.files?.[0] ?? null)}
                className={`w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 ${
                  xmlError ? 'rounded-lg border border-rose-300 bg-rose-50' : ''
                }`}
              />
              {xmlFile && <p className="mt-2 text-xs text-slate-500">Seleccionado: {xmlFile.name}</p>}
              {xmlError && <p className="mt-1 text-xs text-rose-600">{xmlError}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notas</label>
            <textarea
              rows={3}
              value={notas}
              onChange={(event) => onChangeNotas(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Agrega comentarios o referencia..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Guardar factura
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de Detalle de Alerta
interface AlertaDetalleModalProps {
  alerta: AlertaConciliacion;
  facturas: Factura[];
  consumos: Consumo[];
  onClose: () => void;
}

function AlertaDetalleModal({ alerta, facturas, consumos, onClose }: AlertaDetalleModalProps) {
  useEscapeKey(onClose);

  const factura = alerta.facturaId ? facturas.find(f => f.id === alerta.facturaId) : null;
  const consumo = alerta.consumoId ? consumos.find(c => c.id === alerta.consumoId) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Revisión de Alerta</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className={`p-4 rounded-lg border ${
            alerta.gravedad === 'alta' ? 'bg-red-50 border-red-200' :
            alerta.gravedad === 'media' ? 'bg-yellow-50 border-yellow-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start">
              <span className="text-2xl mr-3">
                {alerta.gravedad === 'alta' ? '🚨' : alerta.gravedad === 'media' ? '⚠️' : 'ℹ️'}
              </span>
              <div>
                <p className="font-semibold text-gray-900">{alerta.descripcion}</p>
                <p className="text-sm text-gray-600 mt-1">Tipo: {alerta.tipo.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          {factura && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">📄 Factura Relacionada</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-600">Folio</p>
                    <p className="text-sm font-semibold">{factura.folio}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Total</p>
                    <p className="text-sm font-bold text-primary-600">${factura.total.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {consumo && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">💳 Consumo Efectifintech</h3>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm"><strong>{consumo.comercio}</strong> - ${consumo.monto.toLocaleString()}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Comentarios</label>
            <textarea
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Agregar comentarios..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Cerrar
          </button>
          <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Resolver Alerta
          </button>
        </div>
      </div>
    </div>
  );
}
