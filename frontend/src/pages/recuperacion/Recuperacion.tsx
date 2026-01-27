import { useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { toStorageKey } from '../../utils/storage';
import type { Viatico } from '../../types';

const mockViaticosPendientes: Viatico[] = [
  {
    id: '1',
    userId: 'user1',
    userName: 'Juan Pérez',
    motivo: 'Reunión con clientes',
    destino: 'Guadalajara, Jalisco',
    fechaInicio: '2025-12-15',
    fechaFin: '2025-12-17',
    montoSolicitado: 15000,
    montoAprobado: 14000,
    montoDispersado: 14000,
    montoGastado: 12500,
    saldoRestante: 1500,
    status: 'dispersado',
    gastoFuente: 'manual',
    efectifintechStatus: 'pendiente',
    createdAt: '2025-12-10',
  },
];

const getViaticoStatusIcon = (status: Viatico['status']) => {
  const icons = {
    pendiente: 'P',
    aprobado: 'OK',
    rechazado: 'X',
    dispersado: 'D',
    en_viaje: 'V',
    viaje_finalizado: 'F',
    completado: 'C',
  };

  return icons[status as keyof typeof icons] || 'P';
};

const readStorageList = <T,>(key: string): T[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  const stored = localStorage.getItem(toStorageKey(key));
  if (!stored) {
    return [];
  }
  try {
    return JSON.parse(stored) as T[];
  } catch {
    return [];
  }
};

const writeStorageList = <T,>(key: string, value: T[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  const storageKey = toStorageKey(key);
  localStorage.setItem(storageKey, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('app-storage-change', { detail: { key: storageKey } }));
};

const getGastoSourceBadge = (viatico: Viatico) => {
  if (viatico.gastoFuente === 'efectifintech') {
    return { label: 'Efectifintech', className: 'border border-blue-200 bg-blue-50 text-blue-700' };
  }
  return { label: 'Manual', className: 'border border-slate-200 bg-slate-100 text-slate-600' };
};

const getSyncStatusBadge = (status?: Viatico['efectifintechStatus']) => {
  switch (status) {
    case 'sincronizado':
      return { label: 'Sincronizado', className: 'border border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'error':
      return { label: 'Error', className: 'border border-rose-200 bg-rose-50 text-rose-700' };
    default:
      return { label: 'Pendiente', className: 'border border-amber-200 bg-amber-50 text-amber-700' };
  }
};

const formatSyncTimestamp = (value?: string) => {
  if (!value) {
    return 'Sin sincronizar';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin sincronizar';
  }
  return parsed.toLocaleDateString('es-MX');
};

export default function Recuperacion() {
  const [viaticosPendientes, setViaticosPendientes] = useLocalStorageState<Viatico[]>('recuperacion:viaticosPendientes', mockViaticosPendientes);
  const [showRecuperacionForm, setShowRecuperacionForm] = useLocalStorageState('recuperacion:showRecuperacionForm', false);
  const [selectedViatico, setSelectedViatico] = useLocalStorageState<Viatico | null>('recuperacion:selectedViatico', null);
  const [showInfoModal, setShowInfoModal] = useLocalStorageState('recuperacion:showInfoModal', false);
  const [selectedInfoViatico, setSelectedInfoViatico] = useLocalStorageState<Viatico | null>('recuperacion:selectedInfoViatico', null);
  const [showGastoModal, setShowGastoModal] = useLocalStorageState('recuperacion:showGastoModal', false);
  const [selectedGastoViatico, setSelectedGastoViatico] = useLocalStorageState<Viatico | null>('recuperacion:selectedGastoViatico', null);
  const [gastoMonto, setGastoMonto] = useLocalStorageState('recuperacion:gastoMonto', '');
  const [showGastoErrors, setShowGastoErrors] = useState(false);
  const [filtroAnio, setFiltroAnio] = useLocalStorageState('recuperacion:filtroAnio', 'todos');
  const [filtroMes, setFiltroMes] = useLocalStorageState('recuperacion:filtroMes', 'todos');
  const [filtroDia, setFiltroDia] = useLocalStorageState('recuperacion:filtroDia', 'todos');
  const [filtroRecuperacion, setFiltroRecuperacion] = useLocalStorageState<'todos' | 'pendientes' | 'recuperados'>('recuperacion:filtroRecuperacion', 'pendientes');

  const handleRecuperar = (viatico: Viatico) => {
    setSelectedViatico(viatico);
    setShowRecuperacionForm(true);
  };

  const handleRegistrarGasto = (viatico: Viatico) => {
    setSelectedGastoViatico(viatico);
    setGastoMonto(viatico.montoGastado ? String(viatico.montoGastado) : '');
    setShowGastoErrors(false);
    setShowGastoModal(true);
  };

  const handleVerInfo = (viatico: Viatico) => {
    setSelectedInfoViatico(viatico);
    setShowInfoModal(true);
  };
  const gastoMontoValue = Number(gastoMonto);
  const gastoMontoInvalid = !Number.isFinite(gastoMontoValue) || gastoMontoValue < 0;
  const gastoMontoError = showGastoErrors && gastoMontoInvalid ? 'Ingresa un monto valido.' : '';

  const handleGuardarGasto = () => {
    if (!selectedGastoViatico) {
      return;
    }
    if (gastoMontoInvalid) {
      setShowGastoErrors(true);
      return;
    }
    const montoDispersado = selectedGastoViatico.montoDispersado ?? 0;
    const saldoRestante = Math.max(montoDispersado - gastoMontoValue, 0);
    const applyUpdate = (viatico: Viatico): Viatico => ({
      ...viatico,
      montoGastado: gastoMontoValue,
      saldoRestante,
      gastoFuente: 'manual',
      efectifintechStatus: viatico.efectifintechStatus ?? 'pendiente',
    });
    setViaticosPendientes((prev) => prev.map((viatico) => (viatico.id === selectedGastoViatico.id ? applyUpdate(viatico) : viatico)));
    ['usuario:viaticos', 'viaticos:list'].forEach((key) => {
      const list = readStorageList<Viatico>(key);
      if (!list.length) {
        return;
      }
      const next = list.map((viatico) => (viatico.id === selectedGastoViatico.id ? applyUpdate(viatico) : viatico));
      writeStorageList(key, next);
    });
    setShowGastoModal(false);
    setSelectedGastoViatico(null);
    setGastoMonto('');
    setShowGastoErrors(false);
  };

  const handleConfirmarRecuperacion = (viatico: Viatico, comentarios: string) => {
    const nextComentarios = comentarios.trim();
    const updatedRecord: Viatico = {
      ...viatico,
      comentarios: nextComentarios || viatico.comentarios,
      saldoRestante: 0,
      status: 'completado',
    };
    setViaticosPendientes((prev) => prev.map((item) => (item.id === viatico.id ? updatedRecord : item)));
    ['usuario:viaticos', 'viaticos:list'].forEach((key) => {
      const list = readStorageList<Viatico>(key);
      if (!list.length) {
        return;
      }
      const next = list.map((item) => (item.id === viatico.id ? { ...item, ...updatedRecord } : item));
      writeStorageList(key, next);
    });
  };

  const isRecuperado = (viatico: Viatico) => (viatico.status === 'completado' || (viatico.saldoRestante ?? 0) === 0);

  const getDateParts = (viatico: Viatico) => {
    const value = viatico.fechaInicio || viatico.createdAt;
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return {
      anio: String(parsed.getFullYear()),
      mes: String(parsed.getMonth() + 1).padStart(2, '0'),
      dia: String(parsed.getDate()).padStart(2, '0'),
    };
  };

  const opcionesAnio = Array.from(
    new Set(
      viaticosPendientes
        .map(getDateParts)
        .filter(Boolean)
        .map((parts) => (parts as { anio: string }).anio)
    )
  ).sort();
  const opcionesMes = Array.from(
    new Set(
      viaticosPendientes
        .map(getDateParts)
        .filter(Boolean)
        .map((parts) => (parts as { mes: string }).mes)
    )
  ).sort();
  const opcionesDia = Array.from(
    new Set(
      viaticosPendientes
        .map(getDateParts)
        .filter(Boolean)
        .map((parts) => (parts as { dia: string }).dia)
    )
  ).sort((a, b) => Number(a) - Number(b));

  const viaticosFiltrados = viaticosPendientes.filter((viatico) => {
    const parts = getDateParts(viatico);
    if (!parts) {
      return filtroAnio === 'todos' && filtroMes === 'todos' && filtroDia === 'todos';
    }
    if (filtroRecuperacion === 'pendientes' && isRecuperado(viatico)) {
      return false;
    }
    if (filtroRecuperacion === 'recuperados' && !isRecuperado(viatico)) {
      return false;
    }
    if (filtroAnio !== 'todos' && parts.anio !== filtroAnio) {
      return false;
    }
    if (filtroMes !== 'todos' && parts.mes !== filtroMes) {
      return false;
    }
    if (filtroDia !== 'todos' && parts.dia !== filtroDia) {
      return false;
    }
    return true;
  });

  const totalPendientes = viaticosPendientes.filter((viatico) => !isRecuperado(viatico)).length;
  const totalRecuperados = viaticosPendientes.filter((viatico) => isRecuperado(viatico)).length;
  const totalRecuperar = viaticosPendientes
    .filter((viatico) => !isRecuperado(viatico))
    .reduce((sum, viatico) => sum + (viatico.saldoRestante || 0), 0);

  const getRecuperacionBadge = (viatico: Viatico) => {
    if (isRecuperado(viatico)) {
      return {
        label: 'Recuperado',
        className: 'bg-emerald-100 text-emerald-700',
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ),
      };
    }
    return {
      label: 'En recuperacion',
      className: 'bg-amber-100 text-amber-700',
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    };
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-orange-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-amber-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Recuperacion</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Recuperacion de Saldos</h1>
                <p className="text-[11px] text-slate-600">Gestion de recuperacion de fondos no utilizados.</p>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">Saldos pendientes</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">Actualizacion manual</span>
                </div>
                <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 p-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setFiltroRecuperacion('todos')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
                      filtroRecuperacion === 'todos'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Todos ({viaticosPendientes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroRecuperacion('pendientes')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
                      filtroRecuperacion === 'pendientes'
                        ? 'bg-amber-500 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Pendientes ({totalPendientes})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroRecuperacion('recuperados')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
                      filtroRecuperacion === 'recuperados'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Recuperados ({totalRecuperados})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">RC</span>
                  <div>
                    <p className="font-semibold text-slate-900">Tesoreria</p>
                    <p>Control de recuperaciones</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[10px] text-slate-600 shadow-sm">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10M8 3h8l1 3H7l1-3zm2 6h4v8h-4V9z" />
                    </svg>
                    Filtros
                  </span>
                  <select
                    value={filtroAnio}
                    onChange={(event) => setFiltroAnio(event.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700"
                  >
                    <option value="todos">Todos los años</option>
                    {opcionesAnio.map((anio) => (
                      <option key={anio} value={anio}>{anio}</option>
                    ))}
                  </select>
                  <select
                    value={filtroMes}
                    onChange={(event) => setFiltroMes(event.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700"
                  >
                    <option value="todos">Todos los meses</option>
                    {opcionesMes.map((mes) => (
                      <option key={mes} value={mes}>{mes}</option>
                    ))}
                  </select>
                  <select
                    value={filtroDia}
                    onChange={(event) => setFiltroDia(event.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700"
                  >
                    <option value="todos">Todos los dias</option>
                    {opcionesDia.map((dia) => (
                      <option key={dia} value={dia}>{dia}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[10px] shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-slate-500">Pendientes de Recuperar</p>
                    <p className="text-base font-semibold text-slate-900">{totalPendientes}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[10px] shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-slate-500">Total a Recuperar</p>
                    <p className="text-base font-semibold text-slate-900">${totalRecuperar.toLocaleString()}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[10px] shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-slate-500">Recuperado Este Mes</p>
                    <p className="text-base font-semibold text-slate-900">$8,400</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Viaticos con Saldo Pendiente</h2>
          <p className="text-sm text-gray-600 mt-1">Viajes finalizados con fondos por recuperar</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Viático
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Dispersado
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Gastado
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo a Recuperar
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {viaticosFiltrados.map((viatico) => (
                <tr key={viatico.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold">
                        {viatico.userName.charAt(0)}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{viatico.userName}</p>
                        <p className="text-xs text-gray-500">ID: {viatico.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900 flex items-center gap-2">
                      <span className="text-sm">{getViaticoStatusIcon(viatico.status)}</span>
                      <span>{viatico.motivo}</span>
                    </p>
                    <p className="text-xs text-gray-500">{viatico.destino}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm text-gray-900">${viatico.montoDispersado?.toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm text-gray-900">${viatico.montoGastado?.toLocaleString()}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${getGastoSourceBadge(viatico).className}`}>
                        {getGastoSourceBadge(viatico).label}
                      </span>
                      {viatico.efectifintechStatus && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${getSyncStatusBadge(viatico.efectifintechStatus).className}`}>
                          {getSyncStatusBadge(viatico.efectifintechStatus).label}
                        </span>
                      )}
                      <span className="text-slate-400">Ultima sync: {formatSyncTimestamp(viatico.efectifintechLastSyncAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-bold text-orange-600">${viatico.saldoRestante?.toLocaleString()}</p>
                    <div className="mt-1">
                      {(() => {
                        const badge = getRecuperacionBadge(viatico);
                        return (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                            {badge.icon}
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                    <div className="grid grid-cols-2 gap-2 min-w-[220px]">
                      <button
                        onClick={() => handleVerInfo(viatico)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Informacion
                      </button>
                      <button
                        onClick={() => handleRegistrarGasto(viatico)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4h2m-1 0v4m-3 4h6m-6 0a2 2 0 00-2 2v6h10v-6a2 2 0 00-2-2m-6 0h6" />
                        </svg>
                        Registrar gasto
                      </button>
                      <button
                        onClick={() => handleRecuperar(viatico)}
                        className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Recuperar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showGastoModal && selectedGastoViatico && (
        <MontoGastadoModal
          viatico={selectedGastoViatico}
          montoGastado={gastoMonto}
          montoError={gastoMontoError}
          onChangeMonto={setGastoMonto}
          onClose={() => {
            setShowGastoModal(false);
            setSelectedGastoViatico(null);
            setGastoMonto('');
            setShowGastoErrors(false);
          }}
          onSave={handleGuardarGasto}
        />
      )}

      {showRecuperacionForm && selectedViatico && (
        <RecuperacionModal
          viatico={selectedViatico}
          onConfirm={handleConfirmarRecuperacion}
          onClose={() => {
            setShowRecuperacionForm(false);
            setSelectedViatico(null);
          }}
        />
      )}

      {showInfoModal && selectedInfoViatico && (
        <InfoViaticoModal
          viatico={selectedInfoViatico}
          onClose={() => {
            setShowInfoModal(false);
            setSelectedInfoViatico(null);
          }}
        />
      )}
    </div>
  );
}

interface RecuperacionModalProps {
  viatico: Viatico;
  onConfirm: (viatico: Viatico, comentarios: string) => void;
  onClose: () => void;
}

interface MontoGastadoModalProps {
  viatico: Viatico;
  montoGastado: string;
  montoError?: string;
  onChangeMonto: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

interface InfoViaticoModalProps {
  viatico: Viatico;
  onClose: () => void;
}

function MontoGastadoModal({
  viatico,
  montoGastado,
  montoError,
  onChangeMonto,
  onClose,
  onSave,
}: MontoGastadoModalProps) {
  useEscapeKey(onClose);

  const montoDispersado = viatico.montoDispersado ?? 0;
  const parsedMonto = Number(montoGastado);
  const saldoCalculado = Number.isFinite(parsedMonto)
    ? Math.max(montoDispersado - parsedMonto, 0)
    : viatico.saldoRestante ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-lg w-full"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Registrar monto gastado</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-600">Viatico:</p>
            <p className="font-medium text-slate-900">{viatico.motivo}</p>
            <p className="text-xs text-slate-500">{viatico.destino}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div>
                <p>Dispersado</p>
                <p className="text-sm font-semibold text-slate-900">${montoDispersado.toLocaleString()}</p>
              </div>
              <div>
                <p>Saldo actual</p>
                <p className="text-sm font-semibold text-orange-600">${(viatico.saldoRestante ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Monto gastado</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                min="0"
                value={montoGastado}
                onChange={(event) => onChangeMonto(event.target.value)}
                className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 ${
                  montoError
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-200 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-transparent'
                }`}
                placeholder="0.00"
              />
            </div>
            {montoError && (
              <p className="mt-1 text-xs text-rose-600">{montoError}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Saldo restante estimado: <span className="font-semibold text-orange-600">${saldoCalculado.toLocaleString()}</span>
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Integracion Efectifintech</p>
            <p className="mt-1">Este monto se reemplazara cuando el backend sincronice los consumos reales.</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${getGastoSourceBadge(viatico).className}`}>
                {getGastoSourceBadge(viatico).label}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${getSyncStatusBadge(viatico.efectifintechStatus).className}`}>
                {getSyncStatusBadge(viatico.efectifintechStatus).label}
              </span>
              <span className="text-slate-400">Ultima sync: {formatSyncTimestamp(viatico.efectifintechLastSyncAt)}</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Guardar gasto
          </button>
        </div>
      </div>
    </div>
  );
}

function RecuperacionModal({ viatico, onConfirm, onClose }: RecuperacionModalProps) {
  useEscapeKey(onClose);
  const montoRecuperar = viatico.saldoRestante ?? 0;
  const [comentarios, setComentarios] = useState(viatico.comentarios ?? '');
  const handleAbrirEfectivale = () => {
    const url = 'https://www.efectivalefintech.com.mx/';
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const handleConfirmar = () => {
    onConfirm(viatico, comentarios);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Recuperar Saldo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">Resumen del Viático</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Usuario:</p>
                <p className="font-medium text-gray-900">{viatico.userName}</p>
              </div>
              <div>
                <p className="text-gray-600">ID Viático:</p>
                <p className="font-medium text-gray-900">{viatico.id}</p>
              </div>
              <div>
                <p className="text-gray-600">Motivo:</p>
                <p className="font-medium text-gray-900">{viatico.motivo}</p>
              </div>
              <div>
                <p className="text-gray-600">Destino:</p>
                <p className="font-medium text-gray-900">{viatico.destino}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-600">Dispersado</p>
                  <p className="text-lg font-bold text-blue-600">${viatico.montoDispersado?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Gastado</p>
                  <p className="text-lg font-bold text-green-600">${viatico.montoGastado?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">A Recuperar</p>
                  <p className="text-lg font-bold text-orange-600">${viatico.saldoRestante?.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Confirmacion de recuperacion</p>
            <p className="mt-1">
              Se recuperara un total de <span className="font-semibold text-orange-600">${montoRecuperar.toLocaleString()}</span>.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Usa el boton de Efectivale si necesitas completar el proceso externo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Comentarios</label>
            <textarea
              rows={3}
              value={comentarios}
              onChange={(event) => setComentarios(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Notas o detalles de la recuperacion..."
            />
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            className="inline-flex items-center gap-2 px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Confirmar recuperacion
          </button>
          <button
            type="button"
            onClick={handleAbrirEfectivale}
            className="inline-flex items-center gap-2 px-6 py-2 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h6m0 0v6m0-6L10 16m-1 3H5a2 2 0 01-2-2V7a2 2 0 012-2h4" />
            </svg>
            Abrir Efectivale
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoViaticoModal({ viatico, onClose }: InfoViaticoModalProps) {
  useEscapeKey(onClose);
  const gastoBadge = getGastoSourceBadge(viatico);
  const syncBadge = getSyncStatusBadge(viatico.efectifintechStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Informacion del Viatico</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">Resumen del Viatico</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Usuario:</p>
                <p className="font-medium text-gray-900">{viatico.userName}</p>
              </div>
              <div>
                <p className="text-gray-600">ID Viatico:</p>
                <p className="font-medium text-gray-900">{viatico.id}</p>
              </div>
              <div>
                <p className="text-gray-600">Motivo:</p>
                <p className="font-medium text-gray-900">{viatico.motivo}</p>
              </div>
              <div>
                <p className="text-gray-600">Destino:</p>
                <p className="font-medium text-gray-900">{viatico.destino}</p>
              </div>
              <div>
                <p className="text-gray-600">Fechas:</p>
                <p className="font-medium text-gray-900">
                  {viatico.fechaInicio} - {viatico.fechaFin}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Proyecto:</p>
                <p className="font-medium text-gray-900">{viatico.proyectoNombre ?? 'Sin proyecto'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-600">Dispersado</p>
              <p className="text-lg font-bold text-blue-600">${viatico.montoDispersado?.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-600">Gastado</p>
              <p className="text-lg font-bold text-green-600">${viatico.montoGastado?.toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-[10px]">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${gastoBadge.className}`}>
                  {gastoBadge.label}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${syncBadge.className}`}>
                  {syncBadge.label}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Ultima sync: {formatSyncTimestamp(viatico.efectifintechLastSyncAt)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-600">A Recuperar</p>
              <p className="text-lg font-bold text-orange-600">${viatico.saldoRestante?.toLocaleString()}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Comentarios</p>
            <p className="mt-2">{viatico.comentarios?.trim() ? viatico.comentarios : 'Sin comentarios.'}</p>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
