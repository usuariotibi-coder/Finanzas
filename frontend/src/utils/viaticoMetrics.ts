import type { Viatico } from '../types';

const APPROVED_STATUSES = new Set<Viatico['status']>([
  'aprobado',
  'dispersado',
  'en_viaje',
  'viaje_finalizado',
  'en_recuperacion',
  'completado',
]);

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

export const isViaticoApprovedForGastoKpi = (viatico: Viatico): boolean => {
  if (APPROVED_STATUSES.has(viatico.status)) {
    return true;
  }
  const montoAprobado = toFiniteNumber(viatico.montoAprobado);
  if (montoAprobado !== undefined && montoAprobado > 0) {
    return true;
  }
  const montoDispersado = toFiniteNumber(viatico.montoDispersado);
  return montoDispersado !== undefined && montoDispersado > 0;
};

export const getViaticoGastadoKpi = (viatico: Viatico): number => {
  const montoGastado = toFiniteNumber(viatico.montoGastado);
  if (montoGastado !== undefined && montoGastado > 0) {
    return montoGastado;
  }

  if (!isViaticoApprovedForGastoKpi(viatico)) {
    return 0;
  }

  const montoAprobado = toFiniteNumber(viatico.montoAprobado);
  if (montoAprobado !== undefined && montoAprobado > 0) {
    return montoAprobado;
  }

  const montoSolicitado = toFiniteNumber(viatico.montoSolicitado);
  return montoSolicitado !== undefined && montoSolicitado > 0 ? montoSolicitado : 0;
};
