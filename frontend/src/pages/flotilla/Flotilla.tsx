import { useState } from 'react';
import type { Vehicle, VehicleAssignment, VehicleAlert, CargaGasolina, MaintenanceRecord } from '../../types';
import GasolinaKPI from '../../components/flotilla/GasolinaKPI';
import MenuMantenimiento from '../../components/flotilla/MenuMantenimiento';
import { exportToExcel, formatCurrency, formatDate } from '../../utils/exportExcel';

// Mock data actualizado con tipoMantenimiento y tipoAlerta
const mockVehicles: Vehicle[] = [
  {
    id: 'v1',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2023,
    plates: 'ABC-123',
    serialNumber: 'JTD12345678901234',
    color: 'Blanco',
    insurance: {
      company: 'GNP Seguros',
      policyNumber: 'POL-2025-001',
      expirationDate: '2025-12-31',
    },
    maintenance: {
      lastServiceDate: '2025-11-15',
      lastServiceKm: 45000,
      nextServiceDate: '2026-02-15',
      nextServiceKm: 50000,
    },
    currentKm: 47500,
    status: 'assigned',
    createdAt: '2023-01-15',
  },
  {
    id: 'v2',
    brand: 'Nissan',
    model: 'Versa',
    year: 2022,
    plates: 'XYZ-456',
    serialNumber: 'NIS98765432109876',
    color: 'Gris',
    insurance: {
      company: 'Qualitas',
      policyNumber: 'POL-2025-002',
      expirationDate: '2026-03-15',
    },
    maintenance: {
      lastServiceDate: '2025-10-20',
      lastServiceKm: 30000,
      nextServiceDate: '2026-01-20',
      nextServiceKm: 35000,
    },
    currentKm: 32100,
    status: 'available',
    createdAt: '2022-05-10',
  },
  {
    id: 'v3',
    brand: 'Honda',
    model: 'Civic',
    year: 2024,
    plates: 'DEF-789',
    serialNumber: 'HON45678901234567',
    color: 'Azul',
    insurance: {
      company: 'AXA Seguros',
      policyNumber: 'POL-2025-003',
      expirationDate: '2025-11-30',
    },
    maintenance: {
      lastServiceDate: '2025-09-10',
      lastServiceKm: 15000,
      nextServiceDate: '2025-12-10',
      nextServiceKm: 20000,
    },
    currentKm: 19800,
    status: 'in_shop',
    createdAt: '2024-01-20',
  },
];

const mockAssignments: VehicleAssignment[] = [
  {
    id: 'a1',
    vehicleId: 'v1',
    userId: 'user1',
    userName: 'Juan Pérez',
    viaticoId: 'via1',
    startDate: '2025-12-10',
    reason: 'Viaje de negocios a Guadalajara',
    purpose: 'viaje',
    initialKm: 47000,
    status: 'active',
  },
];

const mockAlertas: VehicleAlert[] = [
  {
    id: 'alert1',
    vehicleId: 'v3',
    type: 'Mantenimiento preventivo - Servicio 20,000 KM',
    message: 'Honda Civic (DEF-789) - Próximo servicio programado en 200 km',
    dueDate: '2025-12-10',
    severity: 'high',
    attended: false,
    tipoMantenimiento: 'preventivo',
    tipoAlerta: 'servicio',
    costoEstimado: 3500,
    proveedorSugerido: 'Honda San Pedro',
  },
  {
    id: 'alert2',
    vehicleId: 'v1',
    type: 'Pastillas de freno desgastadas',
    message: 'Toyota Corolla (ABC-123) - Indicador de desgaste activado',
    dueDate: '2025-12-15',
    severity: 'medium',
    attended: false,
    tipoMantenimiento: 'predictivo',
    tipoAlerta: 'reparacion',
    costoEstimado: 2800,
  },
  {
    id: 'alert3',
    vehicleId: 'v2',
    type: 'Renovación de seguro',
    message: 'Nissan Versa (XYZ-456) - Seguro vence en 90 días',
    dueDate: '2026-03-15',
    severity: 'low',
    attended: false,
    tipoMantenimiento: 'preventivo',
    tipoAlerta: 'seguro',
    costoEstimado: 8500,
    proveedorSugerido: 'Qualitas',
  },
  {
    id: 'alert4',
    vehicleId: 'v3',
    type: 'Motor sobrecalentando',
    message: 'Honda Civic (DEF-789) - Falla en el sistema de enfriamiento',
    dueDate: '2025-12-12',
    severity: 'critical',
    attended: false,
    tipoMantenimiento: 'correctivo',
    tipoAlerta: 'reparacion',
    costoEstimado: 15000,
  },
];

