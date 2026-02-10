export interface ViaticoExtensionRequest {
  requestId: string;
  requestedAt: string;
  requestedById?: string;
  requestedByName?: string;
  fechaFinActual: string;
  nuevaFechaFin: string;
  desayunos: number;
  comidas: number;
  cenas: number;
  montoCapturado: number;
}

export interface ViaticoExtensionResolution {
  status: 'aprobada' | 'rechazada';
  resolvedAt: string;
}

const EXT_REQ_START = '[[EXT_REQ]]';
const EXT_REQ_END = '[[/EXT_REQ]]';

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toString = (value: unknown) => (typeof value === 'string' ? value : '');

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getPendingViaticoExtension = (comentarios?: string) => {
  if (!comentarios) {
    return null;
  }

  const start = comentarios.lastIndexOf(EXT_REQ_START);
  if (start < 0) {
    return null;
  }
  const end = comentarios.indexOf(EXT_REQ_END, start);
  if (end < 0) {
    return null;
  }

  const raw = comentarios.slice(start + EXT_REQ_START.length, end).trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ViaticoExtensionRequest>;
    const fechaFinActual = toString(parsed.fechaFinActual);
    const nuevaFechaFin = toString(parsed.nuevaFechaFin);
    if (!fechaFinActual || !nuevaFechaFin) {
      return null;
    }

    return {
      requestId: toString(parsed.requestId) || `EXT-${Date.now()}`,
      requestedAt: toString(parsed.requestedAt) || new Date().toISOString(),
      requestedById: toString(parsed.requestedById) || undefined,
      requestedByName: toString(parsed.requestedByName) || undefined,
      fechaFinActual,
      nuevaFechaFin,
      desayunos: toNumber(parsed.desayunos),
      comidas: toNumber(parsed.comidas),
      cenas: toNumber(parsed.cenas),
      montoCapturado: toNumber(parsed.montoCapturado),
    };
  } catch {
    return null;
  }
};

export const removePendingViaticoExtension = (comentarios?: string) => {
  if (!comentarios) {
    return '';
  }

  const pattern = new RegExp(`${escapeRegex(EXT_REQ_START)}[\\s\\S]*?${escapeRegex(EXT_REQ_END)}`, 'g');
  return comentarios.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trim();
};

export const withPendingViaticoExtension = (comentarios: string | undefined, request: ViaticoExtensionRequest) => {
  const clean = removePendingViaticoExtension(comentarios);
  const marker = `${EXT_REQ_START}${JSON.stringify(request)}${EXT_REQ_END}`;
  return clean ? `${clean}\n${marker}` : marker;
};

export const appendViaticoComment = (comentarios: string | undefined, note: string) => {
  const clean = (comentarios || '').trim();
  const nextNote = note.trim();
  if (!nextNote) {
    return clean;
  }
  return clean ? `${clean}\n${nextNote}` : nextNote;
};

export const getLatestViaticoExtensionResolution = (
  comentarios?: string
): ViaticoExtensionResolution | null => {
  if (!comentarios) {
    return null;
  }

  const pattern = /Extension (aprobada|rechazada) \(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  let latest: ViaticoExtensionResolution | null = null;

  match = pattern.exec(comentarios);
  while (match) {
    latest = {
      status: match[1] === 'aprobada' ? 'aprobada' : 'rechazada',
      resolvedAt: match[2],
    };
    match = pattern.exec(comentarios);
  }

  return latest;
};
