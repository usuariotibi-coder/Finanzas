import { CUENTAS_CONTABLES, getCuentaByCodigo } from '../data/cuentasContables';
import type { CuentaContable } from '../types';

/**
 * Patrón aprendido para clasificación automática
 */
interface PatronClasificacion {
  comercio: string;
  categoria?: string;
  cuentaContable: string;
  confianza: number; // 0-1
  vecesUsado: number;
}

// Almacenamiento en memoria de patrones aprendidos
// NOTA: En producción, esto debería guardarse en el backend/localStorage
let patronesAprendidos: PatronClasificacion[] = [];

/**
 * Clasifica un gasto automáticamente basándose en keywords y patrones aprendidos
 */
export function clasificarGastoAuto(
  comercio: string,
  categoria: string,
  proyecto?: string
): { cuentaContable: string; confianza: number; esAutomatico: boolean } {

  // 1. Primero verificar si hay un patrón aprendido para este comercio
  const patronAprendido = buscarPatronAprendido(comercio);
  if (patronAprendido && patronAprendido.confianza > 0.7) {
    return {
      cuentaContable: patronAprendido.cuentaContable,
      confianza: patronAprendido.confianza,
      esAutomatico: true
    };
  }

  // 2. Clasificación basada en keywords
  const comercioLower = comercio.toLowerCase();
  const categoriaLower = categoria.toLowerCase();
  const textoCompleto = `${comercioLower} ${categoriaLower}`;

  for (const cuenta of CUENTAS_CONTABLES) {
    if (!cuenta.activa) continue;

    // Verificar si algún keyword coincide
    for (const keyword of cuenta.keywords) {
      if (textoCompleto.includes(keyword.toLowerCase())) {
        // Si la cuenta requiere proyecto y no lo tiene, saltar
        if (cuenta.proyectoRequerido && !proyecto) {
          continue;
        }

        return {
          cuentaContable: cuenta.codigo,
          confianza: 0.8,
          esAutomatico: true
        };
      }
    }
  }

  // 3. Default: cuenta 6200 (Expense - Non Project)
  return {
    cuentaContable: '6200',
    confianza: 0.3,
    esAutomatico: true
  };
}

/**
 * Guarda un patrón de clasificación para aprendizaje futuro
 */
export function aprenderPatron(
  comercio: string,
  categoria: string,
  cuentaContable: string
): void {
  const patronExistente = patronesAprendidos.find(
    p => p.comercio.toLowerCase() === comercio.toLowerCase() &&
         p.cuentaContable === cuentaContable
  );

  if (patronExistente) {
    // Incrementar uso y confianza
    patronExistente.vecesUsado++;
    patronExistente.confianza = Math.min(1, patronExistente.confianza + 0.1);
  } else {
    // Nuevo patrón
    patronesAprendidos.push({
      comercio: comercio.toLowerCase(),
      categoria: categoria.toLowerCase(),
      cuentaContable,
      confianza: 0.6,
      vecesUsado: 1
    });
  }

  // Guardar en localStorage (simulación de persistencia)
  try {
    localStorage.setItem('patronesClasificacion', JSON.stringify(patronesAprendidos));
  } catch (error) {
    console.error('Error al guardar patrones:', error);
  }
}

/**
 * Busca un patrón aprendido para el comercio
 */
function buscarPatronAprendido(comercio: string): PatronClasificacion | undefined {
  const comercioLower = comercio.toLowerCase();
  return patronesAprendidos.find(
    p => p.comercio === comercioLower
  );
}

/**
 * Carga patrones desde localStorage al iniciar
 */
export function cargarPatronesGuardados(): void {
  try {
    const patronesGuardados = localStorage.getItem('patronesClasificacion');
    if (patronesGuardados) {
      patronesAprendidos = JSON.parse(patronesGuardados);
    }
  } catch (error) {
    console.error('Error al cargar patrones:', error);
    patronesAprendidos = [];
  }
}

/**
 * Obtiene todos los patrones aprendidos
 */
export function getPatronesAprendidos(): PatronClasificacion[] {
  return [...patronesAprendidos];
}

/**
 * Elimina un patrón específico
 */
export function eliminarPatron(comercio: string, cuentaContable: string): boolean {
  const index = patronesAprendidos.findIndex(
    p => p.comercio.toLowerCase() === comercio.toLowerCase() &&
         p.cuentaContable === cuentaContable
  );

  if (index !== -1) {
    patronesAprendidos.splice(index, 1);

    // Actualizar localStorage
    try {
      localStorage.setItem('patronesClasificacion', JSON.stringify(patronesAprendidos));
    } catch (error) {
      console.error('Error al guardar patrones:', error);
    }

    return true;
  }

  return false;
}

/**
 * Limpiar todos los patrones aprendidos
 */
export function limpiarPatrones(): void {
  patronesAprendidos = [];
  try {
    localStorage.removeItem('patronesClasificacion');
  } catch (error) {
    console.error('Error al limpiar patrones:', error);
  }
}

/**
 * Obtiene sugerencia de cuenta con información detallada
 */
export function getSugerenciaCuenta(
  comercio: string,
  categoria: string,
  proyecto?: string
): {
  cuenta: CuentaContable | undefined;
  confianza: number;
  razon: string;
} {
  const clasificacion = clasificarGastoAuto(comercio, categoria, proyecto);
  const cuenta = getCuentaByCodigo(clasificacion.cuentaContable);

  let razon = '';
  if (clasificacion.confianza > 0.7) {
    razon = 'Basado en patrón aprendido anteriormente';
  } else if (clasificacion.confianza > 0.5) {
    razon = 'Basado en coincidencia de keywords';
  } else {
    razon = 'Clasificación por defecto';
  }

  return {
    cuenta,
    confianza: clasificacion.confianza,
    razon
  };
}

// Cargar patrones al importar el módulo
cargarPatronesGuardados();
