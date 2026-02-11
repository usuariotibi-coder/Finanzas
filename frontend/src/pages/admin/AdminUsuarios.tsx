import { useEffect, useMemo, useState, type FormEvent } from 'react';
import useAuth from '../../hooks/useAuth';
import { departmentOptions, roleLabels } from '../../context/AuthContext';
import type { AuthUser } from '../../types';
import { api } from '../../utils/api';

const ALLOWED_EMAIL_DOMAIN = 'na.scio-automation.com';

const strengthMeta = [
  { label: 'Muy debil', color: 'bg-red-500', text: 'text-red-600' },
  { label: 'Debil', color: 'bg-orange-500', text: 'text-orange-600' },
  { label: 'Media', color: 'bg-amber-500', text: 'text-amber-700' },
  { label: 'Fuerte', color: 'bg-emerald-500', text: 'text-emerald-700' },
  { label: 'Muy fuerte', color: 'bg-emerald-600', text: 'text-emerald-800' },
];

const initialDepartment = departmentOptions[0]?.value || 'finanzas';
const departmentLabelMap = Object.fromEntries(
  departmentOptions.map((option) => [option.value, option.label])
) as Record<string, string>;

const sortUsers = (users: AuthUser[]) =>
  [...users].sort((a, b) => {
    const byName = a.full_name.localeCompare(b.full_name);
    if (byName !== 0) return byName;
    return a.email.localeCompare(b.email);
  });

const formatUserError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('csrf') || normalized.includes('token missing')) {
    return 'No se pudo validar la sesion. Recarga la pagina e intenta de nuevo.';
  }
  if (normalized.includes('permission') || normalized.includes('permiso')) {
    return 'No tienes permisos para administrar usuarios.';
  }
  if (normalized.includes('ya esta registrado') || normalized.includes('already exists')) {
    return 'Este correo ya esta registrado.';
  }
  return message;
};

