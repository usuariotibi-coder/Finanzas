import { useEffect, useState, type FormEvent } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Vehicle, VehicleAssignment, VehicleAlert, CargaGasolina, MaintenanceRecord, VehicleConditionChecklist } from '../../types';
import GasolinaKPI from '../../components/flotilla/GasolinaKPI';
import MenuMantenimiento from '../../components/flotilla/MenuMantenimiento';
import { exportToExcel, formatCurrency, formatDate } from '../../utils/exportExcel';
import { formatProyectoLabel } from '../../utils/proyectoLabel';

const VEHICLE_IMAGE_FALLBACK = 'https://via.placeholder.com/1200x800/e5e7eb/6b7280?text=Sin+Imagen';

const getVehicleImageSeed = (brand: string, model: string) => {
  const value = `${brand}-${model}`.toLowerCase();
  let total = 0;
  for (let i = 0; i < value.length; i += 1) {
    total += value.charCodeAt(i);
  }
  return total;
};

const getVehicleImageUrl = (brand: string, model: string) => {
  const query = encodeURIComponent(`${brand} ${model} car`);
  const seed = getVehicleImageSeed(brand, model);
  return `https://source.unsplash.com/1200x800/?${query}&sig=${seed}`;
};

const getVehicleStatusIcon = (status: Vehicle['status']) => {
  const icons: Record<Vehicle['status'], string> = {
    disponible: '✅',
    asignado: '🚗',
    en_taller: '🛠️',
    baja: '⛔',
    available: '✅',
    assigned: '🚗',
    in_shop: '🛠️',
    out_of_service: '⛔',
  };

  return icons[status] ?? '🚗';
};

const getAssignmentStatusIcon = (status: VehicleAssignment['status']) => {
  const icons: Record<VehicleAssignment['status'], string> = {
    solicitado: '⏳',
    asignado: '🚗',
    activo: '✅',
    completado: '🏁',
    rechazado: '⛔',
  };

  return icons[status] ?? '🚗';
};





const VEHICLE_ASSIGNMENTS_STORAGE_KEY = 'vehicle_assignments_data';

