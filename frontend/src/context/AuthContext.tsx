import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, UserRole } from '../types';
import { syncCoreAppData } from '../utils/backendSync';
import { api } from '../utils/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    full_name: string;
    email: string;
    department: string;
    position: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const departmentOptions = [
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'diseno_mecanico', label: 'Diseno Mecanico' },
  { value: 'hardware_design', label: 'Hardware Design' },
  { value: 'ensamble', label: 'Ensamble' },
  { value: 'programacion_plc', label: 'Programacion PLC' },
  { value: 'manufactura', label: 'Manufactura' },
  { value: 'otro', label: 'Otro' },
];

export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  pm: 'Operaciones',
  staff: 'Colaborador',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = (await api.me()) as AuthUser;
        if (!data?.id || !data?.role) {
          throw new Error('Sesion invalida');
        }
        setUser(data);
        await syncCoreAppData({ userId: String(data.id) });
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    await api.csrf();
    const data = (await api.login(email.trim().toLowerCase(), password)) as AuthUser;
    setUser(data);
    await syncCoreAppData({ userId: String(data.id) });
  };

  const register = async (payload: {
    full_name: string;
    email: string;
    department: string;
    position: string;
    password: string;
  }) => {
    await api.csrf();
    const data = (await api.register({
      ...payload,
      email: payload.email.trim().toLowerCase(),
    })) as AuthUser;
    setUser(data);
    await syncCoreAppData({ userId: String(data.id) });
  };

  const logout = async () => {
    try {
      await api.csrf();
      await api.logout();
    } finally {
      setUser(null);
      await syncCoreAppData();
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
