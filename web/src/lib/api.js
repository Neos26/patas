import { auth } from '../config/firebase.js';
import { getDemoUser } from './demoUser.js';
import { getServerMode } from './serverMode.js';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function send(path, { method = 'GET', body, signal, formData } = {}) {
  const headers = {};

  const mode = await getServerMode();
  if (mode === 'demo') {
    const demo = getDemoUser();
    if (demo) headers['x-dev-user'] = JSON.stringify(demo);
  } else if (auth?.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  // For FormData uploads the browser must set the multipart boundary itself.
  if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (err) {
    const e = new Error('Cannot reach the server. Check that the API is running.');
    e.network = true;
    throw e;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const e = new Error(data?.error?.message || `Request failed (${res.status})`);
    e.status = res.status;
    e.details = data?.error?.details;
    throw e;
  }
  return data;
}

export const api = {
  get: (path, opts) => send(path, opts),
  post: (path, body, opts) => send(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => send(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => send(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => send(path, { ...opts, method: 'DELETE' }),
  upload: (path, formData, opts) => send(path, { ...opts, method: 'POST', formData }),
};
