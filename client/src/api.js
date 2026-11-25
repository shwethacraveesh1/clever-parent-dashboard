export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export const api = {
  requestLink: (email) =>
    request('/api/auth/request-link', { method: 'POST', body: JSON.stringify({ email }) }),
  verify: (token) =>
    request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => request('/api/auth/me'),
  students: () => request('/api/students'),
  dashboard: (studentId) => request(`/api/students/${encodeURIComponent(studentId)}/dashboard`),
};
