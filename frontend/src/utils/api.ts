const resolveApiRoot = () => {
  const raw = String((import.meta as any).env?.VITE_API_URL || 'http://localhost:8000').trim();
  if (!raw) return 'http://localhost:8000';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};

export const API_ROOT = resolveApiRoot();
const API_BASE = `${API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '')}/api`;
let csrfTokenCache = '';

const getCookie = (name: string) => {
  const value = document.cookie
    .split(';')
    .map((row) => row.trim())
    .find((row) => row.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.split('=')[1]) : '';
};

const isSafeMethod = (method: string) => ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);

const isCsrfError = (message: string | null) => {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('csrf');
};

const extractCsrfTokenFromPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return '';
  const raw = (payload as Record<string, unknown>).csrfToken;
  return typeof raw === 'string' ? raw : '';
};

const ensureCsrfToken = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cookieToken = getCookie('csrftoken');
    if (cookieToken) {
      csrfTokenCache = cookieToken;
      return cookieToken;
    }
    if (csrfTokenCache) {
      return csrfTokenCache;
    }
  }

  const response = await fetch(`${API_BASE}/auth/csrf/`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('No se pudo obtener CSRF token.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  const responseToken = extractCsrfTokenFromPayload(payload);
  const cookieToken = getCookie('csrftoken');
  csrfTokenCache = responseToken || cookieToken || csrfTokenCache;
  return csrfTokenCache;
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

export const apiFetch = async (
  path: string,
  options: RequestInit = {},
  allowCsrfRetry = true
): Promise<unknown> => {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!isFormData && options.body !== undefined && options.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!isSafeMethod(method)) {
    let csrfToken = getCookie('csrftoken') || csrfTokenCache;
    if (!csrfToken) {
      csrfToken = await ensureCsrfToken();
    }
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
    if (allowCsrfRetry && !isSafeMethod(method) && response.status === 403 && isCsrfError(detail)) {
      await ensureCsrfToken(true);
      return apiFetch(path, options, false);
    }
    throw new Error(detail || 'Error en la solicitud.');
  }

  return data;
};

export const api = {
  csrf: () => ensureCsrfToken(true),
  me: () => apiFetch('/auth/me/'),
  login: (email: string, password: string) =>
    apiFetch('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (payload: {
    email: string;
    full_name: string;
    department: string;
    category?: string;
    position: string;
    password: string;
  }) =>
    apiFetch('/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminRegister: (payload: {
    email: string;
    full_name: string;
    department: string;
    category?: string;
    position: string;
    password: string;
  }) =>
    apiFetch('/auth/admin/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminUsers: () => apiFetch('/auth/admin/users/'),
  assignableUsers: () => apiFetch('/auth/assignable-users/'),
  adminUpdateUser: (
    userId: number,
    payload: Partial<{
      email: string;
      full_name: string;
      department: string;
      category: string;
      position: string;
      password: string;
    }>
  ) =>
    apiFetch(`/auth/admin/users/${userId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    apiFetch('/auth/change-password/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => apiFetch('/auth/logout/', { method: 'POST' }),
};

export const toApiAssetUrl = (assetPath?: string | null) => {
  const raw = String(assetPath || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedRoot = API_ROOT.replace(/\/$/, '').replace(/\/api$/i, '');
  if (raw.startsWith('/')) {
    return `${normalizedRoot}${raw}`;
  }
  return `${normalizedRoot}/${raw}`;
};
