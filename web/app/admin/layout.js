'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAdminSession, clearAdminSession } from '@/lib/adminAuth';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/gyms', label: 'Gyms' },
  { href: '/admin/reviews', label: 'Reviews' },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const isPublicRoute = pathname === '/admin/login';

  useEffect(() => {
    if (isPublicRoute) { setChecked(true); return; }
    if (!getAdminSession()) {
      router.replace('/admin/login');
      return;
    }
    setChecked(true);
  }, [isPublicRoute, router]);

  if (isPublicRoute) return children;
  if (!checked) return <div className="max-w-6xl mx-auto px-6 py-20 text-center text-gray-400">Loading...</div>;

  const onLogout = () => {
    clearAdminSession();
    router.push('/admin/login');
  };

  return (
    <div>
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-2xl font-black tracking-tight">
              <span className="text-brand-text dark:text-blue-400">i</span>Gym
            </Link>
            <span className="hidden sm:inline text-xs font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wide border-l border-gray-200 dark:border-gray-800 pl-3">
              Platform Admin
            </span>
          </div>
          <button onClick={onLogout} className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-danger transition">
            Logout
          </button>
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
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
