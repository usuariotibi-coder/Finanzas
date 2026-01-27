import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../utils/api';
import type { AuthUser, UserRole } from '../types';

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
  { value: 'diseno_mecanico', label: 'Diseno Mecanico' },
  { value: 'hardware_design', label: 'Hardware Design' },
  { value: 'ensamble', label: 'Ensamble' },
  { value: 'programacion_plc', label: 'Programacion PLC' },
  { value: 'manufactura', label: 'Manufactura' },
  { value: 'otro', label: 'Otro' },
];

export const positionOptions = [
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'otro', label: 'Otro' },
];

export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  pm: 'Project Manager',
  staff: 'Colaborador',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await api.me();
        setUser(data as AuthUser);
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    await api.csrf();
    const data = (await api.login(email.trim().toLowerCase(), password)) as AuthUser;
    setUser(data);
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
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
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
