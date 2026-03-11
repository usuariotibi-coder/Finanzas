import { readCatalog, replaceCatalog } from '../utils/dropdownCatalog';

export interface UserCategoryOption {
  value: string;
  label: string;
}

const USER_CATEGORIES_STORAGE_KEY = 'catalogs:user-categories';

const DEFAULT_USER_CATEGORY_OPTIONS: UserCategoryOption[] = [
  { value: 'gerente', label: 'Gerente' },
  { value: 'operador', label: 'Operador' },
];

const sanitizeUserCategories = (items: UserCategoryOption[]) =>
  items
    .map((item) => ({
      value: String(item.value || '').trim().toLowerCase(),
      label: String(item.label || '').trim(),
    }))
    .filter((item) => item.value && item.label);

export const USER_CATEGORY_OPTIONS: UserCategoryOption[] = sanitizeUserCategories(
  readCatalog<UserCategoryOption>(USER_CATEGORIES_STORAGE_KEY, DEFAULT_USER_CATEGORY_OPTIONS)
);

if (USER_CATEGORY_OPTIONS.length === 0) {
  replaceCatalog(USER_CATEGORY_OPTIONS, USER_CATEGORIES_STORAGE_KEY, DEFAULT_USER_CATEGORY_OPTIONS);
}

export const replaceUserCategoryOptions = (next: UserCategoryOption[]) => {
  replaceCatalog(USER_CATEGORY_OPTIONS, USER_CATEGORIES_STORAGE_KEY, sanitizeUserCategories(next));
};
