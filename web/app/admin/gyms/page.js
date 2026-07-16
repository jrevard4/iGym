'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadGyms, upsertGym } from '../../../../lib/supabase';

export default function AdminGymsPage() {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      setGyms(await loadGyms());
      setLoading(false);
    })();
  }, []);

  const toggle = async (gym, field) => {
    const updated = { ...gym, [field]: !gym[field] };
    setGyms((prev) => prev.map((g) => (g.id === gym.id ? updated : g)));
    await upsertGym(updated);
  };

  const filtered = gyms.filter((g) => g.gymName?.toLowerCase().includes(query.toLowerCase()));

  if (loading) return <div className="text-center text-gray-400 py-20">Loading gyms...</div>;

  return (
    <div>
      <h1 className="text-4xl font-black mb-2">Gyms</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{gyms.length} listed. Suspending a gym hides it from search/browse without deleting its data.</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name..."
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-sm mb-4 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      />

      <ul className="space-y-2">
        {filtered.map((g) => (
          <li key={g.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex justify-between items-center gap-3 flex-wrap">
            <div>
              <Link href={`/gyms/${g.id}`} className="font-bold text-sm text-gray-900 dark:text-gray-100 hover:underline">{g.gymName}</Link>
              <div className="text-xs text-gray-500 dark:text-gray-400">{g.location}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {g.suspended && <span className="text-xs font-bold text-danger">SUSPENDED</span>}
              <button
                onClick={() => toggle(g, 'featured')}
                className={'text-xs font-semibold px-3 py-1.5 rounded-lg transition ' + (g.featured ? 'bg-warning text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')}
              >
                {g.featured ? '⭐ Featured' : 'Feature'}
              </button>
              <button
                onClick={() => toggle(g, 'suspended')}
                className={'text-xs font-semibold px-3 py-1.5 rounded-lg transition ' + (g.suspended ? 'bg-danger text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')}
              >
                {g.suspended ? 'Unsuspend' : 'Suspend'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