const mockCargasGasolina: CargaGasolina[] = [
  {
    id: 'cg1',
    vehicleId: 'v1',
    fecha: '2025-12-08',
    litros: 45.5,
    precioLitro: 23.50,
    total: 1069.25,
    odometro: 47500,
    estacion: 'Pemex Centro',
    facturaId: 'f20',
  },
  {
    id: 'cg2',
    vehicleId: 'v2',
    fecha: '2025-12-09',
    litros: 38.2,
    precioLitro: 23.80,
    total: 909.16,
    odometro: 32100,
    estacion: 'Shell Norte',
  },
  {
    id: 'cg3',
    vehicleId: 'v1',
    fecha: '2025-12-05',
    litros: 42.0,
    precioLitro: 23.40,
    total: 982.80,
    odometro: 47200,
    estacion: 'Pemex Centro',
    facturaId: 'f18',
  },
  {
    id: 'cg4',
    vehicleId: 'v3',
    fecha: '2025-12-07',
    litros: 35.0,
    precioLitro: 23.60,
    total: 826.00,
    odometro: 19800,
    estacion: 'BP Sur',
    facturaId: 'f19',
  },
];

const mockMaintenanceHistory: MaintenanceRecord[] = [
  {
    id: 'mh1',
    vehicleId: 'v1',
    fecha: '2025-11-15',
    tipo: 'preventivo',
    descripcion: 'Cambio de aceite y filtros - Servicio 45,000 KM',
    costo: 3200,
    km: 45000,
    proveedor: 'Toyota Lomas',
  },
  {
    id: 'mh2',
    vehicleId: 'v2',
    fecha: '2025-10-20',
    tipo: 'preventivo',
    descripcion: 'Servicio mayor 30,000 KM',
    costo: 4500,
    km: 30000,
    proveedor: 'Nissan Plaza',
  },
  {
    id: 'mh3',
    vehicleId: 'v1',
    fecha: '2025-09-10',
    tipo: 'predictivo',
    descripcion: 'Cambio de balatas delanteras',
    costo: 2800,
    km: 42000,
    proveedor: 'Refaccionaria AutoPartes',
  },
];

