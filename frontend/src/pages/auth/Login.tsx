import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import useAuth from '../../hooks/useAuth';
import { buildPath, getLastPath, sanitizePath, wasPageReload } from '../../utils/lastPath';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTarget =
    sanitizePath(
      buildPath((location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from)
    ) ||
    getLastPath() ||
    '/';

  useEffect(() => {
    if (!user) return;
    if (wasPageReload() && location.pathname === '/login') {
      return;
    }
    navigate(redirectTarget, { replace: true });
  }, [user, navigate, redirectTarget, location.pathname]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-10">
        <div className="mb-8">
          <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">Sistema</p>
          <h1 className="text-2xl font-semibold text-primary-900">Bienvenido de nuevo</h1>
          <p className="text-sm text-neutral-600 mt-2">Ingresa con tu cuenta para continuar.</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder="correo@empresa.com"
            />
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
                placeholder="********"
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
            {submitting ? 'Ingresando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-sm text-neutral-600 mt-6 text-center">
          No tienes cuenta?{' '}
          <Link className="text-primary-600 font-semibold hover:underline" to="/registro">
            Registrate
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
