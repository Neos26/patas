import { isFirebaseConfigured } from '../config/firebase.js';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

let modePromise = null;

/**
 * The API server is the source of truth for auth mode
 * (`GET /healthz` → { auth: 'demo' | 'firebase' }). The client env alone is
 * not enough: web/.env can have VITE_FIREBASE_* while the server runs without
 * credentials (demo mode), which previously broke login and role detection.
 * Falls back to the client-config heuristic when the API is unreachable.
 */
export function getServerMode() {
  if (!modePromise) {
    modePromise = fetch(`${BASE}/healthz`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => (h?.auth === 'firebase' ? 'firebase' : 'demo'))
      .catch(() => (isFirebaseConfigured ? 'firebase' : 'demo'));
  }
  return modePromise;
}
