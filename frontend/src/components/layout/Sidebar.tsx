import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { AlertaConciliacion, SolicitudViaje, TicketAMEX, Viatico } from '../../types';
import { canAccessPath } from '../../utils/access';

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
};

export default function Sidebar({ isOpen }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [viaticosUsuario] = useLocalStorageState<Viatico[]>('usuario:viaticos', []);
  const [viajesPendientesPm] = useLocalStorageState<SolicitudViaje[]>('pm-portal:viajesPendientes', []);
  const [viaticosAdmin] = useLocalStorageState<Viatico[]>('viaticos:list', []);
  const [dispersionPendientes] = useLocalStorageState<Viatico[]>('dispersion:viaticosPendientes', []);
  const [recuperacionPendientes] = useLocalStorageState<Viatico[]>('recuperacion:viaticosPendientes', []);
  const [conciliacionAlertas] = useLocalStorageState<AlertaConciliacion[]>('conciliacion:alertas', []);
  const [amexTickets] = useLocalStorageState<TicketAMEX[]>('amex:tickets', []);
  const [viajesSolicitudes] = useLocalStorageState<SolicitudViaje[]>('viajes:solicitudes', []);

  const portalPmBadge = viaticosUsuario.filter((viatico) => viatico.status === 'pendiente').length + viajesPendientesPm.length;
  const viaticosBadge = viaticosAdmin.filter((viatico) => viatico.status === 'pendiente').length;
  const dispersionBadge = dispersionPendientes.length;
  const recuperacionBadge = recuperacionPendientes.length;
  const conciliacionBadge = conciliacionAlertas.length;
  const amexBadge = amexTickets.filter((ticket) => !ticket.matched).length;
  const viajesBadge = viajesSolicitudes.filter((viaje) => viaje.status === 'pendiente' || viaje.status === 'en_proceso').length;

  const filteredItems = menuItems.filter((item) => canAccessPath(user?.role, item.path));

  if (!isOpen) return null;

  return (
    <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-4rem)] bg-white border-r border-neutral-200 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-800 border-l-4 border-accent-500 pl-3 pr-4'
                  : 'text-neutral-700 hover:bg-neutral-50 px-4'
              }`}
            >
              <div className="flex items-center space-x-3">
                <svg
                  className={`w-5 h-5 ${isActive ? 'text-primary-700' : 'text-neutral-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {icons[item.icon]}
                </svg>
                <span className="font-medium">{item.label}</span>
              </div>

              {(() => {
                const badgeMap: Record<string, number> = {
                  '/portal-pm': portalPmBadge,
                  '/viaticos': viaticosBadge,
                  '/dispersion': dispersionBadge,
                  '/recuperacion': recuperacionBadge,
                  '/conciliacion': conciliacionBadge,
                  '/amex': amexBadge,
                  '/viajes': viajesBadge,
                };
                const badgeValue = badgeMap[item.path];
                if (!badgeValue || badgeValue <= 0) {
                  return null;
                }
                return (
                  <span className="px-2 py-1 text-xs font-semibold text-white bg-accent-500 rounded-full">
                    {badgeValue}
                  </span>
                );
              })()}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-200 bg-white">
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>Versión 1.0.0</span>
          <button className="hover:text-accent-600 transition-colors">
            <svg
              className="w-5 h-5"
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
