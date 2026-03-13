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
  getDepartmentLabel,
  replaceDepartmentOptions,
  type DepartmentOption,
} from '../../data/departments';
import {
  USER_CATEGORY_OPTIONS,
  replaceUserCategoryOptions,
  type UserCategoryOption,
} from '../../data/userCategories';
import {
  VIATICO_MEAL_RATES,
  replaceViaticoMealRates,
  type ViaticoMealRates,
} from '../../data/viaticoMealRates';
import type { CuentaContable, TarjetaAMEX } from '../../types';
import {
  createAmexTarjeta,
  createCatalogCuentaContable,
  createCatalogDepartment,
  createCatalogUserCategory,
  createCatalogGSActivity,
  deleteAmexTarjeta,
  deleteCatalogCuentaContable,
  deleteCatalogDepartment,
  deleteCatalogUserCategory,
  deleteCatalogGSActivity,
  fetchAmexTarjetas,
  fetchCatalogCuentasContables,
  fetchCatalogDepartments,
  fetchCatalogUserCategories,
  fetchCatalogGSActivities,
  fetchViaticoMealRates,
  updateAmexTarjeta,
  updateCatalogCuentaContable,
  updateCatalogDepartment,
  updateCatalogGSActivity,
  updateCatalogUserCategory,
  updateViaticoMealRates,
} from '../../utils/backendSync';

const ACTIVITY_CATEGORIES: GSActivity['category'][] = ['job', 'travel', 'facility', 'employee', 'office', 'vehicle'];
const PROTECTED_DEPARTMENTS = new Set(['business_intelligence', 'finanzas', 'operaciones']);
const DEFAULT_ACTIVITY_ACCOUNT = '5450';
const DEFAULT_ACTIVITY_CODE = 'N/A';

const normalizeDepartmentValue = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

