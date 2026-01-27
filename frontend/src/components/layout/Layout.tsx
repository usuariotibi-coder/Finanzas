import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import useAuth from '../../hooks/useAuth';
import { canAccessPath } from '../../utils/access';
import { buildPath, getLastPath, saveLastPath, sanitizePath } from '../../utils/lastPath';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const navigationType = useNavigationType();
  const restoreAttempted = useRef(false);

  useEffect(() => {
    const currentPath = buildPath(location);
    if (!currentPath) {
      return;
    }
    saveLastPath(currentPath);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (restoreAttempted.current || loading) return;
    const lastPath = sanitizePath(getLastPath());
    const currentPath = buildPath(location);
    restoreAttempted.current = true;
    if (!currentPath) {
      return;
    }
    if (!lastPath || lastPath === location.pathname) {
      saveLastPath(currentPath);
      return;
    }
    if (navigationType === 'POP' && location.pathname === '/' && canAccessPath(user?.role, lastPath)) {
      navigate(lastPath, { replace: true });
      return;
    }
    saveLastPath(currentPath);
  }, [location.pathname, location.search, location.hash, loading, navigate, navigationType, user?.role]);

  return (
    <div className="h-screen bg-neutral-50 text-primary-900 flex flex-col overflow-hidden">
      <Navbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} />

        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'} overflow-y-auto pt-16`}>
          <div className="p-4 sm:p-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
