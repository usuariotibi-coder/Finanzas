import { useEffect, useMemo, useState, type FormEvent } from 'react';
import useAuth from '../../hooks/useAuth';
import { categoryOptions, departmentOptions, roleLabels } from '../../context/AuthContext';
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
const initialCategory =
  categoryOptions.find((option) => option.value === 'operador')?.value ||
  categoryOptions[0]?.value ||
  'operador';
const departmentLabelMap = Object.fromEntries(
  departmentOptions.map((option) => [option.value, option.label])
) as Record<string, string>;
const categoryLabelMap = Object.fromEntries(
  categoryOptions.map((option) => [option.value, option.label])
) as Record<string, string>;

const sortUsers = (users: AuthUser[]) =>
  [...users].sort((a, b) => {
    const byName = a.full_name.localeCompare(b.full_name);
    if (byName !== 0) return byName;
    return a.email.localeCompare(b.email);
  });

const buildPasswordChecks = (value: string) => [
  { label: 'Minimo 8 caracteres', ok: value.length >= 8 },
  { label: 'Una mayuscula (A-Z)', ok: /[A-Z]/.test(value) },
  { label: 'Una minuscula (a-z)', ok: /[a-z]/.test(value) },
  { label: 'Un numero (0-9)', ok: /\d/.test(value) },
  { label: 'Un simbolo (!@#$...)', ok: /[^A-Za-z0-9]/.test(value) },
  { label: 'Sin espacios', ok: !/\s/.test(value) },
];

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
  if (
    normalized.includes('password') ||
    normalized.includes('contrasena') ||
    normalized.includes('too common') ||
    normalized.includes('too similar')
  ) {
    return message;
  }
  return message;
};

