import { useEffect, useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import useAuth from '../../hooks/useAuth';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { Dispersion as DispersionType, Viatico } from '../../types';
import { createDispersion, syncCoreAppData, updateViatico } from '../../utils/backendSync';


const esDestinoExtranjero = (viatico: Viatico) => viatico.destinoPais === 'USA' || viatico.destinoPais === 'Otro';

const formatUsd = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function Dispersion() {
  const { user } = useAuth();
  const [viaticosPendientes, setViaticosPendientes] = useLocalStorageState<Viatico[]>('dispersion:viaticosPendientes', []);
  const [dispersiones, setDispersiones] = useLocalStorageState<DispersionType[]>('dispersion:dispersiones', []);
  const [showConfirmacionModal, setShowConfirmacionModal] = useLocalStorageState('dispersion:showConfirmacionModal', false);
  const [selectedViatico, setSelectedViatico] = useLocalStorageState<Viatico | null>('dispersion:selectedViatico', null);
  const [filtroAnio, setFiltroAnio] = useLocalStorageState<string>('dispersion:filtroAnio', '2025');
  const [filtroMes, setFiltroMes] = useLocalStorageState<string>('dispersion:filtroMes', '');
  const [filtroDia, setFiltroDia] = useLocalStorageState<string>('dispersion:filtroDia', '');
  const [tipoCambioUSD, setTipoCambioUSD] = useLocalStorageState<number>('dispersion:tipoCambioUSD', 17.0);
  const [tipoCambioUpdatedAt, setTipoCambioUpdatedAt] = useLocalStorageState<string>(
    'dispersion:tipoCambioUpdatedAt',
    new Date().toISOString()
  );

  const handleAbrirEfectifintech = () => {
    // Abrir Efectifintech en nueva pestaña
    window.open('https://www.efectivalefintech.com.mx/', '_blank');
  };

  const handleConfirmarDispersion = (viatico: Viatico) => {
    setSelectedViatico(viatico);
    setShowConfirmacionModal(true);
  };

  const setTipoCambio = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    setTipoCambioUSD(value);
    setTipoCambioUpdatedAt(new Date().toISOString());
  };

  const getViaticoStatusIcon = (status: Viatico['status']) => {
    const icons = {
      pendiente: '⏳',
      aprobado: '✅',
      rechazado: '⛔',
      dispersado: '💸',
      en_viaje: '🧭',
      viaje_finalizado: '🏁',
      completado: '🏁',
    };

    return icons[status as keyof typeof icons] || '⏳';
  };

  useEffect(() => {
    const shouldRefresh = () => {
      if (!tipoCambioUpdatedAt) {
        return true;
      }
      const last = new Date(tipoCambioUpdatedAt).getTime();
      if (Number.isNaN(last)) {
        return true;
      }
      const twelveHours = 1000 * 60 * 60 * 12;
      return Date.now() - last > twelveHours;
    };

    if (!shouldRefresh()) {
      return;
    }

    let isActive = true;

    const fetchTipoCambio = async () => {
      try {
        const response = await fetch('https://api.exchangerate.host/latest?base=MXN&symbols=USD');
        if (!response.ok) {
          throw new Error('Failed to fetch exchange rate');
        }
        const data = await response.json();
        const rate = data?.rates?.USD;
        if (typeof rate === 'number' && rate > 0 && isActive) {
          const nextValue = Number((1 / rate).toFixed(4));
          setTipoCambio(nextValue);
        }
      } catch {
        // ignore and keep last stored value
      }
    };

    fetchTipoCambio();

    return () => {
      isActive = false;
    };
  }, [tipoCambioUpdatedAt]);

  const handleGuardarDispersion = async (payload: {
    metodoPago: 'transferencia' | 'tarjeta';
    status: 'dispersado' | 'en_viaje' | 'viaje_finalizado';
    notas: string;
    moneda?: 'MXN' | 'USD';
    tipoCambioUSD?: number;
    montoUSD?: number;
    montoDispersado?: number;
  }) => {
    if (!selectedViatico) {
      return;
    }

    const montoAprobado = selectedViatico.montoAprobado ?? selectedViatico.montoSolicitado;
    const montoDispersadoPrevio = selectedViatico.montoDispersado ?? 0;
    const montoPendiente = Math.max(montoAprobado - montoDispersadoPrevio, 0);
    const montoDispersadoActual = payload.montoDispersado && payload.montoDispersado > 0
      ? payload.montoDispersado
      : montoPendiente > 0
        ? montoPendiente
        : montoAprobado;
    const montoDispersadoTotal = Number((montoDispersadoPrevio + montoDispersadoActual).toFixed(2));
    const montoUSD = payload.moneda === 'USD' && payload.tipoCambioUSD
      ? Number((montoDispersadoActual / payload.tipoCambioUSD).toFixed(2))
      : payload.montoUSD;
    try {
      const createdDispersion = await createDispersion({
        viaticoId: selectedViatico.id,
        monto: montoDispersadoActual,
        metodoPago: payload.metodoPago,
        moneda: payload.moneda ?? 'MXN',
        tipoCambio: payload.tipoCambioUSD,
        montoUSD,
        referencia: `DISP-${Date.now()}`,
        dispersadoPor: user?.full_name || 'Tesoreria',
        notas: payload.notas,
      });

      const updatedViatico = await updateViatico(selectedViatico.id, {
        status: payload.status,
        montoAprobado: selectedViatico.montoAprobado ?? selectedViatico.montoSolicitado,
        montoDispersado: montoDispersadoTotal,
        comentarios: payload.notas || selectedViatico.comentarios,
      });

      setDispersiones((prev) => [createdDispersion, ...prev]);
      setViaticosPendientes((prev) => prev.filter((viatico) => viatico.id !== updatedViatico.id));
      void syncCoreAppData({ userId: updatedViatico.userId }).catch(() => {});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar la dispersión.');
    }
  };

  const hoy = new Date().toISOString().split('T')[0];
  const dispersadosHoy = dispersiones.filter(
    (dispersion) => dispersion.confirmado && dispersion.fecha === hoy
  ).length;
  const totalDispersado = dispersiones.reduce(
    (sum, dispersion) => sum + (dispersion.confirmado ? dispersion.monto : 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Dispersión</p>
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Dispersión de Viáticos</h1>
                <p className="text-[11px] text-slate-600">Gestión de dispersión de fondos aprobados.</p>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">
                    Actualizado en tiempo real
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5">
                    Fuente: Portal PM
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                  MX
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Tesoreria</p>
                  <p>Control de dispersiones</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <MetricCard
                label="Pendientes de Dispersar"
                value={viaticosPendientes.length}
                color="yellow"
                icon="clock"
              />
              <MetricCard
                label="Dispersados Hoy"
                value={dispersadosHoy}
                color="green"
                icon="check"
              />
              <MetricCard
                label="Total Dispersado"
                value={`$${totalDispersado.toLocaleString()}`}
                color="blue"
                icon="money"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Viáticos Pendientes de Dispersar</h2>
          <p className="text-sm text-gray-600 mt-1">Viáticos aprobados listos para dispersión</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Solicitante
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Motivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destino
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Aprobado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha Viaje
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {viaticosPendientes.map((viatico) => {
                const montoAprobado = viatico.montoAprobado ?? viatico.montoSolicitado;
                const esExtranjero = esDestinoExtranjero(viatico);
                const safeTipoCambio = tipoCambioUSD > 0 ? tipoCambioUSD : 1;
                const montoUSD = esExtranjero ? montoAprobado / safeTipoCambio : null;

                return (
                  <tr key={viatico.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold">
                        {viatico.userName.charAt(0)}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          <span className="text-sm">{getViaticoStatusIcon(viatico.status)}</span>
                          <span>{viatico.userName}</span>
                        </p>
                        <p className="text-xs text-gray-500">ID: {viatico.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{viatico.motivo}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{viatico.destino}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {esExtranjero ? (
                      <>
                        <p className="text-sm font-semibold text-blue-700">
                          USD ${formatUsd(montoUSD || 0)}
                        </p>
                        <p className="text-xs text-gray-500">
                          MXN ${montoAprobado.toLocaleString()} | TC {tipoCambioUSD.toFixed(2)}
                        </p>
                        <span className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          Viaje al extranjero
                        </span>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-green-600">
                        ${montoAprobado.toLocaleString()}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">{viatico.fechaInicio}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={handleAbrirEfectifintech}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Ir a Efectifintech
                      </button>
                      <button
                        onClick={() => handleConfirmarDispersion(viatico)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Confirmar Dispersión
                      </button>
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Historial de Dispersiones</h2>
              <p className="text-sm text-gray-600 mt-1">Últimas dispersiones realizadas</p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <select
                value={filtroAnio}
                onChange={(e) => setFiltroAnio(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Todos los años</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
              </select>
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Todos los meses</option>
                <option value="01">Enero</option>
                <option value="02">Febrero</option>
                <option value="03">Marzo</option>
                <option value="04">Abril</option>
                <option value="05">Mayo</option>
                <option value="06">Junio</option>
                <option value="07">Julio</option>
                <option value="08">Agosto</option>
                <option value="09">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </select>
              <select
                value={filtroDia}
                onChange={(e) => setFiltroDia(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Todos los días</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(dia => (
                  <option key={dia} value={dia.toString().padStart(2, '0')}>
                    {dia}
                  </option>
                ))}
              </select>
              {(filtroAnio || filtroMes || filtroDia) && (
                <button
                  onClick={() => {
                    setFiltroAnio('');
                    setFiltroMes('');
                    setFiltroDia('');
                  }}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {dispersiones
              .filter(dispersion => {
                if (!filtroAnio && !filtroMes && !filtroDia) return true;
                const fecha = dispersion.fecha;
                const [anio, mes, dia] = fecha.split('-');

                if (filtroAnio && anio !== filtroAnio) return false;
                if (filtroMes && mes !== filtroMes) return false;
                if (filtroDia && dia !== filtroDia) return false;

                return true;
              })
              .map((dispersion) => (
                <DispersionCard key={dispersion.id} dispersion={dispersion} />
              ))}
          </div>
          {dispersiones.filter(dispersion => {
            if (!filtroAnio && !filtroMes && !filtroDia) return true;
            const fecha = dispersion.fecha;
            const [anio, mes, dia] = fecha.split('-');

            if (filtroAnio && anio !== filtroAnio) return false;
            if (filtroMes && mes !== filtroMes) return false;
            if (filtroDia && dia !== filtroDia) return false;

            return true;
          }).length === 0 && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No se encontraron dispersiones</h3>
              <p className="text-gray-600">Intenta ajustar los filtros para ver más resultados</p>
            </div>
          )}
        </div>
      </div>

      {showConfirmacionModal && selectedViatico && (
        <ConfirmacionDispersionModal
          viatico={selectedViatico}
          onConfirm={handleGuardarDispersion}
          tipoCambioUSD={tipoCambioUSD}
          tipoCambioUpdatedAt={tipoCambioUpdatedAt}
          onClose={() => {
            setShowConfirmacionModal(false);
            setSelectedViatico(null);
          }}
        />
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  color: 'yellow' | 'green' | 'blue';
  icon: string;
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorClasses = {
    yellow: { accent: 'bg-amber-500', soft: 'bg-amber-100 text-amber-800' },
    green: { accent: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-800' },
    blue: { accent: 'bg-sky-500', soft: 'bg-sky-100 text-sky-800' },
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </button>
  );
}

interface DispersionCardProps {
  dispersion: DispersionType;
}

function DispersionCard({ dispersion }: DispersionCardProps) {
  const dispersionStatusIcon = dispersion.confirmado ? '✅' : '⏳';
  const showUsd = dispersion.moneda === 'USD' && typeof dispersion.montoUSD === 'number';
  const tipoCambioLabel = dispersion.tipoCambio ? dispersion.tipoCambio.toFixed(2) : 'N/A';
  const formatUsdLocal = (value: number) =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-gray-900 flex items-center gap-2">
            <span className="text-sm">{dispersionStatusIcon}</span>
            <span>Dispersión #{dispersion.id}</span>
          </p>
          <p className="text-sm text-gray-600">Viático ID: {dispersion.viaticoId}</p>
          <p className="text-xs text-gray-500 mt-1">
            {dispersion.metodoPago.toUpperCase()} - {dispersion.referencia}
          </p>
        </div>
      </div>
      <div className="text-right">
        {showUsd ? (
          <>
            <p className="text-lg font-bold text-blue-700">USD ${formatUsdLocal(dispersion.montoUSD || 0)}</p>
            <p className="text-xs text-gray-500">
              MXN ${dispersion.monto.toLocaleString()} | TC {tipoCambioLabel}
            </p>
          </>
        ) : (
          <p className="text-lg font-bold text-green-600">${dispersion.monto.toLocaleString()}</p>
        )}
        <p className="text-xs text-gray-500">{dispersion.fecha}</p>
        <p className="text-xs text-gray-600 mt-1">Por: {dispersion.dispersadoPor}</p>
      </div>
    </div>
  );
}

interface ConfirmacionDispersionModalProps{
  viatico: Viatico;
  onConfirm: (payload: {
    metodoPago: 'transferencia' | 'tarjeta';
    status: 'dispersado' | 'en_viaje' | 'viaje_finalizado';
    notas: string;
    moneda?: 'MXN' | 'USD';
    tipoCambioUSD?: number;
    montoUSD?: number;
    montoDispersado?: number;
  }) => void;
  tipoCambioUSD: number;
  tipoCambioUpdatedAt: string;
  onClose: () => void;
}

function ConfirmacionDispersionModal({
  viatico,
  onConfirm,
  tipoCambioUSD,
  tipoCambioUpdatedAt,
  onClose,
}: ConfirmacionDispersionModalProps) {
  useEscapeKey(onClose);

  const [metodoPago, setMetodoPago] = useState<'transferencia' | 'tarjeta'>('transferencia');
  const [notas, setNotas] = useState('');
  const esExtranjero = esDestinoExtranjero(viatico);
  const [aplicaTipoCambio, setAplicaTipoCambio] = useState(esExtranjero);
  const montoAprobado = viatico.montoAprobado ?? viatico.montoSolicitado;
  const montoDispersadoPrevio = viatico.montoDispersado ?? 0;
  const montoPendiente = Math.max(montoAprobado - montoDispersadoPrevio, 0);
  const safeTipoCambio = tipoCambioUSD > 0 ? tipoCambioUSD : 1;
  const [montoDispersado, setMontoDispersado] = useState<number>(montoPendiente > 0 ? montoPendiente : montoAprobado);
  const montoUSD = aplicaTipoCambio ? montoAprobado / safeTipoCambio : null;
  const montoDispersadoUSD = aplicaTipoCambio ? montoDispersado / safeTipoCambio : null;
  const tipoCambioLabel = tipoCambioUpdatedAt
    ? new Date(tipoCambioUpdatedAt).toLocaleDateString()
    : '';

  const handleGuardar = () => {
    onConfirm({
      metodoPago,
      status: 'dispersado',
      notas,
      moneda: aplicaTipoCambio ? 'USD' : 'MXN',
      tipoCambioUSD: aplicaTipoCambio ? tipoCambioUSD : undefined,
      montoUSD: aplicaTipoCambio && montoUSD ? Number(montoUSD.toFixed(2)) : undefined,
      montoDispersado,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[95vw] sm:max-w-3xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Confirmar Dispersión Ejecutada</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-4 sm:px-5">
          {/* Status Banner */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-800">Dispersado</h3>
                <p className="text-sm text-green-700 mt-1">
                  El monto ha sido dispersado exitosamente al usuario.
                </p>
              </div>
            </div>
          </div>

          {/* Información Básica */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Información del Viático</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">ID Viático</p>
                  <p className="font-semibold text-gray-900">{viatico.id}</p>
                </div>
                <div>
                  <p className="text-gray-600">Solicitante</p>
                  <p className="font-semibold text-gray-900">{viatico.userName}</p>
                </div>
                <div>
                  <p className="text-gray-600">Motivo</p>
                  <p className="font-semibold text-gray-900">{viatico.motivo}</p>
                </div>
                <div>
                  <p className="text-gray-600">Monto aprobado</p>
                  {aplicaTipoCambio ? (
                    <>
                      <p className="text-xl font-bold text-blue-700">USD ${formatUsd(montoUSD || 0)}</p>
                      <p className="text-xs text-gray-500">
                        MXN ${montoAprobado.toLocaleString()} | TC {tipoCambioUSD.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-bold text-green-600">${montoAprobado.toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Formulario de Confirmación */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Registrar Detalles de Dispersión</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto dispersado <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={Number.isFinite(montoDispersado) ? montoDispersado : ''}
                  onChange={(e) => {
                    const nextValue = Number(e.target.value);
                    setMontoDispersado(Number.isNaN(nextValue) ? 0 : nextValue);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total aprobado: MXN ${montoAprobado.toLocaleString()}
                </p>
                {montoDispersadoPrevio > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Ya dispersado: MXN ${montoDispersadoPrevio.toLocaleString()} | Pendiente: MXN ${montoPendiente.toLocaleString()}
                  </p>
                )}
                {aplicaTipoCambio && (
                  <p className="text-xs text-blue-700 mt-1">
                    Equivalente USD: ${formatUsd(montoDispersadoUSD || 0)}
                  </p>
                )}
              </div>
              {esExtranjero && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-blue-900">
                      <input
                        type="checkbox"
                        checked={aplicaTipoCambio}
                        onChange={(e) => setAplicaTipoCambio(e.target.checked)}
                        className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                      />
                      Viaje al extranjero
                    </label>
                    <span className="text-[11px] text-blue-700">
                      TC actualizado: {tipoCambioLabel || 'sin fecha'}
                    </span>
                  </div>
                  {aplicaTipoCambio && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-blue-800 mb-1">Tipo de cambio USD</label>
                        <div className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg bg-white text-blue-800 font-semibold">
                          {tipoCambioUSD.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-blue-800 mb-1">Monto aprobado en USD</label>
                        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700">
                          USD ${formatUsd(montoUSD || 0)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de Pago Utilizado <span className="text-red-500">*</span>
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="transferencia">Transferencia Bancaria (Efectifintech)</option>
                  <option value="tarjeta">Tarjeta Empresarial (AMEX)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comentarios
                </label>
                <textarea
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Comentarios sobre la dispersión (opcional)..."
                ></textarea>
              </div>
            </div>
          </div>

          {/* Historial */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Historial de Dispersión</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Solicitud creada</p>
                  <p className="text-xs text-gray-500">{viatico.createdAt}</p>
                </div>
              </div>
              {viatico.aprobadoPor && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Aprobado</p>
                    <p className="text-xs text-gray-500">Por {viatico.aprobadoPor}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Pendiente de dispersión</p>
                  <p className="text-xs text-gray-500">Esperando confirmación de dispersión</p>
                </div>
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800">
                Al guardar, se enviará una notificación automática a <strong>{viatico.userName}</strong> confirmando que la dispersión fue realizada.
              </p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:justify-end sm:px-5">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            Guardar y Notificar
          </button>
        </div>
      </div>
    </div>
  );
}







