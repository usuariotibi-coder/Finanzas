import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roleLabels } from '../../context/AuthContext';
import useAuth from '../../hooks/useAuth';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { AlertaConciliacion, SolicitudViaje, TicketAMEX, Viatico } from '../../types';
import { canAccessPath } from '../../utils/access';
import { getPendingViaticoExtension } from '../../utils/viaticoExtensions';

interface NavbarProps {
  onMenuClick: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  count: number;
  path: string;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viaticosUsuario] = useLocalStorageState<Viatico[]>('usuario:viaticos', []);
  const [viaticosResueltos] = useLocalStorageState<string[]>('pm-portal:viaticosResueltos', []);
  const [viajesPendientesPm] = useLocalStorageState<SolicitudViaje[]>('pm-portal:viajesPendientes', []);
  const [viaticosAdmin] = useLocalStorageState<Viatico[]>('viaticos:list', []);
  const [dispersionPendientes] = useLocalStorageState<Viatico[]>('dispersion:viaticosPendientes', []);
  const [recuperacionPendientes] = useLocalStorageState<Viatico[]>('recuperacion:viaticosPendientes', []);
  const [conciliacionAlertas] = useLocalStorageState<AlertaConciliacion[]>('conciliacion:alertas', []);
  const [amexTickets] = useLocalStorageState<TicketAMEX[]>('amex:tickets', []);
  const [viajesSolicitudes] = useLocalStorageState<SolicitudViaje[]>('viajes:solicitudes', []);

  const portalPmViaticosPendientes = viaticosUsuario.filter((viatico) => {
    const hasExtensionRequest = Boolean(getPendingViaticoExtension(viatico.comentarios));
    const isSolicitudInicial = viatico.status === 'pendiente' && !viaticosResueltos.includes(String(viatico.id));
    return hasExtensionRequest || isSolicitudInicial;
  }).length;
  const portalPmBadge = portalPmViaticosPendientes + viajesPendientesPm.length;
  const viaticosBadge = viaticosAdmin.filter((viatico) => viatico.status === 'pendiente').length;
  const dispersionBadge = dispersionPendientes.length;
  const recuperacionBadge = recuperacionPendientes.length;
  const conciliacionBadge = conciliacionAlertas.length;
  const amexBadge = amexTickets.filter((ticket) => !ticket.matched).length;
  const viajesBadge = viajesSolicitudes.filter((viaje) => viaje.status === 'pendiente' || viaje.status === 'en_proceso').length;

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (portalPmBadge > 0) {
      items.push({
        id: 'portal-pm',
        title: 'Portal PM',
        description: `Pendientes: ${portalPmBadge}`,
        count: portalPmBadge,
        path: '/portal-pm',
      });
    }
    if (viaticosBadge > 0) {
      items.push({
        id: 'viaticos',
        title: 'Viáticos',
        description: `Pendientes: ${viaticosBadge}`,
        count: viaticosBadge,
        path: '/viaticos',
      });
    }
    if (dispersionBadge > 0) {
      items.push({
        id: 'dispersion',
        title: 'Dispersión',
        description: `Pendientes: ${dispersionBadge}`,
        count: dispersionBadge,
        path: '/dispersion',
      });
    }
    if (recuperacionBadge > 0) {
      items.push({
        id: 'recuperacion',
        title: 'Recuperación',
        description: `Pendientes: ${recuperacionBadge}`,
        count: recuperacionBadge,
        path: '/recuperacion',
      });
    }
    if (conciliacionBadge > 0) {
      items.push({
        id: 'conciliacion',
        title: 'Conciliación',
        description: `Alertas: ${conciliacionBadge}`,
        count: conciliacionBadge,
        path: '/conciliacion',
      });
    }
    if (amexBadge > 0) {
      items.push({
        id: 'amex',
        title: 'AMEX',
        description: `Sin factura: ${amexBadge}`,
        count: amexBadge,
        path: '/amex',
      });
    }
    if (viajesBadge > 0) {
      items.push({
        id: 'viajes',
        title: 'Viajes',
        description: `Pendientes: ${viajesBadge}`,
        count: viajesBadge,
        path: '/viajes',
      });
    }
    return items.filter((item) => canAccessPath(user?.role, item.path));
  }, [
    portalPmBadge,
    viaticosBadge,
    dispersionBadge,
    recuperacionBadge,
    conciliacionBadge,
    amexBadge,
    viajesBadge,
    user?.role,
  ]);

  const totalNotifications = notifications.reduce((sum, item) => sum + item.count, 0);
  const userName = user?.full_name || 'Usuario';
  const userRoleLabel = user ? roleLabels[user.role] : '';
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const getNotificationStyle = (id: string) => {
    const styles = {
      'portal-pm': {
        label: 'PM',
        bg: 'bg-primary-50',
        text: 'text-primary-700',
        badge: 'bg-accent-500',
        border: 'border-primary-100',
        ring: 'ring-primary-100',
      },
      viaticos: {
        label: '$',
        bg: 'bg-accent-50',
        text: 'text-accent-700',
        badge: 'bg-accent-500',
        border: 'border-accent-200',
        ring: 'ring-accent-100',
      },
      dispersion: {
        label: 'DS',
        bg: 'bg-neutral-100',
        text: 'text-primary-700',
        badge: 'bg-primary-600',
        border: 'border-neutral-200',
        ring: 'ring-neutral-200',
      },
      recuperacion: {
        label: 'RC',
        bg: 'bg-neutral-100',
        text: 'text-primary-700',
        badge: 'bg-primary-600',
        border: 'border-neutral-200',
        ring: 'ring-neutral-200',
      },
      conciliacion: {
        label: 'CC',
        bg: 'bg-primary-100',
        text: 'text-primary-800',
        badge: 'bg-primary-700',
        border: 'border-primary-200',
        ring: 'ring-primary-200',
      },
      amex: {
        label: 'AM',
        bg: 'bg-accent-50',
        text: 'text-accent-700',
        badge: 'bg-accent-600',
        border: 'border-accent-200',
        ring: 'ring-accent-100',
      },
      viajes: {
        label: 'VJ',
        bg: 'bg-neutral-100',
        text: 'text-primary-700',
        badge: 'bg-primary-600',
        border: 'border-neutral-200',
        ring: 'ring-neutral-200',
      },
    };

    return styles[id as keyof typeof styles] ?? {
      label: 'N',
      bg: 'bg-neutral-100',
      text: 'text-primary-700',
      badge: 'bg-primary-600',
      border: 'border-neutral-200',
      ring: 'ring-neutral-200',
    };
  };

  useEscapeKey(() => setIsOpen(false), isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white/95 border-b border-neutral-200 z-50 shadow-sm backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-accent-500" />
      <div className="flex items-center justify-between h-full px-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-primary-50 transition-colors"
          >
            <svg
              className="w-6 h-6 text-primary-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <h1 className="text-xl font-bold text-primary-900 tracking-tight">
            Sistema de Gestión Financiera
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setIsOpen((prev) => !prev)}
              className="relative p-2 rounded-lg hover:bg-primary-50 transition-colors"
              aria-label="Notificaciones"
            >
              <svg
                className="w-6 h-6 text-primary-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {totalNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] px-1.5 py-0.5 text-[10px] font-semibold text-white bg-accent-500 rounded-full text-center">
                  {totalNotifications > 9 ? '9+' : totalNotifications}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-xl ring-1 ring-black/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-200 bg-gradient-to-r from-primary-50 via-white to-neutral-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-900">Notificaciones</p>
                        <p className="text-xs text-neutral-600">Resumen de pendientes</p>
                      </div>
                    </div>
                    <div className="text-xs text-neutral-600">
                      Total <span className="font-semibold text-primary-900">{totalNotifications}</span>
                    </div>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-neutral-600">
                      <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      Todo al día.
                      <div className="text-xs text-neutral-500 mt-1">No hay pendientes.</div>
                    </div>
                  ) : (
                    notifications.map((item) => {
                      const style = getNotificationStyle(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setIsOpen(false);
                            navigate(item.path);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-neutral-50 flex items-start justify-between gap-3 border-l-2 ${style.border}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-lg ${style.bg} ${style.text} ring-1 ${style.ring} flex items-center justify-center text-xs font-semibold`}>
                              {style.label}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-primary-900">{item.title}</p>
                              <p className="text-xs text-neutral-600">{item.description}</p>
                            </div>
                          </div>
                          <span className={`min-w-[28px] px-2 py-0.5 text-xs font-semibold text-white ${style.badge} rounded-full text-center`}>
                            {item.count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-sm font-medium text-primary-900">{userName}</p>
              <p className="text-xs text-neutral-600">{userRoleLabel}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
              {initials || 'US'}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-neutral-600 hover:text-accent-600 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
