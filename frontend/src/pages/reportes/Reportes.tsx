export default function Reportes() {
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-2">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-20 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="relative space-y-2">
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Panel de Reportes</p>
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Reportes Contables</h1>
              <p className="text-[11px] text-slate-600">Generacion y exportacion de reportes.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <MetricCard label="Reportes Generados" value={12} />
              <MetricCard label="Este Mes" value={3} />
              <MetricCard label="Pendientes" value={1} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Generar Nuevo Reporte</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Reporte</label>
            <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option>Reporte Mensual Consolidado</option>
              <option>Reporte de Viáticos</option>
              <option>Reporte de Conciliación</option>
              <option>Reporte de Flotilla</option>
              <option>Reporte AMEX</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Periodo</label>
            <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option>Diciembre 2025</option>
              <option>Noviembre 2025</option>
              <option>Octubre 2025</option>
            </select>
          </div>
        </div>
        <button className="mt-6 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">
          Generar Reporte
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Reportes Recientes</h2>
        </div>
        <div className="divide-y divide-gray-200">
          <ReportItem
            title="Reporte Mensual - Diciembre 2025"
            date="2025-12-11"
            type="Consolidado"
            status="Completado"
          />
          <ReportItem
            title="Conciliación - Periodo 1-15 Nov"
            date="2025-11-16"
            type="Conciliación"
            status="Completado"
          />
          <ReportItem
            title="Flotilla - Noviembre 2025"
            date="2025-11-30"
            type="Flotilla"
            status="Completado"
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <button
      type="button"
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white/90 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md select-none"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-slate-300" />
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </button>
  );
}

function ReportItem({ title, date, type, status }: { title: string; date: string; type: string; status: string }) {
  const statusIcon = status === 'Completado' ? '✅' : status === 'Pendiente' ? '⏳' : '🧭';

  return (
    <div className="flex items-center justify-between p-6 hover:bg-gray-50">
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-gray-900">{title}</p>
          <div className="flex items-center space-x-3 mt-1">
            <span className="text-xs text-gray-500">{date}</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{type}</span>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
              {statusIcon} {status}
            </span>
          </div>
        </div>
      </div>
      <div className="flex space-x-2">
        <button className="p-2 text-gray-400 hover:text-primary-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button className="p-2 text-gray-400 hover:text-primary-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