const getVehicleAssignments = (): VehicleAssignment[] => {
  const stored = localStorage.getItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as VehicleAssignment[];
    } catch {
      // ignore parse errors and fall back to empty
    }
  }
  return [];
};
export default function Flotilla() {
  const [showNewVehicleForm, setShowNewVehicleForm] = useLocalStorageState('flotilla:showNewVehicleForm', false);
  const [showAssignmentForm, setShowAssignmentForm] = useLocalStorageState('flotilla:showAssignmentForm', false);
  const [showExportModal, setShowExportModal] = useLocalStorageState('flotilla:showExportModal', false);
  const [activeTab, setActiveTab] = useLocalStorageState<'vehiculos' | 'asignaciones' | 'mantenimiento' | 'gasolina'>('flotilla:activeTab', 'vehiculos');
  const [selectedVehicleId, setSelectedVehicleId] = useLocalStorageState<string | null>('flotilla:selectedVehicleId', null);
  const [showDetalleModal, setShowDetalleModal] = useLocalStorageState('flotilla:showDetalleModal', false);
  const [showHistorialModal, setShowHistorialModal] = useLocalStorageState('flotilla:showHistorialModal', false);
  const [vehicles] = useLocalStorageState<Vehicle[]>('flotilla:vehiculos', []);
  const [alerts] = useLocalStorageState<VehicleAlert[]>('flotilla:alertas', []);
  const [cargasGasolina] = useLocalStorageState<CargaGasolina[]>('flotilla:cargasGasolina', []);
  const [maintenanceHistory] = useLocalStorageState<MaintenanceRecord[]>('flotilla:maintenanceHistory', []);
  const [assignments, setAssignments] = useState<VehicleAssignment[]>(getVehicleAssignments);
  const [showFinalizarModal, setShowFinalizarModal] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  useEscapeKey(() => setShowExportModal(false), showExportModal);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const refreshAssignments = () => {
      setAssignments(getVehicleAssignments());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === VEHICLE_ASSIGNMENTS_STORAGE_KEY) {
        refreshAssignments();
      }
    };

    const handleCustomStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === VEHICLE_ASSIGNMENTS_STORAGE_KEY) {
        refreshAssignments();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('app-storage-change', handleCustomStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app-storage-change', handleCustomStorage);
    };
  }, []);

  const assignedVehicleIds = new Set(
    assignments
      .filter(a => a.vehicleId && (a.status === 'asignado' || a.status === 'activo'))
      .map(a => a.vehicleId)
  );
  const vehiclesWithStatus = vehicles.map((vehicle) => {
    if (vehicle.status === 'in_shop' || vehicle.status === 'out_of_service') {
      return vehicle;
    }
    if (assignedVehicleIds.has(vehicle.id)) {
      return { ...vehicle, status: 'assigned' as const };
    }
    if (vehicle.status === 'assigned') {
      return { ...vehicle, status: 'available' as const };
    }
    return vehicle;
  });

  const vehiculosDisponibles = vehiclesWithStatus.filter(v => v.status === 'available').length;
  const vehiculosAsignados = vehiclesWithStatus.filter(v => v.status === 'assigned').length;
  const vehiculosEnTaller = vehiclesWithStatus.filter(v => v.status === 'in_shop').length;
  const alertasPendientes = alerts.filter(a => !(a.atendido ?? a.attended)).length;
  const solicitudesPendientes = assignments.filter(a => a.status === 'solicitado');
  const asignacionesActivas = assignments.filter(a => a.status !== 'completado');
  const asignacionesCompletadas = assignments.filter(a => a.status === 'completado');
  const selectedAssignment = selectedAssignmentId
    ? assignments.find(a => a.id === selectedAssignmentId) ?? null
    : null;
  const selectedAssignmentVehicle = selectedAssignment
    ? vehiclesWithStatus.find(v => v.id === selectedAssignment.vehicleId) ?? null
    : null;

  const saveAssignments = (nextAssignments: VehicleAssignment[]) => {
    setAssignments(nextAssignments);
    localStorage.setItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments));
    window.dispatchEvent(new CustomEvent('app-storage-change', { detail: { key: VEHICLE_ASSIGNMENTS_STORAGE_KEY } }));
  };

  const handleAssignVehicle = (requestId: string, vehicleId: string, vehiculoLabel: string) => {
    const updatedAssignments = assignments.map((assignment) => {
      if (assignment.id !== requestId) {
        return assignment;
      }
      return {
        ...assignment,
        vehicleId,
        vehiculoLabel,
        status: 'asignado' as VehicleAssignment['status'],
      };
    });
    saveAssignments(updatedAssignments);
    setShowAssignmentForm(false);
  };

  const handleOpenFinalizarModal = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setShowFinalizarModal(true);
  };

  const handleCloseFinalizarModal = () => {
    setShowFinalizarModal(false);
    setSelectedAssignmentId(null);
  };

  const handleFinalizarAsignacion = (assignmentId: string, kmFinal: number, checklistEntrega: VehicleConditionChecklist) => {
    const updatedAssignments = assignments.map((assignment) => (
      assignment.id === assignmentId
        ? {
          ...assignment,
          kmFinal,
          fechaFin: new Date().toISOString(),
          status: 'completado' as VehicleAssignment['status'],
          checklistEntrega,
        }
        : assignment
    ));
    saveAssignments(updatedAssignments);
    handleCloseFinalizarModal();
  };
  const handleScheduleService = (alertId: string) => {
    console.log('Agendar servicio:', alertId);
    // Aquí iría la lógica para agendar
  };

  const handleCompleteService = (alertId: string) => {
    console.log('Completar servicio:', alertId);
    // Aquí iría la lógica para marcar como completado
  };

  const handleExportExcel = () => {
    // Crear hojas de Excel según el plan
    const sheets = [
      // Hoja 1: Resumen de Flotilla
      {
        name: 'Resumen Flotilla',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Placas', key: 'plates', width: 12 },
          { header: 'KM Actual', key: 'currentKm', width: 12 },
          { header: 'Estado', key: 'status', width: 15 },
          { header: 'Próximo Servicio', key: 'nextService', width: 15 },
          { header: 'KM Próximo Servicio', key: 'nextServiceKm', width: 18 },
        ],
        data: vehiclesWithStatus.map(v => ({
          vehicle: `${v.brand} ${v.model} ${v.year}`,
          plates: v.plates,
          currentKm: v.currentKm.toLocaleString(),
          status: v.status === 'available' ? 'Disponible' : v.status === 'assigned' ? 'Asignado' : 'En Taller',
          nextService: formatDate(v.maintenance.nextServiceDate),
          nextServiceKm: v.maintenance.nextServiceKm.toLocaleString(),
        })),
      },
      // Hoja 2: Historial de Mantenimientos
      {
        name: 'Mantenimientos',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Fecha', key: 'date', width: 12 },
          { header: 'Tipo', key: 'type', width: 15 },
          { header: 'KM', key: 'km', width: 12 },
          { header: 'Descripción', key: 'description', width: 40 },
          { header: 'Costo', key: 'cost', width: 15 },
          { header: 'Proveedor', key: 'provider', width: 25 },
        ],
        data: maintenanceHistory.map(m => {
          const vehicle = vehiclesWithStatus.find(v => v.id === m.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            date: formatDate(m.fecha),
            type: m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1),
            km: m.km ? m.km.toLocaleString() : 'N/A',
            description: m.descripcion,
            cost: formatCurrency(m.costo),
            provider: m.proveedor,
          };
        }),
      },
      // Hoja 3: Consumo de Gasolina
      {
        name: 'Gasolina',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Fecha', key: 'date', width: 12 },
          { header: 'Litros', key: 'liters', width: 10 },
          { header: 'Precio/L', key: 'pricePerLiter', width: 12 },
          { header: 'Total', key: 'total', width: 15 },
          { header: 'Odómetro', key: 'odometer', width: 12 },
          { header: 'Estación', key: 'station', width: 25 },
          { header: 'Factura', key: 'invoice', width: 10 },
        ],
        data: cargasGasolina.map(c => {
          const vehicle = vehiclesWithStatus.find(v => v.id === c.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            date: formatDate(c.fecha),
            liters: c.litros.toFixed(2),
            pricePerLiter: formatCurrency(c.precioLitro),
            total: formatCurrency(c.total),
            odometer: c.odometro.toLocaleString(),
            station: c.estacion,
            invoice: c.facturaId ? 'Sí' : 'No',
          };
        }),
      },
      // Hoja 4: Costos por Vehículo
      {
        name: 'Costos',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Gasolina', key: 'fuel', width: 15 },
          { header: 'Mantenimiento', key: 'maintenance', width: 15 },
          { header: 'Seguro', key: 'insurance', width: 15 },
          { header: 'Total', key: 'total', width: 15 },
        ],
        data: vehiclesWithStatus.map(v => {
          const gasolina = cargasGasolina.filter(c => c.vehicleId === v.id).reduce((sum, c) => sum + c.total, 0);
          const mantenimiento = maintenanceHistory.filter(m => m.vehicleId === v.id).reduce((sum, m) => sum + m.costo, 0);
          const seguro = 0;
          const total = gasolina + mantenimiento + seguro;

          return {
            vehicle: `${v.brand} ${v.model} (${v.plates})`,
            fuel: formatCurrency(gasolina),
            maintenance: formatCurrency(mantenimiento),
            insurance: formatCurrency(seguro),
            total: formatCurrency(total),
          };
        }),
      },
      // Hoja 5: Asignaciones
      {
        name: 'Asignaciones',
        columns: [
          { header: 'Vehículo', key: 'vehicle', width: 25 },
          { header: 'Usuario', key: 'user', width: 20 },
          { header: 'Fecha Inicio', key: 'startDate', width: 12 },
          { header: 'KM Inicial', key: 'initialKm', width: 12 },
          { header: 'Propósito', key: 'purpose', width: 15 },
          { header: 'Motivo', key: 'reason', width: 40 },
        ],
        data: assignments.map(a => {
          const vehicle = vehiclesWithStatus.find(v => v.id === a.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            user: a.userName,
            startDate: formatDate(a.fechaInicio),
            initialKm: a.kmInicial.toLocaleString(),
            purpose: a.proposito.charAt(0).toUpperCase() + a.proposito.slice(1),
            reason: a.motivo,
          };
        }),
      },
    ];

    exportToExcel(sheets, `Reporte_Flotilla_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}`);
    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-slate-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Flotilla</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Administracion de Flotilla</h1>
                <p className="text-[11px] text-slate-600">Gestión de vehículos empresariales.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-2.5 py-1.5 text-[11px] bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Exportar Excel</span>
                </button>
                <button
                  onClick={() => setShowAssignmentForm(true)}
                  className="px-2.5 py-1.5 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>Asignar Vehiculo</span>
                </button>
                <button
                  onClick={() => setShowNewVehicleForm(true)}
                  className="px-2.5 py-1.5 text-[11px] bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Nuevo Vehiculo</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              <MetricCard label="Total Vehiculos" value={vehiclesWithStatus.length} color="blue" />
              <MetricCard label="Disponibles" value={vehiculosDisponibles} color="green" />
              <MetricCard label="Asignados" value={vehiculosAsignados} color="yellow" />
              <MetricCard label="Por asignar" value={solicitudesPendientes.length} color="orange" />
              <MetricCard label="En Taller" value={vehiculosEnTaller} color="red" />
            </div>
          </div>
        </div>
      </div>

      {alertasPendientes > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">
                Tienes {alertasPendientes} alerta(s) pendiente(s) que requieren atención inmediata
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <TabButton label="Vehículos" isActive={activeTab === 'vehiculos'} onClick={() => setActiveTab('vehiculos')} />
            <TabButton label="Asignaciones" isActive={activeTab === 'asignaciones'} onClick={() => setActiveTab('asignaciones')} />
            <TabButton label="Mantenimiento" count={alertasPendientes} isActive={activeTab === 'mantenimiento'} onClick={() => setActiveTab('mantenimiento')} />
            <TabButton label="Gasolina" isActive={activeTab === 'gasolina'} onClick={() => setActiveTab('gasolina')} />
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'vehiculos' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {vehiclesWithStatus.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onVerDetalles={() => {
                    setSelectedVehicleId(vehicle.id);
                    setShowDetalleModal(true);
                  }}
                  onVerHistorial={() => {
                    setSelectedVehicleId(vehicle.id);
                    setShowHistorialModal(true);
                  }}
                />
              ))}
            </div>
          )}

          {activeTab === 'asignaciones' && (
            <div className="space-y-4">
              {assignments.length > 0 ? (
                <div className="space-y-4">
                  {asignacionesActivas.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {asignacionesActivas.map((assignment) => (
                        <AssignmentCard
                          key={assignment.id}
                          assignment={assignment}
                          vehicles={vehiclesWithStatus}
                          onFinalize={() => handleOpenFinalizarModal(assignment.id)}
                        />
                      ))}
                    </div>
                  )}
                  {asignacionesCompletadas.length > 0 && (
                    <div className="space-y-2">
                      {asignacionesActivas.length > 0 && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Finalizados</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {asignacionesCompletadas.map((assignment) => (
                          <AssignmentCard
                            key={assignment.id}
                            assignment={assignment}
                            vehicles={vehiclesWithStatus}
                            onFinalize={() => handleOpenFinalizarModal(assignment.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <p className="text-gray-500">No hay asignaciones activas</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'mantenimiento' && (
            <MenuMantenimiento
              alerts={alerts}
              maintenanceHistory={maintenanceHistory}
              onScheduleService={handleScheduleService}
              onCompleteService={handleCompleteService}
            />
          )}

          {activeTab === 'gasolina' && (
            <GasolinaKPI cargas={cargasGasolina} vehicles={vehiclesWithStatus} />
          )}
        </div>
      </div>

      {/* Modal de Exportación */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Exportar Reporte de Flotilla</h3>
            <p className="text-sm text-gray-600 mb-6">
              Se generará un archivo Excel con 5 hojas:
            </p>
            <ul className="text-sm text-gray-700 space-y-2 mb-6">
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Resumen de Flotilla
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Historial de Mantenimientos
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Consumo de Gasolina
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Costos por Vehículo
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Asignaciones
              </li>
            </ul>
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
                Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewVehicleForm && (
        <NewVehicleModal onClose={() => setShowNewVehicleForm(false)} />
      )}

      {showAssignmentForm && (
        <AssignmentModal
          vehicles={vehiclesWithStatus.filter(v => v.status === 'available')}
          requests={solicitudesPendientes}
          onAssign={handleAssignVehicle}
          onClose={() => setShowAssignmentForm(false)}
        />
      )}

      {/* Modal de Detalles del Vehículo */}
      {showDetalleModal && selectedVehicleId && (
        <DetalleVehiculoModal
          vehicle={vehiclesWithStatus.find(v => v.id === selectedVehicleId)!}
          assignments={assignments.filter(a => a.vehicleId === selectedVehicleId)}
          alerts={alerts.filter(a => a.vehicleId === selectedVehicleId)}
          onClose={() => {
            setShowDetalleModal(false);
            setSelectedVehicleId(null);
          }}
        />
      )}

      {/* Modal de Historial del Vehículo */}
      {showHistorialModal && selectedVehicleId && (
        <HistorialVehiculoModal
          vehicle={vehiclesWithStatus.find(v => v.id === selectedVehicleId)!}
          maintenanceHistory={maintenanceHistory.filter(m => m.vehicleId === selectedVehicleId)}
          cargasGasolina={cargasGasolina.filter(c => c.vehicleId === selectedVehicleId)}
          onClose={() => {
            setShowHistorialModal(false);
            setSelectedVehicleId(null);
          }}
        />
      )}

      {showFinalizarModal && selectedAssignment && (
        <FinalizarAsignacionModal
          assignment={selectedAssignment}
          vehicle={selectedAssignmentVehicle}
          onClose={handleCloseFinalizarModal}
          onFinalize={(kmFinal, checklistEntrega) => handleFinalizarAsignacion(selectedAssignment.id, kmFinal, checklistEntrega)}
        />
      )}
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ label, count, isActive, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 text-sm font-medium border-b-2 flex items-center space-x-2 ${
        isActive
          ? 'border-primary-500 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
          isActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'orange' | 'red';
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    blue: { accent: 'bg-blue-500', soft: 'bg-blue-100 text-blue-700' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-700' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-700' },
    orange: { accent: 'bg-orange-500', soft: 'bg-orange-100 text-orange-700' },
    red: { accent: 'bg-rose-500', soft: 'bg-rose-100 text-rose-700' },
  };
  const palette = colorClasses[color] ?? colorClasses.blue;

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
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${palette.soft}`}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
      </div>
    </button>
  );
}

interface VehicleCardProps {
  vehicle: Vehicle;
  onVerDetalles: () => void;
  onVerHistorial: () => void;
}

function VehicleCard({ vehicle, onVerDetalles, onVerHistorial }: VehicleCardProps) {
  const statusConfig: Record<Vehicle['status'], { color: string; label: string; icon: string }> = {
    disponible: { color: 'bg-green-100 text-green-800', label: 'Disponible', icon: '✅' },
    asignado: { color: 'bg-blue-100 text-blue-800', label: 'Asignado', icon: '🚗' },
    en_taller: { color: 'bg-red-100 text-red-800', label: 'En Taller', icon: '🛠️' },
    baja: { color: 'bg-gray-100 text-gray-800', label: 'De Baja', icon: '⛔' },
    available: { color: 'bg-green-100 text-green-800', label: 'Disponible', icon: '✅' },
    assigned: { color: 'bg-blue-100 text-blue-800', label: 'Asignado', icon: '🚗' },
    in_shop: { color: 'bg-red-100 text-red-800', label: 'En Taller', icon: '🛠️' },
    out_of_service: { color: 'bg-gray-100 text-gray-800', label: 'De Baja', icon: '⛔' },
  };

  const status = statusConfig[vehicle.status];
  const vehicleImage = getVehicleImageUrl(vehicle.brand, vehicle.model);
  const fallbackImage = vehicle.foto ?? VEHICLE_IMAGE_FALLBACK;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
      {/* Imagen del Vehículo */}
      <div className="relative h-48 bg-gray-200">
        <img
          src={vehicleImage}
          alt={`${vehicle.brand} ${vehicle.model}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = fallbackImage;
          }}
        />
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${status.color} shadow-sm`}>
            <span className="text-xs">{status.icon}</span>
            {status.label}
          </span>
        </div>
      </div>

      {/* Información del Vehículo */}
      <div className="p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900">{vehicle.brand} {vehicle.model}</h3>
          <p className="text-sm text-gray-600">{vehicle.year}</p>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Placas:</span>
            <span className="font-semibold text-gray-900">{vehicle.plates}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Color:</span>
            <span className="text-gray-900">{vehicle.color}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">KM Actual:</span>
            <span className="font-semibold text-gray-900">{vehicle.currentKm.toLocaleString()} km</span>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-3 mb-3">
          <p className="text-xs text-gray-600 mb-2">Próximo Mantenimiento:</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-900">{formatDate(vehicle.maintenance.nextServiceDate)}</span>
            <span className="text-xs text-gray-600">{vehicle.maintenance.nextServiceKm.toLocaleString()} km</span>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={onVerDetalles}
            className="flex-1 px-3 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors"
          >
            Ver Detalles
          </button>
          <button
            onClick={onVerHistorial}
            className="flex-1 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Historial
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  vehicles,
  onFinalize,
}: {
  assignment: VehicleAssignment;
  vehicles: Vehicle[];
  onFinalize: () => void;
}) {
  const vehicle = vehicles.find(v => v.id === assignment.vehicleId);
  const vehicleLabel = vehicle
    ? `${vehicle.brand} ${vehicle.model} - ${vehicle.plates}`
    : assignment.vehiculoLabel || 'Vehiculo pendiente de asignacion';
  const statusIcon = getAssignmentStatusIcon(assignment.status);
  const isCompleted = assignment.status === 'completado';
  const statusBadge = (() => {
    switch (assignment.status) {
      case 'solicitado':
        return { label: 'Solicitado', color: 'bg-slate-100 text-slate-700' };
      case 'asignado':
        return { label: 'Asignado', color: 'bg-amber-100 text-amber-700' };
      case 'activo':
        return { label: 'Activo', color: 'bg-blue-100 text-blue-700' };
      case 'completado':
        return { label: 'Completado', color: 'bg-emerald-100 text-emerald-700' };
      case 'rechazado':
        return { label: 'Rechazado', color: 'bg-rose-100 text-rose-700' };
      default:
        return { label: assignment.status, color: 'bg-slate-100 text-slate-700' };
    }
  })();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-1">
              <span className="text-xs">{statusIcon}</span>
              <span className="truncate">{vehicleLabel}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
              <p className="text-xs text-gray-600 truncate">Asignado a: {assignment.userName}</p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-600">KM Inicial</p>
          <p className="text-xs font-semibold text-gray-900">{assignment.kmInicial.toLocaleString()}</p>
          {isCompleted ? (
            <span className="mt-2 inline-flex items-center justify-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              🏁 Finalizado
            </span>
          ) : (
            <button
              onClick={onFinalize}
              className="mt-2 inline-flex items-center justify-center gap-1 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Finalizar
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-500 truncate">
        {assignment.motivo} - Desde {formatDate(assignment.fechaInicio)}
      </p>
    </div>
  );
}

function FinalizarAsignacionModal({
  assignment,
  vehicle,
  onClose,
  onFinalize,
}: {
  assignment: VehicleAssignment;
  vehicle: Vehicle | null;
  onClose: () => void;
  onFinalize: (kmFinal: number, checklistEntrega: VehicleConditionChecklist) => void;
}) {
  useEscapeKey(onClose);
  const [kmFinal, setKmFinal] = useState<string>(assignment.kmFinal ? String(assignment.kmFinal) : '');
  const [fotoEntrega, setFotoEntrega] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [checklistEntrega, setChecklistEntrega] = useState<VehicleConditionChecklist>(
    assignment.checklistEntrega ?? {
      exterior: {
        carroceria: 'bueno',
        pintura: 'bueno',
        llantas: 'bueno',
        cristales: 'bueno',
        espejos: 'bueno',
      },
      interior: {
        asientos: 'bueno',
        tablero: 'bueno',
        tapiceria: 'bueno',
        limpieza: 'bueno',
      },
      mecanico: {
        motor: 'bueno',
        frenos: 'bueno',
        luces: 'bueno',
        aire_acondicionado: 'bueno',
      },
      accesorios: {
        gato: true,
        llave_cruz: true,
        triangulo_seguridad: true,
        extintor: true,
        llanta_refaccion: true,
      },
      nivelCombustible: 'lleno',
      observaciones: '',
    }
  );

  const statusConfig: Record<Vehicle['status'], { label: string; color: string }> = {
    disponible: { label: 'Disponible', color: 'bg-green-100 text-green-800' },
    asignado: { label: 'Asignado', color: 'bg-blue-100 text-blue-800' },
    en_taller: { label: 'En Taller', color: 'bg-red-100 text-red-800' },
    baja: { label: 'De Baja', color: 'bg-gray-100 text-gray-800' },
    available: { label: 'Disponible', color: 'bg-green-100 text-green-800' },
    assigned: { label: 'Asignado', color: 'bg-blue-100 text-blue-800' },
    in_shop: { label: 'En Taller', color: 'bg-red-100 text-red-800' },
    out_of_service: { label: 'De Baja', color: 'bg-gray-100 text-gray-800' },
  };
  const statusBadge = vehicle ? statusConfig[vehicle.status] : null;
  const vehiculoLabel = vehicle
    ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})`
    : assignment.vehiculoLabel || 'Vehiculo sin asignar';
  const kmFinalValue = Number(kmFinal);
  const kmFinalInvalid = !kmFinal || Number.isNaN(kmFinalValue) || kmFinalValue <= 0;
  const kmFinalError = showErrors
    ? kmFinalInvalid
      ? 'Ingresa el kilometraje final.'
      : kmFinalValue < assignment.kmInicial
      ? 'El KM final debe ser mayor o igual al KM inicial.'
      : ''
    : '';
  const fuelError = showErrors && !checklistEntrega.nivelCombustible ? 'Selecciona el nivel de combustible.' : '';
  const fotoError = showErrors && !fotoEntrega ? 'Agrega al menos una foto.' : '';

  const handleSubmit = () => {
    setShowErrors(true);
    if (kmFinalInvalid || kmFinalValue < assignment.kmInicial || !checklistEntrega.nivelCombustible || !fotoEntrega) {
      return;
    }
    const checklistToSave = {
      ...checklistEntrega,
      foto: fotoEntrega?.name,
    };
    onFinalize(kmFinalValue, checklistToSave);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Finalizar asignacion</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-600">Vehiculo</p>
                <p className="text-base font-semibold text-slate-900">{vehiculoLabel}</p>
              </div>
              {statusBadge && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBadge.color}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
              <div>
                <span className="text-slate-500">Asignado a:</span> {assignment.userName}
              </div>
              <div>
                <span className="text-slate-500">Motivo:</span> {assignment.motivo}
              </div>
              <div>
                <span className="text-slate-500">Inicio:</span> {formatDate(assignment.fechaInicio)}
              </div>
              <div>
                <span className="text-slate-500">KM inicial:</span> {assignment.kmInicial.toLocaleString()} km
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">KM final *</label>
              <input
                type="number"
                min={assignment.kmInicial}
                value={kmFinal}
                onChange={(event) => setKmFinal(event.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  kmFinalError
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder="Ingresa el KM final"
              />
              {kmFinalError && (
                <p className="mt-1 text-xs text-rose-600">{kmFinalError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de cierre</label>
              <input
                type="text"
                value={formatDate(new Date().toISOString())}
                readOnly
                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
              />
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Exterior *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.exterior).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      exterior: { ...checklistEntrega.exterior, [key]: e.target.value as 'bueno' | 'regular' | 'malo' },
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="bueno">Bueno</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Interior *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.interior).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      interior: { ...checklistEntrega.interior, [key]: e.target.value as 'bueno' | 'regular' | 'malo' },
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="bueno">Bueno</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Mecanico *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.mecanico).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      mecanico: { ...checklistEntrega.mecanico, [key]: e.target.value as 'bueno' | 'regular' | 'malo' },
                    })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="bueno">Bueno</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 mb-3">Accesorios *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(checklistEntrega.accesorios).map(([key, value]) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setChecklistEntrega({
                      ...checklistEntrega,
                      accesorios: { ...checklistEntrega.accesorios, [key]: e.target.checked },
                    })}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 capitalize">{key.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nivel de combustible *</label>
            <select
              value={checklistEntrega.nivelCombustible}
              onChange={(e) => setChecklistEntrega({
                ...checklistEntrega,
                nivelCombustible: e.target.value as '1/4' | '1/2' | '3/4' | 'lleno',
              })}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${
                fuelError
                  ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                  : 'border-gray-300 focus:ring-primary-500'
              }`}
            >
              <option value="1/4">1/4</option>
              <option value="1/2">1/2</option>
              <option value="3/4">3/4</option>
              <option value="lleno">Lleno</option>
            </select>
            {fuelError && (
              <p className="mt-1 text-xs text-rose-600">{fuelError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fotos (minimo 1) *</label>
            <p className="text-xs text-gray-500 mb-3">Agrega evidencia del estado del vehiculo.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((index) => (
                <label
                  key={index}
                  className={`aspect-square border-2 border-dashed rounded-lg hover:border-primary-500 cursor-pointer transition-colors flex flex-col items-center justify-center ${
                    fotoError ? 'border-rose-300 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a1 1 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-gray-500 text-center px-2">Agregar foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setFotoEntrega(selected);
                    }}
                    className="hidden"
                  />
                </label>
              ))}
            </div>
            {fotoError && (
              <p className="text-xs text-rose-600 mt-2">{fotoError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
            <textarea
              value={checklistEntrega.observaciones}
              onChange={(e) => setChecklistEntrega({ ...checklistEntrega, observaciones: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              rows={3}
              placeholder="Notas adicionales sobre el estado del vehiculo..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}

function NewVehicleModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    year: '',
    plates: '',
    serialNumber: '',
    color: '',
  });
  const [showErrors, setShowErrors] = useState(false);

  const yearValue = Number(formData.year);
  const yearInvalid = !formData.year || Number.isNaN(yearValue) || yearValue <= 0;
  const computedErrors = {
    brand: !formData.brand.trim() ? 'Ingresa la marca.' : '',
    model: !formData.model.trim() ? 'Ingresa el modelo.' : '',
    year: yearInvalid ? 'Ingresa un año válido.' : '',
    plates: !formData.plates.trim() ? 'Ingresa las placas.' : '',
    serialNumber: !formData.serialNumber.trim() ? 'Ingresa el número de serie.' : '',
    color: !formData.color.trim() ? 'Ingresa el color.' : '',
  };
  const errors: Partial<typeof computedErrors> = showErrors ? computedErrors : {};
  const hasErrors = Object.values(computedErrors).some(Boolean);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Registrar Nuevo Vehículo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form className="p-6 space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Marca</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(event) => setFormData((prev) => ({ ...prev, brand: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.brand
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.brand && (
                <p className="mt-1 text-xs text-rose-600">{errors.brand}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
              <input
                type="text"
                value={formData.model}
                onChange={(event) => setFormData((prev) => ({ ...prev, model: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.model
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.model && (
                <p className="mt-1 text-xs text-rose-600">{errors.model}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Año</label>
              <input
                type="number"
                value={formData.year}
                onChange={(event) => setFormData((prev) => ({ ...prev, year: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.year
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.year && (
                <p className="mt-1 text-xs text-rose-600">{errors.year}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Placas</label>
              <input
                type="text"
                value={formData.plates}
                onChange={(event) => setFormData((prev) => ({ ...prev, plates: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.plates
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.plates && (
                <p className="mt-1 text-xs text-rose-600">{errors.plates}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Número de Serie</label>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={(event) => setFormData((prev) => ({ ...prev, serialNumber: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.serialNumber
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.serialNumber && (
                <p className="mt-1 text-xs text-rose-600">{errors.serialNumber}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <input
                type="text"
                value={formData.color}
                onChange={(event) => setFormData((prev) => ({ ...prev, color: event.target.value }))}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                  errors.color
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
              />
              {errors.color && (
                <p className="mt-1 text-xs text-rose-600">{errors.color}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">
              Registrar Vehículo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignmentModal({
  vehicles,
  requests,
  onAssign,
  onClose,
}: {
  vehicles: Vehicle[];
  requests: VehicleAssignment[];
  onAssign: (requestId: string, vehicleId: string, vehiculoLabel: string) => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedFuelSource, setSelectedFuelSource] = useState('');
  const [solicitudGasolina, setSolicitudGasolina] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const selectedRequest = requests.find(r => r.id === selectedRequestId);
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const projectLabel = formatProyectoLabel(selectedRequest?.proyectoNombre, selectedRequest?.proyectoId);
  const requestError = showErrors && !selectedRequestId ? 'Selecciona una solicitud.' : '';
  const vehicleError = showErrors && !selectedVehicleId ? 'Selecciona un vehiculo.' : '';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRequestId || !selectedVehicleId) {
      setShowErrors(true);
      return;
    }
    const label = selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model} - ${selectedVehicle.plates}` : '';
    onAssign(selectedRequestId, selectedVehicleId, label);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-[0_32px_80px_-40px_rgba(15,23,42,0.8)] max-w-4xl w-full border border-slate-200/70 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />
        <div className="relative px-6 pt-6 pb-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-blue-200/60 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-10 h-24 w-24 rounded-full bg-indigo-200/50 blur-3xl" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-sm">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Asignar Vehículo</h2>
                <p className="text-sm text-slate-600">Relaciona una solicitud pendiente con un vehículo disponible.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 rounded-full p-1 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-blue-50/40" onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 pb-28">
            {requests.length === 0 ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                No hay solicitudes pendientes de asignación.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Progreso de asignación</h3>
                      <p className="text-xs text-slate-500">Completa los pasos para guardar la asignación.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1">Solicitudes: {requests.length}</span>
                      <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1">Disponibles: {vehicles.length}</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold">
                    <div className="rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-center">1 Selección</div>
                    <div className="rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-center">2 Combustible</div>
                    <div className="rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-center">3 Resumen</div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full w-2/3 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Selección</h3>
                      <p className="text-xs text-slate-500">Elige la solicitud y el vehículo disponibles.</p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Paso 1</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Solicitud pendiente</label>
                      <select
                        value={selectedRequestId}
                        onChange={(event) => setSelectedRequestId(event.target.value)}
                        className={`w-full px-4 py-2.5 border rounded-xl bg-white/90 text-slate-900 shadow-sm transition focus:ring-2 ${
                          requestError
                            ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                            : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      >
                        <option value="">Seleccionar solicitud...</option>
                        {requests.map((request) => (
                          <option key={request.id} value={request.id}>
                            {request.userName} - {request.destino || 'Sin destino'}
                          </option>
                        ))}
                      </select>
                      {requestError && (
                        <p className="mt-1 text-xs text-rose-600">{requestError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Vehículo disponible</label>
                      <select
                        value={selectedVehicleId}
                        onChange={(event) => setSelectedVehicleId(event.target.value)}
                        className={`w-full px-4 py-2.5 border rounded-xl bg-white/90 text-slate-900 shadow-sm transition focus:ring-2 ${
                          vehicleError
                            ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                            : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      >
                        <option value="">Seleccionar vehículo...</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.brand} {v.model} - {v.plates}</option>
                        ))}
                      </select>
                      {vehicleError && (
                        <p className="mt-1 text-xs text-rose-600">{vehicleError}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Datos de combustible</h3>
                      <p className="text-xs text-slate-500">Completa tag, método y monto de la solicitud.</p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Paso 2</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Tag</label>
                      <select
                        value={selectedTag}
                        onChange={(event) => setSelectedTag(event.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white/90 text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar tag...</option>
                        <option value="26453476-7">26453476-7</option>
                        <option value="26536342-9 Rodrigo R.">26536342-9 Rodrigo R.</option>
                        <option value="26536342-9">26536342-9</option>
                        <option value="26328071-4">26328071-4</option>
                        <option value="26328072-2">26328072-2</option>
                        <option value="22308251-1">22308251-1</option>
                        <option value="26536344-5">26536344-5</option>
                        <option value="26328148-5">26328148-5</option>
                        <option value="26454043-5">26454043-5</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Tarjeta de combustible</label>
                      <select
                        value={selectedFuelSource}
                        onChange={(event) => setSelectedFuelSource(event.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white/90 text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Tarjeta de combustible">Tarjeta de combustible</option>
                        <option value="Tarjeta de viáticos">Tarjeta de viáticos</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Solicitud de Gasolina</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={solicitudGasolina}
                        onChange={(event) => setSolicitudGasolina(event.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white/90 text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Monto"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Comentarios</label>
                      <textarea
                        rows={3}
                        value={comentarios}
                        onChange={(event) => setComentarios(event.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white/90 text-slate-900 shadow-sm transition focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Agregar comentarios..."
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">Resumen de solicitud</h3>
                    <span className="text-xs text-slate-500">Vista previa</span>
                  </div>
                  {selectedRequest ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                      <div>
                        <span className="text-slate-500">Usuario:</span> {selectedRequest.userName}
                      </div>
                      <div>
                        <span className="text-slate-500">Proyecto:</span> {projectLabel}
                      </div>
                      <div>
                        <span className="text-slate-500">Vehículo:</span>{' '}
                        {selectedVehicle
                          ? `${selectedVehicle.brand} ${selectedVehicle.model} - ${selectedVehicle.plates}`
                          : 'Sin seleccionar'}
                      </div>
                      <div>
                        <span className="text-slate-500">Origen:</span> {selectedRequest.origen || 'No especificado'}
                      </div>
                      <div>
                        <span className="text-slate-500">Destino:</span> {selectedRequest.destino || 'No especificado'}
                      </div>
                      <div>
                        <span className="text-slate-500">Fechas:</span> {formatDate(selectedRequest.fechaInicio)} - {selectedRequest.fechaFin ? formatDate(selectedRequest.fechaFin) : 'N/A'}
                      </div>
                      <div>
                        <span className="text-slate-500">Propósito:</span> {selectedRequest.proposito}
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-slate-500">Motivo:</span> {selectedRequest.motivo}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Selecciona una solicitud para ver los detalles.</p>
                  )}
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-900">Resumen de combustible</h4>
                      <span className="text-xs text-slate-500">Vista rápida</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                        <p className="text-slate-500">Tag</p>
                        <p className="text-sm font-semibold text-slate-900">{selectedTag || 'Sin seleccionar'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                        <p className="text-slate-500">Tarjeta</p>
                        <p className="text-sm font-semibold text-slate-900">{selectedFuelSource || 'Sin seleccionar'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                        <p className="text-slate-500">Monto</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {solicitudGasolina ? formatCurrency(Number(solicitudGasolina)) : '$0.00'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-xs">
                      <p className="text-slate-500">Comentarios</p>
                      <p className="text-sm text-slate-700">{comentarios || 'Sin comentarios'}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500 hidden sm:block">Confirma la asignación antes de guardar.</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-slate-300 text-slate-700 rounded-xl bg-white shadow-sm hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={requests.length === 0}
                  className="px-6 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-600 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal de Detalles del Vehículo
interface DetalleVehiculoModalProps {
  vehicle: Vehicle;
  assignments: VehicleAssignment[];
  alerts: VehicleAlert[];
  onClose: () => void;
}

function DetalleVehiculoModal({ vehicle, assignments, alerts, onClose }: DetalleVehiculoModalProps) {
  useEscapeKey(onClose);

  const activeAssignment = assignments.find(a => a.status === 'activo' || a.status === 'asignado');
  const vehicleImage = getVehicleImageUrl(vehicle.brand, vehicle.model);
  const fallbackImage = vehicle.foto ?? VEHICLE_IMAGE_FALLBACK;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Detalles del Vehículo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Imagen del Vehículo */}
          <div className="relative h-64 bg-gray-200 rounded-lg overflow-hidden">
            <img
              src={vehicleImage}
              alt={`${vehicle.brand} ${vehicle.model}`}
              className="w-full h-full object-cover"
              onError={(event) => {
                const target = event.target as HTMLImageElement;
                target.src = fallbackImage;
              }}
            />
          </div>

          {/* Información General */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Marca y Modelo</p>
                <p className="text-base font-medium text-gray-900">{vehicle.brand} {vehicle.model} {vehicle.year}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Placas</p>
                <p className="text-base font-medium text-gray-900">{vehicle.plates}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Número de Serie</p>
                <p className="text-base font-medium text-gray-900">{vehicle.serialNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Color</p>
                <p className="text-base font-medium text-gray-900">{vehicle.color}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Kilometraje Actual</p>
                <p className="text-base font-medium text-gray-900">{vehicle.currentKm.toLocaleString()} km</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  vehicle.status === 'available' ? 'bg-green-100 text-green-800' :
                  vehicle.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
                  vehicle.status === 'in_shop' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  <span className="text-xs">{getVehicleStatusIcon(vehicle.status)}</span>
                  {vehicle.status === 'available' ? 'Disponible' :
                   vehicle.status === 'assigned' ? 'Asignado' :
                   vehicle.status === 'in_shop' ? 'En Taller' : 'De Baja'}
                </span>
              </div>
            </div>
          </div>

          {/* Seguro */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Seguro</h3>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Compañía</p>
                  <p className="text-base font-medium text-gray-900">{vehicle.insurance.company}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Póliza</p>
                  <p className="text-base font-medium text-gray-900">{vehicle.insurance.policyNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Vigencia</p>
                  <p className="text-base font-medium text-gray-900">{formatDate(vehicle.insurance.expirationDate)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Mantenimiento */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Mantenimiento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-2">Último Servicio</p>
                <p className="text-base font-medium text-gray-900">{formatDate(vehicle.maintenance.lastServiceDate)}</p>
                <p className="text-sm text-gray-600">{vehicle.maintenance.lastServiceKm.toLocaleString()} km</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-2">Próximo Servicio</p>
                <p className="text-base font-medium text-gray-900">{formatDate(vehicle.maintenance.nextServiceDate)}</p>
                <p className="text-sm text-gray-600">{vehicle.maintenance.nextServiceKm.toLocaleString()} km</p>
              </div>
            </div>
          </div>

          {/* Asignación Actual */}
          {activeAssignment && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Asignación Actual</h3>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Asignado a:</span>
                    <span className="font-medium text-gray-900">{activeAssignment.userName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Motivo:</span>
                    <span className="text-gray-900">{activeAssignment.motivo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Desde:</span>
                    <span className="text-gray-900">{formatDate(activeAssignment.fechaInicio)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">KM Inicial:</span>
                    <span className="text-gray-900">{activeAssignment.kmInicial.toLocaleString()} km</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alertas Pendientes */}
          {alerts.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Alertas Pendientes</h3>
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${
                      alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                      alert.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                      alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">{alert.type}</h4>
                        <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-600">
                          <span>Vence: {alert.dueDate ? formatDate(alert.dueDate) : 'Sin fecha'}</span>
                          {alert.costoEstimado && (
                            <span>Costo Est: {formatCurrency(alert.costoEstimado)}</span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                        alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {alert.severity === 'critical' ? 'Crítico' :
                         alert.severity === 'high' ? 'Alto' :
                         alert.severity === 'medium' ? 'Medio' : 'Bajo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de Historial del Vehículo
interface HistorialVehiculoModalProps {
  vehicle: Vehicle;
  maintenanceHistory: MaintenanceRecord[];
  cargasGasolina: CargaGasolina[];
  onClose: () => void;
}

function HistorialVehiculoModal({ vehicle, maintenanceHistory, cargasGasolina, onClose }: HistorialVehiculoModalProps) {
  useEscapeKey(onClose);

  const [activeTab, setActiveTab] = useState<'mantenimiento' | 'gasolina'>('mantenimiento');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Historial de {vehicle.brand} {vehicle.model}</h2>
              <p className="text-sm text-gray-600">{vehicle.plates}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('mantenimiento')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'mantenimiento'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Mantenimientos ({maintenanceHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('gasolina')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'gasolina'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Cargas de Gasolina ({cargasGasolina.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'mantenimiento' && (
            <div className="space-y-4">
              {maintenanceHistory.length > 0 ? (
                maintenanceHistory.map((record) => (
                  <div key={record.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            record.tipo === 'preventivo' ? 'bg-blue-100 text-blue-800' :
                            record.tipo === 'predictivo' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {record.tipo === 'preventivo' ? 'Preventivo' :
                             record.tipo === 'predictivo' ? 'Predictivo' : 'Correctivo'}
                          </span>
                          <span className="text-sm text-gray-600">{formatDate(record.fecha)}</span>
                        </div>
                        <h4 className="font-semibold text-gray-900">{record.descripcion}</h4>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                          <span>KM: {record.km ? record.km.toLocaleString() : 'N/A'}</span>
                          <span>Proveedor: {record.proveedor}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(record.costo)}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500">No hay registros de mantenimiento</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'gasolina' && (
            <div className="space-y-4">
              {cargasGasolina.length > 0 ? (
                <>
                  {/* Resumen */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total Litros</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {cargasGasolina.reduce((sum, c) => sum + c.litros, 0).toFixed(1)} L
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total Gastado</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(cargasGasolina.reduce((sum, c) => sum + c.total, 0))}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Precio Promedio/L</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(cargasGasolina.reduce((sum, c) => sum + c.precioLitro, 0) / cargasGasolina.length)}
                      </p>
                    </div>
                  </div>

                  {/* Lista de Cargas */}
                  {cargasGasolina.map((carga) => (
                    <div key={carga.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="text-sm font-medium text-gray-900">{formatDate(carga.fecha)}</span>
                            <span className="text-sm text-gray-600">{carga.estacion}</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Litros</p>
                              <p className="font-medium text-gray-900">{carga.litros.toFixed(1)} L</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Precio/L</p>
                              <p className="font-medium text-gray-900">{formatCurrency(carga.precioLitro)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Odómetro</p>
                              <p className="font-medium text-gray-900">{carga.odometro.toLocaleString()} km</p>
                            </div>
                            {carga.facturaId && (
                              <div>
                                <p className="text-gray-600">Factura</p>
                                <p className="font-medium text-blue-600">{carga.facturaId}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(carga.total)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-gray-500">No hay registros de gasolina</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
