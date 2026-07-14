'use client';

import { createContext, useContext } from 'react';

// Provided by app/owner/layout.js once the owner session is confirmed.
// `persistOwner` mirrors the mobile app's persistOwner(): update local state,
// the session cache, and the DB row in one call, so every owner page can just
// spread its changes into the gym object without re-deriving this each time.
export const OwnerContext = createContext(null);

export function useOwnerContext() {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error('useOwnerContext must be used within the /owner layout');
  return ctx;
}