export default function Flotilla() {
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'vehiculos' | 'asignaciones' | 'mantenimiento' | 'gasolina'>('vehiculos');

  const vehiculosDisponibles = mockVehicles.filter(v => v.status === 'available').length;
  const vehiculosAsignados = mockVehicles.filter(v => v.status === 'assigned').length;
  const vehiculosEnTaller = mockVehicles.filter(v => v.status === 'in_shop').length;
  const alertasPendientes = mockAlertas.filter(a => !a.attended).length;

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
        data: mockVehicles.map(v => ({
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
        data: mockMaintenanceHistory.map(m => {
          const vehicle = mockVehicles.find(v => v.id === m.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            date: formatDate(m.fecha),
            type: m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1),
            km: m.km.toLocaleString(),
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
        data: mockCargasGasolina.map(c => {
          const vehicle = mockVehicles.find(v => v.id === c.vehicleId);
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
        data: mockVehicles.map(v => {
          const gasolina = mockCargasGasolina.filter(c => c.vehicleId === v.id).reduce((sum, c) => sum + c.total, 0);
          const mantenimiento = mockMaintenanceHistory.filter(m => m.vehicleId === v.id).reduce((sum, m) => sum + m.costo, 0);
          const seguro = 8500; // Mock - debería venir de los datos reales
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
        data: mockAssignments.map(a => {
          const vehicle = mockVehicles.find(v => v.id === a.vehicleId);
          return {
            vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plates})` : 'Desconocido',
            user: a.userName,
            startDate: formatDate(a.startDate),
            initialKm: a.initialKm.toLocaleString(),
            purpose: a.purpose.charAt(0).toUpperCase() + a.purpose.slice(1),
            reason: a.reason,
          };
        }),
      },
    ];

    exportToExcel(sheets, `Reporte_Flotilla_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}`);
    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Administración de Flotilla</h1>
          <p className="text-gray-600 mt-1">Gestión de vehículos empresariales</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={() => setShowAssignmentForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>Asignar Vehículo</span>
          </button>
          <button
            onClick={() => setShowNewVehicleForm(true)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuevo Vehículo</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard label="Total Vehículos" value={mockVehicles.length} color="blue" />
        <MetricCard label="Disponibles" value={vehiculosDisponibles} color="green" />
        <MetricCard label="Asignados" value={vehiculosAsignados} color="orange" />
        <MetricCard label="En Taller" value={vehiculosEnTaller} color="red" />
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
              {mockVehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          )}

          {activeTab === 'asignaciones' && (
            <div className="space-y-4">
              {mockAssignments.length > 0 ? (
                mockAssignments.map((assignment) => (
                  <AssignmentCard key={assignment.id} assignment={assignment} />
                ))
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
              alerts={mockAlertas}
              maintenanceHistory={mockMaintenanceHistory}
              onScheduleService={handleScheduleService}
              onCompleteService={handleCompleteService}
            />
          )}

          {activeTab === 'gasolina' && (
            <GasolinaKPI cargas={mockCargasGasolina} vehicles={mockVehicles} />
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
        <AssignmentModal vehicles={mockVehicles.filter(v => v.status === 'available')} onClose={() => setShowAssignmentForm(false)} />
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
  color: 'blue' | 'green' | 'orange' | 'red';
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600">{label}</p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <div className={`w-10 h-10 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const statusConfig = {
    available: { color: 'bg-green-100 text-green-800', label: 'Disponible' },
    assigned: { color: 'bg-blue-100 text-blue-800', label: 'Asignado' },
    in_shop: { color: 'bg-red-100 text-red-800', label: 'En Taller' },
    out_of_service: { color: 'bg-gray-100 text-gray-800', label: 'De Baja' },
  };

  const status = statusConfig[vehicle.status];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">{vehicle.brand} {vehicle.model}</h3>
          <p className="text-sm text-gray-600">{vehicle.year}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>
          {status.label}
        </span>
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
        <button className="flex-1 px-3 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors">
          Ver Detalles
        </button>
        <button className="flex-1 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors">
          Historial
        </button>
      </div>
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: VehicleAssignment }) {
  const vehicle = mockVehicles.find(v => v.id === assignment.vehicleId);

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-gray-900">
            {vehicle?.brand} {vehicle?.model} - {vehicle?.plates}
          </p>
          <p className="text-sm text-gray-600">Asignado a: {assignment.userName}</p>
          <p className="text-xs text-gray-500 mt-1">
            {assignment.reason} • Desde {formatDate(assignment.startDate)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm text-gray-600">KM Inicial: {assignment.initialKm.toLocaleString()}</p>
        <button className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium">
          Finalizar Asignación
        </button>
      </div>
    </div>
  );
}

function NewVehicleModal({ onClose }: { onClose: () => void }) {
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

        <form className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Marca</label>
              <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
              <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Año</label>
              <input type="number" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Placas</label>
              <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Número de Serie</label>
              <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
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

function AssignmentModal({ vehicles, onClose }: { vehicles: Vehicle[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Asignar Vehículo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vehículo</label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="">Seleccionar vehículo...</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.brand} {v.model} - {v.plates}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Usuario</label>
              <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Buscar usuario..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Inicio</label>
              <input type="date" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Propósito</label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="operaciones">Operaciones</option>
                <option value="visita">Visita</option>
                <option value="viaje">Viaje</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Motivo</label>
            <textarea rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Describe el motivo de la asignación..."></textarea>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              Asignar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
