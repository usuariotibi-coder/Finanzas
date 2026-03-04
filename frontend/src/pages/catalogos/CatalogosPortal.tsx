import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATEGORY_LABELS,
  GS_ACTIVITIES,
  GS_ACTIVITY_OTHER_ID,
  replaceGSActivities,
  type GSActivity,
} from '../../data/gsActivities';
import {
  CUENTAS_CONTABLES,
  replaceCuentasContables,
} from '../../data/cuentasContables';
import {
  TARJETAS_AMEX,
  replaceTarjetasAmex,
} from '../../data/tarjetasAMEX';
import {
  DEPARTMENT_OPTIONS,
  replaceDepartmentOptions,
  type DepartmentOption,
} from '../../data/departments';
import type { CuentaContable, TarjetaAMEX } from '../../types';
import {
  createAmexTarjeta,
  createCatalogCuentaContable,
  createCatalogDepartment,
  createCatalogGSActivity,
  deleteAmexTarjeta,
  deleteCatalogCuentaContable,
  deleteCatalogDepartment,
  deleteCatalogGSActivity,
  fetchAmexTarjetas,
  fetchCatalogCuentasContables,
  fetchCatalogDepartments,
  fetchCatalogGSActivities,
} from '../../utils/backendSync';

const ACTIVITY_CATEGORIES: GSActivity['category'][] = ['job', 'travel', 'facility', 'employee', 'office', 'vehicle'];
const PROTECTED_DEPARTMENTS = new Set(['business_intelligence', 'finanzas', 'operaciones']);
const DEFAULT_ACTIVITY_ACCOUNT = '5450';

const normalizeDepartmentValue = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

const splitKeywords = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const buildNextCuentaCodigo = (items: CuentaContable[]) => {
  const numericCodes = items
    .map((item) => item.codigo.trim())
    .filter((code) => /^\d+$/.test(code))
    .map((code) => Number(code))
    .filter((code) => Number.isFinite(code));

  let next = numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 1000;
  while (items.some((item) => item.codigo === String(next))) {
    next += 1;
  }
  return String(next);
};

