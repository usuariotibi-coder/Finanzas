export interface GSActivity {
  id: number;
  label: string;                   // Lo que ve el usuario
  account: string;                 // Cuenta contable
  code: string;                    // Código para contabilidad
  category: 'job' | 'travel' | 'facility' | 'employee' | 'office' | 'vehicle';
  proyectoRequerido: boolean;      // Si requiere proyecto obligatorio
  note?: string;                   // Notas especiales
}

export const GS_ACTIVITIES: GSActivity[] = [
  {
    id: 1,
    label: "Travel Support Expenses",
    account: "5450",
    code: "O-TRAVEL",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 2,
    label: "Meal With Customer - Traveling",
    account: "5450",
    code: "-MBE",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 3,
    label: "Meal With Customer - Local (At JA)",
    account: "5450",
    code: "O-MBE",
    category: "travel",
    proyectoRequerido: true
  },
  {
    id: 4,
    label: "Shipping Job Supplies",
    account: "5500",
    code: "O-FRT",
    category: "job",
    proyectoRequerido: true
  },
  {
    id: 5,
    label: "Breakroom Supplies (For a Job)",
    account: "5460",
    code: "O-MBE",
    category: "job",
    proyectoRequerido: true
  },
  {
    id: 6,
    label: "Job Supplies (General)",
    account: "5000",
    code: "M. RAW",
    category: "job",
    proyectoRequerido: true
  },
  {
    id: 7,
    label: "Breakroom Supplies (General/Everyone)",
    account: "5300",
    code: "N/A",
    category: "facility",
    proyectoRequerido: false
  },
  {
    id: 8,
    label: "Shop Supplies",
    account: "5300",
    code: "N/A",
    category: "facility",
    proyectoRequerido: false
  },
  {
    id: 9,
    label: "Cleaning Supplies",
    account: "5300",
    code: "N/A",
    category: "facility",
    proyectoRequerido: false
  },
  {
    id: 10,
    label: "Gas for Facilities Lift/Truck",
    account: "5300",
    code: "N/A",
    category: "facility",
    proyectoRequerido: false
  },
  {
    id: 11,
    label: "Employee Event",
    account: "6150",
    code: "N/A",
    category: "employee",
    proyectoRequerido: false
  },
  {
    id: 12,
    label: "Employee Meal (Any form)",
    account: "6150",
    code: "N/A",
    category: "employee",
    proyectoRequerido: false
  },
  {
    id: 13,
    label: "Estimating Travel",
    account: "6200",
    code: "N/A",
    category: "travel",
    proyectoRequerido: false
  },
  {
    id: 14,
    label: "Recharge Tag (Celso)",
    account: "6200",
    code: "N/A",
    category: "vehicle",
    proyectoRequerido: false
  },
  {
    id: 15,
    label: "Uber for Students",
    account: "6200",
    code: "N/A",
    category: "employee",
    proyectoRequerido: false
  },
  {
    id: 16,
    label: "Meal (Not for a Job)",
    account: "6250",
    code: "N/A",
    category: "employee",
    proyectoRequerido: false
  },
  {
    id: 17,
    label: "Meal w/ Potential Customer (Non-Job)",
    account: "6250",
    code: "MEALS&ENT-NON JOB",
    category: "employee",
    proyectoRequerido: false
  },
  {
    id: 18,
    label: "Water Jugs",
    account: "6090",
    code: "N/A",
    category: "office",
    proyectoRequerido: false
  },
  {
    id: 19,
    label: "Office Supplies",
    account: "6090",
    code: "N/A",
    category: "office",
    proyectoRequerido: false
  },
  {
    id: 20,
    label: "Carwash Supplies",
    account: "6040",
    code: "N/A",
    category: "vehicle",
    proyectoRequerido: false
  },
  {
    id: 21,
    label: "Vehicle Maintenance",
    account: "6040",
    code: "N/A",
    category: "vehicle",
    proyectoRequerido: false
  },
  {
    id: 22,
    label: "MFG Maintenance",
    account: "5755",
    code: "N/A",
    category: "facility",
    proyectoRequerido: false
  },
  {
    id: 23,
    label: "SSL Renewal / Web Services",
    account: "1480",
    code: "N/A",
    category: "office",
    proyectoRequerido: false
  },
  {
    id: 24,
    label: "Facility Maintenance",
    account: "5750",
    code: "N/A",
    category: "facility",
    proyectoRequerido: false,
    note: "Apply 90/10 rule with 6750"
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
  travel: 'Travel',
  facility: 'Facility',
  employee: 'Employee',
  office: 'Office',
  vehicle: 'Vehicle'
};
