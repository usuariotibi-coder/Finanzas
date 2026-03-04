import type { CuentaContable } from '../types';
import { readCatalog, replaceCatalog } from '../utils/dropdownCatalog';

const CUENTAS_STORAGE_KEY = 'catalogs:cuentas-contables';

const DEFAULT_CUENTAS_CONTABLES: CuentaContable[] = [
  {
    codigo: '5450',
    nombre: 'Travel Expenses/Meals',
    descripcion: 'Gastos de viaje y alimentos relacionados a proyectos especificos',
    categoria: 'Viaticos',
    proyectoRequerido: true,
    keywords: [
      'hotel',
      'hospedaje',
      'lodging',
      'accommodation',
      'vuelo',
      'flight',
      'avion',
      'airline',
      'meal',
      'comida',
      'restaurant',
      'restaurante',
      'uber',
      'taxi',
      'transporte',
      'transportation',
      'rental',
      'renta',
      'gasoline',
      'gasolina',
      'pemex',
      'shell',
      'bp',
    ],
    activa: true,
  },
  {
    codigo: '6090',
    nombre: 'Office Supplies',
    descripcion: 'Papeleria y suministros de oficina',
    categoria: 'Administrativo',
    proyectoRequerido: false,
    keywords: [
      'office',
      'depot',
      'papeleria',
      'supplies',
      'staples',
      'pens',
      'paper',
      'printer',
      'toner',
      'cartridge',
      'folder',
      'binder',
      'notebook',
      'escritorio',
      'silla',
      'muebles',
    ],
    activa: true,
  },
  {
    codigo: '6200',
    nombre: 'Expense - Non Project',
    descripcion: 'Gastos no relacionados a proyectos especificos',
    categoria: 'General',
    proyectoRequerido: false,
    keywords: [],
    activa: true,
  },
];

const sanitizeCuentas = (items: CuentaContable[]) =>
  items
    .map((item) => ({
      codigo: String(item.codigo || '').trim(),
      nombre: String(item.nombre || '').trim(),
      descripcion: String(item.descripcion || '').trim(),
      categoria: String(item.categoria || '').trim() || 'General',
      proyectoRequerido: Boolean(item.proyectoRequerido),
      keywords: Array.isArray(item.keywords)
        ? item.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
        : [],
      activa: Boolean(item.activa),
    }))
    .filter((item) => item.codigo && item.nombre);

export const CUENTAS_CONTABLES: CuentaContable[] = sanitizeCuentas(
  readCatalog<CuentaContable>(CUENTAS_STORAGE_KEY, DEFAULT_CUENTAS_CONTABLES)
);

if (CUENTAS_CONTABLES.length === 0) {
  replaceCatalog(CUENTAS_CONTABLES, CUENTAS_STORAGE_KEY, DEFAULT_CUENTAS_CONTABLES);
}

export const replaceCuentasContables = (next: CuentaContable[]) => {
  replaceCatalog(CUENTAS_CONTABLES, CUENTAS_STORAGE_KEY, sanitizeCuentas(next));
};

export function getCuentasActivas(): CuentaContable[] {
  return CUENTAS_CONTABLES.filter((cuenta) => cuenta.activa);
}

export function getCuentaByCodigo(codigo: string): CuentaContable | undefined {
  return CUENTAS_CONTABLES.find((cuenta) => cuenta.codigo === codigo);
}

export function getCuentasByCategoria(categoria: string): CuentaContable[] {
  return CUENTAS_CONTABLES.filter((cuenta) => cuenta.categoria === categoria && cuenta.activa);
}

export function agregarCuenta(nuevaCuenta: CuentaContable): void {
  replaceCuentasContables([...CUENTAS_CONTABLES, nuevaCuenta]);
}

export function actualizarCuenta(codigo: string, datosActualizados: Partial<CuentaContable>): boolean {
  const index = CUENTAS_CONTABLES.findIndex((cuenta) => cuenta.codigo === codigo);
  if (index === -1) {
    return false;
  }
  const next = [...CUENTAS_CONTABLES];
  next[index] = { ...next[index], ...datosActualizados };
  replaceCuentasContables(next);
  return true;
}

export function desactivarCuenta(codigo: string): boolean {
  return actualizarCuenta(codigo, { activa: false });
}