export default function CatalogosPortal() {
  const [activities, setActivities] = useState<GSActivity[]>(() => [...GS_ACTIVITIES].sort((a, b) => a.id - b.id));
  const [cuentas, setCuentas] = useState<CuentaContable[]>(() => [...CUENTAS_CONTABLES]);
  const [tarjetas, setTarjetas] = useState<TarjetaAMEX[]>(() => [...TARJETAS_AMEX]);
  const [departments, setDepartments] = useState<DepartmentOption[]>(() => [...DEPARTMENT_OPTIONS]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activityForm, setActivityForm] = useState({
    label: '',
    category: 'travel' as GSActivity['category'],
    proyectoRequerido: true,
    note: '',
  });

  const [cuentaForm, setCuentaForm] = useState({
    nombre: '',
    descripcion: '',
    categoria: 'General',
    proyectoRequerido: false,
    keywords: '',
    activa: true,
  });

  const [tarjetaForm, setTarjetaForm] = useState({
    cardNumber: '',
    cardHolder: '',
    department: '',
    activa: true,
  });

  const [departmentForm, setDepartmentForm] = useState({
    label: '',
    value: '',
  });

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const getErrorMessage = (unknownError: unknown) =>
    unknownError instanceof Error ? unknownError.message : 'No se pudo completar la operacion.';

  const refreshCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const [nextActivities, nextCuentas, nextTarjetas, nextDepartments] = await Promise.all([
        fetchCatalogGSActivities(),
        fetchCatalogCuentasContables(),
        fetchAmexTarjetas(),
        fetchCatalogDepartments(),
      ]);

      replaceGSActivities(nextActivities);
      replaceCuentasContables(nextCuentas);
      replaceTarjetasAmex(nextTarjetas);
      replaceDepartmentOptions(nextDepartments);

      setActivities([...nextActivities].sort((a, b) => a.id - b.id));
      setCuentas([...nextCuentas]);
      setTarjetas([...nextTarjetas]);
      setDepartments([...nextDepartments]);
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalogs();
  }, [refreshCatalogs]);

  const addActivity = async () => {
    clearMessages();
    const label = activityForm.label.trim();
    if (!label) {
      setError('La actividad requiere nombre.');
      return;
    }
    try {
      await createCatalogGSActivity({
        label,
        account: DEFAULT_ACTIVITY_ACCOUNT,
        category: activityForm.category,
        proyectoRequerido: activityForm.proyectoRequerido,
        note: activityForm.note.trim() || undefined,
      });
      await refreshCatalogs();
      setSuccess('Actividad agregada.');
      setActivityForm({
        label: '',
        category: activityForm.category,
        proyectoRequerido: true,
        note: '',
      });
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const removeActivity = async (id: number) => {
    clearMessages();
    if (id === GS_ACTIVITY_OTHER_ID) {
      setError('La actividad "Otro" es obligatoria y no se puede eliminar.');
      return;
    }
    try {
      await deleteCatalogGSActivity(id);
      await refreshCatalogs();
      setSuccess('Actividad eliminada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const addCuenta = async () => {
    clearMessages();
    const nombre = cuentaForm.nombre.trim();
    if (!nombre) {
      setError('La cuenta requiere nombre.');
      return;
    }
    const codigo = buildNextCuentaCodigo(cuentas);
    try {
      await createCatalogCuentaContable({
        codigo,
        nombre,
        descripcion: cuentaForm.descripcion.trim(),
        categoria: cuentaForm.categoria.trim() || 'General',
        proyectoRequerido: cuentaForm.proyectoRequerido,
        keywords: splitKeywords(cuentaForm.keywords),
        activa: cuentaForm.activa,
      });
      await refreshCatalogs();
      setSuccess('Cuenta contable agregada.');
      setCuentaForm({
        nombre: '',
        descripcion: '',
        categoria: cuentaForm.categoria,
        proyectoRequerido: false,
        keywords: '',
        activa: true,
      });
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const removeCuenta = async (codigo: string) => {
    clearMessages();
    try {
      await deleteCatalogCuentaContable(codigo);
      await refreshCatalogs();
      setSuccess('Cuenta contable eliminada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const addTarjeta = async () => {
    clearMessages();
    const cardNumber = tarjetaForm.cardNumber.trim();
    const cardHolder = tarjetaForm.cardHolder.trim();
    if (!cardNumber || !cardHolder) {
      setError('La tarjeta requiere numero y titular.');
      return;
    }
    if (tarjetas.some((item) => item.cardNumber === cardNumber)) {
      setError('Ya existe una tarjeta con ese numero.');
      return;
    }
    try {
      await createAmexTarjeta({
        cardNumber,
        cardHolder,
        department: tarjetaForm.department.trim() || 'Sin departamento',
        activa: tarjetaForm.activa,
      });
      await refreshCatalogs();
      setSuccess('Tarjeta AMEX agregada.');
      setTarjetaForm({ cardNumber: '', cardHolder: '', department: '', activa: true });
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const removeTarjeta = async (id: string) => {
    clearMessages();
    try {
      await deleteAmexTarjeta(id);
      await refreshCatalogs();
      setSuccess('Tarjeta AMEX eliminada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const addDepartment = async () => {
    clearMessages();
    const label = departmentForm.label.trim();
    const value = (departmentForm.value.trim() || normalizeDepartmentValue(label)).slice(0, 50);
    if (!label || !value) {
      setError('El departamento requiere etiqueta y valor.');
      return;
    }
    if (departments.some((item) => item.value === value)) {
      setError('Ya existe un departamento con ese valor.');
      return;
    }
    try {
      await createCatalogDepartment({ label, value });
      await refreshCatalogs();
      setSuccess('Departamento agregado.');
      setDepartmentForm({ label: '', value: '' });
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const removeDepartment = async (value: string) => {
    clearMessages();
    if (PROTECTED_DEPARTMENTS.has(value)) {
      setError('No puedes eliminar BI, Finanzas u Operaciones porque afectan la asignacion de roles.');
      return;
    }
    try {
      await deleteCatalogDepartment(value);
      await refreshCatalogs();
      setSuccess('Departamento eliminado.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Portal de dropdowns</h1>
            <p className="text-sm text-slate-600">
              Administra los catalogos de dropdowns. Acceso exclusivo para Business Intelligence y Finanzas.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Volver al dashboard
          </Link>
        </div>
        {loading ? <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">Sincronizando catalogos...</p> : null}
        {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Actividades GS</h2>
          <p className="mt-1 text-xs text-slate-600">Dropdown usado en viaticos y AMEX.</p>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={activityForm.label}
              onChange={(event) => setActivityForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Nombre"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={activityForm.category}
              onChange={(event) =>
                setActivityForm((prev) => ({
                  ...prev,
                  category: event.target.value as GSActivity['category'],
                }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {ACTIVITY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category] || category}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={activityForm.proyectoRequerido}
                onChange={(event) =>
                  setActivityForm((prev) => ({ ...prev, proyectoRequerido: event.target.checked }))
                }
              />
              Requiere proyecto
            </label>
            <input
              value={activityForm.note}
              onChange={(event) => setActivityForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Nota (opcional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={addActivity}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Agregar actividad
          </button>

          <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {activities.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{item.id}</td>
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2">{CATEGORY_LABELS[item.category] || item.category}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeActivity(item.id)}
                        disabled={item.id === GS_ACTIVITY_OTHER_ID}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cuentas contables</h2>
          <p className="mt-1 text-xs text-slate-600">Dropdown de clasificacion AMEX.</p>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={cuentaForm.nombre}
              onChange={(event) => setCuentaForm((prev) => ({ ...prev, nombre: event.target.value }))}
              placeholder="Nombre"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={cuentaForm.categoria}
              onChange={(event) => setCuentaForm((prev) => ({ ...prev, categoria: event.target.value }))}
              placeholder="Categoria"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={cuentaForm.keywords}
              onChange={(event) => setCuentaForm((prev) => ({ ...prev, keywords: event.target.value }))}
              placeholder="Keywords separadas por coma"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={cuentaForm.descripcion}
              onChange={(event) => setCuentaForm((prev) => ({ ...prev, descripcion: event.target.value }))}
              placeholder="Descripcion"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={cuentaForm.proyectoRequerido}
                onChange={(event) =>
                  setCuentaForm((prev) => ({ ...prev, proyectoRequerido: event.target.checked }))
                }
              />
              Requiere proyecto
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={cuentaForm.activa}
                onChange={(event) => setCuentaForm((prev) => ({ ...prev, activa: event.target.checked }))}
              />
              Activa
            </label>
          </div>

          <button
            type="button"
            onClick={addCuenta}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Agregar cuenta
          </button>

          <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Activa</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {cuentas.map((item) => (
                  <tr key={item.codigo} className="border-t border-slate-200">
                    <td className="px-3 py-2">{item.nombre}</td>
                    <td className="px-3 py-2">{item.categoria}</td>
                    <td className="px-3 py-2">{item.activa ? 'Si' : 'No'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeCuenta(item.codigo)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Tarjetas AMEX</h2>
          <p className="mt-1 text-xs text-slate-600">Dropdown de tarjetas disponibles.</p>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={tarjetaForm.cardNumber}
              onChange={(event) => setTarjetaForm((prev) => ({ ...prev, cardNumber: event.target.value }))}
              placeholder="Numero de tarjeta"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={tarjetaForm.cardHolder}
              onChange={(event) => setTarjetaForm((prev) => ({ ...prev, cardHolder: event.target.value }))}
              placeholder="Titular"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={tarjetaForm.department}
              onChange={(event) => setTarjetaForm((prev) => ({ ...prev, department: event.target.value }))}
              placeholder="Departamento"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={tarjetaForm.activa}
                onChange={(event) => setTarjetaForm((prev) => ({ ...prev, activa: event.target.checked }))}
              />
              Activa
            </label>
          </div>

          <button
            type="button"
            onClick={addTarjeta}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Agregar tarjeta
          </button>

          <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Numero</th>
                  <th className="px-3 py-2">Titular</th>
                  <th className="px-3 py-2">Departamento</th>
                  <th className="px-3 py-2">Activa</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tarjetas.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{item.cardNumber}</td>
                    <td className="px-3 py-2">{item.cardHolder}</td>
                    <td className="px-3 py-2">{item.department}</td>
                    <td className="px-3 py-2">{item.activa ? 'Si' : 'No'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeTarjeta(item.id)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Departamentos</h2>
          <p className="mt-1 text-xs text-slate-600">Dropdown de registro y administracion de usuarios.</p>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={departmentForm.label}
              onChange={(event) => setDepartmentForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Etiqueta visible"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={departmentForm.value}
              onChange={(event) => setDepartmentForm((prev) => ({ ...prev, value: event.target.value }))}
              placeholder="Valor interno (opcional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={addDepartment}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Agregar departamento
          </button>

          <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Etiqueta</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {departments.map((item) => (
                  <tr key={item.value} className="border-t border-slate-200">
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2">{item.value}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeDepartment(item.value)}
                        disabled={PROTECTED_DEPARTMENTS.has(item.value)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

