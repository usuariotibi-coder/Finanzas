import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { AlertaConciliacion, SolicitudViaje, TicketAMEX, VehicleAssignment, Viatico } from '../../types';
import { canAccessPath } from '../../utils/access';
import { getPendingViaticoExtension } from '../../utils/viaticoExtensions';

interface SidebarProps {
  isOpen: boolean;
}

interface MenuItem {
  path: string;
  label: string;
  icon: string;
  badge?: number;
}

const menuItems: MenuItem[] = [
  { path: '/', label: 'Dashboard', icon: 'home' },
  { path: '/mi-portal', label: 'Mi Portal', icon: 'user' },
  { path: '/admin/usuarios', label: 'Usuarios', icon: 'users' },
  { path: '/portal-dropdowns', label: 'Dropdowns', icon: 'sliders' },
  { path: '/portal-pm', label: 'Portal PM', icon: 'pm' },
  { path: '/proyectos', label: 'Proyectos', icon: 'briefcase' },
  { path: '/viaticos', label: 'Viáticos', icon: 'money' },
  { path: '/dispersion', label: 'Dispersión', icon: 'send' },
  { path: '/recuperacion', label: 'Recuperación', icon: 'return' },
  { path: '/conciliacion', label: 'Conciliación', icon: 'check' },
  { path: '/amex', label: 'AMEX', icon: 'credit-card' },
  { path: '/flotilla', label: 'Flotilla', icon: 'car' },
  { path: '/viajes', label: 'Viajes', icon: 'airplane' },
  { path: '/reportes', label: 'Reportes', icon: 'document' },
];

const VEHICLE_ASSIGNMENTS_STORAGE_KEY = 'vehicle_assignments_data';

const readVehicleAssignments = (): VehicleAssignment[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = localStorage.getItem(VEHICLE_ASSIGNMENTS_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VehicleAssignment[]) : [];
  } catch {
    return [];
  }
};

const icons: Record<string, React.JSX.Element> = {
  home: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  ),
  user: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  ),
  users: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 20h5v-1a4 4 0 00-5-3.87M17 20H7m10 0v-1c0-.65-.14-1.28-.4-1.84M7 20H2v-1a4 4 0 015-3.87M7 20v-1c0-.65.14-1.28.4-1.84m0 0a5 5 0 019.2 0M14 7a3 3 0 11-6 0 3 3 0 016 0m6 1a2 2 0 11-4 0 2 2 0 014 0M8 8a2 2 0 11-4 0 2 2 0 014 0"
    />
  ),
  money: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  send: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  ),
  return: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  ),
  check: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  'credit-card': (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  ),
  car: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
    />
  ),
  document: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  ),
  briefcase: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  ),
  airplane: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 9.5L9 3m0 0l7 7M9 3v11.5M9 21l4.5-4.5M15 9l6 3-6 3m0-6v6m0-6l-6 3"
    />
  ),
  pm: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z M16 2v6h6"
    />
  ),
  sliders: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6h16M4 12h16M4 18h16M9 4v4m6-4v4m-8 8v4m8-4v4"
    />
  ),
};

