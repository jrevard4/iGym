'use client';

import { useT } from '@/lib/PreferencesContext';

export default function Footer() {
  const t = useT();

  return (
    <footer className="mt-24 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-3 gap-8 text-sm">
        <div>
          <div className="text-xl font-black mb-2">
            <span className="text-brand-text">i</span>Gym
          </div>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            Finding the right gym, for you.
          </p>
        </div>

        <div>
          <div className="font-semibold mb-3 text-gray-900 dark:text-gray-100">For Members</div>
          <ul className="space-y-2 text-gray-600 dark:text-gray-400">
            <li><a href="/gyms" className="hover:text-brand-text">{t('findGym')}</a></li>
            <li><a href="/register" className="hover:text-brand-text">Create Account</a></li>
            <li><a href="/wallet" className="hover:text-brand-text">{t('wallet')}</a></li>
          </ul>
        </div>

        <div>
          <div className="font-semibold mb-3 text-gray-900 dark:text-gray-100">{t('forGymOwners')}</div>
          <ul className="space-y-2 text-gray-600 dark:text-gray-400">
            <li><a href="/owner/login" className="hover:text-brand-text">Owner Portal →</a></li>
            <li>AI photo tools still live in the iGym mobile app</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-800 py-5 text-center text-xs text-gray-500 dark:text-gray-500">
        © {new Date().getFullYear()} iGym. All rights reserved.
      </div>
    </footer>
  );
}
