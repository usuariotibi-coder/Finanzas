type LocationLike = {
  pathname?: string;
  search?: string;
  hash?: string;
};

const LAST_PATH_KEY = 'finanzas:lastPath';
const SESSION_LAST_PATH_KEY = 'finanzas:lastPath:session';
const BLOCKED_PATHS = new Set(['/login', '/registro']);

export function buildPath(location?: LocationLike | null) {
  if (!location?.pathname) {
    return null;
  }
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
}

export function sanitizePath(path: string | null) {
  if (!path) return null;
  const base = path.split('#')[0]?.split('?')[0] ?? '';
  if (BLOCKED_PATHS.has(base)) {
    return null;
  }
  return path;
}

export function saveLastPath(path: string | null) {
  const safePath = sanitizePath(path);
  if (!safePath) return;
  try {
    localStorage.setItem(LAST_PATH_KEY, safePath);
    sessionStorage.setItem(SESSION_LAST_PATH_KEY, safePath);
  } catch {
    // Ignore storage errors (private mode, etc.).
  }
}

export function getLastPath() {
  try {
    const sessionStored = sessionStorage.getItem(SESSION_LAST_PATH_KEY);
    if (sessionStored && sessionStored.startsWith('/')) {
      return sanitizePath(sessionStored);
    }
    const stored = localStorage.getItem(LAST_PATH_KEY);
    if (stored && stored.startsWith('/')) {
      return sanitizePath(stored);
    }
  } catch {
    // Ignore storage errors (private mode, etc.).
  }
  return null;
}

export function wasPageReload() {
  if (typeof performance === 'undefined') return false;
  const navEntries = performance.getEntriesByType?.('navigation') as PerformanceNavigationTiming[] | undefined;
  if (navEntries && navEntries.length > 0) {
    return navEntries[0].type === 'reload';
  }
  const legacyNav = (performance as Performance & { navigation?: { type: number } }).navigation;
  return legacyNav?.type === 1;
}
