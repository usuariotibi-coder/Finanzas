import type { TarjetaAMEX } from '../types';
import { readCatalog, replaceCatalog } from '../utils/dropdownCatalog';

const TARJETAS_STORAGE_KEY = 'catalogs:tarjetas-amex';

const DEFAULT_TARJETAS_AMEX: TarjetaAMEX[] = [
  { id: 'card1', cardNumber: '1001', cardHolder: 'Francisco Aguilar', department: 'Direccion', activa: true, comodin: false },
  { id: 'card2', cardNumber: '1002', cardHolder: 'Luis Kuara', department: 'Guest Services', activa: true, comodin: false },
  { id: 'card3', cardNumber: '1003', cardHolder: 'Maria Gonzalez', department: 'Finanzas', activa: true, comodin: false },
  { id: 'card4', cardNumber: '1004', cardHolder: 'Carlos Mendoza', department: 'Operaciones', activa: true, comodin: false },
  { id: 'card5', cardNumber: '1005', cardHolder: 'Ana Martinez', department: 'Comercial', activa: true, comodin: false },
  { id: 'card6', cardNumber: '1006', cardHolder: 'Roberto Sanchez', department: 'Tecnologia', activa: true, comodin: false },
  { id: 'card7', cardNumber: '1007', cardHolder: 'Laura Jimenez', department: 'RH', activa: true, comodin: false },
  { id: 'card8', cardNumber: '1008', cardHolder: 'Pedro Ramirez', department: 'Logistica', activa: true, comodin: false },
];

const sanitizeTarjetas = (items: TarjetaAMEX[]) =>
  items
    .map((item) => ({
      id: String(item.id || '').trim(),
      cardNumber: String(item.cardNumber || '').trim(),
      cardHolder: String(item.cardHolder || '').trim(),
      userId: item.userId ? String(item.userId).trim() : undefined,
      userName: item.userName ? String(item.userName).trim() : undefined,
      employeeNumber: item.employeeNumber ? String(item.employeeNumber).trim() : '',
      accountNumber: item.accountNumber ? String(item.accountNumber).trim() : '',
      expirationDate: item.expirationDate ? String(item.expirationDate).trim() : '',
      comodin: Boolean(item.comodin),
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

