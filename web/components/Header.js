'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession, clearSession } from '@/lib/auth';

export default function Header() {
  const [user, setUser] = useState(null);

  // Pick up session on mount + when other tabs change it
  useEffect(() => {
    setUser(getSession());
    const onStorage = () => setUser(getSession());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const onLogout = () => {
    clearSession();
    setUser(null);
    window.location.href = '/';
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-black tracking-tight">
          <span className="text-brand">i</span>Gym
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-gray-700">
          <Link href="/gyms" className="hover:text-brand">Find a Gym</Link>
          {user && <Link href="/wallet" className="hover:text-brand">Wallet</Link>}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden sm:inline text-sm text-gray-600">
                Hi, <span className="font-semibold text-gray-900">{user.firstName || user.username}</span>
              </span>
              <button
                onClick={onLogout}
                className="text-sm font-medium text-gray-600 hover:text-danger transition"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 hover:text-brand"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
