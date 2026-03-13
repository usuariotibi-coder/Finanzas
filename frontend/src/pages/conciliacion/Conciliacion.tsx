import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { read, utils as XLSXUtils, writeFile } from 'xlsx-js-style';
import useEscapeKey from '../../hooks/useEscapeKey';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Factura, AlertaConciliacion, Consumo, TarjetaAMEX, TicketAMEX, FacturaStatus } from '../../types';
import {
  createConsumo,
  createFactura,
  deleteFactura,
  fetchAlertasConciliacion,
  fetchAmexTickets,
  fetchAmexTarjetas,
  fetchConsumos,
  fetchFacturas,
  fetchViaticos,
  syncCoreAppData,
  updateAmexTicket,
  updateConsumo,
  updateFactura,
} from '../../utils/backendSync';
import { api, API_ROOT, toApiAssetUrl } from '../../utils/api';
import { formatProyectoLabel } from '../../utils/proyectoLabel';

const buildFacturaAssetUrl = (tipo: 'PDF' | 'XML', archivoPath?: string | null) => {
  const raw = String(archivoPath || '').trim();
  if (!raw) {
    return '';
  }

  const folder = tipo === 'PDF' ? 'pdf' : 'xml';
  const apiOrigin = API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '');
  const candidate = raw.includes('/') || /^https?:\/\//i.test(raw)
    ? raw
    : `/media/conciliacion/${folder}/${raw.replace(/^\/+/, '')}`;
  const fallbackFileUrl = toApiAssetUrl(candidate);
  if (!fallbackFileUrl) {
    return '';
  }

  try {
    const parsedRaw = /^https?:\/\//i.test(raw) ? new URL(raw) : null;
    const normalizedCandidate = parsedRaw
      ? `${parsedRaw.pathname}${parsedRaw.search}${parsedRaw.hash}`
      : candidate;
    const fileUrl = toApiAssetUrl(normalizedCandidate);
    if (!fileUrl) {
      return '';
    }

    const parsed = new URL(fileUrl, apiOrigin);
    parsed.protocol = new URL(apiOrigin).protocol;
    parsed.host = new URL(apiOrigin).host;
    const isHttpsPage = window.location.protocol === 'https:';
    const isHttpAsset = parsed.protocol === 'http:';
    const isLocalAsset = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isHttpsPage && isHttpAsset && !isLocalAsset) {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return encodeURI(fallbackFileUrl);
  }
};

const openFacturaAsset = (tipo: 'PDF' | 'XML', archivoPath?: string | null) => {
  const fileUrl = buildFacturaAssetUrl(tipo, archivoPath);
  if (!fileUrl) {
    window.alert(`No se encontro el archivo ${tipo}.`);
    return;
  }
  const link = document.createElement('a');
  link.href = fileUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadFacturaAsset = (tipo: 'PDF' | 'XML', archivoPath?: string | null, fallbackName?: string) => {
  const fileUrl = buildFacturaAssetUrl(tipo, archivoPath);
  if (!fileUrl) {
    window.alert(`No se encontro el archivo ${tipo}.`);
    return;
  }
  const link = document.createElement('a');
  link.href = fileUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (fallbackName) {
    link.download = fallbackName;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

type StatementRow = {
  cardNumber: string;
  employeeNumber: string;
  employeeName: string;
  fecha: string;
  comercio: string;
  paisComercio: string;
  tipoMovimiento: string;
  monto: number;
  montoUsd: number;
  concepto: string;
};

type FacturaMatchResult = {
  factura: Factura;
  propinaDetectada: number;
  propinaPorcentaje: number;
  matchType: 'exacto' | 'propina' | 'comercio';
  dateDistance: number;
  merchantScore: number;
  pdfDateScore: number;
};

type ReportUserRecord = {
  id: string;
  fullName: string;
  department: string;
};

const AMOUNT_MATCH_EPSILON = 0.01;
const MAX_TIP_PERCENTAGE = 0.2;
const TIP_MATCH_MIN_MERCHANT_SCORE = 0.3;
const WEAK_MERCHANT_TIP_MAX_RATIO = 0.15;
const WEAK_MERCHANT_TIP_MAX_DATE_DISTANCE = 21;
const MERCHANT_FALLBACK_MIN_SCORE = 0.75;
const MERCHANT_FALLBACK_MAX_DATE_DISTANCE = 10;
const MERCHANT_FALLBACK_MAX_AMOUNT_RATIO = 0.2;
const MERCHANT_STOPWORDS = new Set([
  'sa',
  'cv',
  'de',
  'del',
  'la',
  'las',
  'los',
  'el',
  'y',
  'the',
  'group',
  'grupo',
  'servicios',
  'servicio',
  'mexico',
  'restaurant',
  'restaurante',
  'comercializadora',
  'comercio',
  'company',
  'corp',
  'corporation',
  'holdings',
]);

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizeExcelHeader = (value: unknown) =>
  normalizeText(String(value || '')).replace(/[^a-z0-9]/g, '');

const normalizeCardNumber = (value: unknown) => String(value || '').replace(/\D/g, '');

const normalizeEmployeeNumber = (value: unknown) => String(value || '').replace(/\D/g, '');

const normalizeMerchant = (value: unknown) => normalizeText(String(value || ''));

const parseMoney = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '')
    .replace(/[^\d.-]/g, '')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = raw.includes(' ') ? raw.split(' ')[0] : raw;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const diffDays = (left: string, right: string) => {
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000));
};

const roundMoney = (value: number) => Number(value.toFixed(2));

const toArrayRecords = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value as Record<string, unknown>[];
  }
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    if (Array.isArray(payload.results)) {
      return payload.results as Record<string, unknown>[];
    }
  }
  return [];
};

const parseReportUsers = (value: unknown): ReportUserRecord[] =>
  toArrayRecords(value).map((item) => ({
    id: String(item.id ?? '').trim(),
    fullName: String(item.full_name ?? '').trim(),
    department: String(item.department ?? '').trim(),
  })).filter((item) => item.id);

const buildConsumptionSheetLabel = (selectedMes: string, monthLabels: Record<string, string>) => {
  if (selectedMes === 'todos') {
    return 'CONSUMPTION REPORT';
  }
  const monthLabel = monthLabels[selectedMes] || selectedMes;
  return `CONSUMPTION ${monthLabel.toUpperCase()}`;
};

const sanitizeFilenamePart = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const buildReportFilename = (sheetLabel: string) => {
  const baseName = sanitizeFilenamePart(sheetLabel) || 'CONSUMPTION_REPORT';
  return baseName;
};

const classifyViaticoForReport = (destinoPais?: string) => {
  const normalized = normalizeText(destinoPais || '');
  if (!normalized) {
    return '';
  }
  if (normalized === 'usa' || normalized === 'otro') {
    return 'INTERNACIONAL';
  }
  return 'NACIONAL';
};

const buildReportDateValue = (value: string) => {
  if (!value) {
    return '';
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed;
};

const REPORT_BORDER = {
  top: { style: 'thin', color: { rgb: 'FFD0D7E2' } },
  right: { style: 'thin', color: { rgb: 'FFD0D7E2' } },
  bottom: { style: 'thin', color: { rgb: 'FFD0D7E2' } },
  left: { style: 'thin', color: { rgb: 'FFD0D7E2' } },
};

const REPORT_HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF1F4E78' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: REPORT_BORDER,
};

const REPORT_TEXT_STYLE = {
  font: { color: { rgb: 'FF0F172A' }, sz: 10 },
  alignment: { vertical: 'center', wrapText: true },
  border: REPORT_BORDER,
};

const REPORT_CENTER_STYLE = {
  ...REPORT_TEXT_STYLE,
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const REPORT_DATE_STYLE = {
  ...REPORT_CENTER_STYLE,
  numFmt: 'mm-dd-yy',
};

const REPORT_AMOUNT_STYLE = {
  ...REPORT_TEXT_STYLE,
  numFmt: '$#,##0.00',
};

const REPORT_ZERO_STYLE = {
  ...REPORT_CENTER_STYLE,
  numFmt: '0.00',
};

const getMerchantComparableText = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getMerchantComparableCompact = (value: string) =>
  getMerchantComparableText(value).replace(/\s+/g, '');

const getMerchantTokens = (value: string) =>
  getMerchantComparableText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !MERCHANT_STOPWORDS.has(token));

const getMerchantSimilarity = (left: string, right: string) => {
  const leftText = getMerchantComparableText(left);
  const rightText = getMerchantComparableText(right);
  if (!leftText || !rightText) {
    return 0;
  }

  const leftCompact = getMerchantComparableCompact(leftText);
  const rightCompact = getMerchantComparableCompact(rightText);
  if (!leftCompact || !rightCompact) {
    return 0;
  }
  if (leftCompact === rightCompact) {
    return 1;
  }
  if (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)) {
    return 0.92;
  }

  const leftTokens = Array.from(new Set(getMerchantTokens(leftText)));
  const rightTokens = Array.from(new Set(getMerchantTokens(rightText)));
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const sharedCount = leftTokens.filter((token) => rightTokens.includes(token)).length;
  let effectiveSharedCount = sharedCount;
  if (effectiveSharedCount === 0) {
    const usedRight = new Set<string>();
    for (const leftToken of leftTokens) {
      for (const rightToken of rightTokens) {
        if (usedRight.has(rightToken)) {
          continue;
        }
        if (leftToken.length < 4 || rightToken.length < 4) {
          continue;
        }
        if (leftToken.startsWith(rightToken) || rightToken.startsWith(leftToken)) {
          effectiveSharedCount += 1;
          usedRight.add(rightToken);
          break;
        }
      }
    }
  }
  if (effectiveSharedCount === 0) {
    return 0;
  }

  const overlap = effectiveSharedCount / Math.min(leftTokens.length, rightTokens.length);
  const coverage = effectiveSharedCount / Math.max(leftTokens.length, rightTokens.length);
  return Number(((overlap * 0.7) + (coverage * 0.3)).toFixed(4));
};

const getFacturaMerchantTexts = (factura: Factura) => {
  const values = [
    factura.razonSocial,
    ...factura.conceptos.map((concepto) => concepto.descripcion),
  ];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
};

const getFacturaPdfMerchantTexts = (factura: Factura) => {
  const values = [
    factura.validacionCFDI?.pdfDetectedRazonSocial || '',
    factura.validacionCFDI?.pdfPreviewText || '',
  ];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
};

const getFacturaXmlTotalCandidates = (factura: Factura) => {
  const candidates: Array<{ source: string; candidateTotal: number }> = [];
  const addCandidate = (source: string, candidateTotal?: number) => {
    if (!Number.isFinite(candidateTotal) || !candidateTotal || candidateTotal <= 0) {
      return;
    }
    const normalized = roundMoney(candidateTotal);
    if (candidates.some((candidate) => Math.abs(candidate.candidateTotal - normalized) <= AMOUNT_MATCH_EPSILON)) {
      return;
    }
    candidates.push({ source, candidateTotal: normalized });
  };

  addCandidate('xml_total', factura.total);
  addCandidate('xml_subtotal_iva', factura.subtotal + factura.iva);

  if (factura.conceptos.length > 0) {
    const conceptosImporte = factura.conceptos.reduce((sum, concepto) => sum + Number(concepto.importe || 0), 0);
    const conceptosUnitario = factura.conceptos.reduce(
      (sum, concepto) => sum + (Number(concepto.valorUnitario || 0) * Number(concepto.cantidad || 0)),
      0,
    );
    const conceptosImpuesto = factura.conceptos.reduce((sum, concepto) => sum + Number(concepto.impuestoImporte || 0), 0);
    addCandidate('xml_conceptos_importe', conceptosImporte);
    addCandidate('xml_conceptos_importe_impuesto', conceptosImporte + conceptosImpuesto);
    addCandidate('xml_valor_unitario_impuesto', conceptosUnitario + conceptosImpuesto);
    addCandidate('xml_conceptos_importe_iva', conceptosImporte + factura.iva);
    addCandidate('xml_valor_unitario_iva', conceptosUnitario + factura.iva);
  }

  return candidates;
};

