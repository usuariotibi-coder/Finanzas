import * as XLSX from 'xlsx';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  data: any[];
}

/**
 * Exporta datos a un archivo Excel con múltiples hojas
 */
export function exportToExcel(sheets: ExcelSheet[], filename: string) {
  // Crear un nuevo workbook
  const workbook = XLSX.utils.book_new();

  sheets.forEach(sheet => {
    // Crear los headers
    const headers = sheet.columns.map(col => col.header);

    // Mapear los datos según las columnas definidas
    const rows = sheet.data.map(item =>
      sheet.columns.map(col => {
        const value = getNestedValue(item, col.key);
        return value !== undefined && value !== null ? value : '';
      })
    );

    // Combinar headers con datos
    const wsData = [headers, ...rows];

    // Crear worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);

    // Aplicar anchos de columna si están definidos
    const colWidths = sheet.columns.map(col => ({ wch: col.width || 15 }));
    worksheet['!cols'] = colWidths;

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  // Generar y descargar el archivo
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Obtiene un valor anidado de un objeto usando dot notation
 * Ej: 'usuario.nombre' => item.usuario.nombre
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Formatea un número como moneda mexicana
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea una fecha en formato DD/MM/YYYY
 */
export function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
