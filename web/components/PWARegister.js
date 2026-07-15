'use client';

import { useEffect } from 'react';

// Registers the offline/installable service worker. Silently no-ops if the
// browser doesn't support it (e.g. older Safari) — PWA install is a bonus,
// not a requirement to use the site.
export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
