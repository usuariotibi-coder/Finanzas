import { useState, useMemo } from 'react';
import type { Proyecto, ProyectoEstado } from '../../types';
import { getProyectos } from '../../components/common/ProyectoSelector';

const STORAGE_KEY = 'proyectos_data';

export default function Proyectos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>(getProyectos());
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<ProyectoEstado | 'todos'>('todos');
  const [filtroCliente, setFiltroCliente] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null);

  // Formulario
  const [formData, setFormData] = useState<Partial<Proyecto>>({
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

    return filtered;
  }, [proyectos, searchTerm, filtroEstado, filtroCliente]);

  // Métricas
  const metricas = useMemo(() => {
    const activos = proyectos.filter(p => p.estado === 'activo').length;
    const presupuestoTotal = proyectos.reduce((sum, p) => sum + p.presupuesto, 0);
    const gastadoTotal = proyectos.reduce((sum, p) => sum + p.gastado, 0);

    return {
      proyectosActivos: activos,
      presupuestoTotal,
      gastadoTotal,
      porcentajeUso: presupuestoTotal > 0 ? (gastadoTotal / presupuestoTotal) * 100 : 0
    };
  }, [proyectos]);

  const guardarProyectos = (nuevosProyectos: Proyecto[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevosProyectos));
    setProyectos(nuevosProyectos);
  };

  const abrirModal = (proyecto?: Proyecto) => {
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
  };

  const guardarProyecto = () => {
    if (!formData.codigo || !formData.nombre || !formData.cliente || !formData.responsable) {
      alert('Por favor completa todos los campos obligatorios');
      return;
    }

    const ahora = new Date().toISOString();

    if (modoEdicion && proyectoSeleccionado) {
      // Actualizar proyecto existente
      const actualizado: Proyecto = {
        ...formData as Proyecto,
        id: proyectoSeleccionado.id,
        createdAt: proyectoSeleccionado.createdAt,
        updatedAt: ahora
      };

      const nuevosProyectos = proyectos.map(p =>
        p.id === proyectoSeleccionado.id ? actualizado : p
      );
      guardarProyectos(nuevosProyectos);
    } else {
      // Crear nuevo proyecto
      const nuevoProyecto: Proyecto = {
        ...(formData as Proyecto),
        id: `PRJ-${Date.now()}`,
        createdAt: ahora,
        updatedAt: ahora
      };

      guardarProyectos([...proyectos, nuevoProyecto]);
    }

    cerrarModal();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-600 mt-1">Gestiona todos los proyectos de la compañía</p>
        </div>
        <button
          onClick={() => abrirModal()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Nuevo Proyecto</span>
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Proyectos Activos</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{metricas.proyectosActivos}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Presupuesto Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                ${(metricas.presupuestoTotal / 1000000).toFixed(1)}M
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Gastado Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                ${(metricas.gastadoTotal / 1000000).toFixed(1)}M
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">% de Uso</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{metricas.porcentajeUso.toFixed(1)}%</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <input
              type="text"
              placeholder="Buscar proyecto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as ProyectoEstado | 'todos')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="todos">Todos los clientes</option>
              {clientes.map(cliente => (
                <option key={cliente} value={cliente}>{cliente}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end">
            <span className="text-sm text-gray-600">
              {proyectosFiltrados.length} proyecto{proyectosFiltrados.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de Proyectos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
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
                  Gastado
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
            <tbody className="bg-white divide-y divide-gray-200">
              {proyectosFiltrados.map((proyecto) => {
                const porcentajeUso = (proyecto.gastado / proyecto.presupuesto) * 100;

                return (
                  <tr key={proyecto.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-gray-900">{proyecto.codigo}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{proyecto.nombre}</span>
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
                      <span className="text-sm text-gray-900">${proyecto.presupuesto.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">${proyecto.gastado.toLocaleString()}</span>
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
                        <span className="text-xs text-gray-600">{porcentajeUso.toFixed(1)}%</span>
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

          {proyectosFiltrados.length === 0 && (
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
          )}
        </div>
      </div>

      {/* Modal Crear/Editar Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={cerrarModal}></div>

            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {modoEdicion ? 'Editar Proyecto' : 'Nuevo Proyecto'}
                </h3>
              </div>

              <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Código <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.codigo}
                        onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="PRJ-2025-001"
                      />
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
                      Nombre del Proyecto <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Ej: Obra Aeropuerto TLM"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cliente <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.cliente}
                        onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Nombre del cliente"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Departamento
                      </label>
                      <input
                        type="text"
                        value={formData.departamento}
                        onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Ej: Operaciones"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                        Gastado (MXN)
                      </label>
                      <input
                        type="number"
                        value={formData.gastado || ''}
                        onChange={(e) => setFormData({ ...formData, gastado: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Nombre del Project Manager"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción
                    </label>
                    <textarea
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Descripción breve del proyecto"
                    ></textarea>
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

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={cerrarModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarProyecto}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
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
