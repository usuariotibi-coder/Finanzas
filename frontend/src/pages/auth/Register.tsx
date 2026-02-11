import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import useAuth from '../../hooks/useAuth';
import { departmentOptions } from '../../context/AuthContext';
import { buildPath, getLastPath, sanitizePath, wasPageReload } from '../../utils/lastPath';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState(departmentOptions[0]?.value || 'finanzas');
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const allowedEmailDomain = 'na.scio-automation.com';
  const normalizedEmail = email.trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] || '';
  const isAllowedDomain = normalizedEmail.length > 0 && emailDomain === allowedEmailDomain;
  const passwordChecks = [
    { label: 'Minimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Una mayuscula (A-Z)', ok: /[A-Z]/.test(password) },
    { label: 'Una minuscula (a-z)', ok: /[a-z]/.test(password) },
    { label: 'Un numero (0-9)', ok: /\d/.test(password) },
    { label: 'Un simbolo (!@#$...)', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const passedChecks = passwordChecks.filter((check) => check.ok).length;
  const strengthScore = Math.min(5, passedChecks + (password.length >= 12 ? 1 : 0));
  const strengthMeta = [
    { label: 'Muy debil', color: 'bg-red-500', text: 'text-red-600' },
    { label: 'Debil', color: 'bg-orange-500', text: 'text-orange-600' },
    { label: 'Media', color: 'bg-amber-500', text: 'text-amber-600' },
    { label: 'Fuerte', color: 'bg-emerald-500', text: 'text-emerald-600' },
    { label: 'Muy fuerte', color: 'bg-emerald-600', text: 'text-emerald-700' },
  ][Math.max(0, Math.min(4, strengthScore - 1))];

  const showFormError = (message: string) => {
    setError(message);
    setModalMessage(message);
  };

  const formatRegisterError = (message: string) => {
    const normalized = message.toLowerCase();
    if (normalized.includes('csrf') || normalized.includes('token missing')) {
      return 'No se pudo validar la sesión. Recarga la página e intenta de nuevo.';
    }
    if (normalized.includes('ya esta registrado') || normalized.includes('already exists')) {
      return 'Este correo ya está registrado. Intenta iniciar sesión.';
    }
    return message;
  };

  const redirectTarget =
    sanitizePath(
      buildPath((location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from)
    ) ||
    getLastPath() ||
    '/';

  useEffect(() => {
    if (!user) return;
    if (wasPageReload() && location.pathname === '/registro') {
      return;
    }
    navigate(redirectTarget, { replace: true });
  }, [user, navigate, redirectTarget, location.pathname]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (
      !fullName.trim() ||
      !email.trim() ||
      !department ||
      !position.trim() ||
      !password ||
      !confirmPassword
    ) {
      showFormError('Completa todos los campos antes de crear la cuenta.');
      return;
    }

    if (passwordChecks.some((check) => !check.ok)) {
      showFormError(
        'La contrasena debe tener minimo 8 caracteres e incluir mayuscula, minuscula, numero y simbolo.'
      );
      return;
    }

    if (!isAllowedDomain) {
      showFormError(`Solo se permite el dominio @${allowedEmailDomain}.`);
      return;
    }

    if (password !== confirmPassword) {
      showFormError('Las contrasenas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        full_name: fullName,
        email,
        department,
        position,
        password,
      });
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      showFormError(
        formatRegisterError(err instanceof Error ? err.message : 'No se pudo registrar.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-10">
        <div className="mb-6">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700 transition-colors hover:border-primary-200 hover:bg-primary-100"
            to="/login"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ←
            </span>
            Volver a iniciar sesión
          </Link>
        </div>
        <div className="mb-8">
          <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">Registro</p>
          <h1 className="text-2xl font-semibold text-primary-900">Crea una cuenta</h1>
          <p className="text-sm text-neutral-600 mt-2">Define tu departamento y rol desde el inicio.</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Nombre completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder="Nombre y apellido"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder={`usuario@${allowedEmailDomain}`}
            />
            <p className="mt-2 text-xs text-neutral-500">
              Solo se permite el dominio <span className="font-semibold text-primary-700">@{allowedEmailDomain}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Departamento</label>
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              >
                {departmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Puesto</label>
              <input
                type="text"
                required
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                placeholder="Escribe tu puesto"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">Contrasena</label>
            <div className="mt-2 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                placeholder="Minimo 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                onMouseDown={(event) => event.preventDefault()}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-1 text-primary-600 hover:text-primary-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-200"
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                <span className="sr-only">{showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}</span>
                {showPassword ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.5 10.5a2 2 0 0 0 2.83 2.83" />
                    <path d="M6.23 6.23C4.2 7.76 2.77 10 2 12c1.5 3.5 5 6 10 6 1.7 0 3.2-.3 4.5-.9" />
                    <path d="M9.5 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-4.16 4.82" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 bg-neutral-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 10V7a5 5 0 0 1 10 0v3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <rect
                        x="5"
                        y="10"
                        width="14"
                        height="10"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                  Seguridad de contrasena
                </div>
                {password.length > 0 && (
                  <span className={`text-sm font-semibold ${strengthMeta.text}`}>
                    {strengthMeta.label}
                  </span>
                )}
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-white shadow-inner">
                <div
                  className={`h-2 rounded-full transition-all ${strengthMeta.color}`}
                  style={{ width: `${(strengthScore / 5) * 100}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-neutral-600 sm:grid-cols-2">
                {passwordChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full border ${
                        check.ok ? 'border-emerald-400 bg-emerald-400' : 'border-gray-300'
                      }`}
                    />
                    <span className={check.ok ? 'text-emerald-600' : 'text-neutral-500'}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">Confirmar contrasena</label>
            <div className="mt-2 relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                placeholder="Repite la contrasena"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                onMouseDown={(event) => event.preventDefault()}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-1 text-primary-600 hover:text-primary-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-200"
                aria-label={showConfirmPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                <span className="sr-only">{showConfirmPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}</span>
                {showConfirmPassword ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.5 10.5a2 2 0 0 0 2.83 2.83" />
                    <path d="M6.23 6.23C4.2 7.76 2.77 10 2 12c1.5 3.5 5 6 10 6 1.7 0 3.2-.3 4.5-.9" />
                    <path d="M9.5 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-4.16 4.82" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-semibold shadow hover:bg-primary-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Registrando...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-sm text-neutral-600 mt-6 text-center">
          Ya tienes cuenta?{' '}
          <Link className="text-primary-600 font-semibold hover:underline" to="/login">
            Iniciar sesión
          </Link>
        </p>
      </div>

      {modalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-primary-900">No se pudo registrar</h2>
                <p className="mt-2 text-sm text-neutral-600">{modalMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalMessage(null)}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-sm text-neutral-600 hover:text-neutral-800"
                aria-label="Cerrar mensaje"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={() => setModalMessage(null)}
              className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
