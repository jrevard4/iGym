'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession, clearSession } from '@/lib/auth';
import { usePreferences, useT } from '@/lib/PreferencesContext';
import { LANGUAGES } from '../../lib/i18n';

export default function Header() {
  const [user, setUser] = useState(null);
  const { theme, toggleTheme, lang, setLang } = usePreferences();
  const t = useT();

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
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-black tracking-tight">
          <span className="text-brand-text dark:text-blue-400">i</span>Gym
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Link href="/gyms" className="hover:text-brand-text dark:hover:text-blue-400">{t('findGym')}</Link>
          {user && <Link href="/wallet" className="hover:text-brand-text dark:hover:text-blue-400">{t('wallet')}</Link>}
          {/* Secondary links — kept off the nav below lg so the existing sm+ pair above never wraps. */}
          <Link href="/gyms/city" className="hidden lg:inline hover:text-brand-text dark:hover:text-blue-400">Browse by City</Link>
          <Link href="/classes" className="hidden lg:inline hover:text-brand-text dark:hover:text-blue-400">Upcoming Classes</Link>
          {user && <Link href="/wallet#workouts" className="hidden lg:inline hover:text-brand-text dark:hover:text-blue-400">My Workouts</Link>}
          {user && <Link href="/wallet#referral" className="hidden lg:inline hover:text-brand-text dark:hover:text-blue-400">Invite &amp; Earn</Link>}
          <Link href="/owner/login" className="hidden lg:inline hover:text-brand-text dark:hover:text-blue-400">Owner Portal</Link>
        </nav>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-lg text-gray-500 dark:text-gray-400 hover:text-brand-text dark:hover:text-blue-400 transition w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            aria-label="Choose language"
            className="text-sm bg-transparent text-gray-500 dark:text-gray-400 hover:text-brand-text dark:hover:text-blue-400 transition outline-none cursor-pointer"
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
          </select>
          {user ? (
            <>
              <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
                Hi, <span className="font-semibold text-gray-900 dark:text-gray-100">{user.firstName || user.username}</span>
              </span>
              <button
                onClick={onLogout}
                className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-danger transition"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-text dark:hover:text-blue-400"
              >
                {t('login')}
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
