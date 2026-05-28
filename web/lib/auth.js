// Lightweight session helper backed by localStorage — mirrors the mobile app
// pattern (which uses AsyncStorage). Good enough for an MVP.
//
// Production upgrade path: replace with @supabase/ssr cookies + middleware so
// session checks happen server-side on every page render. See web/README.md.

const KEY = 'igym_active_user';

export function getSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(user) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(user));
  // Notify other tabs / our own Header listener
  window.dispatchEvent(new Event('storage'));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('storage'));
}

export function isLoggedIn() {
  return !!getSession();
}
