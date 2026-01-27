import { useEffect, useMemo, useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { TicketAMEX } from '../../types';
import { TARJETAS_AMEX } from '../../data/tarjetasAMEX';
import { CUENTAS_CONTABLES } from '../../data/cuentasContables';
import { aprenderPatron, clasificarGastoAuto } from '../../utils/clasificadorContable';
import { exportToExcel, formatCurrency, formatDate } from '../../utils/exportExcel';
import { formatProyectoLabel } from '../../utils/proyectoLabel';
import ProyectoSelector from '../../components/common/ProyectoSelector';

// Mock data con todos los campos nuevos
const mockTickets: TicketAMEX[] = [
  {
    id: 't1',
    userId: 'user1',
    fecha: '2025-11-28',
    comercio: 'Marriott Cancun',
    monto: 12500,
    categoria: 'Hospedaje',
    matched: true,
    autorizado: true,
    duplicado: false,
    facturaId: 'f10',
    cardNumber: '1001',
    cardHolder: 'Francisco Aguilar',
    cuentaContable: '5450',
    proyectoId: 'PRJ-001',
    proyectoNombre: 'Obra Aeropuerto TLM',
    gsActivityId: 1,
    proyecto: 'Obra Aeropuerto TLM',
    paisComercio: 'México',
    clasificacionAuto: true,
  },
  {
    id: 't2',
    userId: 'user2',
    fecha: '2025-12-05',
    comercio: 'Uber USA',
    monto: 850,
    categoria: 'Transporte',
    matched: false,
    autorizado: true,
    duplicado: false,
    cardNumber: '1002',
    cardHolder: 'Luis Kuara',
    cuentaContable: '5450',
    proyectoId: 'PRJ-002',
    proyectoNombre: 'Proyecto Houston',
    gsActivityId: 1,
    proyecto: 'Proyecto Houston',
    paisComercio: 'USA',
    clasificacionAuto: true,
    montoUSD: 45.50,
    tipoCambio: 18.68,
    observaciones: 'Sin factura asociada',
  },
  {
    id: 't3',
    userId: 'user1',
    fecha: '2025-12-10',
    comercio: 'Office Depot',
    monto: 2800,
    categoria: 'Suministros',
    matched: true,
    autorizado: true,
    duplicado: false,
    cardNumber: '1003',
    cardHolder: 'María González',
    cuentaContable: '6090',
    gsActivityId: 19,
    paisComercio: 'México',
    clasificacionAuto: true,
    facturaId: 'f11',
  },
  {
    id: 't4',
    userId: 'user3',
    fecha: '2025-12-08',
    comercio: 'Shell Gas Station',
    monto: 800,
    categoria: 'Gasolina',
    matched: true,
    autorizado: true,
    duplicado: false,
    cardNumber: '1004',
    cardHolder: 'Carlos Mendoza',
    cuentaContable: '5450',
    proyectoId: 'PRJ-003',
    proyectoNombre: 'Supervisión Obra GDL',
    gsActivityId: 1,
    proyecto: 'Supervisión Obra GDL',
    paisComercio: 'México',
    clasificacionAuto: true,
    facturaId: 'f12',
  },
  {
    id: 't5',
    userId: 'user4',
    fecha: '2025-12-11',
    comercio: 'Amazon Business',
    monto: 3200,
    categoria: 'Electrónica',
    matched: false,
    autorizado: true,
    duplicado: false,
    cardNumber: '1005',
    cardHolder: 'Ana Martínez',
    cuentaContable: '6200',
    paisComercio: 'USA',
    clasificacionAuto: false,
    montoUSD: 170,
    tipoCambio: 18.82,
  },
  {
    id: 't6',
    userId: 'user5',
    fecha: '2025-12-09',
    comercio: 'Restaurante La Nacional',
    monto: 1450,
    categoria: 'Alimentos',
    matched: true,
    autorizado: true,
    duplicado: false,
    cardNumber: '1006',
    cardHolder: 'Roberto Sánchez',
    cuentaContable: '5450',
    proyecto: 'Reunión Cliente MTY',
    paisComercio: 'México',
    clasificacionAuto: true,
    facturaId: 'f13',
  },
];

const safeString = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeDate = (value: unknown) => {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  const raw = safeString(value);
  if (!raw) {
    return '';
  }
  const isoMatch = raw.match(/^\\d{4}-\\d{2}-\\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return '';
};

const normalizeCountry = (value: string) => {
  const normalized = value.toLowerCase();
  if (!normalized) {
    return 'Mexico';
  }
  if (['us', 'usa', 'united states', 'united states of america'].includes(normalized)) {
    return 'USA';
  }
  if (['mx', 'mex', 'mexico'].includes(normalized)) {
    return 'Mexico';
  }
  return value;
};

const formatSyncTimestamp = (value: string) => {
  if (!value) {
    return 'Sin datos';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString().replace('T', ' ').slice(0, 16);
};

const buildTicketId = (input: {
  id: string;
  cardNumber: string;
  fecha: string;
  comercio: string;
  monto: number;
}) => {
  if (input.id) {
    return input.id;
  }
  const safeMerchant = input.comercio
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return [
    'api',
    input.cardNumber || 'card',
    input.fecha || 'date',
    safeMerchant || 'merchant',
    input.monto.toFixed(2),
  ].join('-');
};

const normalizeApiTicket = (record: any): TicketAMEX | null => {
  const raw = record ?? {};
  const cardNumber = safeString(raw.cardNumber ?? raw.card_number ?? raw.card ?? raw.tarjeta ?? raw.card_last4 ?? raw.last4);
  const cardHolder = safeString(raw.cardHolder ?? raw.card_holder ?? raw.titular ?? raw.holder ?? raw.nombre);
  const comercio = safeString(raw.comercio ?? raw.merchant ?? raw.commerce ?? raw.descripcion ?? raw.descripcion_comercio);
  const categoria = safeString(raw.categoria ?? raw.category ?? raw.tipo ?? raw.concepto ?? raw.tipo_gasto);
  const fecha = normalizeDate(raw.fecha ?? raw.date ?? raw.transaction_date ?? raw.fecha_consumo);
  const facturaId = safeString(raw.facturaId ?? raw.invoice_id ?? raw.invoice ?? raw.factura);
  const proyectoId = safeString(raw.proyectoId ?? raw.project_id ?? raw.project ?? raw.proyecto);
  const proyectoNombreRaw = safeString(
    raw.proyectoNombre ?? raw.project_name ?? raw.projectName ?? raw.nombre_proyecto ?? raw.proyecto_nombre
  );

  const montoRaw = toNumber(raw.monto ?? raw.amount ?? raw.amount_mxn ?? raw.monto_mxn ?? raw.total);
  const montoUSD = toNumber(raw.montoUSD ?? raw.amount_usd ?? raw.monto_usd ?? raw.usd);
  let tipoCambio = toNumber(raw.tipoCambio ?? raw.tipo_cambio ?? raw.fx_rate ?? raw.exchange_rate);
  let monto = montoRaw;

  if ((!monto || Number.isNaN(monto)) && montoUSD && tipoCambio) {
    monto = Number((montoUSD * tipoCambio).toFixed(2));
  }

  if (!monto || Number.isNaN(monto)) {
    return null;
  }

  if (!tipoCambio && montoUSD) {
    tipoCambio = Number((monto / montoUSD).toFixed(4));
  }

  const tarjetaInfo = TARJETAS_AMEX.find((item) => item.cardNumber === cardNumber);
  const finalCardHolder = cardHolder || tarjetaInfo?.cardHolder || 'Sin titular';
  const finalComercio = comercio || 'Consumo AMEX';
  const finalCategoria = categoria || 'Sin categoria';

  const proyectoNombre = formatProyectoLabel(proyectoNombreRaw || undefined, proyectoId || undefined);
  const clasificacion = clasificarGastoAuto(finalComercio, finalCategoria, proyectoNombre || proyectoId);
  const cuentaContableRaw = safeString(raw.cuentaContable ?? raw.account_code ?? raw.cuenta ?? raw.account);
  const cuentaContable = cuentaContableRaw || clasificacion.cuentaContable;
  const clasificacionAuto = cuentaContableRaw ? false : clasificacion.esAutomatico;

  const autorizado = typeof raw.autorizado === 'boolean'
    ? raw.autorizado
    : typeof raw.authorized === 'boolean'
    ? raw.authorized
    : true;
  const duplicado = typeof raw.duplicado === 'boolean'
    ? raw.duplicado
    : typeof raw.duplicate === 'boolean'
    ? raw.duplicate
    : false;
  const matched = typeof raw.matched === 'boolean' ? raw.matched : Boolean(facturaId);

  const paisRaw = safeString(raw.paisComercio ?? raw.country ?? raw.pais ?? raw.pais_origen);
  const paisComercio = normalizeCountry(paisRaw);

  const generatedId = buildTicketId({
    id: safeString(raw.id ?? raw.ticketId ?? raw.ticket_id ?? raw.transaction_id ?? raw.uuid),
    cardNumber,
    fecha: fecha || new Date().toISOString().split('T')[0],
    comercio: finalComercio,
    monto,
  });

  return {
    id: generatedId,
    userId: safeString(raw.userId ?? raw.user_id ?? raw.usuarioId ?? 'user1') || 'user1',
    cardNumber,
    cardHolder: finalCardHolder,
    fecha: fecha || new Date().toISOString().split('T')[0],
    comercio: finalComercio,
    monto,
    montoUSD: montoUSD || undefined,
    tipoCambio: tipoCambio || undefined,
    categoria: finalCategoria,
    cuentaContable,
    proyectoId: proyectoId || undefined,
    proyectoNombre: proyectoNombre || undefined,
    gsActivityId: typeof raw.gsActivityId === 'number' ? raw.gsActivityId : undefined,
    paisComercio,
    facturaId: facturaId || undefined,
    matched,
    autorizado,
    duplicado,
    clasificacionAuto,
    observaciones: safeString(raw.observaciones ?? raw.notes ?? raw.observations) || undefined,
  };
};

const mergeTickets = (prev: TicketAMEX[], incoming: TicketAMEX[]) => {
  const existingMap = new Map(prev.map((ticket) => [ticket.id, ticket]));
  const updated: TicketAMEX[] = [];
  const seen = new Set<string>();

  incoming.forEach((ticket) => {
    const existing = existingMap.get(ticket.id);
    if (existing) {
      updated.push({
        ...ticket,
        cuentaContable: existing.cuentaContable ?? ticket.cuentaContable,
        proyectoId: existing.proyectoId ?? ticket.proyectoId,
        proyectoNombre: existing.proyectoNombre ?? ticket.proyectoNombre,
        gsActivityId: existing.gsActivityId ?? ticket.gsActivityId,
        facturaId: existing.facturaId ?? ticket.facturaId,
        matched: existing.matched ?? ticket.matched,
        autorizado: existing.autorizado ?? ticket.autorizado,
        duplicado: existing.duplicado ?? ticket.duplicado,
        clasificacionAuto: existing.clasificacionAuto ?? ticket.clasificacionAuto,
        observaciones: existing.observaciones ?? ticket.observaciones,
        montoUSD: existing.montoUSD ?? ticket.montoUSD,
        tipoCambio: existing.tipoCambio ?? ticket.tipoCambio,
      });
    } else {
      updated.push(ticket);
    }
    seen.add(ticket.id);
  });

  prev.forEach((ticket) => {
    if (!seen.has(ticket.id)) {
      updated.push(ticket);
    }
  });

  return updated.sort((a, b) => b.fecha.localeCompare(a.fecha));
};

export default function Amex() {
  const [selectedCard, setSelectedCard] = useLocalStorageState<string>('amex:selectedCard', 'all');
  const [tickets, setTickets] = useLocalStorageState<TicketAMEX[]>('amex:tickets', mockTickets);
  const [showExportModal, setShowExportModal] = useLocalStorageState('amex:showExportModal', false);
  const [showAddModal, setShowAddModal] = useLocalStorageState('amex:showAddModal', false);
  const [showFacturaModal, setShowFacturaModal] = useLocalStorageState('amex:showFacturaModal', false);
  const [facturaTicketId, setFacturaTicketId] = useLocalStorageState<string | null>('amex:facturaTicketId', null);
  const [facturaValue, setFacturaValue] = useLocalStorageState('amex:facturaValue', '');
  const [newTicket, setNewTicket] = useLocalStorageState('amex:newTicket', {
    fecha: '',
    cardNumber: '',
    cardHolder: '',
    comercio: '',
    categoria: '',
    monto: '',
    montoUSD: '',
    tipoCambio: '',
    paisComercio: 'Mexico',
    cuentaContable: '5450',
    proyectoId: '',
    proyectoNombre: '',
    facturaId: '',
    matched: false,
    autorizado: true,
    duplicado: false,
    observaciones: '',
  });
  const [showAddErrors, setShowAddErrors] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useLocalStorageState('amex:lastSyncAt', '');
  const [lastSyncError, setLastSyncError] = useLocalStorageState('amex:lastSyncError', '');
  const [isSyncing, setIsSyncing] = useState(false);

  const amexApiUrl = import.meta.env.VITE_AMEX_API_URL as string | undefined;
  const amexApiToken = import.meta.env.VITE_AMEX_API_TOKEN as string | undefined;

  useEscapeKey(() => setShowExportModal(false), showExportModal);
  useEscapeKey(() => setShowAddModal(false), showAddModal);
  useEscapeKey(() => setShowFacturaModal(false), showFacturaModal);

  // Calcular período actual (del 26 del mes pasado al 25 del mes actual)
  const getCurrentPeriod = () => {
    const today = new Date();
    const currentDay = today.getDate();

    let startDate: Date;
    let endDate: Date;

    if (currentDay >= 26) {
      // Estamos en el período actual
      startDate = new Date(today.getFullYear(), today.getMonth(), 26);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 25);
    } else {
      // Estamos en el período anterior
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 26);
      endDate = new Date(today.getFullYear(), today.getMonth(), 25);
    }

    const formatMonth = (date: Date) => {
      return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
    };

    const daysUntilClose = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      label: `${formatMonth(startDate)} - ${formatMonth(endDate)}`,
      daysUntilClose: daysUntilClose > 0 ? daysUntilClose : 0,
      isClosed: daysUntilClose <= 0,
      startDate,
      endDate
    };
  };

  const period = getCurrentPeriod();
  const parsedMonto = Number(newTicket.monto);
  const parsedMontoUSD = Number(newTicket.montoUSD);
  const parsedTipoCambio = Number(newTicket.tipoCambio);
  const requiresUsd = newTicket.paisComercio === 'USA';
  const montoInvalid = !newTicket.monto || Number.isNaN(parsedMonto) || parsedMonto <= 0;
  const montoUsdInvalid = requiresUsd
    ? !newTicket.montoUSD || Number.isNaN(parsedMontoUSD) || parsedMontoUSD <= 0
    : newTicket.montoUSD
    ? Number.isNaN(parsedMontoUSD) || parsedMontoUSD <= 0
    : false;
  const tipoCambioInvalid = newTicket.tipoCambio
    ? Number.isNaN(parsedTipoCambio) || parsedTipoCambio <= 0
    : false;
  const addErrors = showAddErrors
    ? {
      fecha: !newTicket.fecha ? 'Selecciona la fecha.' : '',
      cardNumber: !newTicket.cardNumber ? 'Selecciona la tarjeta.' : '',
      cardHolder: !newTicket.cardHolder.trim() ? 'Ingresa el titular.' : '',
      comercio: !newTicket.comercio.trim() ? 'Ingresa el comercio.' : '',
      categoria: !newTicket.categoria.trim() ? 'Ingresa la categoria.' : '',
      monto: montoInvalid
        ? newTicket.monto
          ? 'Ingresa un monto valido.'
          : 'Ingresa el monto.'
        : '',
      montoUSD: montoUsdInvalid
        ? requiresUsd
          ? 'Ingresa el monto en USD.'
          : 'Ingresa un monto USD valido.'
        : '',
      tipoCambio: tipoCambioInvalid ? 'Ingresa un tipo de cambio valido.' : '',
    }
    : {};

  const buildSyncUrl = (baseUrl: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(baseUrl, base);
    const start = period.startDate.toISOString().split('T')[0];
    const end = period.endDate.toISOString().split('T')[0];
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    return url.toString();
  };

  const syncAmexTickets = async (silent = false) => {
    if (!amexApiUrl) {
      if (!silent) {
        setLastSyncError('AMEX API no configurada');
      }
      return;
    }
    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setLastSyncError('');

    try {
      const url = buildSyncUrl(amexApiUrl);
      const headers: HeadersInit = { Accept: 'application/json' };
      if (amexApiToken) {
        headers.Authorization = `Bearer ${amexApiToken}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Sync failed (${response.status})`);
      }
      const data = await response.json();
      const records = Array.isArray(data)
        ? data
        : data?.tickets ?? data?.data ?? data?.results ?? [];

      if (!Array.isArray(records)) {
        throw new Error('Invalid AMEX API response');
      }

      const incoming = records
        .map((record: any) => normalizeApiTicket(record))
        .filter((ticket: TicketAMEX | null): ticket is TicketAMEX => Boolean(ticket));

      if (incoming.length > 0) {
        setTickets((prevTickets) => mergeTickets(prevTickets, incoming));
      }

      setLastSyncAt(new Date().toISOString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AMEX sync failed';
      setLastSyncError(message);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!amexApiUrl) {
      return;
    }
    const lastSyncTime = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
    const thirtyMinutes = 1000 * 60 * 30;
    if (lastSyncTime && Date.now() - lastSyncTime < thirtyMinutes) {
      return;
    }
    syncAmexTickets(true);
  }, [amexApiUrl, lastSyncAt]);

  // Filtrar tickets por tarjeta seleccionada
  const filteredTickets = useMemo(() => {
    if (selectedCard === 'all') return tickets;
    return tickets.filter(t => t.cardNumber === selectedCard);
  }, [tickets, selectedCard]);

  // Métricas
  const totalPeriodo = filteredTickets.reduce((sum, t) => sum + t.monto, 0);
  const ticketsMatched = filteredTickets.filter(t => Boolean(t.facturaId)).length;
  const ticketsSinMatch = filteredTickets.filter(t => !t.facturaId).length;
  const gastosNoAutorizados = filteredTickets.filter(t => !t.autorizado).length;

  // Actualizar cuenta contable de un ticket
  const handleUpdateCuentaContable = (ticketId: string, nuevaCuenta: string) => {
    setTickets(prevTickets =>
      prevTickets.map(t => {
        if (t.id === ticketId) {
          // Aprender el patrón para clasificaciones futuras
          aprenderPatron(t.comercio, t.categoria, nuevaCuenta);

          return {
            ...t,
            cuentaContable: nuevaCuenta,
            clasificacionAuto: false // Ya no es automático porque el usuario lo cambió
          };
        }
        return t;
      })
    );
  };

  const handleUpdateEstado = (ticketId: string, estado: 'autorizado' | 'no_autorizado' | 'duplicado') => {
    setTickets(prevTickets =>
      prevTickets.map(t => {
        if (t.id !== ticketId) {
          return t;
        }

        return {
          ...t,
          autorizado: estado !== 'no_autorizado',
          duplicado: estado === 'duplicado',
        };
      })
    );
  };

  const handleOpenFacturaModal = (ticket: TicketAMEX) => {
    setFacturaTicketId(ticket.id);
    setFacturaValue(ticket.facturaId || '');
    setShowFacturaModal(true);
  };

  const handleGuardarFactura = () => {
    if (!facturaTicketId) {
      return;
    }

    setTickets(prevTickets =>
      prevTickets.map(ticket => {
        if (ticket.id !== facturaTicketId) {
          return ticket;
        }

        const facturaId = facturaValue.trim();
        return {
          ...ticket,
          facturaId: facturaId || undefined,
          matched: Boolean(facturaId),
        };
      })
    );

    setShowFacturaModal(false);
    setFacturaTicketId(null);
    setFacturaValue('');
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const excelData = filteredTickets.map(t => ({
      Fecha: formatDate(t.fecha),
      Tarjeta: t.cardNumber,
      Titular: t.cardHolder,
      Comercio: t.comercio,
      Categoria: t.categoria,
      'Monto MXN': formatCurrency(t.monto),
      'Monto USD': t.montoUSD ? `$${t.montoUSD.toFixed(2)}` : 'N/A',
      'Tipo Cambio': t.tipoCambio ? t.tipoCambio.toFixed(2) : 'N/A',
      País: t.paisComercio,
      'Cuenta Contable': t.cuentaContable,
      Proyecto: t.proyecto || 'N/A',
      Factura: t.matched ? 'Sí' : 'No',
      Estado: !t.autorizado ? 'No Autorizado' : t.duplicado ? 'Duplicado' : 'Autorizado',
      Observaciones: t.observaciones || ''
    }));

    exportToExcel(
      [
        {
          name: 'Tickets AMEX',
          columns: [
            { header: 'Fecha', key: 'Fecha', width: 12 },
            { header: 'Tarjeta', key: 'Tarjeta', width: 10 },
            { header: 'Titular', key: 'Titular', width: 20 },
            { header: 'Comercio', key: 'Comercio', width: 25 },
            { header: 'Categoría', key: 'Categoria', width: 15 },
            { header: 'Monto MXN', key: 'Monto MXN', width: 15 },
            { header: 'Monto USD', key: 'Monto USD', width: 12 },
            { header: 'Tipo Cambio', key: 'Tipo Cambio', width: 12 },
            { header: 'País', key: 'País', width: 12 },
            { header: 'Cuenta Contable', key: 'Cuenta Contable', width: 15 },
            { header: 'Proyecto', key: 'Proyecto', width: 20 },
            { header: 'Factura', key: 'Factura', width: 10 },
            { header: 'Estado', key: 'Estado', width: 15 },
            { header: 'Observaciones', key: 'Observaciones', width: 30 },
          ],
          data: excelData,
        },
      ],
      `AMEX_${period.label.replace(/\s/g, '_')}_${selectedCard === 'all' ? 'Todas' : selectedCard}`
    );

    setShowExportModal(false);
  };

  const resetNewTicket = () => {
    setNewTicket({
      fecha: '',
      cardNumber: '',
      cardHolder: '',
      comercio: '',
      categoria: '',
      monto: '',
      montoUSD: '',
      tipoCambio: '',
      paisComercio: 'Mexico',
      cuentaContable: '5450',
      proyectoId: '',
      proyectoNombre: '',
      facturaId: '',
      matched: false,
      autorizado: true,
      duplicado: false,
      observaciones: '',
    });
  };
  const openAddModal = () => {
    setShowAddErrors(false);
    setShowAddModal(true);
  };
  const closeAddModal = () => {
    setShowAddModal(false);
    setShowAddErrors(false);
  };

  const handleAddTicket = () => {
    const hasErrors = !newTicket.fecha
      || !newTicket.cardNumber
      || !newTicket.cardHolder.trim()
      || !newTicket.comercio.trim()
      || !newTicket.categoria.trim()
      || montoInvalid
      || montoUsdInvalid
      || tipoCambioInvalid;

    if (hasErrors) {
      setShowAddErrors(true);
      return;
    }

    const monto = parsedMonto;
    const montoUSD = newTicket.montoUSD ? parsedMontoUSD : undefined;
    const tipoCambio = newTicket.tipoCambio ? parsedTipoCambio : undefined;

    const nuevoTicket: TicketAMEX = {
      id: `t${Date.now()}`,
      userId: 'user1',
      fecha: newTicket.fecha,
      comercio: newTicket.comercio,
      monto,
      montoUSD,
      tipoCambio,
      categoria: newTicket.categoria,
      matched: newTicket.matched,
      autorizado: newTicket.autorizado,
      duplicado: newTicket.duplicado,
      facturaId: newTicket.facturaId || undefined,
      cardNumber: newTicket.cardNumber,
      cardHolder: newTicket.cardHolder,
      cuentaContable: newTicket.cuentaContable,
      proyectoId: newTicket.proyectoId || undefined,
      proyectoNombre: newTicket.proyectoNombre || undefined,
      paisComercio: newTicket.paisComercio,
      clasificacionAuto: false,
      observaciones: newTicket.observaciones || undefined,
    };

    setTickets(prevTickets => [nuevoTicket, ...prevTickets]);
    setShowAddModal(false);
    resetNewTicket();
    setShowAddErrors(false);
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-rose-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel AMEX</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">AMEX - Tarjetas Empresariales</h1>
                <p className="text-[11px] text-slate-600">
                  Periodo: <span className="font-semibold">{period.label}</span>
                  {!period.isClosed && (
                    <span className="ml-2 text-[10px] text-blue-600">
                      {period.daysUntilClose} {period.daysUntilClose === 1 ? 'dia' : 'dias'} para cierre
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500">
                  Ultima sincronizacion: <span className="font-medium">{formatSyncTimestamp(lastSyncAt)}</span>
                  {lastSyncError && (
                    <span className="ml-2 text-red-600">Error: {lastSyncError}</span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => syncAmexTickets()}
                  disabled={isSyncing}
                  className={`px-2.5 py-1.5 text-[11px] border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors flex items-center space-x-2 hover:bg-gray-50 ${
                    isSyncing ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.01 9A7 7 0 0112 5c1.657 0 3.181.58 4.381 1.549M18.99 15A7 7 0 0112 19c-1.657 0-3.181-.58-4.381-1.549" />
                  </svg>
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar AMEX'}</span>
                </button>
                <button
                  onClick={openAddModal}
                  className="px-2.5 py-1.5 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Agregar Ticket</span>
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-2.5 py-1.5 text-[11px] bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Exportar Excel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtro de Tarjetas */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filtrar por Tarjeta
        </label>
        <select
          value={selectedCard}
          onChange={(e) => setSelectedCard(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="all">Todas las tarjetas</option>
          {TARJETAS_AMEX.filter(t => t.activa).map(tarjeta => (
            <option key={tarjeta.id} value={tarjeta.cardNumber}>
              {tarjeta.cardNumber} - {tarjeta.cardHolder} ({tarjeta.department})
            </option>
          ))}
        </select>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <MetricCard
          label="Total del Período"
          value={formatCurrency(totalPeriodo)}
          color="blue"
          icon="currency"
        />
        <MetricCard
          label="Total Tickets"
          value={filteredTickets.length}
          color="purple"
          icon="document"
        />
        <MetricCard
          label="Con Factura"
          value={ticketsMatched}
          color="green"
          icon="check"
        />
        <MetricCard
          label="Sin Factura"
          value={ticketsSinMatch}
          color="yellow"
          icon="alert"
        />
        <MetricCard
          label="No Autorizados"
          value={gastosNoAutorizados}
          color="red"
          icon="ban"
        />
      </div>

      {/* Tabla de Tickets */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Tickets AMEX</h2>
              <p className="text-sm text-gray-600 mt-1">
                {filteredTickets.length} consumos registrados
                {selectedCard !== 'all' && ` para tarjeta ${selectedCard}`}
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[20%]" />
              <col className="w-[30%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Tarjeta
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Comercio / Proyecto
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Cuenta Contable
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Factura / Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-gray-900">{formatDate(ticket.fecha)}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">{ticket.cardNumber}</p>
                      <p className="text-xs text-gray-500">{ticket.cardHolder}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{ticket.comercio}</p>
                    {ticket.observaciones && (
                      <p className="text-xs text-gray-500 mt-1">{ticket.observaciones}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                        {ticket.categoria}
                      </span>
                      <span className={`px-2 py-0.5 rounded ${
                        ticket.paisComercio === 'USA'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {ticket.paisComercio}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatProyectoLabel(ticket.proyectoNombre || ticket.proyecto, ticket.proyectoId) || 'N/A'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={ticket.cuentaContable}
                        onChange={(e) => handleUpdateCuentaContable(ticket.id, e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        {CUENTAS_CONTABLES.filter(c => c.activa).map(cuenta => (
                          <option key={cuenta.codigo} value={cuenta.codigo}>
                            {cuenta.codigo} - {cuenta.nombre}
                          </option>
                        ))}
                      </select>
                      {ticket.clasificacionAuto && (
                        <span className="text-blue-600 text-xs" title="Clasificación automática">
                          🤖
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(ticket.monto)}
                    </p>
                    {ticket.montoUSD && (
                      <p className="text-xs text-gray-500">
                        ${ticket.montoUSD.toFixed(2)} USD
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={ticket.facturaId ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                          {ticket.facturaId ? 'Factura: Sí' : 'Factura: No'}
                        </span>
                        <button
                          onClick={() => handleOpenFacturaModal(ticket)}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          {ticket.facturaId ? 'Editar' : 'Agregar'}
                        </button>
                      </div>
                      <select
                        value={ticket.duplicado ? 'duplicado' : ticket.autorizado ? 'autorizado' : 'no_autorizado'}
                        onChange={(e) => handleUpdateEstado(ticket.id, e.target.value as 'autorizado' | 'no_autorizado' | 'duplicado')}
                        className={`w-full border rounded px-2 py-1 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                          ticket.duplicado
                            ? 'bg-purple-100 text-purple-700 border-purple-200'
                            : ticket.autorizado
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                        }`}
                      >
                        <option value="autorizado">✅ Autorizado</option>
                        <option value="no_autorizado">⛔ No Autorizado</option>
                        <option value="duplicado">⚠️ Duplicado</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Exportación */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Exportar a Excel</h3>
            <p className="text-sm text-gray-600 mb-6">
              Se exportará el reporte AMEX del período <strong>{period.label}</strong>
              {selectedCard !== 'all' && (
                <> para la tarjeta <strong>{selectedCard}</strong></>
              )}.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-6">
              <p className="text-sm text-blue-800">
                📊 Se incluirán <strong>{filteredTickets.length} tickets</strong> con todas las columnas:
                Fecha, Tarjeta, Titular, Comercio, Categoría, Montos, País, Cuenta Contable, Proyecto, Factura y Estado.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={closeAddModal}
            aria-hidden="true"
          />
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Agregar Ticket AMEX</h2>
                <button
                  onClick={closeAddModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={newTicket.fecha}
                    onChange={(e) => setNewTicket({ ...newTicket, fecha: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                      addErrors.fecha
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  />
                  {addErrors.fecha && (
                    <p className="mt-1 text-xs text-rose-600">{addErrors.fecha}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarjeta *</label>
                  <select
                    value={newTicket.cardNumber}
                    onChange={(e) => {
                      const tarjeta = TARJETAS_AMEX.find(t => t.cardNumber === e.target.value);
                      setNewTicket({
                        ...newTicket,
                        cardNumber: e.target.value,
                        cardHolder: tarjeta?.cardHolder || newTicket.cardHolder,
                      });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                      addErrors.cardNumber
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                  >
                    <option value="">Seleccionar tarjeta...</option>
                    {TARJETAS_AMEX.filter(t => t.activa).map(tarjeta => (
                      <option key={tarjeta.id} value={tarjeta.cardNumber}>
                        {tarjeta.cardNumber} - {tarjeta.cardHolder}
                      </option>
                    ))}
                  </select>
                  {addErrors.cardNumber && (
                    <p className="mt-1 text-xs text-rose-600">{addErrors.cardNumber}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titular *</label>
                  <input
                    type="text"
                    value={newTicket.cardHolder}
                    onChange={(e) => setNewTicket({ ...newTicket, cardHolder: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                      addErrors.cardHolder
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    placeholder="Nombre del titular"
                  />
                  {addErrors.cardHolder && (
                    <p className="mt-1 text-xs text-rose-600">{addErrors.cardHolder}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comercio *</label>
                  <input
                    type="text"
                    value={newTicket.comercio}
                    onChange={(e) => setNewTicket({ ...newTicket, comercio: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                      addErrors.comercio
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    placeholder="Ej: Marriott Cancun"
                  />
                  {addErrors.comercio && (
                    <p className="mt-1 text-xs text-rose-600">{addErrors.comercio}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                  <input
                    type="text"
                    value={newTicket.categoria}
                    onChange={(e) => setNewTicket({ ...newTicket, categoria: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                      addErrors.categoria
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    placeholder="Ej: Hospedaje"
                  />
                  {addErrors.categoria && (
                    <p className="mt-1 text-xs text-rose-600">{addErrors.categoria}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto (MXN) *</label>
                  <input
                    type="number"
                    value={newTicket.monto}
                    onChange={(e) => setNewTicket({ ...newTicket, monto: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                      addErrors.monto
                        ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    placeholder="0.00"
                    min="0"
                  />
                  {addErrors.monto && (
                    <p className="mt-1 text-xs text-rose-600">{addErrors.monto}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pais</label>
                  <select
                    value={newTicket.paisComercio}
                    onChange={(e) => setNewTicket({ ...newTicket, paisComercio: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="Mexico">Mexico</option>
                    <option value="USA">USA</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Contable</label>
                  <select
                    value={newTicket.cuentaContable}
                    onChange={(e) => setNewTicket({ ...newTicket, cuentaContable: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    {CUENTAS_CONTABLES.filter(c => c.activa).map(cuenta => (
                      <option key={cuenta.codigo} value={cuenta.codigo}>
                        {cuenta.codigo} - {cuenta.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <ProyectoSelector
                    value={newTicket.proyectoId}
                    onChange={(proyectoId, proyecto) => setNewTicket({
                      ...newTicket,
                      proyectoId,
                      proyectoNombre: formatProyectoLabel(proyecto?.nombre, proyectoId),
                    })}
                    required={false}
                    label="Proyecto"
                    inputClassName="px-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Factura Asociada</label>
                  <input
                    type="text"
                    value={newTicket.facturaId}
                    onChange={(e) => setNewTicket({ ...newTicket, facturaId: e.target.value, matched: !!e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="ID de factura (opcional)"
                  />
                  <div className="mt-2 flex items-center space-x-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={newTicket.matched}
                      onChange={(e) => setNewTicket({ ...newTicket, matched: e.target.checked })}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <span>Factura conciliada</span>
                  </div>
                </div>
              </div>

              {newTicket.paisComercio === 'USA' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto USD</label>
                    <input
                      type="number"
                      value={newTicket.montoUSD}
                      onChange={(e) => setNewTicket({ ...newTicket, montoUSD: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                        addErrors.montoUSD
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500'
                      }`}
                      placeholder="0.00"
                      min="0"
                    />
                    {addErrors.montoUSD && (
                      <p className="mt-1 text-xs text-rose-600">{addErrors.montoUSD}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cambio</label>
                    <input
                      type="number"
                      value={newTicket.tipoCambio}
                      onChange={(e) => setNewTicket({ ...newTicket, tipoCambio: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                        addErrors.tipoCambio
                          ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                          : 'border-gray-300 focus:ring-primary-500'
                      }`}
                      placeholder="0.00"
                      min="0"
                    />
                    {addErrors.tipoCambio && (
                      <p className="mt-1 text-xs text-rose-600">{addErrors.tipoCambio}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select
                    value={newTicket.autorizado ? (newTicket.duplicado ? 'duplicado' : 'autorizado') : 'no_autorizado'}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewTicket({
                        ...newTicket,
                        autorizado: value !== 'no_autorizado',
                        duplicado: value === 'duplicado',
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="autorizado">✅ Autorizado</option>
                    <option value="no_autorizado">⛔ No Autorizado</option>
                    <option value="duplicado">⚠️ Duplicado</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                  <input
                    type="text"
                    value={newTicket.observaciones}
                    onChange={(e) => setNewTicket({ ...newTicket, observaciones: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Notas adicionales (opcional)"
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => {
                  closeAddModal();
                  resetNewTicket();
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddTicket}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Guardar Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {showFacturaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setShowFacturaModal(false)}
            aria-hidden="true"
          />
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Factura del Ticket</h3>
                <button
                  onClick={() => setShowFacturaModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Folio de Factura</label>
                <input
                  type="text"
                  value={facturaValue}
                  onChange={(e) => setFacturaValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: FAC-2025-001"
                />
                <p className="text-xs text-gray-500 mt-1">Si dejas vacio, se marcara como sin factura.</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowFacturaModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarFactura}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  icon: string;
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    blue: { accent: 'bg-blue-500', soft: 'bg-blue-100 text-blue-700' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-700' },
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-800' },
    red: { accent: 'bg-rose-500', soft: 'bg-rose-100 text-rose-700' },
    purple: { accent: 'bg-purple-500', soft: 'bg-purple-100 text-purple-700' },
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
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${palette.soft}`}>
          <div className="h-2 w-2 rounded-full bg-current"></div>
        </div>
      </div>
    </button>
  );
}
