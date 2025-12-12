import type { TarjetaAMEX } from '../types';

/**
 * Tarjetas AMEX activas en el sistema
 * Este catálogo es dinámico y puede ser modificado según las necesidades
 */
export const TARJETAS_AMEX: TarjetaAMEX[] = [
  {
    id: 'card1',
    cardNumber: '1001',
    cardHolder: 'Francisco Aguilar',
    department: 'Dirección',
    activa: true
  },
  {
    id: 'card2',
    cardNumber: '1002',
    cardHolder: 'Luis Kuara',
    department: 'Guest Services',
    activa: true
  },
  {
    id: 'card3',
    cardNumber: '1003',
    cardHolder: 'María González',
    department: 'Finanzas',
    activa: true
  },
  {
    id: 'card4',
    cardNumber: '1004',
    cardHolder: 'Carlos Mendoza',
    department: 'Operaciones',
    activa: true
  },
  {
    id: 'card5',
    cardNumber: '1005',
    cardHolder: 'Ana Martínez',
    department: 'Comercial',
    activa: true
  },
  {
    id: 'card6',
    cardNumber: '1006',
    cardHolder: 'Roberto Sánchez',
    department: 'Tecnología',
    activa: true
  },
  {
    id: 'card7',
    cardNumber: '1007',
    cardHolder: 'Laura Jiménez',
    department: 'RH',
    activa: true
  },
  {
    id: 'card8',
    cardNumber: '1008',
    cardHolder: 'Pedro Ramírez',
    department: 'Logística',
    activa: true
  }
];

/**
 * Obtener tarjetas activas
 */
export function getTarjetasActivas(): TarjetaAMEX[] {
  return TARJETAS_AMEX.filter(t => t.activa);
}

/**
 * Buscar tarjeta por número
 */
export function getTarjetaByNumber(cardNumber: string): TarjetaAMEX | undefined {
  return TARJETAS_AMEX.find(t => t.cardNumber === cardNumber);
}

/**
 * Agregar nueva tarjeta
 */
export function agregarTarjeta(nuevaTarjeta: TarjetaAMEX): void {
  TARJETAS_AMEX.push(nuevaTarjeta);
}
