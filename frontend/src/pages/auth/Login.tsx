import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import useAuth from '../../hooks/useAuth';
import { buildPath, getLastPath, sanitizePath } from '../../utils/lastPath';

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
    if (user) {
      navigate(redirectTarget, { replace: true });
    }
  }, [user, navigate, redirectTarget]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion.');
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary-600 hover:text-primary-800"
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
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
