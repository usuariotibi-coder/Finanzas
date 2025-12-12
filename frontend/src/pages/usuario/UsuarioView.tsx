import { useState } from 'react';
import type { Viatico } from '../../types';
import { getProyectos } from '../../components/common/ProyectoSelector';

// Mock data: viáticos del usuario actual
const MOCK_VIATICOS: Viatico[] = [
  {
    id: 'VIA-001',
    userId: 'user1',
    userName: 'Juan Pérez',
    proyectoId: 'PRJ-001',
    proyectoNombre: 'Obra Aeropuerto TLM',
    motivo: 'Visita a obra en construcción para supervisión',
    destino: 'Guadalajara',
    destinoPais: 'Mexico',
    tipoViatico: 'efectifintech',
    fechaInicio: '2025-12-15',
    fechaFin: '2025-12-18',
    montoSolicitado: 15000,
    montoAprobado: 15000,
    montoDispersado: 15000,
    montoGastado: 12350,
    saldoRestante: 2650,
    status: 'dispersado',
    gsActivityId: 1,
    createdAt: '2025-12-01T10:00:00Z',
    aprobadoPor: 'Francisco Aguilar',
    comentarios: 'Aprobado',
  },
  {
    id: 'VIA-002',
    userId: 'user1',
    userName: 'Juan Pérez',
    proyectoId: 'PRJ-002',
    proyectoNombre: 'Proyecto Houston',
    motivo: 'Reunión con cliente y supervisión de instalaciones',
    destino: 'Houston, TX',
    destinoPais: 'USA',
    tipoViatico: 'amex',
    fechaInicio: '2025-12-20',
    fechaFin: '2025-12-23',
    montoSolicitado: 28000,
    montoAprobado: 28000,
    status: 'aprobado',
    gsActivityId: 1,
    createdAt: '2025-12-03T14:30:00Z',
    aprobadoPor: 'María López',
    comentarios: 'Aprobado. Coordinarse con cliente.',
  },
  {
    id: 'VIA-003',
    userId: 'user1',
    userName: 'Juan Pérez',
    proyectoId: 'PRJ-003',
    proyectoNombre: 'Proyecto GDL',
    motivo: 'Instalación de equipos y capacitación',
    destino: 'Guadalajara',
    destinoPais: 'Mexico',
    tipoViatico: 'mixto',
    fechaInicio: '2025-11-25',
    fechaFin: '2025-11-28',
    montoSolicitado: 12000,
    montoAprobado: 12000,
    montoDispersado: 12000,
    montoGastado: 12000,
    saldoRestante: 0,
    status: 'completado',
    gsActivityId: 1,
    createdAt: '2025-11-15T09:00:00Z',
    aprobadoPor: 'Carlos Gómez',
    comentarios: 'Completado exitosamente',
  },
];

interface GastoDocumento {
  id: string;
  viaticoId: string;
  tipo: 'completo' | 'sin_xml';
  descripcion: string;
  monto: number;
  pdf?: File;
  xml?: File;
  ticket?: File;
  fecha: string;
}