export default function AdminUsuarios() {
  const { user: currentUser } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState(initialDepartment);
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');

  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDepartment, setEditDepartment] = useState(initialDepartment);
  const [editPosition, setEditPosition] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] || '';
  const isAllowedDomain = normalizedEmail.length > 0 && emailDomain === ALLOWED_EMAIL_DOMAIN;

  const passwordChecks = useMemo(
    () => [
      { label: 'Minimo 8 caracteres', ok: password.length >= 8 },
      { label: 'Una mayuscula (A-Z)', ok: /[A-Z]/.test(password) },
      { label: 'Una minuscula (a-z)', ok: /[a-z]/.test(password) },
      { label: 'Un numero (0-9)', ok: /\d/.test(password) },
      { label: 'Un simbolo (!@#$...)', ok: /[^A-Za-z0-9]/.test(password) },
    ],
    [password]
  );
  const passedChecks = passwordChecks.filter((check) => check.ok).length;
  const strengthScore = Math.min(5, passedChecks + (password.length >= 12 ? 1 : 0));
  const currentStrength = strengthMeta[Math.max(0, Math.min(4, strengthScore - 1))];

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const data = (await api.adminUsers()) as AuthUser[];
        if (!active) return;
        setUsers(sortUsers(data));
        setUsersError('');
      } catch (err) {
        if (!active) return;
        setUsersError(formatUserError(err instanceof Error ? err.message : 'No se pudo cargar usuarios.'));
      } finally {
        if (active) {
          setUsersLoading(false);
        }
      }
    };

    void loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setDepartment(initialDepartment);
    setPosition('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const openEditModal = (selectedUser: AuthUser) => {
    setEditingUser(selectedUser);
    setEditFullName(selectedUser.full_name);
    setEditEmail(selectedUser.email);
    setEditDepartment(selectedUser.department);
    setEditPosition(selectedUser.position);
    setEditError('');
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditFullName('');
    setEditEmail('');
    setEditDepartment(initialDepartment);
    setEditPosition('');
    setEditError('');
    setEditSubmitting(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (
      !fullName.trim() ||
      !email.trim() ||
      !department ||
      !position.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Completa todos los campos.');
      return;
    }

    if (passwordChecks.some((check) => !check.ok)) {
      setError(
        'La contrasena debe tener minimo 8 caracteres e incluir mayuscula, minuscula, numero y simbolo.'
      );
      return;
    }

    if (!isAllowedDomain) {
      setError(`Solo se permite el dominio @${ALLOWED_EMAIL_DOMAIN}.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      await api.csrf();
      const createdUser = (await api.adminRegister({
        full_name: fullName.trim(),
        email: normalizedEmail,
        department,
        position: position.trim(),
        password,
      })) as AuthUser;
      setUsers((prev) => sortUsers([createdUser, ...prev.filter((item) => item.id !== createdUser.id)]));
      setSuccess(`Usuario creado: ${createdUser.full_name} (${createdUser.email})`);
      setUsersError('');
      resetForm();
    } catch (err) {
      setError(formatUserError(err instanceof Error ? err.message : 'No se pudo registrar.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;

    setEditError('');
    setSuccess('');

    const normalizedEditEmail = editEmail.trim().toLowerCase();
    const editEmailDomain = normalizedEditEmail.split('@')[1] || '';
    const editAllowedDomain =
      normalizedEditEmail.length > 0 && editEmailDomain === ALLOWED_EMAIL_DOMAIN;

    if (!editFullName.trim() || !normalizedEditEmail || !editDepartment || !editPosition.trim()) {
      setEditError('Completa todos los campos para actualizar el usuario.');
      return;
    }

    if (!editAllowedDomain) {
      setEditError(`Solo se permite el dominio @${ALLOWED_EMAIL_DOMAIN}.`);
      return;
    }

    setEditSubmitting(true);
    try {
      await api.csrf();
      const updatedUser = (await api.adminUpdateUser(editingUser.id, {
        full_name: editFullName.trim(),
        email: normalizedEditEmail,
        department: editDepartment,
        position: editPosition.trim(),
      })) as AuthUser;

      setUsers((prev) => sortUsers(prev.map((item) => (item.id === updatedUser.id ? updatedUser : item))));
      setSuccess(`Usuario actualizado: ${updatedUser.full_name}`);
      closeEditModal();
    } catch (err) {
      setEditError(formatUserError(err instanceof Error ? err.message : 'No se pudo actualizar.'));
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 shadow-sm sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Administracion</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Alta y edicion de usuarios</h1>
        <p className="mt-2 text-sm text-slate-600">
          Solo administradores pueden crear y editar cuentas. El rol se asigna automaticamente por departamento.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Registrar nuevo usuario</h2>
          <p className="mt-1 text-sm text-slate-600">Campos obligatorios para crear una cuenta activa.</p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder="Nombre y apellido"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Correo</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder={`usuario@${ALLOWED_EMAIL_DOMAIN}`}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Dominio permitido: <span className="font-semibold text-primary-700">@{ALLOWED_EMAIL_DOMAIN}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Departamento</label>
                <select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                >
                  {departmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Puesto</label>
                <input
                  type="text"
                  required
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder="Ejemplo: Analista"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Contrasena</label>
                <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-l-lg px-4 py-2.5 text-sm outline-none"
                    placeholder="Minimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="rounded-r-lg px-3 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Confirmar contrasena</label>
                <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-l-lg px-4 py-2.5 text-sm outline-none"
                    placeholder="Repite la contrasena"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="rounded-r-lg px-3 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                  >
                    {showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Seguridad de contrasena</p>
                {password.length > 0 && (
                  <span className={`text-sm font-semibold ${currentStrength.text}`}>{currentStrength.label}</span>
                )}
              </div>
              <div className="mt-3 h-2 rounded-full bg-white shadow-inner">
                <div
                  className={`h-2 rounded-full transition-all ${currentStrength.color}`}
                  style={{ width: `${(strengthScore / 5) * 100}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {passwordChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full border ${
                        check.ok ? 'border-emerald-400 bg-emerald-400' : 'border-slate-300'
                      }`}
                    />
                    <span className={check.ok ? 'text-emerald-700' : 'text-slate-500'}>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {success}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Limpiar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Registrando...' : 'Registrar usuario'}
              </button>
            </div>
          </form>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Usuarios registrados</h2>
              <p className="mt-1 text-sm text-slate-600">Puedes editar nombre, correo, departamento y puesto.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {users.length}
            </span>
          </div>

          {usersLoading ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Cargando usuarios...
            </div>
          ) : usersError ? (
            <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {usersError}
            </div>
          ) : users.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No hay usuarios registrados.
            </div>
          ) : (
            <ul className="mt-4 max-h-[640px] space-y-3 overflow-y-auto pr-1">
              {users.map((item) => {
                const isCurrentUser = currentUser?.id === item.id;
                return (
                  <li key={item.id} className="rounded-lg border border-slate-200 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.full_name}
                          {isCurrentUser ? ' (tu usuario)' : ''}
                        </p>
                        <p className="text-xs text-slate-600">{item.email}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {departmentLabelMap[item.department] || item.department} · {roleLabels[item.role]}
                        </p>
                        <p className="text-xs text-slate-500">{item.position}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Editar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Edicion</p>
                <h3 className="text-xl font-semibold text-slate-900">Editar usuario</h3>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleEditSubmit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(event) => setEditFullName(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Nombre y apellido"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Correo</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder={`usuario@${ALLOWED_EMAIL_DOMAIN}`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Departamento</label>
                  <select
                    value={editDepartment}
                    onChange={(event) => setEditDepartment(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  >
                    {departmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Puesto</label>
                  <input
                    type="text"
                    required
                    value={editPosition}
                    onChange={(event) => setEditPosition(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Ejemplo: Coordinador"
                  />
                </div>
              </div>

              {editError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {editError}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {editSubmitting ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
