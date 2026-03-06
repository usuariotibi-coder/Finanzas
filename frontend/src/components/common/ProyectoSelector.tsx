import { useState, useMemo } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import type { Proyecto } from '../../types';
import { getCachedProyectos } from '../../utils/backendSync';
import {
  getProyectoPresupuestoDisponible,
  getProyectoUsoPorcentaje,
  sanitizeProyectoMontos,
  toSafeMonto,
} from '../../utils/proyectoMetrics';
import { NEW_PROJECT_ID } from '../../utils/proyectoLabel';

interface ProyectoSelectorProps {
  value: string;                    // ID del proyecto seleccionado
  onChange: (proyectoId: string, proyecto: Proyecto | null) => void;
  required?: boolean;               // Obligatorio o no
  filterByUser?: boolean;           // Filtrar por proyectos del usuario
  showInactive?: boolean;           // Mostrar proyectos inactivos
  showCreateOption?: boolean;       // Mostrar opcion de nuevo proyecto
  disabled?: boolean;
  label?: string;
  inputClassName?: string;
  compact?: boolean;
}

const STORAGE_KEY = 'proyectos_data';
const NEW_PROJECT_LABEL = 'Nuevo Proyecto';
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function getProyectos(): Proyecto[] {
  const cached = getCachedProyectos();
  if (cached.length > 0) {
    return cached.map(sanitizeProyectoMontos);
  }

  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? (parsed as Proyecto[]).map(sanitizeProyectoMontos) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function ProyectoSelector({
  value,
  onChange,
  required = false,
  filterByUser: _filterByUser = false,
  showInactive = false,
  showCreateOption = false,
  disabled = false,
  label = 'Proyecto',
  inputClassName = '',
  compact = false,
}: ProyectoSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEscapeKey(() => setIsOpen(false), isOpen);
  const [searchTerm, setSearchTerm] = useState('');

  const proyectos = getProyectos();

  // Filtrar proyectos
  const filteredProyectos = useMemo(() => {
    let filtered = proyectos;

    // Filtrar por estado (activo por defecto)
    if (!showInactive) {
      filtered = filtered.filter(p => p.estado === 'activo');
    }

    // Filtrar por término de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.codigo.toLowerCase().includes(term) ||
          p.nombre.toLowerCase().includes(term) ||
          p.cliente.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [proyectos, showInactive, searchTerm]);

  const selectedProyecto = proyectos.find(p => p.id === value);
  const isNewProjectSelected = value === NEW_PROJECT_ID;

  const handleSelect = (proyecto: Proyecto) => {
    onChange(proyecto.id, proyecto);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleSelectNew = () => {
    onChange(NEW_PROJECT_ID, null);
    setIsOpen(false);
    setSearchTerm('');
  };

  const getEstadoBadgeColor = (estado: Proyecto['estado']) => {
    switch (estado) {
      case 'activo':
        return 'bg-green-100 text-green-700';
      case 'en_pausa':
        return 'bg-yellow-100 text-yellow-700';
      case 'completado':
        return 'bg-blue-100 text-blue-700';
      case 'cancelado':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getEstadoLabel = (estado: Proyecto['estado']) => {
    switch (estado) {
      case 'activo':
        return 'Activo';
      case 'en_pausa':
        return 'En Pausa';
      case 'completado':
        return 'Completado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return estado;
    }
  };

  const calcularPresupuestoDisponible = (proyecto: Proyecto) => {
    return getProyectoPresupuestoDisponible(proyecto.gastado, proyecto.presupuesto);
  };

  const calcularPorcentajeUso = (proyecto: Proyecto) => {
    return getProyectoUsoPorcentaje(proyecto.gastado, proyecto.presupuesto);
  };

  return (
    <div className="relative w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Selected value display */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 text-left border rounded-lg flex items-center justify-between ${
          compact ? 'min-h-[44px] py-2' : 'min-h-[74px] py-2'
        } ${
          disabled
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : 'bg-white hover:border-primary-500 cursor-pointer'
        } ${isOpen ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-300'} ${inputClassName}`}
      >
        {isNewProjectSelected ? (
          <div className="flex items-center space-x-2 flex-1">
            <span className="text-sm font-medium text-gray-900">{NEW_PROJECT_LABEL}</span>
          </div>
        ) : selectedProyecto ? (
          <div className={`flex flex-1 ${compact ? 'min-w-0 items-center' : 'flex-col'}`}>
            {(() => {
              const selectedNombre = (selectedProyecto.nombre || '').trim();
              const selectedCliente = (selectedProyecto.cliente || '').trim();
              const sameClienteDescripcion = Boolean(selectedCliente && selectedNombre && sameText(selectedNombre, selectedCliente));
              const selectedDescripcion = sameClienteDescripcion ? '' : selectedNombre;
              const selectedCodigo = (selectedProyecto.codigo || '').trim();
              const compactLabel = [selectedCodigo, selectedCliente]
                .filter(Boolean)
                .join(' - ') || selectedNombre || selectedProyecto.codigo;
              return (
                <>
                  {compact ? (
                    <span className="truncate text-sm font-medium text-gray-900">{compactLabel}</span>
                  ) : (
                    <>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-gray-900">{selectedProyecto.codigo}</span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getEstadoBadgeColor(selectedProyecto.estado)}`}>
                          {getEstadoLabel(selectedProyecto.estado)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 truncate">
                        {sameClienteDescripcion
                          ? `Cliente/Descripcion: ${selectedCliente || '-'}`
                          : `Cliente: ${selectedCliente || '-'} | Descripcion: ${selectedDescripcion || '-'}`}
                      </span>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          <span className="text-gray-500">Selecciona un proyecto...</span>
        )}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>

          {/* Dropdown menu */}
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-hidden flex flex-col">
            {/* Search box */}
            <div className="p-3 border-b border-gray-200">
              <input
                type="text"
                placeholder="Buscar proyecto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                autoFocus
              />
            </div>

            {showCreateOption && (
              <button
                type="button"
                onClick={handleSelectNew}
                className={`flex items-center justify-between px-4 py-2 text-sm border-b border-gray-200 transition-colors ${
                  isNewProjectSelected ? 'bg-blue-50 text-blue-700' : 'text-primary-700 hover:bg-primary-50'
                }`}
              >
                <span>{NEW_PROJECT_LABEL}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}

            {/* Projects list */}
            <div className="overflow-y-auto flex-1">
              {filteredProyectos.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  No se encontraron proyectos
                </div>
              ) : (
                filteredProyectos.map((proyecto) => {
                  const presupuesto = toSafeMonto(proyecto.presupuesto);
                  const gastado = toSafeMonto(proyecto.gastado);
                  const disponible = calcularPresupuestoDisponible(proyecto);
                  const porcentajeUso = calcularPorcentajeUso(proyecto);
                  const nombreProyecto = (proyecto.nombre || '').trim();
                  const clienteProyecto = (proyecto.cliente || '').trim();
                  const sameClienteDescripcion = Boolean(clienteProyecto && nombreProyecto && sameText(nombreProyecto, clienteProyecto));
                  const descripcionProyecto = sameClienteDescripcion ? '' : nombreProyecto;

                  return (
                    <button
                      key={proyecto.id}
                      type="button"
                      onClick={() => handleSelect(proyecto)}
                      className={`w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                        value === proyecto.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {/* Header */}
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-bold text-gray-900">{proyecto.codigo}</span>
                            {value === proyecto.id && (
                              <svg className="w-4 h-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                          <p className="mb-1.5 text-xs text-gray-600">
                            {sameClienteDescripcion
                              ? `Cliente/Descripcion: ${clienteProyecto || '-'}`
                              : `Cliente: ${clienteProyecto || '-'} | Descripcion: ${descripcionProyecto || '-'}`}
                          </p>

                          {/* Estado y presupuesto */}
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getEstadoBadgeColor(proyecto.estado)}`}>
                              {getEstadoLabel(proyecto.estado)}
                            </span>
                            <span className="text-xs text-gray-600">
                              ${gastado.toLocaleString()} / ${presupuesto.toLocaleString()} ({porcentajeUso.toFixed(1)}%)
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
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

                          {/* Disponible */}
                          <p className="text-xs text-gray-500">
                            Disponible: ${disponible.toLocaleString()} | PM: {proyecto.responsable}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Export function to get proyectos for use in other components
export { getProyectos };
