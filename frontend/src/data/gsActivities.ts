import { readCatalog, replaceCatalog } from '../utils/dropdownCatalog';

export interface GSActivity {
  id: number;
  label: string;
  account: string;
  code: string;
  category: 'job' | 'travel' | 'facility' | 'employee' | 'office' | 'vehicle';
  proyectoRequerido: boolean;
  note?: string;
}

const GS_ACTIVITIES_STORAGE_KEY = 'catalogs:gs-activities';
export const GS_ACTIVITY_OTHER_ID = 9;

const DEFAULT_GS_ACTIVITIES: GSActivity[] = [
  { id: 1, label: 'Support', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: true },
  { id: 2, label: 'Commissioning', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: true },
  { id: 3, label: 'Instalation', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: true },
  { id: 4, label: 'Assembly Build', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: true },
  { id: 5, label: 'Levantamiento', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: false },
  { id: 6, label: 'Lunch', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: false },
  { id: 7, label: 'Viaticos TE', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: true },
  { id: 8, label: 'Visa', account: '5450', code: 'N/A', category: 'travel', proyectoRequerido: true },
  {
    id: GS_ACTIVITY_OTHER_ID,
    label: 'Otro',
    account: '5450',
    code: 'N/A',
    category: 'travel',
    proyectoRequerido: true,
  },
];

const validCategories: GSActivity['category'][] = ['job', 'travel', 'facility', 'employee', 'office', 'vehicle'];

const sanitizeActivities = (items: GSActivity[]): GSActivity[] =>
  items
    .map((item, index) => {
      const id = Number(item.id);
      const safeId = Number.isFinite(id) ? id : index + 1;
      const category = validCategories.includes(item.category) ? item.category : 'travel';
      return {
        id: safeId,
        label: String(item.label || '').trim(),
        account: String(item.account || '').trim() || '5450',
        code: String(item.code || '').trim() || 'N/A',
        category,
        proyectoRequerido: Boolean(item.proyectoRequerido),
        note: String(item.note || '').trim() || undefined,
      };
    })
    .filter((item) => item.label)
    .sort((a, b) => a.id - b.id);

export const GS_ACTIVITIES: GSActivity[] = sanitizeActivities(
  readCatalog<GSActivity>(GS_ACTIVITIES_STORAGE_KEY, DEFAULT_GS_ACTIVITIES)
);

if (GS_ACTIVITIES.length === 0) {
  replaceCatalog(GS_ACTIVITIES, GS_ACTIVITIES_STORAGE_KEY, DEFAULT_GS_ACTIVITIES);
}

export const replaceGSActivities = (next: GSActivity[]) => {
  replaceCatalog(GS_ACTIVITIES, GS_ACTIVITIES_STORAGE_KEY, sanitizeActivities(next));
};

export const addGSActivity = (activity: GSActivity) => {
  replaceGSActivities([...GS_ACTIVITIES, activity]);
};

export const removeGSActivity = (id: number) => {
  if (id === GS_ACTIVITY_OTHER_ID) {
    return false;
  }
  const next = GS_ACTIVITIES.filter((activity) => activity.id !== id);
  if (next.length === GS_ACTIVITIES.length) {
    return false;
  }
  replaceGSActivities(next);
  return true;
};

export function getActivityById(id: number): GSActivity | undefined {
  return GS_ACTIVITIES.find((activity) => activity.id === id);
}

export function getActivitiesByCategory(category: string): GSActivity[] {
  return GS_ACTIVITIES.filter((activity) => activity.category === category);
}

export const CATEGORY_LABELS: Record<string, string> = {
  job: 'Job/Proyecto',
  travel: 'Motivo de Viaje',
  facility: 'Facility',
  employee: 'Employee',
  office: 'Office',
  vehicle: 'Vehicle',
};