export default function UsuarioView() {
  const [viaticos] = useState<Viatico[]>(MOCK_VIATICOS);
  const [viaticoSeleccionado, setViaticoSeleccionado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'activos' | 'completados'>('activos');

  // Estado para documentos
  const [gastos, setGastos] = useState<GastoDocumento[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [ticketFile, setTicketFile] = useState<File | null>(null);

  const proyectos = getProyectos();

  // Filtrar viáticos
  const viaticosFiltrados = viaticos.filter(v => {
    if (filtro === 'activos') {
      return ['aprobado', 'dispersado', 'en_viaje'].includes(v.status);
    }
    if (filtro === 'completados') {
      return v.status === 'completado';
    }
    return true;
  });

  const getEstadoInfo = (status: Viatico['status']) => {
    const configs = {
      pendiente: { label: 'Pendiente de Aprobación', color: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
      aprobado: { label: 'Esperando dispersión', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
      rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: '❌' },
      dispersado: { label: 'Dispersado', color: 'bg-green-100 text-green-700', icon: '✅' },
      en_viaje: { label: 'En Viaje', color: 'bg-purple-100 text-purple-700', icon: '✈️' },
      viaje_finalizado: { label: 'Viaje Finalizado', color: 'bg-indigo-100 text-indigo-700', icon: '🏁' },
      en_recuperacion: { label: 'Pendiente Recuperación', color: 'bg-orange-100 text-orange-700', icon: '💰' },
      completado: { label: 'Completado', color: 'bg-gray-100 text-gray-700', icon: '✅' },
    };
    return configs[status] || configs.pendiente;
  };

  const getAccionBoton = (viatico: Viatico) => {
    if (viatico.status === 'dispersado' || viatico.status === 'viaje_finalizado') {
      const facturasCompletas = (viatico.montoGastado || 0) >= (viatico.montoDispersado || 0) * 0.9;
      return facturasCompletas
        ? { label: 'Documentos completos', color: 'bg-green-100 text-green-700', icon: '✅', accion: 'ver' }
        : { label: 'Pendiente por subir facturas', color: 'bg-yellow-100 text-yellow-700', icon: '📄', accion: 'subir' };
    }
    if (viatico.status === 'aprobado') {
      return { label: 'Esperando dispersión', color: 'bg-blue-100 text-blue-700', icon: '⏳', accion: 'none' };
    }
    if (viatico.status === 'completado') {
      return { label: 'Documentos completos', color: 'bg-green-100 text-green-700', icon: '✅', accion: 'ver' };
    }
    return { label: 'Ver detalles', color: 'bg-gray-100 text-gray-700', icon: 'ℹ️', accion: 'ver' };
  };

  const handleAccionClick = (viatico: Viatico, accion: string) => {
    if (accion === 'subir') {
      setViaticoSeleccionado(viatico.id);
    }
  };

  const handleAgregarGasto = () => {
    if (!pdfFile && !ticketFile) {
      alert('Debes subir al menos el PDF o un ticket/foto');
      return;
    }

    const nuevoGasto: GastoDocumento = {
      id: `GASTO-${Date.now()}`,
      viaticoId: viaticoSeleccionado!,
      tipo: xmlFile ? 'completo' : 'sin_xml',
      descripcion: pdfFile?.name || ticketFile?.name || 'Sin descripción',
      monto: 0,
      pdf: pdfFile || undefined,
      xml: xmlFile || undefined,
      ticket: ticketFile || undefined,
      fecha: new Date().toISOString(),
    };

    setGastos([...gastos, nuevoGasto]);

    // Limpiar campos
    setPdfFile(null);
    setXmlFile(null);
    setTicketFile(null);
  };

  const handleSubirDocumentos = () => {
    if (gastos.length === 0) {
      alert('Debes agregar al menos un gasto');
      return;
    }

    // Aquí iría la lógica para subir al backend
    console.log('Subiendo gastos:', gastos);
    alert(`${gastos.length} gasto(s) subido(s) exitosamente`);

    // Limpiar y volver a la lista
    setGastos([]);
    setViaticoSeleccionado(null);
  };

  const eliminarGasto = (gastoId: string) => {
    setGastos(gastos.filter(g => g.id !== gastoId));
  };

  const viaticoActual = viaticos.find(v => v.id === viaticoSeleccionado);
  const proyectoActual = proyectos.find(p => p.id === viaticoActual?.proyectoId);

  return (
    <div className="space-y-6">
      {!viaticoSeleccionado ? (
        <>
          {/* Vista Principal: Lista de Viáticos */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mi Portal - Mis Viáticos</h1>
              <p className="text-sm text-gray-600 mt-1">Gestiona tus viáticos y sube tus comprobantes</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex space-x-2">
            <button
              onClick={() => setFiltro('todos')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filtro === 'todos'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFiltro('activos')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filtro === 'activos'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Activos
            </button>
            <button
              onClick={() => setFiltro('completados')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filtro === 'completados'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Completados
            </button>
          </div>

          {/* Lista de Viáticos */}
          <div className="space-y-4">
            {viaticosFiltrados.length > 0 ? (
              viaticosFiltrados.map((viatico) => {
                const estadoInfo = getEstadoInfo(viatico.status);
                const accionBoton = getAccionBoton(viatico);
                const proyecto = proyectos.find(p => p.id === viatico.proyectoId);

                return (
                  <div key={viatico.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">
                            {estadoInfo.icon} {viatico.destino} - {proyecto?.nombre || viatico.proyectoNombre}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>{new Date(viatico.fechaInicio).toLocaleDateString('es-MX')} - {new Date(viatico.fechaFin).toLocaleDateString('es-MX')}</span>
                          <span className="font-semibold text-gray-900">${viatico.montoAprobado?.toLocaleString() || viatico.montoSolicitado.toLocaleString()} MXN</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${estadoInfo.color}`}>
                        {estadoInfo.label}
                      </span>
                    </div>

                    {/* Botón de acción */}
                    {accionBoton.accion !== 'none' && (
                      <button
                        onClick={() => handleAccionClick(viatico, accionBoton.accion)}
                        className={`w-full px-4 py-3 rounded-lg font-medium text-sm transition-colors ${accionBoton.color} hover:opacity-90`}
                      >
                        {accionBoton.icon} {accionBoton.label}
                      </button>
                    )}

                    {/* Información de recuperación si aplica */}
                    {viatico.saldoRestante && viatico.saldoRestante > 0 && (
                      <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <p className="text-sm text-orange-800">
                          <span className="font-semibold">Pendiente por recuperar:</span> ${viatico.saldoRestante.toLocaleString()} MXN
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay viáticos {filtro !== 'todos' ? filtro : ''}</h3>
                <p className="text-gray-600">Intenta cambiar los filtros o solicita un nuevo viático</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Vista de Carga de Documentos */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => {
                setViaticoSeleccionado(null);
                setGastos([]);
              }}
              className="text-primary-600 hover:text-primary-700 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Volver a la lista</span>
            </button>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Viático: {viaticoActual?.destino} - {proyectoActual?.nombre}
            </h1>
          </div>

          {/* Información del Viático */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Información del Viático</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Destino</p>
                <p className="text-base font-medium text-gray-900">{viaticoActual?.destino}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Proyecto</p>
                <p className="text-base font-medium text-gray-900">{proyectoActual?.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fechas</p>
                <p className="text-base font-medium text-gray-900">
                  {new Date(viaticoActual!.fechaInicio).toLocaleDateString('es-MX')} -{' '}
                  {new Date(viaticoActual!.fechaFin).toLocaleDateString('es-MX')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monto</p>
                <p className="text-base font-semibold text-gray-900">
                  ${viaticoActual?.montoDispersado?.toLocaleString() || viaticoActual?.montoAprobado?.toLocaleString()} MXN
                </p>
              </div>
            </div>

            {viaticoActual?.montoGastado !== undefined && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Monto Comprobado:</span>
                  <span className="font-semibold text-gray-900">${viaticoActual.montoGastado.toLocaleString()} MXN</span>
                </div>
                {viaticoActual.saldoRestante && viaticoActual.saldoRestante > 0 && (
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-orange-600 font-medium">Por Recuperar:</span>
                    <span className="font-semibold text-orange-600">${viaticoActual.saldoRestante.toLocaleString()} MXN</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subir Documentos */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Subir Documentos</h2>

            <div className="space-y-6">
              {/* 1. Factura PDF */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  1️⃣ Factura PDF
                </label>
                <div className="flex items-center space-x-4">
                  <label className="flex-1 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 cursor-pointer transition-colors">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm text-gray-600">Seleccionar archivo PDF</span>
                    </div>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {pdfFile && (
                    <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                      <span className="text-sm font-medium text-green-700">{pdfFile.name}</span>
                      <button onClick={() => setPdfFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Factura XML */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  2️⃣ Factura XML
                </label>
                <div className="flex items-center space-x-4">
                  <label className="flex-1 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 cursor-pointer transition-colors">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm text-gray-600">Seleccionar archivo XML</span>
                    </div>
                    <input
                      type="file"
                      accept=".xml"
                      onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {xmlFile && (
                    <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                      <span className="text-sm font-medium text-green-700">{xmlFile.name}</span>
                      <button onClick={() => setXmlFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Ticket/Foto */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  3️⃣ Ticket / Comprobante (Foto)
                </label>
                <div className="flex items-center space-x-4">
                  <label className="flex-1 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 cursor-pointer transition-colors">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm text-gray-600">Tomar foto o seleccionar</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setTicketFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {ticketFile && (
                    <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                      <span className="text-sm font-medium text-green-700">{ticketFile.name}</span>
                      <button onClick={() => setTicketFile(null)} className="text-red-600 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón agregar gasto */}
              <div className="flex justify-end">
                <button
                  onClick={handleAgregarGasto}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  + Agregar Gasto
                </button>
              </div>

              {/* Lista de gastos agregados */}
              {gastos.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Gastos agregados ({gastos.length})
                  </h3>
                  <div className="space-y-2">
                    {gastos.map((gasto) => (
                      <div key={gasto.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{gasto.descripcion}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              {gasto.pdf && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">PDF</span>}
                              {gasto.xml && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">XML</span>}
                              {gasto.ticket && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Ticket</span>}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => eliminarGasto(gasto.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón final de subir */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => {
                    setViaticoSeleccionado(null);
                    setGastos([]);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubirDocumentos}
                  disabled={gastos.length === 0}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  Subir Documentos ({gastos.length})
                </button>
              </div>
            </div>
          </div>

          {/* Ayuda */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-blue-800 mb-1">Ayuda</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• El PDF y XML deben ser de la misma factura</li>
                  <li>• Si solo tienes un ticket (sin factura), solo sube la foto en la sección 3</li>
                  <li>• Puedes agregar múltiples gastos para un mismo viático</li>
                  <li>• Asegúrate de que las fotos sean legibles</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
