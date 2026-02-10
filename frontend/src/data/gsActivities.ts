export interface GSActivity {
  id: number;
  label: string;                   // Lo que ve el usuario
  account: string;                 // Cuenta contable
  code: string;                    // Código para contabilidad
  category: 'job' | 'travel' | 'facility' | 'employee' | 'office' | 'vehicle';
  proyectoRequerido: boolean;      // Si requiere proyecto obligatorio
  note?: string;                   // Notas especiales
}

export const GS_ACTIVITY_OTHER_ID = 9;

export const GS_ACTIVITIES: GSActivity[] = [
  {
    id: 1,
    label: "Support",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 2,
    label: "Commissioning",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 3,
    label: "Instalation",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 4,
    label: "Assembly Build",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 5,
    label: "Levantamiento",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 6,
    label: "Lunch",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 7,
    label: "Viaticos TE",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 8,
    label: "Visa",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: GS_ACTIVITY_OTHER_ID,
    label: "Otro",
    account: "5450",
    code: "N/A",
    category: "travel",
    proyectoRequerido: true
  }
];

// Funciones helper
export function getActivityById(id: number): GSActivity | undefined {
  return GS_ACTIVITIES.find(a => a.id === id);
}

export function getActivitiesByCategory(category: string): GSActivity[] {
  return GS_ACTIVITIES.filter(a => a.category === category);
}

export const CATEGORY_LABELS: Record<string, string> = {
  job: 'Job/Proyecto',
  travel: 'Motivo de Viaje',
  facility: 'Facility',
  employee: 'Employee',
  office: 'Office',
  vehicle: 'Vehicle'
};