export default function Sidebar({ isOpen }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [viaticosPm] = useLocalStorageState<Viatico[]>('pm-portal:viaticos', []);
  const [viaticosResueltos] = useLocalStorageState<string[]>('pm-portal:viaticosResueltos', []);
  const [viajesPendientesPm] = useLocalStorageState<SolicitudViaje[]>('pm-portal:viajesPendientes', []);
  const [viaticosAdmin] = useLocalStorageState<Viatico[]>('viaticos:list', []);
  const [dispersionPendientes] = useLocalStorageState<Viatico[]>('dispersion:viaticosPendientes', []);
  const [recuperacionPendientes] = useLocalStorageState<Viatico[]>('recuperacion:viaticosPendientes', []);
  const [conciliacionAlertas] = useLocalStorageState<AlertaConciliacion[]>('conciliacion:alertas', []);
  const [amexTickets] = useLocalStorageState<TicketAMEX[]>('amex:tickets', []);
  const [viajesSolicitudes] = useLocalStorageState<SolicitudViaje[]>('viajes:solicitudes', []);
  const [vehicleAssignments, setVehicleAssignments] = useState<VehicleAssignment[]>(readVehicleAssignments);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncAssignments = () => {
      setVehicleAssignments(readVehicleAssignments());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === VEHICLE_ASSIGNMENTS_STORAGE_KEY) {
        syncAssignments();
      }
    };

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === VEHICLE_ASSIGNMENTS_STORAGE_KEY) {
        syncAssignments();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('app-storage-change', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app-storage-change', handleCustom);
    };
  }, []);

  const portalPmViaticosSource = viaticosPm.length > 0 ? viaticosPm : viaticosAdmin;
  const portalPmViaticosPendientes = portalPmViaticosSource.filter((viatico) => {
    const hasExtensionRequest = Boolean(getPendingViaticoExtension(viatico.comentarios));
    const isSolicitudInicial = viatico.status === 'pendiente' && !viaticosResueltos.includes(String(viatico.id));
    return hasExtensionRequest || isSolicitudInicial;
  }).length;
  const portalPmBadge = portalPmViaticosPendientes + viajesPendientesPm.length;
  const viaticosBadge = viaticosAdmin.filter((viatico) => viatico.status === 'pendiente').length;
  const dispersionBadge = dispersionPendientes.length;
  const recuperacionBadge = recuperacionPendientes.filter((viatico) => {
    const saldo = typeof viatico.saldoRestante === 'number'
      ? viatico.saldoRestante
      : Math.max((viatico.montoDispersado ?? 0) - (viatico.montoGastado ?? 0), 0);
    return saldo > 0;
  }).length;
  const conciliacionBadge = conciliacionAlertas.length;
  const amexBadge = amexTickets.filter((ticket) => !ticket.matched).length;
  const viajesBadge = viajesSolicitudes.filter((viaje) => viaje.status === 'pendiente' || viaje.status === 'en_proceso').length;
  const miPortalBadge = vehicleAssignments.filter((assignment) => (
    assignment.userId === String(user?.id) && assignment.status === 'asignado'
  )).length;
  const flotillaBadge = vehicleAssignments.filter((assignment) => {
    const status = String(assignment.status);
    if (status === 'solicitado' || status === 'pendiente') {
      return true;
    }
    if (status === 'completado') {
      return !assignment.checklistEntrega?.liberacionEntrega?.validada;
    }
    return false;
  }).length;

  const filteredItems = menuItems.filter((item) => canAccessPath(user?.role, item.path));

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-48 border-r border-neutral-200 bg-white/95 shadow-sm backdrop-blur transition-all duration-300 ease-out ${
        isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-primary-500" />

      <div className="border-b border-neutral-200 px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.28em] text-neutral-500">Navegacion</p>
        <p className="mt-1 pr-2 text-xs font-medium text-primary-800">Accesos rapidos del sistema</p>
      </div>

      <nav className="h-[calc(100%-7.3rem)] overflow-y-auto p-3 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`group flex items-center justify-between rounded-xl py-2 transition-all duration-200 ${
                isActive
                  ? 'bg-primary-50 text-primary-800 border-l-4 border-accent-500 pl-2.5 pr-3 shadow-sm'
                  : 'text-neutral-700 hover:bg-neutral-50 hover:translate-x-0.5 px-3'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <svg
                  className={`w-[18px] h-[18px] transition-transform duration-200 ${
                    isActive ? 'text-primary-700' : 'text-neutral-500 group-hover:text-primary-700 group-hover:scale-110'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {icons[item.icon]}
                </svg>
                <span className="pr-1 text-[14px] font-medium">{item.label}</span>
              </div>

              {(() => {
                const badgeMap: Record<string, number> = {
                  '/mi-portal': miPortalBadge,
                  '/portal-pm': portalPmBadge,
                  '/viaticos': viaticosBadge,
                  '/dispersion': dispersionBadge,
                  '/recuperacion': recuperacionBadge,
                  '/conciliacion': conciliacionBadge,
                  '/amex': amexBadge,
                  '/flotilla': flotillaBadge,
                  '/viajes': viajesBadge,
                };
                const badgeValue = badgeMap[item.path];
                if (!badgeValue || badgeValue <= 0) {
                  return null;
                }
                return (
                  <span className="px-1.5 py-0.5 text-[11px] font-semibold text-white bg-accent-500 rounded-full shadow-sm">
                    {badgeValue}
                  </span>
                );
              })()}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-neutral-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between text-xs text-neutral-600">
          <span>Version 1.0.0</span>
          <button className="rounded-md p-1 hover:bg-primary-50 hover:text-accent-600 transition-colors">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
