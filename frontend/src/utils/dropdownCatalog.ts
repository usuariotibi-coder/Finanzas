import { toStorageKey } from './storage';

const STORAGE_EVENT = 'app-storage-change';

const cloneList = <T,>(items: T[]): T[] => items.map((item) => ({ ...item }));

export const readCatalog = <T,>(key: string, fallback: T[]): T[] => {
  if (typeof window === 'undefined') {
    return cloneList(fallback);
  }

  const storageKey = toStorageKey(key);
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return cloneList(fallback);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return cloneList(fallback);
    }
    return parsed as T[];
  } catch {
    return cloneList(fallback);
  }
};

export const writeCatalog = <T,>(key: string, items: T[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  const storageKey = toStorageKey(key);
  localStorage.setItem(storageKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key: storageKey, sourceId: 'catalog-editor' } }));
};

export const replaceCatalog = <T,>(target: T[], key: string, nextItems: T[]) => {
  target.splice(0, target.length, ...nextItems);
  writeCatalog(key, target);
};

