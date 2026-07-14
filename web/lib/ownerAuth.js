// Owner-session equivalent of lib/auth.js — separate localStorage key so a
// browser can be logged in as a member and an owner at the same time (two tabs).
const KEY = 'igym_active_owner';

export function getOwnerSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setOwnerSession(owner) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(owner));
  window.dispatchEvent(new Event('storage'));
}

export function clearOwnerSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('storage'));
}
