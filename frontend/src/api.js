const tokenKey = 'team-task-tracker.token';
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function getToken() {
  return window.localStorage.getItem(tokenKey);
}

export function setToken(token) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  window.localStorage.removeItem(tokenKey);
}

function resolvePath(path) {
  return apiBase ? `${apiBase}${path}` : path;
}

export async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const authToken = token ?? getToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(resolvePath(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const message = payload?.message || 'Request failed.';
    throw new Error(message);
  }

  return payload;
}