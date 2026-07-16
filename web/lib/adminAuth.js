// Platform-operator session — same localStorage-session shape as
// lib/ownerAuth.js, just a separate key and a boolean instead of a full
// record (there's no "admin" row in the database, only a shared password).
const KEY = 'igym_admin_session';

export function getAdminSession() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY) === 'true';
}

export function setAdminSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, 'true');
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
