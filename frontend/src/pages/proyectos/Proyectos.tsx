import { useEffect, useMemo, useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import useAuth from '../../hooks/useAuth';
import type { Proyecto, ProyectoEstado } from '../../types';
import { getProyectos } from '../../components/common/ProyectoSelector';
import {
  createProyecto,
  fetchProyectos,
  syncCoreAppData,
  updateProyecto,
} from '../../utils/backendSync';
import {
  formatProyectoMontoCompacto,
  getProyectoUsoPorcentaje,
  sanitizeProyectoMontos,
  toSafeMonto,
} from '../../utils/proyectoMetrics';

export default function Proyectos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>(() => getProyectos().map(sanitizeProyectoMontos));
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useLocalStorageState('proyectos:searchTerm', '');
  const [filtroEstado, setFiltroEstado] = useLocalStorageState<ProyectoEstado | 'todos'>('proyectos:filtroEstado', 'todos');
  const [filtroCliente, setFiltroCliente] = useLocalStorageState<string>('proyectos:filtroCliente', 'todos');
  const [isModalOpen, setIsModalOpen] = useLocalStorageState('proyectos:isModalOpen', false);
  const [modoEdicion, setModoEdicion] = useLocalStorageState('proyectos:modoEdicion', false);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useLocalStorageState<Proyecto | null>('proyectos:proyectoSeleccionado', null);

  // Formulario
  const [formData, setFormData] = useLocalStorageState<Partial<Proyecto>>('proyectos:formData', {
    codigo: '',
    nombre: '',
    cliente: '',
    estado: 'activo',
    presupuesto: 0,
    gastado: 0,
    fechaInicio: '',
    fechaFinEstimada: '',
    responsable: '',
    departamento: '',
    descripcion: '',
    notas: ''
  });
  const [showFormErrors, setShowFormErrors] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProyectos = async () => {
      try {
        const data = await fetchProyectos();
        if (active) {
          setProyectos(data.map(sanitizeProyectoMontos));
        }
      } catch {
        // Keep local cached data if backend request fails.
      }
    };

    void loadProyectos();

    return () => {
      active = false;
    };
  }, []);

  // Clientes únicos para filtro
  const clientes = useMemo(() => {
    const uniqueClientes = Array.from(new Set(proyectos.map(p => p.cliente)));
    return uniqueClientes.sort();
  }, [proyectos]);

  // Filtrar proyectos
  const proyectosFiltrados = useMemo(() => {
    let filtered = proyectos;

    // Filtro por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.codigo.toLowerCase().includes(term) ||
          p.nombre.toLowerCase().includes(term) ||
          p.cliente.toLowerCase().includes(term) ||
          p.responsable.toLowerCase().includes(term)
      );
    }

    // Filtro por estado
    if (filtroEstado !== 'todos') {
      filtered = filtered.filter(p => p.estado === filtroEstado);
    }

    // Filtro por cliente
    if (filtroCliente !== 'todos') {
      filtered = filtered.filter(p => p.cliente === filtroCliente);
    }

    const estadoOrden = {
      activo: 0,
      en_pausa: 1,
      completado: 2,
      cancelado: 3,
    } as const;

    return [...filtered].sort((a, b) => {
      const ordenA = estadoOrden[a.estado] ?? 99;
      const ordenB = estadoOrden[b.estado] ?? 99;
      if (ordenA !== ordenB) {
        return ordenA - ordenB;
      }
      return a.nombre.localeCompare(b.nombre);
    });
  }, [proyectos, searchTerm, filtroEstado, filtroCliente]);

  // Métricas
  const metricas = useMemo(() => {
    const activos = proyectos.filter(p => p.estado === 'activo').length;
    const presupuestoTotal = proyectos.reduce((sum, p) => sum + toSafeMonto(p.presupuesto), 0);
    const gastadoTotal = proyectos.reduce((sum, p) => sum + toSafeMonto(p.gastado), 0);

    return {
      proyectosActivos: activos,
      presupuestoTotal,
      gastadoTotal,
      porcentajeUso: getProyectoUsoPorcentaje(gastadoTotal, presupuestoTotal),
    };
  }, [proyectos]);
  const formErrors = showFormErrors
    ? {
      codigo: !formData.codigo?.trim() ? 'Ingresa el codigo.' : '',
      cliente: !formData.cliente?.trim() ? 'Ingresa el cliente o descripcion.' : '',
      responsable: !formData.responsable?.trim() ? 'Ingresa el responsable.' : '',
    }
    : {};

  const abrirModal = (proyecto?: Proyecto) => {
    setShowFormErrors(false);
    if (proyecto) {
      setModoEdicion(true);
      setProyectoSeleccionado(proyecto);
      setFormData(proyecto);
    } else {
      setModoEdicion(false);
      setProyectoSeleccionado(null);
      const siguienteCodigo = `PRJ-${new Date().getFullYear()}-${String(proyectos.length + 1).padStart(3, '0')}`;
      setFormData({
        codigo: siguienteCodigo,
        nombre: '',
        cliente: '',
        estado: 'activo',
        presupuesto: 0,
        gastado: 0,
        fechaInicio: '',
        fechaFinEstimada: '',
        responsable: '',
        departamento: '',
        descripcion: '',
        notas: ''
      });
    }
    setIsModalOpen(true);
  };

  const cerrarModal = () => {
    setIsModalOpen(false);
    setModoEdicion(false);
    setProyectoSeleccionado(null);
    setShowFormErrors(false);
  };

  useEscapeKey(cerrarModal, isModalOpen);

  const guardarProyecto = async () => {
    const clienteDescripcion = formData.cliente?.trim() || '';
    if (!formData.codigo?.trim() || !clienteDescripcion || !formData.responsable?.trim()) {
      setShowFormErrors(true);
      return;
    }

    try {
      if (modoEdicion && proyectoSeleccionado) {
        const actualizado = await updateProyecto(proyectoSeleccionado.id, {
          ...formData,
          nombre: clienteDescripcion,
          descripcion: clienteDescripcion,
        });
        setProyectos((prev) =>
          prev.map((proyecto) =>
            proyecto.id === actualizado.id ? sanitizeProyectoMontos(actualizado) : proyecto
          )
        );
      } else {
        const nuevoProyecto = await createProyecto({
          ...formData,
          nombre: clienteDescripcion,
          descripcion: clienteDescripcion,
        });
        setProyectos((prev) => [...prev, sanitizeProyectoMontos(nuevoProyecto)]);
      }

      await syncCoreAppData({ userId: user ? String(user.id) : undefined });
      cerrarModal();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar el proyecto.');
    }
  };

  const getEstadoBadgeColor = (estado: ProyectoEstado) => {
    switch (estado) {
      case 'activo':
        return 'bg-green-100 text-green-700';
      case 'en_pausa':
        return 'bg-yellow-100 text-yellow-700';
      case 'completado':
        return 'bg-blue-100 text-blue-700';
      case 'cancelado':
        return 'bg-red-100 text-red-700';
    }
  };

  const getEstadoLabel = (estado: ProyectoEstado) => {
    switch (estado) {
      case 'activo':
        return 'Activo';
      case 'en_pausa':
        return 'En Pausa';
      case 'completado':
        return 'Completado';
      case 'cancelado':
        return 'Cancelado';
    }
  };

  const getEstadoIcon = (estado: ProyectoEstado) => {
    const icons = {
      activo: '✅',
      en_pausa: '⏸️',
      completado: '🏁',
      cancelado: '⛔',
    };

    return icons[estado] || '📁';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Proyectos</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Proyectos</h1>
                <p className="text-[11px] text-slate-600">Gestiona todos los proyectos de la compañía</p>
              </div>
              <button
              onClick={() => abrirModal()}
              className="w-full sm:w-auto px-2.5 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center sm:justify-start space-x-2 text-[11px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuevo Proyecto</span>
            </button>
          </div>

          {/* Metricas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              className="w-full text-left bg-white rounded-lg shadow-sm p-2.5 border border-gray-100 transition hover:-translate-y-0.5 hover:shadow-md select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-600">Proyectos Activos</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{metricas.proyectosActivos}</p>
                </div>
                <div className="hidden sm:flex w-7 h-7 bg-green-100 rounded-full items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
            </button>

            <button
              type="button"
              className="w-full text-left bg-white rounded-lg shadow-sm p-2.5 border border-gray-100 transition hover:-translate-y-0.5 hover:shadow-md select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-600">Presupuesto Total</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatProyectoMontoCompacto(metricas.presupuestoTotal)}
                  </p>
                </div>
                <div className="hidden sm:flex w-7 h-7 bg-blue-100 rounded-full items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
            </button>

            <button
              type="button"
              className="w-full text-left bg-white rounded-lg shadow-sm p-2.5 border border-gray-100 transition hover:-translate-y-0.5 hover:shadow-md select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-600">Gastado Total</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatProyectoMontoCompacto(metricas.gastadoTotal)}
                  </p>
                </div>
                <div className="hidden sm:flex w-7 h-7 bg-purple-100 rounded-full items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
            </button>

            <button
              type="button"
              className="w-full text-left bg-white rounded-lg shadow-sm p-2.5 border border-gray-100 transition hover:-translate-y-0.5 hover:shadow-md select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-600">% de Uso</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{metricas.porcentajeUso.toFixed(1)}%</p>
                </div>
                <div className="hidden sm:flex w-7 h-7 bg-orange-100 rounded-full items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-3.5 h-3.5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                    />
                  </svg>
                </div>
              </div>
            </button>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-lg shadow-sm p-2.5 border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <input
                  type="text"
                  placeholder="Buscar proyecto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-2.5 py-1 text-[11px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as ProyectoEstado | 'todos')}
                  className="w-full px-2.5 py-1 text-[11px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="activo">Activo</option>
                  <option value="en_pausa">En Pausa</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div>
                <select
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  className="w-full px-2.5 py-1 text-[11px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="todos">Todos los clientes</option>
                  {clientes.map(cliente => (
                    <option key={cliente} value={cliente}>{cliente}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-start lg:justify-end">
                <span className="text-[10px] text-gray-600">
                  {proyectosFiltrados.length} proyecto{proyectosFiltrados.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Tabla de Proyectos - Responsive */}
      <div className="bg-white rounded-lg shadow">
        {proyectosFiltrados.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron proyectos</h3>
            <p className="mt-1 text-sm text-gray-500">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <>
            {/* Vista Desktop - Tabla */}
            <div className="hidden lg:block overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Código
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Presupuesto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % Uso
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Responsable
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {proyectosFiltrados.map((proyecto) => {
                    const porcentajeUso = getProyectoUsoPorcentaje(proyecto.gastado, proyecto.presupuesto);

                    return (
                      <tr key={proyecto.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900">{proyecto.codigo}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            <span className="text-sm">{getEstadoIcon(proyecto.estado)}</span>
                            <span>{proyecto.nombre}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{proyecto.cliente}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded ${getEstadoBadgeColor(proyecto.estado)}`}>
                            {getEstadoLabel(proyecto.estado)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">${(proyecto.presupuesto / 1000).toFixed(0)}K</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  porcentajeUso > 90
                                    ? 'bg-red-600'
                                    : porcentajeUso > 75
                                    ? 'bg-yellow-600'
                                    : 'bg-green-600'
                                }`}
                                style={{ width: `${Math.min(porcentajeUso, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-600 w-8">{porcentajeUso.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{proyecto.responsable}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => abrirModal(proyecto)}
                            className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista Móvil - Cards */}
            <div className="lg:hidden divide-y divide-gray-200">
              {proyectosFiltrados.map((proyecto) => {
                const porcentajeUso = getProyectoUsoPorcentaje(proyecto.gastado, proyecto.presupuesto);

                return (
                  <div key={proyecto.id} className="p-4 hover:bg-gray-50">
                    <div className="space-y-3">
                      {/* Header Card */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-700">
                              {proyecto.codigo}
                            </span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded ${getEstadoBadgeColor(proyecto.estado)}`}>
                              {getEstadoLabel(proyecto.estado)}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 mt-2 flex items-center gap-2">
                            <span className="text-sm">{getEstadoIcon(proyecto.estado)}</span>
                            <span>{proyecto.nombre}</span>
                          </h3>
                          <p className="text-xs text-gray-600 mt-1">{proyecto.cliente}</p>
                        </div>
                        <button
                          onClick={() => abrirModal(proyecto)}
                          className="text-primary-600 hover:text-primary-900 ml-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>

                      {/* Presupuesto Info */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-600">Presupuesto</p>
                          <p className="text-sm font-semibold text-gray-900">${(proyecto.presupuesto / 1000).toFixed(0)}K</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Gastado</p>
                          <p className="text-sm font-semibold text-gray-900">${(proyecto.gastado / 1000).toFixed(0)}K</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-gray-600">Uso de Presupuesto</p>
                          <span className="text-xs font-semibold text-gray-900">{porcentajeUso.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              porcentajeUso > 90
                                ? 'bg-red-600'
                                : porcentajeUso > 75
                                ? 'bg-yellow-600'
                                : 'bg-green-600'
                            }`}
                            style={{ width: `${Math.min(porcentajeUso, 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Responsable */}
                      <div className="text-xs text-gray-600">
                        PM: <span className="font-medium text-gray-900">{proyecto.responsable}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal Crear/Editar Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 py-8">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={cerrarModal}></div>

            <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[94vh] overflow-y-auto">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
                <h3 className="text-lg font-semibold text-gray-900">
                  {modoEdicion ? 'Editar Proyecto' : 'Nuevo Proyecto'}
                </h3>
              </div>

              <div className="px-4 sm:px-5 py-3">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Código <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.codigo}
                        onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                          formErrors.codigo
                            ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                            : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                        }`}
                        placeholder="PRJ-2025-001"
                      />
                      {formErrors.codigo && (
                        <p className="mt-1 text-xs text-rose-600">{formErrors.codigo}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estado
                      </label>
                      <select
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value as ProyectoEstado })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="activo">Activo</option>
                        <option value="en_pausa">En Pausa</option>
                        <option value="completado">Completado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cliente / Descripción <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.cliente}
                      onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                        formErrors.cliente
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                      }`}
                      placeholder="Cliente o descripción breve del proyecto"
                    />
                    {formErrors.cliente && (
                      <p className="mt-1 text-xs text-rose-600">{formErrors.cliente}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Presupuesto (MXN)
                      </label>
                      <input
                        type="number"
                        value={formData.presupuesto || ''}
                        onChange={(e) => setFormData({ ...formData, presupuesto: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Gastado Acumulado (MXN)
                      </label>
                      <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-medium text-gray-700">
                        {formatProyectoMontoCompacto(formData.gastado || 0)}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Se actualiza automaticamente cuando se aprueban gastos.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fecha de Inicio
                      </label>
                      <input
                        type="date"
                        value={formData.fechaInicio}
                        onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fecha de Fin Estimada
                      </label>
                      <input
                        type="date"
                        value={formData.fechaFinEstimada}
                        onChange={(e) => setFormData({ ...formData, fechaFinEstimada: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Responsable (PM) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.responsable}
                      onChange={(e) => setFormData({ ...formData, responsable: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                        formErrors.responsable
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                      }`}
                      placeholder="Nombre del Project Manager"
                    />
                    {formErrors.responsable && (
                      <p className="mt-1 text-xs text-rose-600">{formErrors.responsable}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notas
                    </label>
                    <textarea
                      value={formData.notas}
                      onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Notas adicionales (opcional)"
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
                <button
                  onClick={cerrarModal}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarProyecto}
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                >
                  {modoEdicion ? 'Guardar Cambios' : 'Crear Proyecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
