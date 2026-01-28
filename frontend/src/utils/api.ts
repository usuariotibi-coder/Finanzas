const resolveApiRoot = () => {
  const raw = String((import.meta as any).env?.VITE_API_URL || 'http://localhost:8000').trim();
  if (!raw) return 'http://localhost:8000';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};

const API_ROOT = resolveApiRoot();
const API_BASE = `${API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '')}/api`;

const getCookie = (name: string) => {
  const value = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.split('=')[1]) : '';
};

const extractErrorMessage = (data: unknown): string | null => {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors[0]) {
    return String(payload.non_field_errors[0]);
  }
  const firstKey = Object.keys(payload)[0];
  if (firstKey) {
    const value = payload[firstKey];
    if (Array.isArray(value) && value[0]) {
      return String(value[0]);
    }
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
};

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    const csrfToken = getCookie('csrftoken');
    if (csrfToken && !headers.has('X-CSRFToken')) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = extractErrorMessage(data);
    throw new Error(detail || 'Error en la solicitud.');
  }

  return data;
};

export const api = {
  csrf: () => apiFetch('/auth/csrf/'),
  me: () => apiFetch('/auth/me/'),
  login: (email: string, password: string) =>
    apiFetch('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (payload: { email: string; full_name: string; department: string; position: string; password: string }) =>
    apiFetch('/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => apiFetch('/auth/logout/', { method: 'POST' }),
};