const getFacturaPdfTotalCandidate = (factura: Factura) => {
  const pdfTotal = Number(factura.validacionCFDI?.pdfDetectedTotal);
  return Number.isFinite(pdfTotal) && pdfTotal > 0 ? pdfTotal : undefined;
};

const getBestMerchantScore = (rowTexts: string[], facturaTexts: string[]) => {
  let bestScore = 0;

  for (const rowText of rowTexts) {
    for (const facturaText of facturaTexts) {
      bestScore = Math.max(bestScore, getMerchantSimilarity(rowText, facturaText));
      if (bestScore >= 0.999) {
        return bestScore;
      }
    }
  }

  return bestScore;
};

const getFacturaMerchantScore = (factura: Factura, row: StatementRow) => {
  const rowTexts = [row.comercio, `${row.comercio} ${row.concepto}`.trim()].filter(Boolean);
  const xmlScore = getBestMerchantScore(rowTexts, getFacturaMerchantTexts(factura));
  if (xmlScore >= 0.35) {
    return xmlScore;
  }
  const pdfScore = getBestMerchantScore(rowTexts, getFacturaPdfMerchantTexts(factura));
  return Math.max(xmlScore, pdfScore);
};

const getFacturaPdfDateScore = (factura: Factura, fechaEstadoCuenta: string) => {
  const dateHints = Array.isArray(factura.validacionCFDI?.pdfDateHints)
    ? factura.validacionCFDI?.pdfDateHints ?? []
    : [];
  if (!fechaEstadoCuenta || dateHints.length === 0) {
    return 0;
  }

  if (dateHints.includes(fechaEstadoCuenta)) {
    return 1;
  }

  const bestDistance = Math.min(...dateHints.map((hint) => diffDays(hint, fechaEstadoCuenta)));
  if (!Number.isFinite(bestDistance)) {
    return 0;
  }
  if (bestDistance <= 1) {
    return 0.85;
  }
  if (bestDistance <= 3) {
    return 0.65;
  }
  return 0;
};

const getFacturaMatchTuple = (match: FacturaMatchResult) => [
  match.matchType === 'exacto' ? 0 : match.matchType === 'propina' ? 1 : 2,
  100 - Math.round(match.pdfDateScore * 100),
  100 - Math.round(match.merchantScore * 100),
  match.dateDistance,
  Number(match.propinaPorcentaje.toFixed(2)),
  Number(match.propinaDetectada.toFixed(2)),
] as const;

const hasTipMatchContext = (
  merchantScore: number,
  pdfDateScore: number,
  tipRatio: number,
  dateDistance: number,
) => (
  merchantScore >= TIP_MATCH_MIN_MERCHANT_SCORE
  || (merchantScore >= 0.2 && pdfDateScore >= 0.85)
  || (tipRatio <= WEAK_MERCHANT_TIP_MAX_RATIO && dateDistance <= WEAK_MERCHANT_TIP_MAX_DATE_DISTANCE)
);

const getFacturaMatchCandidate = (
  factura: Factura,
  row: StatementRow
): FacturaMatchResult | null => {
  const dateDistance = diffDays(factura.fecha, row.fecha);
  const merchantScore = getFacturaMerchantScore(factura, row);
  const pdfDateScore = getFacturaPdfDateScore(factura, row.fecha);
  const xmlAmountSources = getFacturaXmlTotalCandidates(factura);
  const amountCandidates: Array<{
    source: string;
    candidateTotal: number;
    difference: number;
    matchType: 'exacto' | 'propina';
    tipRatio: number;
  }> = [];

  const buildAmountCandidate = (source: string, candidateTotal: number) => {
    const difference = roundMoney(row.monto - candidateTotal);
    if (Math.abs(difference) <= AMOUNT_MATCH_EPSILON) {
      return {
        source,
        candidateTotal,
        difference: 0,
        matchType: 'exacto' as const,
        tipRatio: 0,
      };
    }
    if (difference < 0 || candidateTotal <= 0) {
      return null;
    }
    const tipRatio = difference / candidateTotal;
    if (tipRatio > MAX_TIP_PERCENTAGE + 1e-6) {
      return null;
    }
    return {
      source,
      candidateTotal,
      difference,
      matchType: 'propina' as const,
      tipRatio,
    };
  };

  for (const xmlSource of xmlAmountSources) {
    const xmlCandidate = buildAmountCandidate(xmlSource.source, xmlSource.candidateTotal);
    if (xmlCandidate) {
      amountCandidates.push(xmlCandidate);
    }
  }

  if (amountCandidates.length === 0) {
    const pdfTotal = getFacturaPdfTotalCandidate(factura);
    if (typeof pdfTotal === 'number' && !xmlAmountSources.some((source) => Math.abs(source.candidateTotal - pdfTotal) <= AMOUNT_MATCH_EPSILON)) {
      const pdfCandidate = buildAmountCandidate('pdf_total', pdfTotal);
      if (pdfCandidate) {
        amountCandidates.push(pdfCandidate);
      }
    }
  }

  if (amountCandidates.length === 0) {
    const pdfTotal = getFacturaPdfTotalCandidate(factura);
    const fallbackTotal = typeof pdfTotal === 'number'
      ? pdfTotal
      : (xmlAmountSources[0]?.candidateTotal ?? factura.total);
    const fallbackDifference = Math.abs(roundMoney(row.monto - fallbackTotal));
    const fallbackRatio = fallbackTotal > 0 ? (fallbackDifference / fallbackTotal) : Number.POSITIVE_INFINITY;
    const fallbackDateOk = pdfDateScore >= 0.65 || dateDistance <= MERCHANT_FALLBACK_MAX_DATE_DISTANCE;
    if (
      merchantScore >= MERCHANT_FALLBACK_MIN_SCORE
      && fallbackDateOk
      && fallbackRatio <= MERCHANT_FALLBACK_MAX_AMOUNT_RATIO
    ) {
      return {
        factura,
        propinaDetectada: 0,
        propinaPorcentaje: 0,
        matchType: 'comercio',
        dateDistance,
        merchantScore,
        pdfDateScore,
      };
    }
    return null;
  }

  const contextualAmountCandidates = amountCandidates.filter((candidate) => (
    candidate.matchType === 'exacto' || hasTipMatchContext(merchantScore, pdfDateScore, candidate.tipRatio, dateDistance)
  ));
  if (contextualAmountCandidates.length === 0) {
    return null;
  }

  const bestAmountCandidate = contextualAmountCandidates.sort((left, right) => {
    if (left.matchType !== right.matchType) {
      return left.matchType === 'exacto' ? -1 : 1;
    }
    return left.difference - right.difference;
  })[0];
  return {
    factura,
    propinaDetectada: bestAmountCandidate.difference,
    propinaPorcentaje: Number((bestAmountCandidate.tipRatio * 100).toFixed(2)),
    matchType: bestAmountCandidate.matchType,
    dateDistance,
    merchantScore,
    pdfDateScore,
  };
};

const compareFacturaMatches = (left: FacturaMatchResult, right: FacturaMatchResult) => {
  const leftTuple = getFacturaMatchTuple(left);
  const rightTuple = getFacturaMatchTuple(right);
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) {
      return leftTuple[index] - rightTuple[index];
    }
  }
  return 0;
};

const readStatementRows = async (file: File): Promise<StatementRow[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    throw new Error('El archivo no contiene hojas para importar.');
  }

  const matrix = XLSXUtils.sheet_to_json<(string | number | null)[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  const headerRowIndex = matrix.findIndex((row) => row.some((cell) => normalizeExcelHeader(cell) === 'tarjeta'));
  if (headerRowIndex < 0) {
    throw new Error('No se encontro la fila de encabezados del estado de cuenta.');
  }

  const headers = matrix[headerRowIndex].map((cell) => normalizeExcelHeader(cell));
  const headerIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const rowValue = (row: (string | number | null)[], names: string[]) => {
    const index = headerIndex(names);
    return index >= 0 ? row[index] : '';
  };

  return matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row) => ({
      cardNumber: normalizeCardNumber(rowValue(row, ['tarjeta'])),
      employeeNumber: normalizeEmployeeNumber(rowValue(row, ['numempleado', 'numdeempleado', 'nudempleado'])),
      employeeName: String(rowValue(row, ['empleado'])).trim(),
      fecha: toIsoDate(rowValue(row, ['fechayhora', 'fecha'])),
      comercio: String(rowValue(row, ['comercio'])).trim(),
      paisComercio: String(rowValue(row, ['paiscomercio'])).trim(),
      tipoMovimiento: String(rowValue(row, ['tipodemovimiento'])).trim(),
      monto: parseMoney(rowValue(row, ['importemxn'])),
      montoUsd: parseMoney(rowValue(row, ['importeorigenusd'])),
      concepto: String(rowValue(row, ['concepto'])).trim(),
    }))
    .filter((row) => row.cardNumber && row.employeeNumber && row.fecha && row.comercio && row.monto > 0);
};

