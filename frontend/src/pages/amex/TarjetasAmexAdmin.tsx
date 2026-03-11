import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import { replaceTarjetasAmex } from '../../data/tarjetasAMEX';
import type { AuthUser, TarjetaAMEX } from '../../types';
import { api } from '../../utils/api';
import {
  createAmexTarjeta,
  deleteAmexTarjeta,
  fetchAmexTarjetas,
  updateAmexTarjeta,
} from '../../utils/backendSync';

type TarjetaFormState = {
  userId: string;
  cardNumber: string;
  employeeNumber: string;
  accountNumber: string;
  expirationDate: string;
  comodin: boolean;
  activa: boolean;
};

const EMPTY_FORM: TarjetaFormState = {
  userId: '',
  cardNumber: '',
  employeeNumber: '',
  accountNumber: '',
  expirationDate: '',
  comodin: false,
  activa: true,
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const formatDate = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Sin vigencia';
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const sortCards = (items: TarjetaAMEX[]) =>
  [...items].sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    if ((a.comodin ?? false) !== (b.comodin ?? false)) return a.comodin ? -1 : 1;
    return (a.userName || a.cardHolder).localeCompare(b.userName || b.cardHolder);
  });

export default function TarjetasAmexAdmin() {
  const formRef = useRef<HTMLDivElement | null>(null);

  const [cards, setCards] = useState<TarjetaAMEX[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [form, setForm] = useState<TarjetaFormState>(EMPTY_FORM);
  const [editingCard, setEditingCard] = useState<TarjetaAMEX | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TarjetaAMEX | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [tarjetas, assignableUsers] = await Promise.all([
        fetchAmexTarjetas(),
        api.assignableUsers() as Promise<AuthUser[]>,
      ]);
      const nextCards = sortCards(tarjetas);
      setCards(nextCards);
      replaceTarjetasAmex(nextCards);
      setUsers(
        [...assignableUsers].sort((a, b) => {
          const byName = a.full_name.localeCompare(b.full_name);
          return byName !== 0 ? byName : a.email.localeCompare(b.email);
        })
      );
      setError('');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'No se pudieron cargar las tarjetas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEscapeKey(() => {
    setDeleteTarget(null);
  }, Boolean(deleteTarget));

  const usersWithoutCard = useMemo(() => {
    return users.filter((user) => {
      return !cards.some((card) => {
        if (card.id === editingCard?.id || card.comodin) {
          return false;
        }
        if (card.userId && card.userId === String(user.id)) {
          return true;
        }
        return normalizeText(card.userName || card.cardHolder) === normalizeText(user.full_name);
      });
    });
  }, [cards, editingCard?.id, users]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return cards;
    return cards.filter((card) =>
      [
        card.userName,
        card.cardHolder,
        card.cardNumber,
        card.employeeNumber,
        card.accountNumber,
        card.department,
        card.comodin ? 'comodin' : 'asignada',
      ]
        .map((value) => normalizeText(String(value || '')))
        .some((value) => value.includes(normalizedQuery))
    );
  }, [cards, query]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingCard(null);
  };

  const openNewCardForm = () => {
    resetForm();
    setError('');
    setSuccess('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleEdit = (card: TarjetaAMEX) => {
    setEditingCard(card);
    setForm({
      userId: card.userId || '',
      cardNumber: card.cardNumber,
      employeeNumber: card.employeeNumber || '',
      accountNumber: card.accountNumber || '',
      expirationDate: card.expirationDate || '',
      comodin: Boolean(card.comodin),
      activa: card.activa,
    });
    setError('');
    setSuccess('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDelete = async (card: TarjetaAMEX) => {
    setDeleteTarget(card);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError('');
    setSuccess('');
    try {
      await deleteAmexTarjeta(deleteTarget.id);
      await loadData();
      if (editingCard?.id === deleteTarget.id) {
        resetForm();
      }
      setDeleteTarget(null);
      setSuccess('Tarjeta eliminada correctamente.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'No se pudo eliminar la tarjeta.');
    } finally {
      setDeletingId('');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const cardNumber = form.cardNumber.trim();
    const employeeNumber = form.employeeNumber.trim();
    const accountNumber = form.accountNumber.trim();
    const expirationDate = form.expirationDate.trim();
    const selectedUser = users.find((user) => String(user.id) === form.userId) || null;

    if (!cardNumber || !employeeNumber || !accountNumber || !expirationDate) {
      setError('Completa numero de tarjeta, numero de empleado, cuenta y vigencia.');
      return;
    }

    if (!form.comodin && !selectedUser) {
      setError('Selecciona un usuario para la tarjeta.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        userId: form.comodin ? '' : form.userId,
        cardNumber,
        cardHolder: form.comodin ? 'Tarjeta comodin' : selectedUser?.full_name || '',
        department: form.comodin ? 'Comodin' : selectedUser?.department || '',
        employeeNumber,
        accountNumber,
        expirationDate,
        comodin: form.comodin,
        activa: form.activa,
      };

      if (editingCard) {
        await updateAmexTarjeta(editingCard.id, payload);
        setSuccess('Tarjeta actualizada correctamente.');
      } else {
        await createAmexTarjeta(payload);
        setSuccess('Tarjeta registrada correctamente.');
      }

      await loadData();
      resetForm();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'No se pudo guardar la tarjeta.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalCards = cards.length;
  const comodinCards = cards.filter((card) => card.comodin).length;
  const usersWithoutCardCount = users.filter((user) =>
    !cards.some((card) => !card.comodin && (
      (card.userId && card.userId === String(user.id)) ||
      normalizeText(card.userName || card.cardHolder) === normalizeText(user.full_name)
    ))
  ).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-[linear-gradient(135deg,#fff8ec_0%,#f6efe0_38%,#ecf0f5_100%)] px-6 py-7 text-slate-900 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.85fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Administracion AMEX</p>
            <h1 className="mt-3 text-2xl font-semibold">Tarjetas corporativas</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              Registra tarjetas por usuario, detecta quienes siguen sin asignacion y controla comodines desde una sola vista.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openNewCardForm}
                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Agregar tarjeta
              </button>
            </div>
          </div>

          <div className="grid gap-3 rounded-[24px] border border-amber-200 bg-white/75 p-4">
            <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-700">Tarjetas</p>
              <p className="mt-2 text-3xl font-semibold">{totalCards}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-700">Comodin</p>
                <p className="mt-2 text-2xl font-semibold">{comodinCards}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Sin tarjeta</p>
                <p className="mt-2 text-2xl font-semibold">{usersWithoutCardCount}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <article ref={formRef} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                {editingCard ? 'Editar tarjeta' : 'Nueva tarjeta'}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                {editingCard ? 'Actualizar registro' : 'Agregar datos de tarjeta'}
              </h2>
            </div>
            {editingCard ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Titular</span>
              <select
                value={form.userId}
                onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
                disabled={form.comodin}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">{form.comodin ? 'Tarjeta comodin' : 'Selecciona un usuario sin tarjeta'}</option>
                {usersWithoutCard.map((user) => (
                  <option key={user.id} value={user.id}>
                    {`${user.full_name} · ${user.department}`}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Numero de tarjeta</span>
                <input
                  value={form.cardNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, cardNumber: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  placeholder="0000000000000000"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Numero de empleado</span>
                <input
                  value={form.employeeNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, employeeNumber: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  placeholder="EMP-00124"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta</span>
                <input
                  value={form.accountNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, accountNumber: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  placeholder="5410-0021"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Vigencia</span>
                <input
                  type="date"
                  value={form.expirationDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, expirationDate: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.comodin}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      comodin: event.target.checked,
                      userId: event.target.checked ? '' : prev.userId,
                    }))
                  }
                />
                Tarjeta comodin
              </label>
              <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(event) => setForm((prev) => ({ ...prev, activa: event.target.checked }))}
                />
                Tarjeta activa
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitting ? 'Guardando...' : editingCard ? 'Actualizar tarjeta' : 'Registrar tarjeta'}
            </button>
          </form>
        </article>

        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Usuarios registrados</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Control de tarjetas</h2>
            </div>
            <div className="w-full md:max-w-sm">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</label>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                placeholder="Usuario, tarjeta, cuenta o empleado"
              />
            </div>
          </div>

          {loading ? (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Cargando tarjetas...</p>
          ) : filteredCards.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">No hay registros que mostrar</p>
              <p className="mt-1 text-sm text-slate-600">Ajusta la busqueda o registra una tarjeta nueva.</p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Usuario</th>
                      <th className="px-4 py-3 font-semibold">Tarjeta</th>
                      <th className="px-4 py-3 font-semibold">Empleado</th>
                      <th className="px-4 py-3 font-semibold">Cuenta</th>
                      <th className="px-4 py-3 font-semibold">Vigencia</th>
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((card) => (
                      <tr key={card.id} className="border-t border-slate-200 align-top">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{card.userName || card.cardHolder || 'Tarjeta comodin'}</p>
                          <p className="text-xs text-slate-500">{card.department || 'Sin departamento'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">{card.cardNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{card.employeeNumber || 'Sin dato'}</td>
                        <td className="px-4 py-3 text-slate-700">{card.accountNumber || 'Sin dato'}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(card.expirationDate)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${card.comodin ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                            {card.comodin ? 'Comodin' : 'Asignada'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${card.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                            {card.activa ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(card)}
                              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === card.id}
                              onClick={() => {
                                void handleDelete(card);
                              }}
                              className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === card.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-rose-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4m0 4h.01" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">Confirmacion</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">Eliminar tarjeta</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Se eliminará la tarjeta <span className="font-semibold text-slate-900">{deleteTarget.cardNumber}</span> de{' '}
                  <span className="font-semibold text-slate-900">{deleteTarget.userName || deleteTarget.cardHolder}</span>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                onClick={() => {
                  void confirmDelete();
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                {deletingId === deleteTarget.id ? 'Eliminando...' : 'Eliminar tarjeta'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
