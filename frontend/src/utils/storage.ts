export const STORAGE_PREFIX = 'finanzas_v2:';

const LEGACY_STORAGE_KEYS = [
  'proyectos_data',
  'vehicle_assignments_data',
  'patronesClasificacion',
];

export const toStorageKey = (key: string) => `${STORAGE_PREFIX}${key}`;

export const clearAppStorage = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) {
      continue;
    }
    if (key.startsWith(STORAGE_PREFIX) || LEGACY_STORAGE_KEYS.includes(key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
};
