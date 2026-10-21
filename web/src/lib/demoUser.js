/** Demo-mode identity (used when Firebase is not configured). */

export const DEMO_ACCOUNTS = {
  teacher: {
    uid: 'demo-teacher',
    role: 'teacher',
    name: 'Prof. Maria Santos',
    email: 'teacher@integrity.demo',
  },
  student: {
    uid: 'demo-s1',
    role: 'student',
    name: 'Juan Dela Cruz',
    email: 'student1@integrity.demo',
  },
  admin: {
    uid: 'demo-admin',
    role: 'admin',
    name: 'Admin Rivera',
    email: 'admin@integrity.demo',
  },
};

const KEY = 'integrity_demo_user';

/** Fired (same tab) whenever the demo identity changes; other tabs get the
 *  native `storage` event. Listeners re-sync auth state so a sign-out really
 *  terminates the session everywhere, not just in the tab that clicked it. */
export const DEMO_USER_CHANGED = 'integrity:demo-user-changed';

export function getDemoUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function setDemoUser(user) {
  if (user) localStorage.setItem(KEY, JSON.stringify(user));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(DEMO_USER_CHANGED));
}
