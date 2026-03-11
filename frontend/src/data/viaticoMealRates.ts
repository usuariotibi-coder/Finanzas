import { toStorageKey } from '../utils/storage';

const STORAGE_EVENT = 'app-storage-change';
const VIATICO_MEAL_RATES_STORAGE_KEY = 'catalogs:viatico-meal-rates';

export interface ViaticoMealRates {
  desayuno: number;
  comida: number;
  cena: number;
  updatedAt?: string;
}

const DEFAULT_VIATICO_MEAL_RATES: ViaticoMealRates = {
  desayuno: 150,
  comida: 200,
  cena: 250,
};

const sanitizeViaticoMealRates = (value?: Partial<ViaticoMealRates> | null): ViaticoMealRates => ({
  desayuno: Number(value?.desayuno) >= 0 ? Number(value?.desayuno) : DEFAULT_VIATICO_MEAL_RATES.desayuno,
  comida: Number(value?.comida) >= 0 ? Number(value?.comida) : DEFAULT_VIATICO_MEAL_RATES.comida,
  cena: Number(value?.cena) >= 0 ? Number(value?.cena) : DEFAULT_VIATICO_MEAL_RATES.cena,
  updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : undefined,
});

const readStoredViaticoMealRates = (): ViaticoMealRates => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_VIATICO_MEAL_RATES };
  }

  const raw = localStorage.getItem(toStorageKey(VIATICO_MEAL_RATES_STORAGE_KEY));
  if (!raw) {
    return { ...DEFAULT_VIATICO_MEAL_RATES };
  }

  try {
    return sanitizeViaticoMealRates(JSON.parse(raw) as Partial<ViaticoMealRates>);
  } catch {
    return { ...DEFAULT_VIATICO_MEAL_RATES };
  }
};

const writeStoredViaticoMealRates = (next: ViaticoMealRates) => {
  if (typeof window === 'undefined') {
    return;
  }

  const storageKey = toStorageKey(VIATICO_MEAL_RATES_STORAGE_KEY);
  localStorage.setItem(storageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key: storageKey, sourceId: 'catalog-editor' } }));
};

export const VIATICO_MEAL_RATES: ViaticoMealRates = readStoredViaticoMealRates();

export const replaceViaticoMealRates = (next: Partial<ViaticoMealRates>) => {
  const sanitized = sanitizeViaticoMealRates(next);
  Object.assign(VIATICO_MEAL_RATES, sanitized);
  writeStoredViaticoMealRates(sanitized);
};