const normalizeCategoryValue = (input: string) =>
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
  const [userCategories, setUserCategories] = useState<UserCategoryOption[]>(() => [...USER_CATEGORY_OPTIONS]);
  const [viaticoMealRates, setViaticoMealRates] = useState<ViaticoMealRates>(() => ({ ...VIATICO_MEAL_RATES }));
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
  const [userCategoryForm, setUserCategoryForm] = useState({
    label: '',
    value: '',
  });
  const [viaticoMealRateForm, setViaticoMealRateForm] = useState({
    desayuno: String(VIATICO_MEAL_RATES.desayuno),
    comida: String(VIATICO_MEAL_RATES.comida),
    cena: String(VIATICO_MEAL_RATES.cena),
  });
  const [rateConfirmChecks, setRateConfirmChecks] = useState({
    impact: false,
    reviewed: false,
  });
  const [rateConfirmPhrase, setRateConfirmPhrase] = useState('');
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [editingActivityForm, setEditingActivityForm] = useState({
    label: '',
    category: 'travel' as GSActivity['category'],
    proyectoRequerido: true,
    note: '',
  });
  const [editingCuentaCodigo, setEditingCuentaCodigo] = useState<string | null>(null);
  const [editingCuentaForm, setEditingCuentaForm] = useState({
    nombre: '',
    descripcion: '',
    categoria: 'General',
    proyectoRequerido: false,
    keywords: '',
    activa: true,
  });
  const [editingTarjetaId, setEditingTarjetaId] = useState<string | null>(null);
  const [editingTarjetaForm, setEditingTarjetaForm] = useState({
    cardNumber: '',
    cardHolder: '',
    department: '',
    activa: true,
  });
  const [editingDepartmentValue, setEditingDepartmentValue] = useState<string | null>(null);
  const [editingDepartmentForm, setEditingDepartmentForm] = useState({
    label: '',
    value: '',
  });
  const [editingUserCategoryValue, setEditingUserCategoryValue] = useState<string | null>(null);
  const [editingUserCategoryForm, setEditingUserCategoryForm] = useState({
    label: '',
    value: '',
  });

  const availableDepartmentLabels = Array.from(
    new Set(
      departments
        .map((item) => item.label.trim())
        .filter(Boolean)
    )
  );
  const viaticoMealRateValues = [
    viaticoMealRateForm.desayuno,
    viaticoMealRateForm.comida,
    viaticoMealRateForm.cena,
  ];
  const areViaticoMealRateFieldsComplete = viaticoMealRateValues.every((value) => value.trim() !== '');
  const areViaticoMealRateValuesValid = viaticoMealRateValues
    .map((value) => Number(value))
    .every((value) => Number.isFinite(value) && value >= 0);
  const canSaveViaticoMealRates =
    areViaticoMealRateFieldsComplete &&
    areViaticoMealRateValuesValid &&
    rateConfirmChecks.impact &&
    rateConfirmChecks.reviewed &&
    rateConfirmPhrase.trim() === 'ACTUALIZAR TARIFAS';

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const getErrorMessage = (unknownError: unknown) =>
    unknownError instanceof Error ? unknownError.message : 'No se pudo completar la operacion.';

  const refreshCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const [nextActivities, nextCuentas, nextTarjetas, nextDepartments, nextUserCategories, nextViaticoMealRates] = await Promise.all([
        fetchCatalogGSActivities(),
        fetchCatalogCuentasContables(),
        fetchAmexTarjetas(),
        fetchCatalogDepartments(),
        fetchCatalogUserCategories(),
        fetchViaticoMealRates(),
      ]);

      replaceGSActivities(nextActivities);
      replaceCuentasContables(nextCuentas);
      replaceTarjetasAmex(nextTarjetas);
      replaceDepartmentOptions(nextDepartments);
      replaceUserCategoryOptions(nextUserCategories);
      replaceViaticoMealRates(nextViaticoMealRates);

      setActivities([...nextActivities].sort((a, b) => a.id - b.id));
      setCuentas([...nextCuentas]);
      setTarjetas([...nextTarjetas]);
      setDepartments([...nextDepartments]);
      setUserCategories([...nextUserCategories]);
      setViaticoMealRates(nextViaticoMealRates);
      setViaticoMealRateForm({
        desayuno: String(nextViaticoMealRates.desayuno),
        comida: String(nextViaticoMealRates.comida),
        cena: String(nextViaticoMealRates.cena),
      });
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
        code: DEFAULT_ACTIVITY_CODE,
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
    const department = tarjetaForm.department.trim();
    if (!cardNumber || !cardHolder || !department) {
      setError('La tarjeta requiere numero, titular y departamento.');
      return;
    }
    if (!availableDepartmentLabels.includes(department)) {
      setError('Selecciona un departamento valido del catalogo.');
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
        department,
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

  const addUserCategory = async () => {
    clearMessages();
    const label = userCategoryForm.label.trim();
    const value = (userCategoryForm.value.trim() || normalizeCategoryValue(label)).slice(0, 50);
    if (!label || !value) {
      setError('La categoria requiere etiqueta y valor.');
      return;
    }
    if (userCategories.some((item) => item.value === value)) {
      setError('Ya existe una categoria con ese valor.');
      return;
    }
    try {
      await createCatalogUserCategory({ label, value });
      await refreshCatalogs();
      setSuccess('Categoria de usuario agregada.');
      setUserCategoryForm({ label: '', value: '' });
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const removeUserCategory = async (value: string) => {
    clearMessages();
    try {
      await deleteCatalogUserCategory(value);
      await refreshCatalogs();
      setSuccess('Categoria de usuario eliminada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const startEditingActivity = (item: GSActivity) => {
    clearMessages();
    setEditingActivityId(item.id);
    setEditingActivityForm({
      label: item.label,
      category: item.category,
      proyectoRequerido: item.proyectoRequerido,
      note: item.note || '',
    });
  };

  const saveActivityEdit = async () => {
    clearMessages();
    if (editingActivityId === null) return;
    const label = editingActivityForm.label.trim();
    if (!label) {
      setError('La actividad requiere nombre.');
      return;
    }
    try {
      await updateCatalogGSActivity(editingActivityId, {
        label,
        category: editingActivityForm.category,
        proyectoRequerido: editingActivityForm.proyectoRequerido,
        note: editingActivityForm.note.trim(),
      });
      await refreshCatalogs();
      setEditingActivityId(null);
      setSuccess('Actividad actualizada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const startEditingCuenta = (item: CuentaContable) => {
    clearMessages();
    setEditingCuentaCodigo(item.codigo);
    setEditingCuentaForm({
      nombre: item.nombre,
      descripcion: item.descripcion,
      categoria: item.categoria,
      proyectoRequerido: item.proyectoRequerido,
      keywords: item.keywords.join(', '),
      activa: item.activa,
    });
  };

  const saveCuentaEdit = async () => {
    clearMessages();
    if (!editingCuentaCodigo) return;
    const nombre = editingCuentaForm.nombre.trim();
    if (!nombre) {
      setError('La cuenta requiere nombre.');
      return;
    }
    try {
      await updateCatalogCuentaContable(editingCuentaCodigo, {
        nombre,
        descripcion: editingCuentaForm.descripcion.trim(),
        categoria: editingCuentaForm.categoria.trim() || 'General',
        proyectoRequerido: editingCuentaForm.proyectoRequerido,
        keywords: splitKeywords(editingCuentaForm.keywords),
        activa: editingCuentaForm.activa,
      });
      await refreshCatalogs();
      setEditingCuentaCodigo(null);
      setSuccess('Cuenta contable actualizada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const startEditingTarjeta = (item: TarjetaAMEX) => {
    clearMessages();
    setEditingTarjetaId(item.id);
    setEditingTarjetaForm({
      cardNumber: item.cardNumber,
      cardHolder: item.cardHolder,
      department: getDepartmentLabel(item.department),
      activa: item.activa,
    });
  };

  const saveTarjetaEdit = async () => {
    clearMessages();
    if (!editingTarjetaId) return;
    const cardNumber = editingTarjetaForm.cardNumber.trim();
    const cardHolder = editingTarjetaForm.cardHolder.trim();
    const department = editingTarjetaForm.department.trim();
    if (!cardNumber || !cardHolder || !department) {
      setError('La tarjeta requiere numero, titular y departamento.');
      return;
    }
    if (!availableDepartmentLabels.includes(department)) {
      setError('Selecciona un departamento valido del catalogo.');
      return;
    }
    if (tarjetas.some((item) => item.id !== editingTarjetaId && item.cardNumber === cardNumber)) {
      setError('Ya existe una tarjeta con ese numero.');
      return;
    }
    try {
      await updateAmexTarjeta(editingTarjetaId, {
        cardNumber,
        cardHolder,
        department,
        activa: editingTarjetaForm.activa,
      });
      await refreshCatalogs();
      setEditingTarjetaId(null);
      setSuccess('Tarjeta AMEX actualizada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const startEditingDepartment = (item: DepartmentOption) => {
    clearMessages();
    setEditingDepartmentValue(item.value);
    setEditingDepartmentForm({
      label: item.label,
      value: item.value,
    });
  };

  const saveDepartmentEdit = async () => {
    clearMessages();
    if (!editingDepartmentValue) return;
    const label = editingDepartmentForm.label.trim();
    const nextValue = (editingDepartmentForm.value.trim() || normalizeDepartmentValue(label)).slice(0, 50);
    if (!label || !nextValue) {
      setError('El departamento requiere etiqueta y valor.');
      return;
    }
    if (PROTECTED_DEPARTMENTS.has(editingDepartmentValue) && nextValue !== editingDepartmentValue) {
      setError('Los departamentos protegidos solo permiten editar la etiqueta visible.');
      return;
    }
    if (departments.some((item) => item.value !== editingDepartmentValue && item.value === nextValue)) {
      setError('Ya existe un departamento con ese valor.');
      return;
    }
    try {
      await updateCatalogDepartment(editingDepartmentValue, { label, value: nextValue });
      await refreshCatalogs();
      setEditingDepartmentValue(null);
      setSuccess('Departamento actualizado.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const startEditingUserCategory = (item: UserCategoryOption) => {
    clearMessages();
    setEditingUserCategoryValue(item.value);
    setEditingUserCategoryForm({
      label: item.label,
      value: item.value,
    });
  };

  const saveUserCategoryEdit = async () => {
    clearMessages();
    if (!editingUserCategoryValue) return;
    const label = editingUserCategoryForm.label.trim();
    const nextValue = (editingUserCategoryForm.value.trim() || normalizeCategoryValue(label)).slice(0, 50);
    if (!label || !nextValue) {
      setError('La categoria requiere etiqueta y valor.');
      return;
    }
    if (userCategories.some((item) => item.value !== editingUserCategoryValue && item.value === nextValue)) {
      setError('Ya existe una categoria con ese valor.');
      return;
    }
    try {
      await updateCatalogUserCategory(editingUserCategoryValue, { label, value: nextValue });
      await refreshCatalogs();
      setEditingUserCategoryValue(null);
      setSuccess('Categoria de usuario actualizada.');
    } catch (unknownError) {
      setError(getErrorMessage(unknownError));
    }
  };

  const resetViaticoRateConfirmations = () => {
    setRateConfirmChecks({ impact: false, reviewed: false });
    setRateConfirmPhrase('');
  };

  const saveViaticoMealRates = async () => {
    clearMessages();
    const desayuno = Number(viaticoMealRateForm.desayuno);
    const comida = Number(viaticoMealRateForm.comida);
    const cena = Number(viaticoMealRateForm.cena);

    if (![desayuno, comida, cena].every((value) => Number.isFinite(value) && value >= 0)) {
      setError('Las tarifas de viaticos deben ser numeros validos mayores o iguales a 0.');
      return;
    }

    if (!rateConfirmChecks.impact || !rateConfirmChecks.reviewed || rateConfirmPhrase.trim() !== 'ACTUALIZAR TARIFAS') {
      setError('Completa todos los candados antes de guardar las tarifas de viaticos.');
      return;
    }

    const confirmed = window.confirm(
      `Confirma el cambio de tarifas de viaticos.\nDesayuno: $${desayuno}\nComida: $${comida}\nCena: $${cena}`
    );
    if (!confirmed) {
      return;
    }

    try {
      const nextRates = await updateViaticoMealRates({ desayuno, comida, cena });
      replaceViaticoMealRates(nextRates);
      setViaticoMealRates(nextRates);
      setViaticoMealRateForm({
        desayuno: String(nextRates.desayuno),
        comida: String(nextRates.comida),
        cena: String(nextRates.cena),
      });
      resetViaticoRateConfirmations();
      setSuccess('Tarifas de viaticos actualizadas.');
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
                    <td className="px-3 py-2">
                      {editingActivityId === item.id ? (
                        <div className="space-y-2">
                          <input
                            value={editingActivityForm.label}
                            onChange={(event) => setEditingActivityForm((prev) => ({ ...prev, label: event.target.value }))}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={editingActivityForm.note}
                            onChange={(event) => setEditingActivityForm((prev) => ({ ...prev, note: event.target.value }))}
                            placeholder="Nota"
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                      ) : (
                        item.label
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingActivityId === item.id ? (
                        <div className="space-y-2">
                          <select
                            value={editingActivityForm.category}
                            onChange={(event) => setEditingActivityForm((prev) => ({
                              ...prev,
                              category: event.target.value as GSActivity['category'],
                            }))}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            {ACTIVITY_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {CATEGORY_LABELS[category] || category}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={editingActivityForm.proyectoRequerido}
                              onChange={(event) => setEditingActivityForm((prev) => ({
                                ...prev,
                                proyectoRequerido: event.target.checked,
                              }))}
                            />
                            Requiere proyecto
                          </label>
                        </div>
                      ) : (
                        CATEGORY_LABELS[item.category] || item.category
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {editingActivityId === item.id ? (
                          <>
                            <button
                              type="button"
                              onClick={saveActivityEdit}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingActivityId(null)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingActivity(item)}
                              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeActivity(item.id)}
                              disabled={item.id === GS_ACTIVITY_OTHER_ID}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
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
                    <td className="px-3 py-2">
                      {editingCuentaCodigo === item.codigo ? (
                        <div className="space-y-2">
                          <input
                            value={editingCuentaForm.nombre}
                            onChange={(event) => setEditingCuentaForm((prev) => ({ ...prev, nombre: event.target.value }))}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={editingCuentaForm.descripcion}
                            onChange={(event) => setEditingCuentaForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                            placeholder="Descripcion"
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                      ) : (
                        item.nombre
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingCuentaCodigo === item.codigo ? (
                        <div className="space-y-2">
                          <input
                            value={editingCuentaForm.categoria}
                            onChange={(event) => setEditingCuentaForm((prev) => ({ ...prev, categoria: event.target.value }))}
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={editingCuentaForm.keywords}
                            onChange={(event) => setEditingCuentaForm((prev) => ({ ...prev, keywords: event.target.value }))}
                            placeholder="Keywords"
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                      ) : (
                        item.categoria
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingCuentaCodigo === item.codigo ? (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={editingCuentaForm.activa}
                              onChange={(event) => setEditingCuentaForm((prev) => ({ ...prev, activa: event.target.checked }))}
                            />
                            Activa
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={editingCuentaForm.proyectoRequerido}
                              onChange={(event) => setEditingCuentaForm((prev) => ({ ...prev, proyectoRequerido: event.target.checked }))}
                            />
                            Requiere proyecto
                          </label>
                        </div>
                      ) : (
                        item.activa ? 'Si' : 'No'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {editingCuentaCodigo === item.codigo ? (
                          <>
                            <button
                              type="button"
                              onClick={saveCuentaEdit}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCuentaCodigo(null)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingCuenta(item)}
                              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCuenta(item.codigo)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
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
            <select
              value={tarjetaForm.department}
              onChange={(event) => setTarjetaForm((prev) => ({ ...prev, department: event.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Selecciona departamento</option>
              {availableDepartmentLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
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
                    <td className="px-3 py-2">
                      {editingTarjetaId === item.id ? (
                        <input
                          value={editingTarjetaForm.cardNumber}
                          onChange={(event) => setEditingTarjetaForm((prev) => ({ ...prev, cardNumber: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.cardNumber
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingTarjetaId === item.id ? (
                        <input
                          value={editingTarjetaForm.cardHolder}
                          onChange={(event) => setEditingTarjetaForm((prev) => ({ ...prev, cardHolder: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.cardHolder
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingTarjetaId === item.id ? (
                        <select
                          value={editingTarjetaForm.department}
                          onChange={(event) => setEditingTarjetaForm((prev) => ({ ...prev, department: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="">Selecciona departamento</option>
                          {availableDepartmentLabels.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        getDepartmentLabel(item.department)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingTarjetaId === item.id ? (
                        <label className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={editingTarjetaForm.activa}
                            onChange={(event) => setEditingTarjetaForm((prev) => ({ ...prev, activa: event.target.checked }))}
                          />
                          Activa
                        </label>
                      ) : (
                        item.activa ? 'Si' : 'No'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {editingTarjetaId === item.id ? (
                          <>
                            <button
                              type="button"
                              onClick={saveTarjetaEdit}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTarjetaId(null)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingTarjeta(item)}
                              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTarjeta(item.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
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
                    <td className="px-3 py-2">
                      {editingDepartmentValue === item.value ? (
                        <input
                          value={editingDepartmentForm.label}
                          onChange={(event) => setEditingDepartmentForm((prev) => ({ ...prev, label: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.label
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingDepartmentValue === item.value ? (
                        <input
                          value={editingDepartmentForm.value}
                          onChange={(event) => setEditingDepartmentForm((prev) => ({ ...prev, value: event.target.value }))}
                          disabled={PROTECTED_DEPARTMENTS.has(item.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      ) : (
                        item.value
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {editingDepartmentValue === item.value ? (
                          <>
                            <button
                              type="button"
                              onClick={saveDepartmentEdit}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDepartmentValue(null)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingDepartment(item)}
                              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeDepartment(item.value)}
                              disabled={PROTECTED_DEPARTMENTS.has(item.value)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tarifas de viaticos</h2>
              <p className="mt-1 text-xs text-slate-600">
                Cambia los montos de desayuno, comida y cena usados en solicitudes nuevas y extensiones.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">Valores actuales</p>
              <p>{`Desayuno: $${viaticoMealRates.desayuno.toLocaleString()}`}</p>
              <p>{`Comida: $${viaticoMealRates.comida.toLocaleString()}`}</p>
              <p>{`Cena: $${viaticoMealRates.cena.toLocaleString()}`}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Desayuno</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={viaticoMealRateForm.desayuno}
                onChange={(event) => setViaticoMealRateForm((prev) => ({ ...prev, desayuno: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comida</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={viaticoMealRateForm.comida}
                onChange={(event) => setViaticoMealRateForm((prev) => ({ ...prev, comida: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Cena</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={viaticoMealRateForm.cena}
                onChange={(event) => setViaticoMealRateForm((prev) => ({ ...prev, cena: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-900">Candados de guardado</p>
            <p className="mt-1 text-xs text-rose-700">
              Este cambio impacta solicitudes futuras. Completa todos los candados antes de guardar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rateConfirmChecks.impact}
                  onChange={(event) => setRateConfirmChecks((prev) => ({ ...prev, impact: event.target.checked }))}
                  className="shrink-0"
                />
                Entiendo que este cambio modifica el calculo de viaticos y extensiones futuras.
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rateConfirmChecks.reviewed}
                  onChange={(event) => setRateConfirmChecks((prev) => ({ ...prev, reviewed: event.target.checked }))}
                  className="shrink-0"
                />
                Ya revise los montos y confirmo que son correctos antes de guardar.
              </label>
              <label className="block w-full text-sm text-slate-700">
                <span className="mb-1 block font-medium">Escribe `ACTUALIZAR TARIFAS` para desbloquear</span>
                <input
                  value={rateConfirmPhrase}
                  onChange={(event) => setRateConfirmPhrase(event.target.value)}
                  placeholder="ACTUALIZAR TARIFAS"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={saveViaticoMealRates}
              disabled={!canSaveViaticoMealRates}
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300 disabled:hover:bg-rose-300"
            >
              Guardar tarifas de viaticos
            </button>
            <button
              type="button"
              onClick={() => {
                setViaticoMealRateForm({
                  desayuno: String(viaticoMealRates.desayuno),
                  comida: String(viaticoMealRates.comida),
                  cena: String(viaticoMealRates.cena),
                });
                resetViaticoRateConfirmations();
                clearMessages();
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Revertir cambios
            </button>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Categorias de usuario</h2>
          <p className="mt-1 text-xs text-slate-600">Dropdown para alta y edicion de usuarios (Categoria).</p>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={userCategoryForm.label}
              onChange={(event) => setUserCategoryForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Etiqueta visible"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={userCategoryForm.value}
              onChange={(event) => setUserCategoryForm((prev) => ({ ...prev, value: event.target.value }))}
              placeholder="Valor interno (opcional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={addUserCategory}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Agregar categoria
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
                {userCategories.map((item) => (
                  <tr key={item.value} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      {editingUserCategoryValue === item.value ? (
                        <input
                          value={editingUserCategoryForm.label}
                          onChange={(event) => setEditingUserCategoryForm((prev) => ({ ...prev, label: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.label
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingUserCategoryValue === item.value ? (
                        <input
                          value={editingUserCategoryForm.value}
                          onChange={(event) => setEditingUserCategoryForm((prev) => ({ ...prev, value: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.value
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {editingUserCategoryValue === item.value ? (
                          <>
                            <button
                              type="button"
                              onClick={saveUserCategoryEdit}
                              className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUserCategoryValue(null)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingUserCategory(item)}
                              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeUserCategory(item.value)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
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

