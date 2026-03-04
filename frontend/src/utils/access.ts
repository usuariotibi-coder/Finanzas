import type { UserRole } from '../types';

const ACCESS_MAP: Record<string, UserRole[]> = {
  '/': ['admin', 'finance', 'pm', 'staff'],
  '/mi-portal': ['admin', 'pm', 'staff'],
  '/admin/usuarios': ['admin'],
  '/portal-dropdowns': ['admin', 'finance'],
  '/portal-pm': ['admin', 'pm'],
  '/proyectos': ['admin', 'pm'],
  '/viaticos': ['admin', 'finance', 'pm', 'staff'],
  '/conciliacion': ['admin', 'finance', 'pm', 'staff'],
  '/dispersion': ['admin', 'finance'],
  '/recuperacion': ['admin', 'finance'],
  '/amex': ['admin', 'finance'],
  '/flotilla': ['admin', 'finance'],
  '/viajes': ['admin', 'finance'],
  '/reportes': ['admin', 'finance'],
};

export const canAccessPath = (role: UserRole | undefined, path?: string | null) => {
  if (!role || !path) return false;
  if (path === '/') {
    return ACCESS_MAP['/']?.includes(role);
  }
  const keys = Object.keys(ACCESS_MAP).filter((key) => key !== '/').sort((a, b) => b.length - a.length);
  const matchedKey = keys.find((key) => path.startsWith(key));
  if (!matchedKey) return false;
  return ACCESS_MAP[matchedKey].includes(role);
};

export const getAllowedRoles = (path?: string | null): UserRole[] => {
  if (!path) return [];
  if (path === '/') {
    return ACCESS_MAP['/'] ?? [];
  }
  const keys = Object.keys(ACCESS_MAP).filter((key) => key !== '/').sort((a, b) => b.length - a.length);
  const matchedKey = keys.find((key) => path.startsWith(key));
  return matchedKey ? ACCESS_MAP[matchedKey] : [];
};
