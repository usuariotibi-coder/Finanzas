import { useEffect, useRef, useState } from 'react';
import { toStorageKey } from '../utils/storage';

type LocalStorageStateOptions<T> = {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
};

const STORAGE_EVENT = 'app-storage-change';

const resolveInitialValue = <T,>(initialValue: T | (() => T)) => {
  return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
};

export default function useLocalStorageState<T>(
  key: string,
  initialValue: T | (() => T),
  options: LocalStorageStateOptions<T> = {}
) {
  const storageKey = toStorageKey(key);
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize = options.deserialize ?? JSON.parse;
  const instanceIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const isSyncingRef = useRef(false);

  const readStoredValue = () => {
    if (typeof window === 'undefined') {
      return resolveInitialValue(initialValue);
    }

    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      try {
        return deserialize(stored);
      } catch {
        // ignore parse errors and fall back to default
      }
    }

    return resolveInitialValue(initialValue);
  };

  const [state, setState] = useState<T>(readStoredValue);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }

    try {
      localStorage.setItem(storageKey, serialize(state));
      window.dispatchEvent(
        new CustomEvent(STORAGE_EVENT, {
          detail: { key: storageKey, sourceId: instanceIdRef.current },
        })
      );
    } catch {
      // ignore write errors (storage full, privacy mode, etc.)
    }
  }, [storageKey, serialize, state]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncState = () => {
      isSyncingRef.current = true;
      setState(readStoredValue());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        syncState();
      }
    };

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; sourceId?: string }>).detail;
      if (detail?.key === storageKey && detail?.sourceId !== instanceIdRef.current) {
        syncState();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(STORAGE_EVENT, handleCustom);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(STORAGE_EVENT, handleCustom);
    };
  }, [storageKey, deserialize, initialValue]);

  return [state, setState] as const;
}
