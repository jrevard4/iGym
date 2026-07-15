'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearOwnerSession } from '@/lib/ownerAuth';
import { usePreferences } from '@/lib/PreferencesContext';

const TABS = [
  { href: '/owner', label: 'Desk' },
  { href: '/owner/inventory', label: 'Inventory' },
  { href: '/owner/profile', label: 'Profile' },
  { href: '/owner/trainers', label: 'Trainers' },
  { href: '/owner/members', label: 'Members' },
  { href: '/owner/analytics', label: 'Analytics' },
];

export default function OwnerHeader({ gymName }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = usePreferences();

  const onLogout = () => {
    clearOwnerSession();
    router.push('/owner/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-2xl font-black tracking-tight">
            <span className="text-brand-text">i</span>Gym
          </Link>
          <span className="hidden sm:inline text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-l border-gray-200 dark:border-gray-800 pl-3">
            Owner Console
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-lg text-gray-500 dark:text-gray-400 hover:text-brand-text transition w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {gymName && (
            <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{gymName}</span>
            </span>
          )}
          <button onClick={onLogout} className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-danger transition">
            Logout
          </button>
        </div>
      </div>
      <nav className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto pb-3">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                'px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition ' +
                (active ? 'bg-brand text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
