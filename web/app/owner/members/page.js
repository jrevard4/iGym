'use client';

import { useEffect, useState } from 'react';
import { loadGymPasses } from '../../../../lib/supabase';
import { useOwnerContext } from '@/lib/ownerContext';

export default function OwnerMembersPage() {
  const { owner } = useOwnerContext();
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setPasses(await loadGymPasses(owner.id)); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [owner.id]);

  const isUpcoming = (p) => p.startsAt && new Date(p.startsAt) > new Date();
  const isExpired = (p) => p.expiresAt && new Date(p.expiresAt) <= new Date();
  const active = passes.filter((p) => !isExpired(p) && !isUpcoming(p));
  const upcoming = passes.filter((p) => !isExpired(p) && isUpcoming(p));
  const expired = passes.filter(isExpired);

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-black mb-2">Pass Holders</h1>
          <p className="text-gray-600 dark:text-gray-400">{passes.length} {passes.length === 1 ? 'pass' : 'passes'} sold at your gym.</p>
        </div>
        <button onClick={refresh} className="text-brand text-sm font-semibold hover:underline shrink-0">↻ Refresh</button>
      </div>

      {loading ? (
        <p className="text-gray-400 dark:text-gray-600">Loading...</p>
      ) : passes.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🎟️</div>
          <h2 className="text-lg font-bold mb-1">No passes sold yet</h2>
          <p className="text-gray-500 dark:text-gray-500 text-sm">Pass holders will appear here once members purchase access.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6 max-w-lg">
            <Stat label="Total sold" value={passes.length} color="text-brand" />
            <Stat label="Active" value={active.length} color="text-success" />
            <Stat label="Upcoming" value={upcoming.length} color="text-warning" />
            <Stat label="Expired" value={expired.length} color="text-danger" />
          </div>
          <ul className="space-y-3 max-w-lg">
            {passes.map((pass) => {
              const passExpired = isExpired(pass);
              const passUpcoming = !passExpired && isUpcoming(pass);
              const hasPunch = pass.remainingPunches != null;
              const borderClass = passExpired ? 'border-danger' : passUpcoming ? 'border-warning' : 'border-success';
              const textClass = passExpired ? 'text-danger' : passUpcoming ? 'text-warning' : 'text-success';
              return (
                <li key={pass.id} className={'bg-white dark:bg-gray-900 border-l-4 rounded-xl p-4 ' + borderClass}>
                  <div className="flex justify-between">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{pass.label}</span>
                    <span className={'text-xs font-bold ' + textClass}>
                      {passExpired ? 'Expired' : passUpcoming ? `Starts ${new Date(pass.startsAt).toLocaleDateString()}` : 'Active'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">User ID: {pass.userId}</div>
                  {hasPunch && <div className="text-xs text-brand mt-1">{pass.remainingPunches}/{pass.totalPunches} scans remaining</div>}
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-600 mt-2">
                    <span>Purchased: {new Date(pass.purchasedAt).toLocaleDateString()}</span>
                    {pass.expiresAt && <span>Expires: {new Date(pass.expiresAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="text-success font-bold text-sm mt-2">${Number(pass.gymReceives || 0).toFixed(2)} earned</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
      <div className={'text-2xl font-black ' + color}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-500 font-semibold mt-1">{label}</div>
    </div>
  );
}
