import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { roleLabels } from '../../context/AuthContext';
import useAuth from '../../hooks/useAuth';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { AlertaConciliacion, SolicitudViaje, TicketAMEX, VehicleAssignment, Viatico } from '../../types';
import { canAccessPath } from '../../utils/access';
import { getPendingViaticoExtension } from '../../utils/viaticoExtensions';
import { api } from '../../utils/api';

interface NavbarProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  count: number;
  path: string;
}

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

const strengthMeta = [
  { label: 'Muy debil', color: 'bg-red-500', text: 'text-red-600' },
  { label: 'Debil', color: 'bg-orange-500', text: 'text-orange-600' },
  { label: 'Media', color: 'bg-amber-500', text: 'text-amber-700' },
  { label: 'Fuerte', color: 'bg-emerald-500', text: 'text-emerald-700' },
  { label: 'Muy fuerte', color: 'bg-emerald-600', text: 'text-emerald-800' },
];

const buildPasswordChecks = (value: string) => [
  { label: 'Minimo 8 caracteres', ok: value.length >= 8 },
  { label: 'Una mayuscula (A-Z)', ok: /[A-Z]/.test(value) },
  { label: 'Una minuscula (a-z)', ok: /[a-z]/.test(value) },
  { label: 'Un numero (0-9)', ok: /\d/.test(value) },
  { label: 'Un simbolo (!@#$...)', ok: /[^A-Za-z0-9]/.test(value) },
  { label: 'Sin espacios', ok: !/\s/.test(value) },
];

export default function Navbar({ onMenuClick, sidebarOpen }: NavbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
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

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (miPortalBadge > 0) {
      items.push({
        id: 'mi-portal',
        title: 'Mi Portal',
        description: `Vehiculos por recibir: ${miPortalBadge}`,
        count: miPortalBadge,
        path: '/mi-portal',
      });
    }
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
    miPortalBadge,
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

  const passwordChecks = useMemo(
    () => buildPasswordChecks(newPassword),
    [newPassword]
  );
  const passedChecks = passwordChecks.filter((check) => check.ok).length;
  const rawStrengthScore = Math.min(5, passedChecks + (newPassword.length >= 12 ? 1 : 0));
  const strengthScore = passwordChecks.every((check) => check.ok)
    ? rawStrengthScore
    : Math.min(rawStrengthScore, 3);
  const currentStrength = strengthMeta[Math.max(0, Math.min(4, strengthScore - 1))];

  const getNotificationStyle = (id: string) => {
    const styles = {
      'mi-portal': {
        label: 'MP',
        bg: 'bg-primary-100',
        text: 'text-primary-700',
        badge: 'bg-accent-500',
        border: 'border-primary-100',
        ring: 'ring-primary-100',
      },
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

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordSubmitting(false);
  };

  useEscapeKey(
    () => {
      setIsOpen(false);
      setIsUserMenuOpen(false);
      if (isPasswordModalOpen) {
        closePasswordModal();
      }
    },
    isOpen || isUserMenuOpen || isPasswordModalOpen
  );

  useEffect(() => {
    if (!isOpen && !isUserMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, isUserMenuOpen]);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const handleChangePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Completa los tres campos de contrasena.');
      return;
    }
    if (passwordChecks.some((check) => !check.ok)) {
      setPasswordError(
        'La nueva contrasena debe tener minimo 8 caracteres, incluir mayuscula, minuscula, numero, simbolo y no contener espacios.'
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('La confirmacion no coincide con la nueva contrasena.');
      return;
    }

    setPasswordSubmitting(true);
    try {
      await api.csrf();
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess('Contrasena actualizada correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'No se pudo actualizar la contrasena.'
      );
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-neutral-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-accent-500" />
      <div className="mx-auto flex h-full w-full max-w-[2400px] items-center justify-between px-4 sm:px-5 lg:px-6 xl:px-8">
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuClick}
            className={`rounded-lg p-2 transition-all ${
              sidebarOpen
                ? 'bg-primary-100 text-primary-800 shadow-inner'
                : 'text-primary-700 hover:bg-primary-50'
            }`}
            aria-label={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
            aria-expanded={sidebarOpen}
          >
            <svg
              className={`h-6 w-6 transition-transform duration-200 ${sidebarOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {sidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <h1 className="text-xl font-bold text-primary-900 tracking-tight">
            Sistema de Gestión Financiera
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => {
                setIsUserMenuOpen(false);
                setIsOpen((prev) => !prev);
              }}
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

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsUserMenuOpen((prev) => !prev);
              }}
              className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-1 transition-all hover:border-primary-100 hover:bg-primary-50/60"
            >
              <div className="text-right">
                <p className="text-sm font-medium text-primary-900">{userName}</p>
                <p className="text-xs text-neutral-600">{userRoleLabel}</p>
              </div>
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-white font-semibold shadow-sm transition-transform group-hover:scale-105">
                {initials || 'US'}
              </div>
              <svg
                className={`h-4 w-4 text-neutral-500 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5">
                <div className="border-b border-neutral-200 bg-gradient-to-r from-primary-50 via-white to-neutral-50 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-primary-900">{userName}</p>
                  <p className="text-xs text-neutral-600">{userRoleLabel}</p>
                </div>
                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsPasswordModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-primary-800 transition-colors hover:bg-primary-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V6a5 5 0 10-10 0v1H6a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    Cambiar contrasena
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Cerrar sesion
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </nav>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/55 px-2 py-6 backdrop-blur-sm sm:px-4 sm:py-8">
          <div className="mx-auto my-8 w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl sm:my-12 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Seguridad</p>
                <h3 className="text-xl font-semibold text-primary-900">Cambiar contrasena</h3>
                <p className="mt-1 text-xs text-neutral-600">
                  Protege tu cuenta usando una contrasena fuerte y unica.
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleChangePasswordSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Contrasena actual</label>
                <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="w-full rounded-l-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="Contrasena actual"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                  >
                    {showCurrentPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Nueva contrasena</label>
                  <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="w-full rounded-l-lg px-3 py-2.5 text-sm outline-none"
                      placeholder="Nueva contrasena"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      {showNewPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Confirmar nueva contrasena</label>
                  <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                    <input
                      type={showConfirmNewPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      className="w-full rounded-l-lg px-3 py-2.5 text-sm outline-none"
                      placeholder="Repite la nueva contrasena"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword((prev) => !prev)}
                      className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      {showConfirmNewPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700">Seguridad de nueva contrasena</p>
                  {newPassword.length > 0 && (
                    <span className={`text-xs font-semibold ${currentStrength.text}`}>{currentStrength.label}</span>
                  )}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white shadow-inner">
                  <div
                    className={`h-1.5 rounded-full transition-all ${currentStrength.color}`}
                    style={{ width: `${(strengthScore / 5) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  {passwordChecks.map((check) => (
                    <span
                      key={check.label}
                      className={check.ok ? 'font-medium text-emerald-700' : 'text-slate-500'}
                    >
                      {check.ok ? '* ' : 'o '}
                      {check.label}
                    </span>
                  ))}
                </div>
              </div>

              {passwordError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {passwordSuccess}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting}
                  className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {passwordSubmitting ? 'Actualizando...' : 'Actualizar contrasena'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
