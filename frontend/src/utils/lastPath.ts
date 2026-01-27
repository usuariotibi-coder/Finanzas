type LocationLike = {
  pathname?: string;
  search?: string;
  hash?: string;
};

const LAST_PATH_KEY = 'finanzas:lastPath';
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
  } catch {
    // Ignore storage errors (private mode, etc.).
  }
}

export function getLastPath() {
  try {
    const stored = localStorage.getItem(LAST_PATH_KEY);
    if (stored && stored.startsWith('/')) {
      return sanitizePath(stored);
    }
  } catch {
    // Ignore storage errors (private mode, etc.).
  }
  return null;
}
