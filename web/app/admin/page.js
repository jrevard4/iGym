'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadGyms, loadUsers } from '../../../lib/supabase';
import { computePlatformStats } from '../../../lib/helpers';

export default function AdminOverviewPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [gyms, users] = await Promise.all([loadGyms(), loadUsers()]);
      setStats(computePlatformStats(gyms, users));
      setLoading(false);
    })();
  }, []);

  if (loading || !stats) {
    return <div className="text-center text-gray-400 py-20">Loading platform stats...</div>;
  }

  const cards = [
    { label: 'Total gyms', value: stats.totalGyms },
    { label: 'Total members', value: stats.totalMembers },
    { label: 'Gross pass revenue', value: `$${stats.totalRevenue.toFixed(2)}` },
    { label: 'Platform fees earned', value: `$${stats.totalPlatformFees.toFixed(2)}` },
    { label: 'Total reviews', value: stats.totalReviews },
  ];

  return (
    <div>
      <h1 className="text-4xl font-black mb-6">Platform Overview</h1>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold mb-1">{c.label}</div>
            <div className="text-2xl font-black text-gray-900 dark:text-gray-100">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-3">Top gyms by revenue</h2>
        {stats.topGymsByRevenue.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No revenue yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {stats.topGymsByRevenue.map((g) => (
              <li key={g.id} className="py-3 flex justify-between items-center gap-3">
                <div>
                  <Link href={`/gyms/${g.id}`} className="font-bold text-sm text-gray-900 dark:text-gray-100 hover:underline">{g.gymName}</Link>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{g.location}</div>
                </div>
                <div className="text-success font-bold text-sm shrink-0">${Number(g.totalPassRevenue || 0).toFixed(2)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
