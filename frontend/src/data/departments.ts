import { readCatalog, replaceCatalog } from '../utils/dropdownCatalog';

export interface DepartmentOption {
  value: string;
  label: string;
}

const DEPARTMENTS_STORAGE_KEY = 'catalogs:departments';

const DEFAULT_DEPARTMENT_OPTIONS: DepartmentOption[] = [
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'business_intelligence', label: 'Business Intelligence' },
  { value: 'diseno_mecanico', label: 'Diseno Mecanico' },
  { value: 'hardware_design', label: 'Hardware Design' },
  { value: 'ensamble', label: 'Ensamble' },
  { value: 'programacion_plc', label: 'Programacion PLC' },
  { value: 'manufactura', label: 'Manufactura' },
  { value: 'otro', label: 'Otro' },
];

const sanitizeDepartments = (items: DepartmentOption[]) =>
  items
    .map((item) => ({
      value: String(item.value || '').trim(),
      label: String(item.label || '').trim(),
    }))
    .filter((item) => item.value && item.label);

export const DEPARTMENT_OPTIONS: DepartmentOption[] = sanitizeDepartments(
  readCatalog<DepartmentOption>(DEPARTMENTS_STORAGE_KEY, DEFAULT_DEPARTMENT_OPTIONS)
);

if (DEPARTMENT_OPTIONS.length === 0) {
  replaceCatalog(DEPARTMENT_OPTIONS, DEPARTMENTS_STORAGE_KEY, DEFAULT_DEPARTMENT_OPTIONS);
}

export const replaceDepartmentOptions = (next: DepartmentOption[]) => {
  replaceCatalog(DEPARTMENT_OPTIONS, DEPARTMENTS_STORAGE_KEY, sanitizeDepartments(next));
};

export const addDepartmentOption = (option: DepartmentOption) => {
  replaceDepartmentOptions([...DEPARTMENT_OPTIONS, option]);
};

export const removeDepartmentOption = (value: string) => {
  const normalizedValue = value.trim();
  replaceDepartmentOptions(DEPARTMENT_OPTIONS.filter((item) => item.value !== normalizedValue));
};

const prettifyDepartmentValue = (value: string) =>
  value
    .split('_')
    .filter(Boolean)
    .map((segment) => {
      const upperSegment = segment.toUpperCase();
      if (upperSegment === 'PLC' || upperSegment === 'RH' || upperSegment === 'BI') {
        return upperSegment;
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join(' ');

export const getDepartmentLabel = (value: string) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';

  const match = [...DEPARTMENT_OPTIONS, ...DEFAULT_DEPARTMENT_OPTIONS].find(
    (item) => item.value === normalizedValue || item.label === normalizedValue
  );

  if (match?.label) {
    return match.label;
  }

  return normalizedValue.includes('_') ? prettifyDepartmentValue(normalizedValue) : normalizedValue;
};