export default function Conciliacion() {
  const { user } = useAuth();
  const restrictToCurrentUser = user?.role === 'staff';
  const currentUserId = user ? String(user.id) : '';
  const statementInputRef = useRef<HTMLInputElement | null>(null);
  const [facturas, setFacturas] = useLocalStorageState<Factura[]>('conciliacion:facturas', []);
  const [consumos, setConsumos] = useLocalStorageState<Consumo[]>('conciliacion:consumos', []);
  const [ticketsAMEX, setTicketsAMEX] = useLocalStorageState<TicketAMEX[]>('conciliacion:amex', []);
  const [selectedFacturaId, setSelectedFacturaId] = useLocalStorageState<string | null>('conciliacion:selectedFacturaId', null);
  const [selectedAlertaIndex, setSelectedAlertaIndex] = useLocalStorageState<number | null>('conciliacion:selectedAlertaIndex', null);
  const [selectedMatchConsumoId, setSelectedMatchConsumoId] = useState<string | null>(null);
  const [showDetalleModal, setShowDetalleModal] = useLocalStorageState('conciliacion:showDetalleModal', false);
  const [showAlertaModal, setShowAlertaModal] = useLocalStorageState('conciliacion:showAlertaModal', false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useLocalStorageState('conciliacion:showUploadModal', false);
  const [uploadTarget, setUploadTarget] = useLocalStorageState<{ type: 'consumo' | 'amex'; id: string } | null>(
    'conciliacion:uploadTarget',
    null
  );
  const [uploadPdfFile, setUploadPdfFile] = useState<File | null>(null);
  const [uploadXmlFile, setUploadXmlFile] = useState<File | null>(null);
  const [uploadNotas, setUploadNotas] = useState('');
  const [uploadSaving, setUploadSaving] = useState(false);
  const [showUploadErrors, setShowUploadErrors] = useState(false);
  const [statementImporting, setStatementImporting] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reprocessingConciliacion, setReprocessingConciliacion] = useState(false);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [statementImportMessage, setStatementImportMessage] = useState('');
  const [statementImportError, setStatementImportError] = useState('');
  const [selectedMes, setSelectedMes] = useLocalStorageState('conciliacion:selectedMes', 'todos');
  const [selectedUsuario, setSelectedUsuario] = useLocalStorageState('conciliacion:selectedUsuario', 'todos');
  const [vistaActiva, setVistaActiva] = useLocalStorageState<'facturas' | 'consumos' | 'amex'>('conciliacion:vistaActiva', 'facturas');
  const [alertas, setAlertas] = useLocalStorageState<AlertaConciliacion[]>('conciliacion:alertas', []);
  const [detalleReadOnly, setDetalleReadOnly] = useState(false);
  const facturasById = useMemo(
    () => new Map(facturas.map((factura) => [String(factura.id), factura])),
    [facturas]
  );

  const monthLabels = {
    '01': 'Enero',
    '02': 'Febrero',
    '03': 'Marzo',
    '04': 'Abril',
    '05': 'Mayo',
    '06': 'Junio',
    '07': 'Julio',
    '08': 'Agosto',
    '09': 'Septiembre',
    '10': 'Octubre',
    '11': 'Noviembre',
    '12': 'Diciembre',
  };
  const getMesKey = (value: string) => {
    if (!value) {
      return '';
    }
    const parts = value.split('-');
    return parts.length >= 2 ? parts[1] : '';
  };
  const effectiveSelectedUsuario = restrictToCurrentUser && currentUserId ? currentUserId : selectedUsuario;
  const filtraPorMes = (fecha: string) => selectedMes === 'todos' || getMesKey(fecha) === selectedMes;
  const filtraPorUsuario = (userId?: string | null) =>
    effectiveSelectedUsuario === 'todos' || String(userId || '') === effectiveSelectedUsuario;
  const hasConsumoMatchConfirmado = (consumo: Consumo, facturaRelacionada?: Factura) => (
    Boolean(consumo.facturaId && facturaRelacionada && (consumo.matched || facturaRelacionada.matchConsumo))
  );
  const hasAmexMatchConfirmado = (ticket: TicketAMEX, facturaRelacionada?: Factura) => (
    Boolean(ticket.facturaId && facturaRelacionada && (ticket.matched || facturaRelacionada.matchConsumo))
  );
  const mesesDisponibles = Array.from(
    new Set(
      [...facturas, ...consumos, ...ticketsAMEX]
        .map((item) => getMesKey(item.fecha))
        .filter(Boolean)
    )
  ).sort();
  const usuariosDisponibles = useMemo(() => {
    const users = new Map<string, string>();
    facturas.forEach((factura) => {
      const id = String(factura.userId || '').trim();
      if (!id) {
        return;
      }
      const label = String(factura.userName || factura.userId || id).trim() || id;
      if (!users.has(id) || users.get(id) === id) {
        users.set(id, label);
      }
    });
    consumos.forEach((consumo) => {
      const id = String(consumo.userId || '').trim();
      if (!id || users.has(id)) {
        return;
      }
      const label = String(consumo.userName || consumo.userId || id).trim() || id;
      users.set(id, label);
    });
    ticketsAMEX.forEach((ticket) => {
      const id = String(ticket.userId || '').trim();
      if (!id || users.has(id)) {
        return;
      }
      const label = String(ticket.userName || ticket.userId || id).trim() || id;
      users.set(id, label);
    });

    return Array.from(users.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [facturas, consumos, ticketsAMEX]);

  const facturasFiltradas = facturas.filter((factura) => filtraPorMes(factura.fecha) && filtraPorUsuario(factura.userId));
  const consumosFiltrados = consumos.filter((consumo) => filtraPorMes(consumo.fecha) && filtraPorUsuario(consumo.userId));
  const ticketsAMEXFiltrados = ticketsAMEX.filter((ticket) => filtraPorMes(ticket.fecha) && filtraPorUsuario(ticket.userId));
  const matchedFacturaIdsDesdeConsumos = useMemo(
    () => new Set(
      consumos
        .filter((consumo) => hasConsumoMatchConfirmado(
          consumo,
          consumo.facturaId ? facturasById.get(String(consumo.facturaId)) : undefined,
        ))
        .map((consumo) => String(consumo.facturaId))
    ),
    [consumos, facturasById]
  );
  const matchedFacturaIdsDesdeAmex = useMemo(
    () => new Set(
      ticketsAMEX
        .filter((ticket) => hasAmexMatchConfirmado(
          ticket,
          ticket.facturaId ? facturasById.get(String(ticket.facturaId)) : undefined,
        ))
        .map((ticket) => String(ticket.facturaId))
    ),
    [ticketsAMEX, facturasById]
  );

  const facturasValidadas = facturasFiltradas.filter(f => f.status === 'validada').length;
  const facturasPendientes = facturasFiltradas.filter(f => f.status === 'pendiente').length;
  const totalFacturas = facturasFiltradas.length;
  const selectedFactura = selectedFacturaId ? facturas.find((item) => item.id === selectedFacturaId) ?? null : null;
  const selectedMatchConsumo = selectedMatchConsumoId
    ? consumos.find((item) => item.id === selectedMatchConsumoId) ?? null
    : null;
  const selectedAlerta = selectedAlertaIndex !== null ? alertas[selectedAlertaIndex] ?? null : null;

  const consumosSinMatch = consumosFiltrados.filter((consumo) => !hasConsumoMatchConfirmado(
    consumo,
    consumo.facturaId ? facturasById.get(String(consumo.facturaId)) : undefined,
  )).length;
  const amexSinMatch = ticketsAMEXFiltrados.filter((ticket) => !hasAmexMatchConfirmado(
    ticket,
    ticket.facturaId ? facturasById.get(String(ticket.facturaId)) : undefined,
  )).length;
  const uploadErrors = showUploadErrors
    ? {
      pdf: !uploadPdfFile ? 'Agrega el PDF.' : '',
      xml: !uploadXmlFile ? 'Agrega el XML.' : '',
    }
    : {};

  const handleVerDetalles = (facturaId: string) => {
    setDetalleReadOnly(false);
    setSelectedFacturaId(facturaId);
    setShowDetalleModal(true);
  };

  const handleVerMatchConsumo = (consumoId: string) => {
    setSelectedMatchConsumoId(consumoId);
    setShowMatchModal(true);
  };

  const openUploadModal = (type: 'consumo' | 'amex', id: string) => {
    setUploadTarget({ type, id });
    setUploadPdfFile(null);
    setUploadXmlFile(null);
    setUploadNotas('');
    setShowUploadErrors(false);
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadTarget(null);
    setUploadPdfFile(null);
    setUploadXmlFile(null);
    setUploadNotas('');
    setShowUploadErrors(false);
  };

  const upsertFactura = (factura: Factura) => {
    setFacturas((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      map.set(factura.id, { ...map.get(factura.id), ...factura });
      return Array.from(map.values());
    });
  };

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetchFacturas(),
      fetchConsumos(),
      fetchAmexTickets(),
      fetchAlertasConciliacion(),
    ])
      .then(([nextFacturas, nextConsumos, nextTicketsAMEX, nextAlertas]) => {
        if (cancelled) {
          return;
        }
        setFacturas(nextFacturas);
        setConsumos(nextConsumos);
        setTicketsAMEX(nextTicketsAMEX);
        setAlertas(nextAlertas);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [setAlertas, setConsumos, setFacturas, setTicketsAMEX]);

  const findMatchingCard = (cards: TarjetaAMEX[], row: StatementRow) => {
    const cardsByNumber = cards.filter((card) => normalizeCardNumber(card.cardNumber) === row.cardNumber && card.userId);
    const exactCard = cardsByNumber.find(
      (card) => normalizeEmployeeNumber(card.employeeNumber || '') === row.employeeNumber
    );
    if (exactCard) {
      return { card: exactCard, warning: '' };
    }
    if (cardsByNumber.length === 1) {
      return {
        card: cardsByNumber[0],
        warning: `Se importo ${row.comercio} (${row.fecha}) usando tarjeta asignada, aunque el numero de empleado no coincidió exactamente.`,
      };
    }

    const cardsByEmployee = cards.filter(
      (card) => normalizeEmployeeNumber(card.employeeNumber || '') === row.employeeNumber && card.userId
    );
    if (cardsByEmployee.length === 1) {
      return {
        card: cardsByEmployee[0],
        warning: `Se importo ${row.comercio} (${row.fecha}) usando numero de empleado, aunque la tarjeta no coincidió exactamente.`,
      };
    }

    return {
      card: null,
      warning: `No se pudo relacionar usuario para ${row.comercio} (${row.fecha}) con tarjeta ${row.cardNumber} y empleado ${row.employeeNumber}.`,
    };
  };

  const findMatchingFactura = (availableFacturas: Factura[], row: StatementRow, userId?: string) => {
    const candidates = availableFacturas
      .filter((factura) => !userId || factura.userId === userId)
      .map((factura) => getFacturaMatchCandidate(factura, row))
      .filter((match): match is FacturaMatchResult => Boolean(match))
      .sort(compareFacturaMatches);

    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      const [bestCandidate, nextCandidate] = candidates;
      const bestTuple = getFacturaMatchTuple(bestCandidate).join('|');
      const nextTuple = getFacturaMatchTuple(nextCandidate).join('|');
      if (bestTuple !== nextTuple) {
        return bestCandidate;
      }
    }
    return null;
  };

  const buildStatementRowFromConsumo = (consumo: Consumo): StatementRow => ({
    cardNumber: consumo.cardNumber || '',
    employeeNumber: consumo.employeeNumber || '',
    employeeName: consumo.userName || '',
    fecha: consumo.fecha,
    comercio: consumo.comercio,
    paisComercio: consumo.paisComercio || '',
    tipoMovimiento: consumo.tipoMovimiento || '',
    monto: consumo.monto,
    montoUsd: 0,
    concepto: consumo.concepto || consumo.categoria || '',
  });

  const syncFacturaMatchFlags = async (currentFacturas: Factura[], currentConsumos: Consumo[]) => {
    const matchedFacturaIds = new Set(
      currentConsumos
        .filter((consumo) => consumo.matched && consumo.facturaId)
        .map((consumo) => String(consumo.facturaId))
    );

    let nextFacturas = [...currentFacturas];
    for (const factura of currentFacturas) {
      const shouldBeMatched = matchedFacturaIds.has(String(factura.id));
      if (Boolean(factura.matchConsumo) === shouldBeMatched) {
        continue;
      }

      const updatedFactura = await updateFactura(factura.id, { matchConsumo: shouldBeMatched });
      nextFacturas = nextFacturas.map((item) => (
        item.id === updatedFactura.id ? { ...item, ...updatedFactura } : item
      ));
    }

    return nextFacturas;
  };

  const handleGenerarReporte = async () => {
    const consumosReporte = consumos.filter((consumo) => filtraPorMes(consumo.fecha));
    if (consumosReporte.length === 0) {
      setStatementImportError('No hay consumos en el mes seleccionado para generar el reporte.');
      setStatementImportMessage('');
      return;
    }

    setReportGenerating(true);
    setStatementImportError('');
    setStatementImportMessage('');

    try {
      const [viaticos, usersResponse] = await Promise.all([
        fetchViaticos().catch(() => []),
        (async () => {
          try {
            return await api.adminUsers();
          } catch {
            try {
              return await api.assignableUsers();
            } catch {
              return [];
            }
          }
        })(),
      ]);

      const usersById = new Map<string, ReportUserRecord>(
        parseReportUsers(usersResponse).map((reportUser) => [reportUser.id, reportUser])
      );
      if (user) {
        usersById.set(String(user.id), {
          id: String(user.id),
          fullName: user.full_name,
          department: user.department || '',
        });
      }

      const viaticosById = new Map(viaticos.map((viatico) => [String(viatico.id), viatico]));
      const reportHeaders = [
        'Tarjeta',
        'Num. Empleado',
        'Empleado',
        'Departamento',
        'Fecha',
        'Comercio',
        'Importe MXN',
        'Importe origen USD',
        'USD',
        'PDF',
        'Invoice',
        'Proyecto',
        'Propina',
        'Gasto No Comprobado',
        'Clasificacion del Viatico',
        'Pais Comercio',
        'Tipo de movimiento',
        'Concepto',
      ];
      const reportRows = consumosReporte
        .slice()
        .sort((left, right) => (
          left.fecha.localeCompare(right.fecha)
          || left.userName?.localeCompare(right.userName || '', 'es', { sensitivity: 'base' })
          || left.comercio.localeCompare(right.comercio, 'es', { sensitivity: 'base' })
        ))
        .map((consumo) => {
          const facturaRelacionada = consumo.facturaId
            ? facturasById.get(String(consumo.facturaId))
            : undefined;
          const viaticoRelacionado = consumo.viaticoId
            ? viaticosById.get(String(consumo.viaticoId))
            : facturaRelacionada?.viaticoId
              ? viaticosById.get(String(facturaRelacionada.viaticoId))
              : undefined;
          const usuarioRelacionado = usersById.get(String(consumo.userId || facturaRelacionada?.userId || ''));
          const propinaDetectada = Number(consumo.propinaDetectada || 0);
          const proyectoLabel = viaticoRelacionado
            ? (
              formatProyectoLabel(viaticoRelacionado.proyectoNombre, viaticoRelacionado.proyectoId)
              || viaticoRelacionado.motivo
            )
            : '';
          const gastoNoComprobado = facturaRelacionada ? 0 : roundMoney(consumo.monto);

          return [
            consumo.cardNumber || '',
            consumo.employeeNumber || '',
            consumo.userName || facturaRelacionada?.userName || usuarioRelacionado?.fullName || '',
            usuarioRelacionado?.department || '',
            buildReportDateValue(consumo.fecha),
            consumo.comercio || '',
            roundMoney(consumo.monto),
            0,
            0,
            facturaRelacionada?.archivoPDF ? 'ok' : '',
            facturaRelacionada?.uuid || facturaRelacionada?.folio || '',
            proyectoLabel,
            roundMoney(propinaDetectada),
            gastoNoComprobado,
            classifyViaticoForReport(viaticoRelacionado?.destinoPais),
            consumo.paisComercio || '',
            consumo.tipoMovimiento || '',
            consumo.concepto || consumo.categoria || '',
          ];
        });

      const workbook = XLSXUtils.book_new();
      const worksheet = XLSXUtils.aoa_to_sheet([reportHeaders, ...reportRows]);
      worksheet['!cols'] = [
        { wch: 20.66 },
        { wch: 21.66 },
        { wch: 62.89 },
        { wch: 20.89 },
        { wch: 11.55 },
        { wch: 44.89 },
        { wch: 21.11 },
        { wch: 27.44 },
        { wch: 11.66 },
        { wch: 9.44 },
        { wch: 211.11 },
        { wch: 197 },
        { wch: 15.33 },
        { wch: 30.44 },
        { wch: 30.89 },
        { wch: 19.66 },
        { wch: 29.33 },
        { wch: 20.55 },
      ];
      worksheet['!rows'] = [
        { hpx: 28 },
        ...reportRows.map(() => ({ hpx: 22 })),
      ];

      for (let colIndex = 0; colIndex < reportHeaders.length; colIndex += 1) {
        const headerRef = XLSXUtils.encode_cell({ r: 0, c: colIndex });
        const headerCell = worksheet[headerRef];
        if (headerCell) {
          headerCell.s = REPORT_HEADER_STYLE;
        }
      }

      for (let rowIndex = 0; rowIndex < reportRows.length; rowIndex += 1) {
        const excelRow = rowIndex + 1;
        for (let colIndex = 0; colIndex < reportHeaders.length; colIndex += 1) {
          const cellRef = XLSXUtils.encode_cell({ r: excelRow, c: colIndex });
          const cell = worksheet[cellRef];
          if (!cell) {
            continue;
          }

          if (colIndex === 4) {
            cell.s = REPORT_DATE_STYLE;
            continue;
          }
          if ([6, 7, 8, 12, 13].includes(colIndex)) {
            cell.s = colIndex === 7 || colIndex === 8 ? REPORT_ZERO_STYLE : REPORT_AMOUNT_STYLE;
            continue;
          }
          if (colIndex === 9 && String(cell.v || '').trim().toLowerCase() === 'ok') {
            cell.s = {
              ...REPORT_CENTER_STYLE,
              font: { bold: true, color: { rgb: 'FF166534' }, sz: 10 },
              fill: { patternType: 'solid', fgColor: { rgb: 'FFDCFCE7' } },
            };
            continue;
          }
          if (colIndex === 13 && Number(reportRows[rowIndex][13] || 0) > 0) {
            cell.s = {
              ...REPORT_AMOUNT_STYLE,
              font: { bold: true, color: { rgb: 'FF991B1B' }, sz: 10 },
              fill: { patternType: 'solid', fgColor: { rgb: 'FFFEE2E2' } },
            };
            continue;
          }
          cell.s = [1, 4, 8, 9, 12, 13, 14, 15, 16].includes(colIndex) ? REPORT_CENTER_STYLE : REPORT_TEXT_STYLE;
        }
      }
      if (reportRows.length > 0) {
        worksheet['!autofilter'] = {
          ref: XLSXUtils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: reportRows.length, c: reportHeaders.length - 1 },
          }),
        };
      }

      const sheetLabel = buildConsumptionSheetLabel(selectedMes, monthLabels);
      XLSXUtils.book_append_sheet(workbook, worksheet, sheetLabel.slice(0, 31));
      writeFile(workbook, `${buildReportFilename(sheetLabel)}.xlsx`);
      setStatementImportMessage(`Reporte generado con ${reportRows.length} consumos del mes seleccionado.`);
    } catch (error) {
      setStatementImportError(error instanceof Error ? error.message : 'No se pudo generar el reporte de conciliacion.');
      setStatementImportMessage('');
    } finally {
      setReportGenerating(false);
    }
  };

  const handleReprocesarConciliacion = async () => {
    if (consumosFiltrados.length === 0) {
      setStatementImportError('No hay consumos visibles para reprocesar con los filtros actuales.');
      setStatementImportMessage('');
      return;
    }

    setReprocessingConciliacion(true);
    setShowReprocessModal(false);
    setStatementImportError('');
    setStatementImportMessage('');

    try {
      let nextConsumos = [...consumos];
      let nextFacturas = [...facturas];
      let reprocesados = 0;
      let matchedCount = 0;
      let tipMatchedCount = 0;
      let clearedCount = 0;

      for (const consumo of consumosFiltrados) {
        const row = buildStatementRowFromConsumo(consumo);
        const previousFacturaId = String(consumo.facturaId || '');
        const facturaMatch = findMatchingFactura(nextFacturas, row, consumo.userId);
        const matchedFactura = facturaMatch?.factura;
        const nextFacturaId = matchedFactura ? String(matchedFactura.id) : undefined;
        const nextMatched = Boolean(facturaMatch);

        const updatedConsumo = await updateConsumo(consumo.id, {
          facturaId: nextFacturaId,
          matched: nextMatched,
          propinaDetectada: facturaMatch?.propinaDetectada,
          propinaPorcentaje: facturaMatch?.propinaPorcentaje,
        });

        nextConsumos = nextConsumos.map((item) => (
          item.id === updatedConsumo.id ? { ...item, ...updatedConsumo } : item
        ));

        reprocesados += 1;
        if (nextMatched) {
          matchedCount += 1;
          if (facturaMatch?.matchType === 'propina') {
            tipMatchedCount += 1;
          }
        } else if (previousFacturaId) {
          clearedCount += 1;
        }
      }

      nextFacturas = await syncFacturaMatchFlags(nextFacturas, nextConsumos);
      setConsumos(nextConsumos);
      setFacturas(nextFacturas);
      setStatementImportMessage(
        [
          `Reproceso completado: ${reprocesados} consumos evaluados, ${matchedCount} relacionados y ${clearedCount} relaciones previas limpiadas.`,
          tipMatchedCount > 0 ? `${tipMatchedCount} coincidencias quedaron conciliadas con tolerancia de propina.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      setStatementImportError(error instanceof Error ? error.message : 'No se pudo reprocesar la conciliacion.');
    } finally {
      setReprocessingConciliacion(false);
    }
  };

  const handleEstadoCuentaFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatementImporting(true);
    setStatementImportError('');
    setStatementImportMessage('');

    try {
      const rows = await readStatementRows(file);
      if (rows.length === 0) {
        throw new Error('El archivo no contiene movimientos utilizables.');
      }

      const cards = await fetchAmexTarjetas();
      let nextConsumos = [...consumos];
      let nextFacturas = [...facturas];
      let createdCount = 0;
      let updatedCount = 0;
      let matchedCount = 0;
      let tipMatchedCount = 0;
      let skippedCount = 0;
      const warnings: string[] = [];

      for (const row of rows) {
        const relation = findMatchingCard(cards, row);
        if (!relation.card?.userId) {
          skippedCount += 1;
          warnings.push(relation.warning);
          continue;
        }
        if (relation.warning) {
          warnings.push(relation.warning);
        }

        const existingConsumo = nextConsumos.find((item) =>
          normalizeCardNumber(item.cardNumber || '') === row.cardNumber &&
          normalizeEmployeeNumber(item.employeeNumber || '') === row.employeeNumber &&
          item.fecha === row.fecha &&
          normalizeMerchant(item.comercio) === normalizeMerchant(row.comercio) &&
          Math.abs(item.monto - row.monto) < 0.01
        );
        const facturaMatch = findMatchingFactura(nextFacturas, row, relation.card.userId);
        const matchedFactura = facturaMatch?.factura;

        const facturaId = matchedFactura?.id || existingConsumo?.facturaId;
        const matched = Boolean(facturaMatch || existingConsumo?.matched);
        const payload: Partial<Consumo> = {
          userId: relation.card.userId,
          viaticoId: existingConsumo?.viaticoId,
          cardNumber: row.cardNumber,
          employeeNumber: row.employeeNumber,
          fecha: row.fecha,
          comercio: row.comercio,
          paisComercio: row.paisComercio,
          tipoMovimiento: row.tipoMovimiento,
          concepto: row.concepto,
          monto: row.monto,
          propinaDetectada: facturaMatch
            ? facturaMatch.propinaDetectada
            : existingConsumo?.matched
              ? existingConsumo.propinaDetectada
              : undefined,
          propinaPorcentaje: facturaMatch
            ? facturaMatch.propinaPorcentaje
            : existingConsumo?.matched
              ? existingConsumo.propinaPorcentaje
              : undefined,
          categoria: row.concepto || row.tipoMovimiento || 'Estado de cuenta',
          facturaId,
          facturaPdfName: existingConsumo?.facturaPdfName,
          facturaXmlName: existingConsumo?.facturaXmlName,
          facturaNotas: existingConsumo?.facturaNotas,
          matched,
          autorizado: existingConsumo?.autorizado ?? false,
        };

        const persisted = existingConsumo
          ? await updateConsumo(existingConsumo.id, payload)
          : await createConsumo(payload);

        if (existingConsumo) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }

        nextConsumos = [
          ...nextConsumos.filter((item) => item.id !== persisted.id),
          persisted,
        ].sort((left, right) => right.fecha.localeCompare(left.fecha));

        if (matchedFactura) {
          matchedCount += 1;
          if (facturaMatch?.matchType === 'propina') {
            tipMatchedCount += 1;
          }
          if (!matchedFactura.matchConsumo) {
            const updatedFactura = await updateFactura(matchedFactura.id, { matchConsumo: true });
            nextFacturas = nextFacturas.map((item) => (
              item.id === updatedFactura.id ? { ...item, ...updatedFactura } : item
            ));
          }
        }
      }

      setConsumos(nextConsumos);
      setFacturas(nextFacturas);
      setStatementImportMessage(
        [
          `Estado de cuenta procesado: ${createdCount} nuevos, ${updatedCount} actualizados, ${matchedCount} relacionados con XML/factura y ${skippedCount} omitidos.`,
          tipMatchedCount > 0 ? `${tipMatchedCount} coincidencias se conciliaron usando tolerancia de propina de hasta 20%.` : '',
          warnings.length > 0 ? `Observaciones: ${warnings.slice(0, 3).join(' ')}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      setStatementImportError(error instanceof Error ? error.message : 'No se pudo importar el estado de cuenta.');
    } finally {
      setStatementImporting(false);
      event.target.value = '';
    }
  };

  const handleGuardarFactura = async () => {
    if (!uploadTarget) {
      return;
    }
    if (!uploadPdfFile || !uploadXmlFile) {
      setShowUploadErrors(true);
      return;
    }
    const snapshotTarget = uploadTarget;
    const snapshotPdfFile = uploadPdfFile;
    const snapshotXmlFile = uploadXmlFile;
    const snapshotNotas = uploadNotas;

    closeUploadModal();
    setUploadSaving(true);
    try {
      const targetConsumo = snapshotTarget.type === 'consumo'
        ? consumos.find((item) => item.id === snapshotTarget.id) ?? null
        : null;
      const targetTicket = snapshotTarget.type === 'amex'
        ? ticketsAMEX.find((item) => item.id === snapshotTarget.id) ?? null
        : null;

      if (!targetConsumo && !targetTicket) {
        throw new Error('No se encontró el registro a actualizar.');
      }

      const baseTimestamp = Date.now();
      const baseData = targetConsumo
        ? {
          viaticoId: targetConsumo.viaticoId,
          razonSocial: targetConsumo.comercio || 'Consumo',
          fecha: targetConsumo.fecha,
          monto: targetConsumo.monto || 0,
          categoria: targetConsumo.categoria || 'Consumo',
        }
        : {
          viaticoId: undefined,
          razonSocial: targetTicket?.comercio || 'Ticket AMEX',
          fecha: targetTicket?.fecha || new Date().toISOString().slice(0, 10),
          monto: targetTicket?.monto || 0,
          categoria: targetTicket?.categoria || 'AMEX',
        };

      const facturaCreada = await createFactura({
        userId: targetConsumo?.userId || targetTicket?.userId,
        viaticoId: baseData.viaticoId,
        folio: `FAC-CON-${baseTimestamp}`,
        uuid: `TMP-CON-${baseTimestamp}`,
        rfc: 'XAXX010101000',
        razonSocial: baseData.razonSocial,
        fecha: baseData.fecha,
        subtotal: baseData.monto,
        iva: 0,
        total: baseData.monto,
        formaPago: 'NA',
        metodoPago: 'NA',
        archivoPdf: snapshotPdfFile,
        archivoXml: snapshotXmlFile,
      });

      const facturaId = String(facturaCreada.id);
      const notas = snapshotNotas.trim() || undefined;

      if (targetConsumo) {
        const uploadedFacturaMatch = getFacturaMatchCandidate(facturaCreada, {
          cardNumber: targetConsumo.cardNumber || '',
          employeeNumber: targetConsumo.employeeNumber || '',
          employeeName: targetConsumo.userName || '',
          fecha: targetConsumo.fecha,
          comercio: targetConsumo.comercio,
          paisComercio: targetConsumo.paisComercio || '',
          tipoMovimiento: targetConsumo.tipoMovimiento || '',
          monto: targetConsumo.monto,
          montoUsd: 0,
          concepto: targetConsumo.concepto || targetConsumo.categoria || '',
        });
        const consumoActualizado = await updateConsumo(targetConsumo.id, {
          facturaId,
          facturaPdfName: snapshotPdfFile.name,
          facturaXmlName: snapshotXmlFile.name,
          facturaNotas: notas,
          matched: Boolean(uploadedFacturaMatch),
          propinaDetectada: uploadedFacturaMatch?.propinaDetectada,
          propinaPorcentaje: uploadedFacturaMatch?.propinaPorcentaje,
        });
        setConsumos((prev) => prev.map((item) => (item.id === consumoActualizado.id ? consumoActualizado : item)));
        if (uploadedFacturaMatch && !facturaCreada.matchConsumo) {
          const facturaActualizada = await updateFactura(facturaId, { matchConsumo: true });
          upsertFactura(facturaActualizada);
        } else {
          upsertFactura(facturaCreada);
        }
      } else if (targetTicket) {
        const ticketActualizado = await updateAmexTicket(targetTicket.id, {
          facturaId,
          facturaPdfName: snapshotPdfFile.name,
          facturaXmlName: snapshotXmlFile.name,
          facturaNotas: notas,
          matched: false,
        });
        setTicketsAMEX((prev) => prev.map((item) => (item.id === ticketActualizado.id ? ticketActualizado : item)));
        upsertFactura(facturaCreada);
      }
      void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
    } catch (error) {
      setUploadTarget(snapshotTarget);
      setUploadPdfFile(snapshotPdfFile);
      setUploadXmlFile(snapshotXmlFile);
      setUploadNotas(snapshotNotas);
      setShowUploadErrors(false);
      setShowUploadModal(true);
      window.alert(error instanceof Error ? error.message : 'No se pudo subir la factura.');
    } finally {
      setUploadSaving(false);
    }
  };

  const handleRevisarAlerta = (index: number) => {
    setSelectedAlertaIndex(index);
    setShowAlertaModal(true);
  };

  const handlePreviewArchivo = (tipo: 'PDF' | 'XML', archivoPath?: string) => {
    if (!archivoPath) {
      return;
    }
    openFacturaAsset(tipo, archivoPath);
  };

  useEscapeKey(() => closeUploadModal(), showUploadModal);
  useEscapeKey(() => setShowReprocessModal(false), showReprocessModal);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-purple-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Conciliacion</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Conciliacion de Facturas</h1>
                <p className="text-[11px] text-slate-600">Control de facturas y consumos asociados por gasto.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={statementInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleEstadoCuentaFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => statementInputRef.current?.click()}
                  disabled={statementImporting}
                  className="px-3 py-1.5 text-[11px] rounded-lg bg-slate-900 font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {statementImporting ? 'Importando estado...' : 'Subir Estado de Cuenta'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (consumosFiltrados.length === 0) {
                      setStatementImportError('No hay consumos visibles para reprocesar con los filtros actuales.');
                      setStatementImportMessage('');
                      return;
                    }
                    setShowReprocessModal(true);
                  }}
                  disabled={reprocessingConciliacion}
                  className="px-3 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {reprocessingConciliacion ? 'Reprocesando...' : 'Reprocesar conciliacion'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerarReporte()}
                  disabled={reportGenerating}
                  className="px-3 py-1.5 text-[11px] rounded-lg border border-emerald-300 bg-emerald-50 font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {reportGenerating ? 'Generando reporte...' : 'Generar reporte'}
                </button>
                <select
                  value={selectedMes}
                  onChange={(e) => setSelectedMes(e.target.value)}
                  className="px-2.5 py-1.5 text-[11px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="todos">Todos los meses</option>
                  {mesesDisponibles.map((mes) => (
                    <option key={mes} value={mes}>
                      {monthLabels[mes as keyof typeof monthLabels] ?? mes}
                    </option>
                  ))}
                </select>
                {restrictToCurrentUser ? (
                  <div className="min-w-[170px] px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                    Usuario: {user?.full_name || 'Actual'}
                  </div>
                ) : (
                  <select
                    value={selectedUsuario}
                    onChange={(e) => setSelectedUsuario(e.target.value)}
                    className="min-w-[170px] px-2.5 py-1.5 text-[11px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="todos">Todos los usuarios</option>
                    {usuariosDisponibles.map((usuarioOption) => (
                      <option key={usuarioOption.id} value={usuarioOption.id}>
                        {usuarioOption.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <MetricCard label="Facturas" value={totalFacturas} color="blue" icon="F" />
              <MetricCard label="Consumos" value={consumosFiltrados.length} color="purple" icon="C" />
              <MetricCard label="AMEX" value={ticketsAMEXFiltrados.length} color="indigo" icon="AX" />
              <MetricCard label="Conciliadas" value={facturasValidadas} color="green" icon="OK" />
              <MetricCard label="Pendientes" value={facturasPendientes + consumosSinMatch + amexSinMatch} color="yellow" icon="P" />
              <MetricCard label="Alertas" value={alertas.length} color="red" icon="!" />
            </div>

            {statementImportError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                {statementImportError}
              </p>
            ) : null}
            {statementImportMessage ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                {statementImportMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alertas de Conciliación</h2>
              <p className="text-sm text-gray-600 mt-1">{alertas.length} discrepancias detectadas</p>
            </div>
            <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Ver todas
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {alertas.map((alerta, index) => (
              <AlertaCard key={index} alerta={alerta} onRevisar={() => handleRevisarAlerta(index)} />
            ))}
          </div>
        </div>
      </div>

      {/* Tabs para cambiar entre Facturas, Consumos y AMEX */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setVistaActiva('facturas')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                vistaActiva === 'facturas'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Facturas ({totalFacturas})
            </button>
            <button
              onClick={() => setVistaActiva('consumos')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                vistaActiva === 'consumos'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Efectifintech ({consumosFiltrados.length})
            </button>
            <button
              onClick={() => setVistaActiva('amex')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                vistaActiva === 'amex'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              AMEX ({ticketsAMEXFiltrados.length})
            </button>
          </nav>
        </div>

        {/* Tabla de Facturas */}
        {vistaActiva === 'facturas' && (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full table-auto">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-[22%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Folio / UUID
                  </th>
                  <th className="w-[24%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Razón Social
                  </th>
                  <th className="w-[10%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="w-[10%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="w-[14%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Match
                  </th>
                  <th className="w-[10%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Archivos
                  </th>
                  <th className="w-[10%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="w-[10%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {facturasFiltradas.map((factura) => (
                  (() => {
                    const hasConsumoMatch = matchedFacturaIdsDesdeConsumos.has(String(factura.id));
                    const hasAmexMatch = matchedFacturaIdsDesdeAmex.has(String(factura.id));
                    const matchLabel = hasConsumoMatch && hasAmexMatch
                      ? 'Matched Efectifintech + AMEX'
                      : hasConsumoMatch
                        ? 'Matched Efectifintech'
                        : hasAmexMatch
                          ? 'Matched AMEX'
                          : 'Sin match';
                    const matchClassName = hasConsumoMatch || hasAmexMatch
                      ? 'inline-flex min-w-[92px] justify-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium'
                      : 'inline-flex min-w-[92px] justify-center px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium';
                    return (
                  <tr key={factura.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 align-top">
                      <p className="break-all text-sm font-medium text-gray-900">{factura.folio}</p>
                      <p className="mt-1 break-all text-xs text-gray-500 font-mono">{factura.uuid.substring(0, 20)}...</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="break-words text-sm text-gray-900">{factura.razonSocial}</p>
                      <p className="mt-1 break-all text-xs text-gray-500">{factura.rfc}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <p className="text-sm text-gray-900">{factura.fecha}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <p className="text-sm font-semibold text-gray-900">${factura.total.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span className={matchClassName}>{matchLabel}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePreviewArchivo('PDF', factura.archivoPDF)}
                          disabled={!factura.archivoPDF}
                          className={`px-2 py-1 text-xs rounded-md border ${
                            factura.archivoPDF
                              ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                              : 'border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreviewArchivo('XML', factura.archivoXML)}
                          disabled={!factura.archivoXML}
                          className={`px-2 py-1 text-xs rounded-md border ${
                            factura.archivoXML
                              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              : 'border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          XML
                        </button>
                      </div>
                      {!factura.archivoPDF && !factura.archivoXML && (
                        <p className="mt-1 text-[10px] text-gray-400">Sin archivos</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <StatusBadge status={factura.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium align-top">
                      <button
                        onClick={() => handleVerDetalles(factura.id)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        Ver Detalles
                      </button>
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabla de Consumos Efectifintech */}
        {vistaActiva === 'consumos' && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comercio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Factura Match
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {consumosFiltrados.map((consumo) => {
                  const facturaRelacionada = consumo.facturaId
                    ? facturasById.get(String(consumo.facturaId))
                    : undefined;
                  const consumoMatchConfirmado = hasConsumoMatchConfirmado(consumo, facturaRelacionada);
                  const consumoPdfPath = facturaRelacionada?.archivoPDF;
                  const consumoXmlPath = facturaRelacionada?.archivoXML;
                  const consumoPdfLabel = facturaRelacionada?.archivoPDF || consumo.facturaPdfName;
                  const consumoXmlLabel = facturaRelacionada?.archivoXML || consumo.facturaXmlName;
                  return (
                  <tr key={consumo.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{consumo.id}</p>
                      {(consumo.cardNumber || consumo.employeeNumber) ? (
                        <p className="mt-1 text-[11px] text-gray-500">
                          {consumo.cardNumber ? `Tarjeta: ${consumo.cardNumber}` : ''}
                          {consumo.cardNumber && consumo.employeeNumber ? ' · ' : ''}
                          {consumo.employeeNumber ? `Empleado: ${consumo.employeeNumber}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{consumo.comercio}</p>
                      {consumo.userName ? (
                        <p className="mt-1 text-[11px] text-gray-500">{consumo.userName}</p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">{consumo.fecha}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                        {consumo.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-900">${consumo.monto.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      {consumoMatchConfirmado ? (
                        <div>
                          <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                            {consumo.propinaDetectada && consumo.propinaDetectada > AMOUNT_MATCH_EPSILON ? 'Match con propina' : 'Matched'}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {consumo.facturaId}</p>
                          {consumo.propinaDetectada && consumo.propinaDetectada > AMOUNT_MATCH_EPSILON ? (
                            <p className="text-[11px] text-amber-700 mt-1">
                              Propina detectada: ${consumo.propinaDetectada.toLocaleString()} ({(consumo.propinaPorcentaje || 0).toFixed(2)}%)
                            </p>
                          ) : null}
                        </div>
                      ) : consumo.facturaId ? (
                        <div>
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Factura cargada</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {consumo.facturaId}</p>
                          {(consumoPdfLabel || consumoXmlLabel) && (
                            <p className="text-[10px] text-gray-400 mt-1 break-all">
                              {consumoPdfLabel ? `PDF: ${consumoPdfLabel}` : ''}
                              {consumoPdfLabel && consumoXmlLabel ? ' · ' : ''}
                              {consumoXmlLabel ? `XML: ${consumoXmlLabel}` : ''}
                            </p>
                          )}
                          {(consumoPdfLabel || consumoXmlLabel) && (
                            <div className="mt-1 flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('PDF', consumoPdfPath)}
                                disabled={!consumoPdfPath}
                                className={`px-2 py-0.5 rounded border ${
                                  consumoPdfPath
                                    ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('XML', consumoXmlPath)}
                                disabled={!consumoXmlPath}
                                className={`px-2 py-0.5 rounded border ${
                                  consumoXmlPath
                                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                XML
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Sin factura</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {consumo.autorizado ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">Autorizado</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium">Pendiente</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {facturaRelacionada ? (
                          <button
                            type="button"
                            onClick={() => handleVerMatchConsumo(consumo.id)}
                            className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-800"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12Z" />
                            </svg>
                            {consumoMatchConfirmado ? 'Ver match' : 'Ver factura'}
                          </button>
                        ) : null}
                        {!facturaRelacionada ? (
                          <button
                            onClick={() => openUploadModal('consumo', consumo.id)}
                            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Subir factura
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabla de Tickets AMEX */}
        {vistaActiva === 'amex' && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID / Tarjeta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comercio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proyecto / Cuenta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Factura Match
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ticketsAMEXFiltrados.map((ticket) => {
                  const proyectoLabel = formatProyectoLabel(ticket.proyectoNombre, ticket.proyectoId);
                  const facturaRelacionada = ticket.facturaId
                    ? facturasById.get(String(ticket.facturaId))
                    : undefined;
                  const ticketMatchConfirmado = hasAmexMatchConfirmado(ticket, facturaRelacionada);
                  const ticketPdfPath = facturaRelacionada?.archivoPDF;
                  const ticketXmlPath = facturaRelacionada?.archivoXML;
                  const ticketPdfLabel = facturaRelacionada?.archivoPDF || ticket.facturaPdfName;
                  const ticketXmlLabel = facturaRelacionada?.archivoXML || ticket.facturaXmlName;
                  return (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{ticket.id}</p>
                      <p className="text-xs text-gray-500">**** {ticket.cardNumber} - {ticket.cardHolder}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{ticket.comercio}</p>
                      <p className="text-xs text-gray-500">{ticket.paisComercio}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">{ticket.fecha}</p>
                    </td>
                    <td className="px-6 py-4">
                      {proyectoLabel ? (
                        <div>
                          <p className="text-sm text-gray-900">{proyectoLabel}</p>
                          <p className="text-xs text-gray-500">Cuenta: {ticket.cuentaContable}</p>
                        </div>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          Cuenta: {ticket.cuentaContable}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-900">${ticket.monto.toLocaleString()}</p>
                      {ticket.montoUSD && (
                        <p className="text-xs text-gray-500">USD ${ticket.montoUSD} (TC: {ticket.tipoCambio})</p>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {ticketMatchConfirmado ? (
                        <div>
                          <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Matched</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {ticket.facturaId}</p>
                        </div>
                      ) : ticket.facturaId ? (
                        <div>
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Factura cargada</span>
                          <p className="text-xs text-gray-500 mt-1">Factura: {ticket.facturaId}</p>
                          {(ticketPdfLabel || ticketXmlLabel) && (
                            <p className="text-[10px] text-gray-400 mt-1 break-all">
                              {ticketPdfLabel ? `PDF: ${ticketPdfLabel}` : ''}
                              {ticketPdfLabel && ticketXmlLabel ? ' · ' : ''}
                              {ticketXmlLabel ? `XML: ${ticketXmlLabel}` : ''}
                            </p>
                          )}
                          {(ticketPdfLabel || ticketXmlLabel) && (
                            <div className="mt-1 flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('PDF', ticketPdfPath)}
                                disabled={!ticketPdfPath}
                                className={`px-2 py-0.5 rounded border ${
                                  ticketPdfPath
                                    ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePreviewArchivo('XML', ticketXmlPath)}
                                disabled={!ticketXmlPath}
                                className={`px-2 py-0.5 rounded border ${
                                  ticketXmlPath
                                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                XML
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex min-w-[92px] justify-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Sin factura</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {ticket.autorizado ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">Autorizado</span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium">Rechazado</span>
                      )}
                      {ticket.observaciones && (
                        <p className="text-xs text-gray-600 mt-1">{ticket.observaciones}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openUploadModal('amex', ticket.id)}
                        className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {ticket.facturaId ? 'Actualizar factura' : 'Subir factura'}
                      </button>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales */}
      {showDetalleModal && selectedFactura && (
        <DetalleFacturaModal
          factura={selectedFactura}
          consumos={consumos}
          readOnly={detalleReadOnly}
          onRequestUpdate={selectedMatchConsumo && selectedFactura.id === selectedMatchConsumo.facturaId
            ? () => {
              setShowDetalleModal(false);
              setSelectedFacturaId(null);
              setDetalleReadOnly(false);
              setSelectedMatchConsumoId(null);
              openUploadModal('consumo', selectedMatchConsumo.id);
            }
            : undefined}
          onClose={() => {
            setShowDetalleModal(false);
            setSelectedFacturaId(null);
            setDetalleReadOnly(false);
            setSelectedMatchConsumoId(null);
          }}
          onUpdateStatus={async (facturaId, status) => {
            try {
              const updated = await updateFactura(facturaId, { status });
              setFacturas((prev) => prev.map((item) => (
                item.id === facturaId ? { ...item, ...updated } : item
              )));
              void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
            } catch (error) {
              window.alert(error instanceof Error ? error.message : 'No se pudo actualizar el estado de la factura.');
            }
          }}
          onDelete={async (facturaId) => {
            try {
              await deleteFactura(facturaId);
              setFacturas((prev) => prev.filter((item) => item.id !== facturaId));
              setConsumos((prev) => prev.map((item) => (
                item.facturaId === facturaId
                  ? {
                    ...item,
                    facturaId: undefined,
                    facturaPdfName: undefined,
                    facturaXmlName: undefined,
                    facturaNotas: undefined,
                    matched: false,
                    propinaDetectada: undefined,
                    propinaPorcentaje: undefined,
                  }
                  : item
              )));
              setTicketsAMEX((prev) => prev.map((item) => (
                item.facturaId === facturaId
                  ? {
                    ...item,
                    facturaId: undefined,
                    facturaPdfName: undefined,
                    facturaXmlName: undefined,
                    facturaNotas: undefined,
                    matched: false,
                  }
                  : item
              )));
              setShowDetalleModal(false);
              setSelectedFacturaId(null);
              void syncCoreAppData({ userId: user ? String(user.id) : undefined }).catch(() => {});
            } catch (error) {
              window.alert(error instanceof Error ? error.message : 'No se pudo eliminar la factura.');
            }
          }}
        />
      )}

      {showMatchModal && selectedMatchConsumo && (
        <MatchFacturaModal
          consumo={selectedMatchConsumo}
          factura={selectedMatchConsumo.facturaId ? facturasById.get(String(selectedMatchConsumo.facturaId)) ?? null : null}
          onClose={() => {
            setShowMatchModal(false);
            setSelectedMatchConsumoId(null);
          }}
        />
      )}

      {showAlertaModal && selectedAlerta && (
        <AlertaDetalleModal
          alerta={selectedAlerta}
          facturas={facturas}
          consumos={consumos}
          onClose={() => {
            setShowAlertaModal(false);
            setSelectedAlertaIndex(null);
          }}
        />
      )}

      {showUploadModal && uploadTarget && (
        <SubirFacturaModal
          tipo={uploadTarget.type}
          consumo={uploadTarget.type === 'consumo' ? consumos.find((item) => item.id === uploadTarget.id) ?? null : null}
          ticket={uploadTarget.type === 'amex' ? ticketsAMEX.find((item) => item.id === uploadTarget.id) ?? null : null}
          pdfFile={uploadPdfFile}
          xmlFile={uploadXmlFile}
          notas={uploadNotas}
          errors={uploadErrors}
          saving={uploadSaving}
          onChangePdf={setUploadPdfFile}
          onChangeXml={setUploadXmlFile}
          onChangeNotas={setUploadNotas}
          onClose={closeUploadModal}
          onSave={handleGuardarFactura}
        />
      )}

      {showReprocessModal && (
        <ConfirmReprocessModal
          visibleCount={consumosFiltrados.length}
          isProcessing={reprocessingConciliacion}
          onClose={() => setShowReprocessModal(false)}
          onConfirm={() => void handleReprocesarConciliacion()}
        />
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
  icon: string;
}

interface ConfirmReprocessModalProps {
  visibleCount: number;
  isProcessing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function ConfirmReprocessModal({ visibleCount, isProcessing, onClose, onConfirm }: ConfirmReprocessModalProps) {
  useEscapeKey(onClose, !isProcessing);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar confirmacion"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={isProcessing ? undefined : onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300">Conciliacion</p>
          <h3 className="mt-2 text-xl font-semibold">Confirmar reproceso</h3>
          <p className="mt-2 text-sm text-slate-300">
            Se volveran a evaluar los consumos visibles con la logica actual de XML, PDF y tolerancia de propina.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">{visibleCount}</span> consumos visibles se van a recalcular con los filtros actuales.
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Si una coincidencia mejora, se actualizara automaticamente. Si ya no cumple con la logica actual, se limpiara la relacion anterior.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? 'Reprocesando...' : 'Reprocesar ahora'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, icon }: MetricCardProps) {
  const colorClasses = {
    blue: { accent: 'bg-blue-500', soft: 'bg-blue-100 text-blue-700' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-700' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-800' },
    red: { accent: 'bg-rose-500', soft: 'bg-rose-100 text-rose-700' },
    purple: { accent: 'bg-purple-500', soft: 'bg-purple-100 text-purple-700' },
    indigo: { accent: 'bg-indigo-500', soft: 'bg-indigo-100 text-indigo-700' },
  };
  const palette = colorClasses[color];

  return (
    <button
      type="button"
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white/90 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md select-none"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.accent}`} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${palette.soft} text-sm`}>
          {icon}
        </div>
      </div>
    </button>
  );
}

function AlertaCard({ alerta, onRevisar }: { alerta: AlertaConciliacion; onRevisar: () => void }) {
  const iconMap = {
    propina_excedida: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    articulo_personal: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    factura_sin_consumo: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    monto_diferente: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    consumo_sin_factura: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    duplicado: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  };

  const colorMap = {
    alta: 'bg-red-50 border-red-200',
    media: 'bg-yellow-50 border-yellow-200',
    baja: 'bg-blue-50 border-blue-200',
  };

  const iconColorMap = {
    alta: 'text-red-600',
    media: 'text-yellow-600',
    baja: 'text-blue-600',
  };

  return (
    <div className={`flex items-start p-4 rounded-lg border ${colorMap[alerta.gravedad]}`}>
      <svg
        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColorMap[alerta.gravedad]}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconMap[alerta.tipo]} />
      </svg>
      <div className="ml-3 flex-1">
        <p className="text-sm font-medium text-gray-900">{alerta.descripcion}</p>
        {alerta.facturaId && (
          <p className="text-xs text-gray-600 mt-1">Factura: {alerta.facturaId}</p>
        )}
      </div>
      <button
        onClick={onRevisar}
        className="ml-3 text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        Revisar
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
    validada: { label: 'Validada', color: 'bg-green-100 text-green-800', icon: 'OK' },
    rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-800', icon: 'X' },
    conciliada: { label: 'Conciliada', color: 'bg-blue-100 text-blue-800', icon: '=' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendiente;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      <span className="text-xs">{config.icon}</span>
      {config.label}
    </span>
  );
}

// Modal de Detalle de Factura
interface DetalleFacturaModalProps {
  factura: Factura;
  consumos: Consumo[];
  readOnly?: boolean;
  onClose: () => void;
  onRequestUpdate?: () => void;
  onUpdateStatus: (facturaId: string, status: FacturaStatus) => Promise<void> | void;
  onDelete: (facturaId: string) => Promise<void> | void;
}

interface MatchFacturaModalProps {
  consumo: Consumo;
  factura: Factura | null;
  onClose: () => void;
}

interface SubirFacturaModalProps {
  tipo: 'consumo' | 'amex';
  consumo: Consumo | null;
  ticket: TicketAMEX | null;
  pdfFile: File | null;
  xmlFile: File | null;
  notas: string;
  errors?: {
    pdf?: string;
    xml?: string;
  };
  saving?: boolean;
  onChangePdf: (file: File | null) => void;
  onChangeXml: (file: File | null) => void;
  onChangeNotas: (value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void> | void;
}

function DetalleFacturaModal({
  factura,
  consumos,
  readOnly = false,
  onClose,
  onRequestUpdate,
  onUpdateStatus,
  onDelete,
}: DetalleFacturaModalProps) {
  useEscapeKey(onClose);

  const [statusLocal, setStatusLocal] = useState(factura.status);
  const consumoMatch = consumos.find(c => c.facturaId === factura.id);
  const pdfPath = factura.archivoPDF;
  const xmlPath = factura.archivoXML;
  const pdfName = factura.archivoPDF ?? consumoMatch?.facturaPdfName;
  const xmlName = factura.archivoXML ?? consumoMatch?.facturaXmlName;
  const pdfPreviewUrl = pdfPath ? buildFacturaAssetUrl('PDF', pdfPath) : '';
  const xmlPreviewUrl = xmlPath ? buildFacturaAssetUrl('XML', xmlPath) : '';
  const pdfDetectedData = factura.validacionCFDI;
  const [previewTipo, setPreviewTipo] = useState<'PDF' | 'XML' | null>(pdfPreviewUrl ? 'PDF' : xmlPreviewUrl ? 'XML' : null);
  const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState('');
  const [pdfPreviewError, setPdfPreviewError] = useState('');
  const [xmlPreviewContent, setXmlPreviewContent] = useState('');
  const [xmlPreviewError, setXmlPreviewError] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (previewTipo !== 'PDF' || !pdfPreviewUrl) {
      setPdfPreviewBlobUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return '';
      });
      setPdfPreviewError('');
      return;
    }

    let cancelled = false;
    setPdfPreviewError('');

    void fetch(pdfPreviewUrl, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar el PDF.');
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const nextBlobUrl = URL.createObjectURL(blob);
        setPdfPreviewBlobUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return nextBlobUrl;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPdfPreviewError('No se pudo cargar la previsualizacion del PDF.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewTipo, pdfPreviewUrl]);

  useEffect(() => {
    if (previewTipo !== 'XML' || !xmlPreviewUrl) {
      setXmlPreviewContent('');
      setXmlPreviewError('');
      return;
    }

    let cancelled = false;
    setXmlPreviewContent('');
    setXmlPreviewError('');

    void fetch(xmlPreviewUrl, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar el XML.');
        }
        return response.text();
      })
      .then((content) => {
        if (!cancelled) {
          setXmlPreviewContent(content);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setXmlPreviewError('No se pudo cargar la previsualizacion del XML.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewTipo, xmlPreviewUrl]);

  const handleDescargarArchivo = (tipo: 'PDF' | 'XML', path?: string) => {
    const defaultName = `${factura.folio || factura.id}.${tipo.toLowerCase()}`;
    downloadFacturaAsset(tipo, path, defaultName);
  };

  const handleStatusChange = (status: FacturaStatus) => {
    setStatusLocal(status);
    onUpdateStatus(factura.id, status);
    onClose();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(factura.id);
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const getStatusButtonStyles = (status: FacturaStatus, baseStyles: string) => {
    const isActive = statusLocal === status;
    return `${baseStyles}${isActive ? ' ring-2 ring-offset-1 ring-slate-300' : ''}`;
  };

  const pdfViewerUrl = (pdfPreviewBlobUrl || pdfPreviewUrl)
    ? `${pdfPreviewBlobUrl || pdfPreviewUrl}#view=FitH&zoom=page-width&pagemode=none`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm">
      <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-7xl w-full max-h-[calc(100dvh-1.5rem)] overflow-hidden">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Detalle de Factura - {factura.folio}</h2>
              {readOnly ? (
                <p className="mt-1 text-xs text-slate-500">Vista limitada para revisar la factura relacionada.</p>
              ) : null}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${readOnly ? 'space-y-4' : 'grid grid-cols-1 gap-4 xl:grid-cols-2'}`}>
          {!readOnly ? (
            <>
          {/* Información General */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Información General</h3>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Lugar donde se realizo el consumo</p>
                <p className="text-sm font-semibold text-gray-900">{factura.razonSocial}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="text-sm text-gray-900">{factura.fecha}</p>
              </div>
            </div>
          </div>

          {(pdfDetectedData?.pdfDetectedRazonSocial
            || pdfDetectedData?.pdfDetectedTotal
            || pdfDetectedData?.pdfDetectedRfc
            || pdfDetectedData?.pdfDetectedFolio
            || pdfDetectedData?.pdfDetectedUuid) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Datos detectados en PDF</h3>
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-600">Razon social detectada</p>
                  <p className="text-sm font-semibold text-gray-900">{pdfDetectedData?.pdfDetectedRazonSocial || 'No detectada'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total detectado</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {Number.isFinite(Number(pdfDetectedData?.pdfDetectedTotal))
                      ? `$${Number(pdfDetectedData?.pdfDetectedTotal).toLocaleString()}`
                      : 'No detectado'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">RFC detectado</p>
                  <p className="text-sm font-semibold text-gray-900">{pdfDetectedData?.pdfDetectedRfc || 'No detectado'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Folio detectado</p>
                  <p className="text-sm font-semibold text-gray-900">{pdfDetectedData?.pdfDetectedFolio || 'No detectado'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-600">UUID detectado</p>
                  <p className="break-all text-sm font-semibold text-gray-900">{pdfDetectedData?.pdfDetectedUuid || 'No detectado'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Montos */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Desglose de Montos</h3>
            <div className="bg-blue-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Subtotal:</span>
                <span className="text-sm font-semibold text-gray-900">${factura.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">IVA:</span>
                <span className="text-sm font-semibold text-gray-900">${factura.iva.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-2">
                <span className="text-base font-semibold text-gray-900">Total:</span>
                <span className="text-base font-bold text-primary-600">${factura.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Conceptos */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Conceptos</h3>
            <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Clave</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Descripción</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cantidad</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">P. Unitario</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Importe</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {factura.conceptos.map((concepto, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-gray-900">{concepto.claveProdServ}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{concepto.descripcion}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{concepto.cantidad}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">${concepto.valorUnitario.toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900">${concepto.importe.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            </>
          ) : null}

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Archivos de Factura</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-800">PDF</p>
                <p className="text-xs text-slate-500 mt-1">{pdfName ?? 'Sin archivo'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTipo('PDF')}
                    disabled={!pdfPath}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                      pdfPath
                        ? previewTipo === 'PDF'
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                        : 'border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Ver PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDescargarArchivo('PDF', pdfPath)}
                    disabled={!pdfPath}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                      pdfPath
                        ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
                        : 'border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-3-3m3 3l3-3" />
                    </svg>
                    Descargar PDF
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-800">XML</p>
                <p className="text-xs text-slate-500 mt-1">{xmlName ?? 'Sin archivo'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTipo('XML')}
                    disabled={!xmlPath}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                      xmlPath
                        ? previewTipo === 'XML'
                          ? 'border-teal-300 bg-teal-50 text-teal-700'
                          : 'border-teal-200 text-teal-700 hover:bg-teal-50'
                        : 'border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Ver XML
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDescargarArchivo('XML', xmlPath)}
                    disabled={!xmlPath}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                      xmlPath
                        ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        : 'border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-3-3m3 3l3-3" />
                    </svg>
                    Descargar XML
                  </button>
                </div>
              </div>
            </div>
          </div>

          {previewTipo && (previewTipo === 'PDF' ? (pdfPreviewBlobUrl || pdfPreviewUrl) : xmlPreviewUrl) ? (
            <div className="xl:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Vista Previa</h3>
                  <p className="text-xs text-slate-500">
                    {previewTipo === 'PDF' ? (pdfName || 'PDF') : (xmlName || 'XML')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openFacturaAsset(previewTipo, previewTipo === 'PDF' ? pdfPath : xmlPath)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Abrir aparte
                </button>
              </div>

              {previewTipo === 'PDF' ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {pdfPreviewError ? (
                    <div className="px-4 py-6 text-sm text-rose-500">{pdfPreviewError}</div>
                  ) : (
                    <iframe
                      title={`Vista previa PDF ${factura.folio || factura.id}`}
                      src={pdfViewerUrl}
                      className="h-[58vh] min-h-[480px] w-full bg-white"
                    />
                  )}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                  {xmlPreviewError ? (
                    <div className="px-4 py-6 text-sm text-rose-300">{xmlPreviewError}</div>
                  ) : xmlPreviewContent ? (
                    <pre className="max-h-[42vh] min-h-[320px] overflow-auto px-4 py-4 text-xs leading-5 text-emerald-100">
                      {xmlPreviewContent}
                    </pre>
                  ) : (
                    <div className="px-4 py-6 text-sm text-slate-300">Cargando XML...</div>
                  )}
                </div>
              )}
            </div>
          ) : null}

        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {readOnly && onRequestUpdate ? (
              <button
                type="button"
                onClick={onRequestUpdate}
                className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Actualizar factura
              </button>
            ) : null}
            {!readOnly ? (
              deleteConfirmOpen ? (
                <>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                    Esta accion elimina la factura y limpia su match.
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={deleting}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {deleting ? 'Eliminando...' : 'Eliminar factura'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  Eliminar factura
                </button>
              )
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cerrar
            </button>
            {!readOnly ? (
              <>
                <button
                  onClick={() => handleStatusChange('pendiente')}
                  disabled={deleting}
                  className={getStatusButtonStyles('pendiente', 'px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70')}
                >
                  Pendiente
                </button>
                <button
                  onClick={() => handleStatusChange('rechazada')}
                  disabled={deleting}
                  className={getStatusButtonStyles('rechazada', 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70')}
                >
                  Rechazar Factura
                </button>
                <button
                  onClick={() => handleStatusChange('validada')}
                  disabled={deleting}
                  className={getStatusButtonStyles('validada', 'px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70')}
                >
                  Aprobar Factura
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchFacturaModal({ consumo, factura, onClose }: MatchFacturaModalProps) {
  useEscapeKey(onClose);

  const facturaStatusLabel = factura
    ? {
      pendiente: 'Pendiente',
      validada: 'Validada',
      rechazada: 'Rechazada',
      conciliada: 'Conciliada',
    }[factura.status]
    : 'Sin factura';
  const pdfPath = factura?.archivoPDF;
  const xmlPath = factura?.archivoXML;
  const pdfPreviewUrl = pdfPath ? buildFacturaAssetUrl('PDF', pdfPath) : '';
  const xmlPreviewUrl = xmlPath ? buildFacturaAssetUrl('XML', xmlPath) : '';
  const [showFacturaPreview, setShowFacturaPreview] = useState(false);
  const [previewTipo, setPreviewTipo] = useState<'PDF' | 'XML' | null>(pdfPreviewUrl ? 'PDF' : xmlPreviewUrl ? 'XML' : null);
  const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState('');
  const [pdfPreviewError, setPdfPreviewError] = useState('');
  const [xmlPreviewContent, setXmlPreviewContent] = useState('');
  const [xmlPreviewError, setXmlPreviewError] = useState('');

  useEffect(() => {
    if (!showFacturaPreview || previewTipo !== 'PDF' || !pdfPreviewUrl) {
      setPdfPreviewBlobUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return '';
      });
      setPdfPreviewError('');
      return;
    }

    let cancelled = false;
    setPdfPreviewError('');

    void fetch(pdfPreviewUrl, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar el PDF.');
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const nextBlobUrl = URL.createObjectURL(blob);
        setPdfPreviewBlobUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return nextBlobUrl;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPdfPreviewError('No se pudo cargar la previsualizacion del PDF.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showFacturaPreview, previewTipo, pdfPreviewUrl]);

  useEffect(() => {
    if (!showFacturaPreview || previewTipo !== 'XML' || !xmlPreviewUrl) {
      setXmlPreviewContent('');
      setXmlPreviewError('');
      return;
    }

    let cancelled = false;
    setXmlPreviewContent('');
    setXmlPreviewError('');

    void fetch(xmlPreviewUrl, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar el XML.');
        }
        return response.text();
      })
      .then((content) => {
        if (!cancelled) {
          setXmlPreviewContent(content);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setXmlPreviewError('No se pudo cargar la previsualizacion del XML.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showFacturaPreview, previewTipo, xmlPreviewUrl]);

  const pdfViewerUrl = (pdfPreviewBlobUrl || pdfPreviewUrl)
    ? `${pdfPreviewBlobUrl || pdfPreviewUrl}#view=FitH&zoom=page-width&pagemode=none`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Ver Match de Factura</h2>
              <p className="mt-1 text-sm text-slate-500">Resumen del consumo y la factura relacionada.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">Efectifintech</p>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Comercio</p>
                  <p className="text-sm font-semibold text-slate-900">{consumo.comercio}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Fecha</p>
                    <p className="text-sm text-slate-900">{consumo.fecha}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Monto</p>
                    <p className="text-sm font-semibold text-slate-900">${consumo.monto.toLocaleString()}</p>
                  </div>
                </div>
                {consumo.userName ? (
                  <div>
                    <p className="text-xs text-slate-500">Usuario</p>
                    <p className="text-sm text-slate-900">{consumo.userName}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">Factura</p>
              {factura ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs text-emerald-700/70">Emisor</p>
                    <p className="text-sm font-semibold text-slate-900">{factura.razonSocial}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-emerald-700/70">Fecha</p>
                      <p className="text-sm text-slate-900">{factura.fecha}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700/70">Total</p>
                      <p className="text-sm font-semibold text-slate-900">${factura.total.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-emerald-700/70">Folio</p>
                      <p className="text-sm text-slate-900">{factura.folio}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700/70">Estado</p>
                      <p className="text-sm text-slate-900">{facturaStatusLabel}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">No hay factura relacionada para este consumo.</p>
              )}
            </div>
          </div>

          {showFacturaPreview && factura ? (
            <div className="border-t border-slate-200 px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Factura</h3>
                <p className="text-xs text-slate-500">Vista previa dentro del mismo modal.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTipo('PDF')}
                  disabled={!pdfPath}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    pdfPath
                      ? previewTipo === 'PDF'
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                      : 'border-slate-200 text-slate-400'
                  }`}
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTipo('XML')}
                  disabled={!xmlPath}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    xmlPath
                      ? previewTipo === 'XML'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      : 'border-slate-200 text-slate-400'
                  }`}
                >
                  XML
                </button>
                <button
                  type="button"
                  onClick={() => openFacturaAsset(previewTipo === 'XML' ? 'XML' : 'PDF', previewTipo === 'XML' ? xmlPath : pdfPath)}
                  disabled={previewTipo === 'XML' ? !xmlPath : !pdfPath}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                >
                  Abrir aparte
                </button>
              </div>
            </div>

            {previewTipo === 'XML' ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                {xmlPreviewError ? (
                  <div className="px-4 py-6 text-sm text-rose-300">{xmlPreviewError}</div>
                ) : xmlPreviewContent ? (
                  <pre className="max-h-[48vh] min-h-[360px] overflow-auto px-4 py-4 text-xs leading-5 text-emerald-100">
                    {xmlPreviewContent}
                  </pre>
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-300">Cargando XML...</div>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {pdfPreviewError ? (
                  <div className="px-4 py-6 text-sm text-rose-500">{pdfPreviewError}</div>
                ) : (
                  <iframe
                    title={`Vista previa factura ${factura.folio || factura.id}`}
                    src={pdfViewerUrl}
                    className="h-[62vh] min-h-[520px] w-full bg-white"
                  />
                )}
              </div>
            )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
          {factura ? (
            <button
              type="button"
              onClick={() => setShowFacturaPreview((current) => !current)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              {showFacturaPreview ? 'Ocultar factura' : 'Ver factura'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SubirFacturaModal({
  tipo,
  consumo,
  ticket,
  pdfFile,
  xmlFile,
  notas,
  errors,
  saving = false,
  onChangePdf,
  onChangeXml,
  onChangeNotas,
  onClose,
  onSave,
}: SubirFacturaModalProps) {
  useEscapeKey(onClose);
  const titulo = tipo === 'consumo' ? 'Efectifintech' : 'AMEX';
  const comercio = consumo?.comercio ?? ticket?.comercio ?? 'Sin comercio';
  const fecha = consumo?.fecha ?? ticket?.fecha ?? '';
  const monto = consumo?.monto ?? ticket?.monto ?? 0;
  const categoria = consumo?.categoria ?? ticket?.categoria ?? '';
  const referencia = consumo?.id ?? ticket?.id ?? '';
  const pdfError = errors?.pdf;
  const xmlError = errors?.xml;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Subir factura - {titulo}</h2>
              <p className="text-xs text-gray-500">Vincula la factura al gasto seleccionado</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                ID: {referencia}
              </span>
              {categoria && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                  {categoria}
                </span>
              )}
              {fecha && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                  {fecha}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <p className="text-base font-semibold text-slate-900">{comercio}</p>
              <p className="text-sm text-slate-600">Monto: ${monto.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Archivo PDF</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(event) => onChangePdf(event.target.files?.[0] ?? null)}
                className={`w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 ${
                  pdfError ? 'rounded-lg border border-rose-300 bg-rose-50' : ''
                }`}
              />
              {pdfFile && <p className="mt-2 text-xs text-slate-500">Seleccionado: {pdfFile.name}</p>}
              {pdfError && <p className="mt-1 text-xs text-rose-600">{pdfError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Archivo XML</label>
              <input
                type="file"
                accept=".xml"
                onChange={(event) => onChangeXml(event.target.files?.[0] ?? null)}
                className={`w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 ${
                  xmlError ? 'rounded-lg border border-rose-300 bg-rose-50' : ''
                }`}
              />
              {xmlFile && <p className="mt-2 text-xs text-slate-500">Seleccionado: {xmlFile.name}</p>}
              {xmlError && <p className="mt-1 text-xs text-rose-600">{xmlError}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notas</label>
            <textarea
              rows={3}
              value={notas}
              onChange={(event) => onChangeNotas(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Agrega comentarios o referencia..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar factura'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de Detalle de Alerta
interface AlertaDetalleModalProps {
  alerta: AlertaConciliacion;
  facturas: Factura[];
  consumos: Consumo[];
  onClose: () => void;
}

function AlertaDetalleModal({ alerta, facturas, consumos, onClose }: AlertaDetalleModalProps) {
  useEscapeKey(onClose);

  const factura = alerta.facturaId ? facturas.find(f => f.id === alerta.facturaId) : null;
  const consumo = alerta.consumoId ? consumos.find(c => c.id === alerta.consumoId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Revisión de Alerta</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className={`p-4 rounded-lg border ${
            alerta.gravedad === 'alta' ? 'bg-red-50 border-red-200' :
            alerta.gravedad === 'media' ? 'bg-yellow-50 border-yellow-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start">
              <span className="text-2xl mr-3">
                {alerta.gravedad === 'alta' ? 'Alta' : alerta.gravedad === 'media' ? 'Media' : 'Baja'}
              </span>
              <div>
                <p className="font-semibold text-gray-900">{alerta.descripcion}</p>
                <p className="text-sm text-gray-600 mt-1">Tipo: {alerta.tipo.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          {factura && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Factura Relacionada</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-600">Folio</p>
                    <p className="text-sm font-semibold">{factura.folio}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Total</p>
                    <p className="text-sm font-bold text-primary-600">${factura.total.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {consumo && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Consumo Efectifintech</h3>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm"><strong>{consumo.comercio}</strong> - ${consumo.monto.toLocaleString()}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Comentarios</label>
            <textarea
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Agregar comentarios..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
          <button onClick={onClose} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Cerrar
          </button>
          <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Resolver Alerta
          </button>
        </div>
      </div>
    </div>
  );
}
