import type { Proyecto } from '../types';

export const toSafeMonto = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) {
      return fallback;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

export const sanitizeProyectoMontos = (proyecto: Proyecto): Proyecto => ({
  ...proyecto,
  presupuesto: toSafeMonto(proyecto.presupuesto),
  gastado: toSafeMonto(proyecto.gastado),
});

export const getProyectoUsoPorcentaje = (gastado: unknown, presupuesto: unknown): number => {
  const presupuestoNum = toSafeMonto(presupuesto);
  if (presupuestoNum <= 0) {
    return 0;
  }

  const porcentaje = (toSafeMonto(gastado) / presupuestoNum) * 100;
  if (!Number.isFinite(porcentaje)) {
    return 0;
  }

  return Math.max(0, porcentaje);
};

export const getProyectoPresupuestoDisponible = (gastado: unknown, presupuesto: unknown): number =>
  toSafeMonto(presupuesto) - toSafeMonto(gastado);
