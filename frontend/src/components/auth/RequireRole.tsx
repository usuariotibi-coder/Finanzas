import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '../../types';
import useAuth from '../../hooks/useAuth';
import { buildPath, saveLastPath } from '../../utils/lastPath';

interface RequireRoleProps {
  allowed: UserRole[];
  children: ReactNode;
}

export default function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      </div>
    );
  }

  if (!user) {
    saveLastPath(buildPath(location));
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