export default function AdminUsuarios() {
  const { user: currentUser } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [externalPersonnel, setExternalPersonnel] = useState(false);
  const [department, setDepartment] = useState(initialDepartment);
  const [category, setCategory] = useState(initialCategory);
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
  const [editExternalPersonnel, setEditExternalPersonnel] = useState(false);
  const [editDepartment, setEditDepartment] = useState(initialDepartment);
  const [editCategory, setEditCategory] = useState(initialCategory);
  const [editPosition, setEditPosition] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] || '';
  const isAllowedDomain = externalPersonnel || (normalizedEmail.length > 0 && emailDomain === ALLOWED_EMAIL_DOMAIN);

  const passwordChecks = useMemo(
    () => buildPasswordChecks(password),
    [password]
  );
  const passedChecks = passwordChecks.filter((check) => check.ok).length;
  const rawStrengthScore = Math.min(5, passedChecks + (password.length >= 12 ? 1 : 0));
  const strengthScore = passwordChecks.every((check) => check.ok)
    ? rawStrengthScore
    : Math.min(rawStrengthScore, 3);
  const currentStrength = strengthMeta[Math.max(0, Math.min(4, strengthScore - 1))];

  const editPasswordChecks = useMemo(
    () => buildPasswordChecks(editPassword),
    [editPassword]
  );
  const editPassedChecks = editPasswordChecks.filter((check) => check.ok).length;
  const editRawStrengthScore = Math.min(5, editPassedChecks + (editPassword.length >= 12 ? 1 : 0));
  const editStrengthScore = editPasswordChecks.every((check) => check.ok)
    ? editRawStrengthScore
    : Math.min(editRawStrengthScore, 3);
  const editCurrentStrength = strengthMeta[Math.max(0, Math.min(4, editStrengthScore - 1))];

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
    setExternalPersonnel(false);
    setDepartment(initialDepartment);
    setCategory(initialCategory);
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
    setEditExternalPersonnel(Boolean(selectedUser.external_personnel));
    setEditDepartment(selectedUser.department);
    setEditCategory(selectedUser.category || initialCategory);
    setEditPosition(selectedUser.position);
    setEditPassword('');
    setEditConfirmPassword('');
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
    setEditError('');
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditFullName('');
    setEditEmail('');
    setEditExternalPersonnel(false);
    setEditDepartment(initialDepartment);
    setEditCategory(initialCategory);
    setEditPosition('');
    setEditPassword('');
    setEditConfirmPassword('');
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
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
      !category ||
      !position.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Completa todos los campos.');
      return;
    }

    if (passwordChecks.some((check) => !check.ok)) {
      setError(
        'La contrasena debe tener minimo 8 caracteres, incluir mayuscula, minuscula, numero, simbolo y no contener espacios.'
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
        external_personnel: externalPersonnel,
        department,
        category,
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
      editExternalPersonnel || (normalizedEditEmail.length > 0 && editEmailDomain === ALLOWED_EMAIL_DOMAIN);

    if (!editFullName.trim() || !normalizedEditEmail || !editDepartment || !editCategory || !editPosition.trim()) {
      setEditError('Completa todos los campos para actualizar el usuario.');
      return;
    }

    if (!editAllowedDomain) {
      setEditError(`Solo se permite el dominio @${ALLOWED_EMAIL_DOMAIN}.`);
      return;
    }

    const wantsToChangePassword = editPassword.length > 0 || editConfirmPassword.length > 0;
    if (wantsToChangePassword) {
      if (!editPassword || !editConfirmPassword) {
        setEditError('Para cambiar contrasena debes completar y confirmar la nueva contrasena.');
        return;
      }
      if (editPasswordChecks.some((check) => !check.ok)) {
        setEditError(
          'La nueva contrasena debe tener minimo 8 caracteres, incluir mayuscula, minuscula, numero, simbolo y no contener espacios.'
        );
        return;
      }
      if (editPassword !== editConfirmPassword) {
        setEditError('Las nuevas contrasenas no coinciden.');
        return;
      }
    }

    const snapshot = {
      editingUser,
      editFullName,
      editEmail,
      editExternalPersonnel,
      editDepartment,
      editCategory,
      editPosition,
      editPassword,
      editConfirmPassword,
      showEditPassword,
      showEditConfirmPassword,
    };

    setEditSubmitting(true);
    closeEditModal();
    try {
      await api.csrf();
      const payload: {
        full_name: string;
        email: string;
        external_personnel: boolean;
        department: string;
        category: string;
        position: string;
        password?: string;
      } = {
        full_name: snapshot.editFullName.trim(),
        email: normalizedEditEmail,
        external_personnel: snapshot.editExternalPersonnel,
        department: snapshot.editDepartment,
        category: snapshot.editCategory,
        position: snapshot.editPosition.trim(),
      };
      if (wantsToChangePassword && snapshot.editPassword) {
        payload.password = snapshot.editPassword;
      }

      const updatedUser = (await api.adminUpdateUser(snapshot.editingUser.id, {
        ...payload,
      })) as AuthUser;

      setUsers((prev) => sortUsers(prev.map((item) => (item.id === updatedUser.id ? updatedUser : item))));
      setSuccess(
        wantsToChangePassword
          ? `Usuario actualizado: ${updatedUser.full_name} (contrasena renovada)`
          : `Usuario actualizado: ${updatedUser.full_name}`
      );
    } catch (err) {
      setEditingUser(snapshot.editingUser);
      setEditFullName(snapshot.editFullName);
      setEditEmail(snapshot.editEmail);
      setEditExternalPersonnel(snapshot.editExternalPersonnel);
      setEditDepartment(snapshot.editDepartment);
      setEditCategory(snapshot.editCategory);
      setEditPosition(snapshot.editPosition);
      setEditPassword(snapshot.editPassword);
      setEditConfirmPassword(snapshot.editConfirmPassword);
      setShowEditPassword(snapshot.showEditPassword);
      setShowEditConfirmPassword(snapshot.showEditConfirmPassword);
      setEditError(formatUserError(err instanceof Error ? err.message : 'No se pudo actualizar.'));
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-hidden">
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Administracion</p>
              <h1 className="text-lg font-semibold text-slate-900">Alta y edicion de usuarios</h1>
            </div>
            <p className="text-xs text-slate-600">Rol por departamento · BI = Admin · Finanzas = Finanzas</p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_350px]">
          <section className="min-h-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <form className="flex h-full flex-col" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Nombre completo</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Nombre y apellido"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Correo</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder={`usuario@${ALLOWED_EMAIL_DOMAIN}`}
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={externalPersonnel}
                      onChange={(event) => setExternalPersonnel(event.target.checked)}
                    />
                    Personal externo
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Departamento</label>
                  <select
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  >
                    {departmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Categoria</label>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Puesto</label>
                  <input
                    type="text"
                    required
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Ejemplo: Analista"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Contrasena</label>
                  <div className="mt-1.5 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-l-lg px-3 py-2 text-sm outline-none"
                      placeholder="Minimo 8 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Confirmar contrasena</label>
                  <div className="mt-1.5 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full rounded-l-lg px-3 py-2 text-sm outline-none"
                      placeholder="Repite la contrasena"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      {showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700">Seguridad de contrasena</p>
                  {password.length > 0 && (
                    <span className={`text-xs font-semibold ${currentStrength.text}`}>{currentStrength.label}</span>
                  )}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white shadow-inner">
                  <div
                    className={`h-1.5 rounded-full transition-all ${currentStrength.color}`}
                    style={{ width: `${(strengthScore / 5) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  {passwordChecks.map((check) => (
                    <span
                      key={check.label}
                      className={check.ok ? 'font-medium text-emerald-700' : 'text-slate-500'}
                    >
                      {check.ok ? '* ' : 'o '}
                      {check.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-600">
                {externalPersonnel ? (
                  <>Personal externo: se permiten correos con cualquier dominio.</>
                ) : (
                  <>Dominio permitido: <span className="font-semibold text-primary-700">@{ALLOWED_EMAIL_DOMAIN}</span></>
                )}
              </div>

              <div className="mt-2 space-y-2">
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {success}
                  </div>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? 'Registrando...' : 'Registrar usuario'}
                </button>
              </div>
            </form>
          </section>

          <aside className="flex min-h-0 h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Usuarios registrados</h2>
                <p className="text-xs text-slate-600">
                  Editar nombre, correo, departamento, categoria, puesto y cambiar contrasena.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {users.length}
              </span>
            </div>

            {usersLoading ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                Cargando usuarios...
              </div>
            ) : usersError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {usersError}
              </div>
            ) : users.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No hay usuarios registrados.
              </div>
            ) : (
              <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {users.map((item) => {
                  const isCurrentUser = currentUser?.id === item.id;
                  return (
                    <li key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.full_name}
                            {isCurrentUser ? ' (tu usuario)' : ''}
                          </p>
                          <p className="truncate text-[11px] text-slate-600">{item.email}</p>
                          {item.external_personnel ? (
                            <p className="mt-0.5 text-[11px] font-semibold text-sky-700">Personal externo</p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            {departmentLabelMap[item.department] || item.department} ·{' '}
                            {categoryLabelMap[item.category || ''] || item.category || 'Operador'} · {roleLabels[item.role]}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">{item.position}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
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
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
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

                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editExternalPersonnel}
                      onChange={(event) => setEditExternalPersonnel(event.target.checked)}
                    />
                    Personal externo
                  </label>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {editExternalPersonnel
                      ? 'Se permiten correos con cualquier dominio para este usuario.'
                      : `Se requiere el dominio @${ALLOWED_EMAIL_DOMAIN}.`}
                  </p>
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
                  <label className="block text-sm font-medium text-slate-700">Categoria</label>
                  <select
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  >
                    {categoryOptions.map((option) => (
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

                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-slate-700">Cambiar contrasena (opcional)</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Si lo dejas vacio, la contrasena actual del usuario se conserva.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Nueva contrasena</label>
                  <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(event) => setEditPassword(event.target.value)}
                      className="w-full rounded-l-lg px-3 py-2.5 text-sm outline-none"
                      placeholder="Minimo 8 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword((prev) => !prev)}
                      className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      {showEditPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Confirmar nueva contrasena</label>
                  <div className="mt-2 flex rounded-lg border border-slate-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200">
                    <input
                      type={showEditConfirmPassword ? 'text' : 'password'}
                      value={editConfirmPassword}
                      onChange={(event) => setEditConfirmPassword(event.target.value)}
                      className="w-full rounded-l-lg px-3 py-2.5 text-sm outline-none"
                      placeholder="Repite la nueva contrasena"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditConfirmPassword((prev) => !prev)}
                      className="rounded-r-lg px-3 text-[11px] font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      {showEditConfirmPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                {editPassword.length > 0 && (
                  <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-700">Seguridad de nueva contrasena</p>
                      <span className={`text-xs font-semibold ${editCurrentStrength.text}`}>
                        {editCurrentStrength.label}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white shadow-inner">
                      <div
                        className={`h-1.5 rounded-full transition-all ${editCurrentStrength.color}`}
                        style={{ width: `${(editStrengthScore / 5) * 100}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      {editPasswordChecks.map((check) => (
                        <span
                          key={check.label}
                          className={check.ok ? 'font-medium text-emerald-700' : 'text-slate-500'}
                        >
                          {check.ok ? '* ' : 'o '}
                          {check.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
