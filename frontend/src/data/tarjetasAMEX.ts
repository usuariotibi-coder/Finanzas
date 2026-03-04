import type { TarjetaAMEX } from '../types';
import { readCatalog, replaceCatalog } from '../utils/dropdownCatalog';

const TARJETAS_STORAGE_KEY = 'catalogs:tarjetas-amex';

const DEFAULT_TARJETAS_AMEX: TarjetaAMEX[] = [
  { id: 'card1', cardNumber: '1001', cardHolder: 'Francisco Aguilar', department: 'Direccion', activa: true },
  { id: 'card2', cardNumber: '1002', cardHolder: 'Luis Kuara', department: 'Guest Services', activa: true },
  { id: 'card3', cardNumber: '1003', cardHolder: 'Maria Gonzalez', department: 'Finanzas', activa: true },
  { id: 'card4', cardNumber: '1004', cardHolder: 'Carlos Mendoza', department: 'Operaciones', activa: true },
  { id: 'card5', cardNumber: '1005', cardHolder: 'Ana Martinez', department: 'Comercial', activa: true },
  { id: 'card6', cardNumber: '1006', cardHolder: 'Roberto Sanchez', department: 'Tecnologia', activa: true },
  { id: 'card7', cardNumber: '1007', cardHolder: 'Laura Jimenez', department: 'RH', activa: true },
  { id: 'card8', cardNumber: '1008', cardHolder: 'Pedro Ramirez', department: 'Logistica', activa: true },
];

const sanitizeTarjetas = (items: TarjetaAMEX[]) =>
  items
    .map((item) => ({
      id: String(item.id || '').trim(),
      cardNumber: String(item.cardNumber || '').trim(),
      cardHolder: String(item.cardHolder || '').trim(),
      department: String(item.department || '').trim(),
      activa: Boolean(item.activa),
    }))
    .filter((item) => item.id && item.cardNumber && item.cardHolder);

export const TARJETAS_AMEX: TarjetaAMEX[] = sanitizeTarjetas(
  readCatalog<TarjetaAMEX>(TARJETAS_STORAGE_KEY, DEFAULT_TARJETAS_AMEX)
);

if (TARJETAS_AMEX.length === 0) {
  replaceCatalog(TARJETAS_AMEX, TARJETAS_STORAGE_KEY, DEFAULT_TARJETAS_AMEX);
}

export const replaceTarjetasAmex = (next: TarjetaAMEX[]) => {
  replaceCatalog(TARJETAS_AMEX, TARJETAS_STORAGE_KEY, sanitizeTarjetas(next));
};

export function getTarjetasActivas(): TarjetaAMEX[] {
  return TARJETAS_AMEX.filter((tarjeta) => tarjeta.activa);
}

export function getTarjetaByNumber(cardNumber: string): TarjetaAMEX | undefined {
  return TARJETAS_AMEX.find((tarjeta) => tarjeta.cardNumber === cardNumber);
}

export function agregarTarjeta(nuevaTarjeta: TarjetaAMEX): void {
  replaceTarjetasAmex([...TARJETAS_AMEX, nuevaTarjeta]);
}

