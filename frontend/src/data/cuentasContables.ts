import type { CuentaContable } from '../types';

/**
 * Catálogo de cuentas contables
 * Este catálogo es flexible y puede ser modificado/ampliado según las necesidades
 */
export const CUENTAS_CONTABLES: CuentaContable[] = [
  {
    codigo: '5450',
    nombre: 'Travel Expenses/Meals',
    descripcion: 'Gastos de viaje y alimentos relacionados a proyectos específicos',
    categoria: 'Viáticos',
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
      'bp'
    ],
    activa: true
  },
  {
    codigo: '6090',
    nombre: 'Office Supplies',
    descripcion: 'Papelería y suministros de oficina',
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
      'muebles'
    ],
    activa: true
  },
  {
    codigo: '6200',
    nombre: 'Expense - Non Project',
    descripcion: 'Gastos no relacionados a proyectos específicos',
    categoria: 'General',
    proyectoRequerido: false,
    keywords: [],
    activa: true
  }
];

/**
 * Obtener todas las cuentas activas
 */
export function getCuentasActivas(): CuentaContable[] {
  return CUENTAS_CONTABLES.filter(cuenta => cuenta.activa);
}

/**
 * Buscar cuenta por código
 */
export function getCuentaByCodigo(codigo: string): CuentaContable | undefined {
  return CUENTAS_CONTABLES.find(cuenta => cuenta.codigo === codigo);
}

/**
 * Obtener cuentas por categoría
 */
export function getCuentasByCategoria(categoria: string): CuentaContable[] {
  return CUENTAS_CONTABLES.filter(cuenta => cuenta.categoria === categoria && cuenta.activa);
}

/**
 * Agregar nueva cuenta contable
 * NOTA: En producción, esto debería conectarse al backend
 */
export function agregarCuenta(nuevaCuenta: CuentaContable): void {
  CUENTAS_CONTABLES.push(nuevaCuenta);
}

/**
 * Actualizar cuenta existente
 * NOTA: En producción, esto debería conectarse al backend
 */
export function actualizarCuenta(codigo: string, datosActualizados: Partial<CuentaContable>): boolean {
  const index = CUENTAS_CONTABLES.findIndex(cuenta => cuenta.codigo === codigo);
  if (index !== -1) {
    CUENTAS_CONTABLES[index] = { ...CUENTAS_CONTABLES[index], ...datosActualizados };
    return true;
  }
  return false;
}

/**
 * Desactivar cuenta (no se elimina, solo se marca como inactiva)
 */
export function desactivarCuenta(codigo: string): boolean {
  return actualizarCuenta(codigo, { activa: false });
}
