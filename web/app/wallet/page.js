'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession } from '@/lib/auth';
import { loadUserPasses } from '../../../lib/supabase';

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setUser(session);

    // Refresh passes from DB so any pass purchased on mobile shows up here too
    (async () => {
      try {
        const fresh = await loadUserPasses(session.id);
        setPasses(fresh);
        setSession({ ...session, activePasses: fresh });
      } catch {
        setPasses(session.activePasses || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading || !user) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="text-gray-400">Loading your wallet...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-black mb-2">Your Wallet</h1>
      <p className="text-gray-600 mb-8">
        Active passes for {user.firstName || user.username}. Open the iGym mobile app to scan in at the front desk.
      </p>

      {passes.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4">🎟️</div>
          <h2 className="text-xl font-bold mb-2">No passes yet</h2>
          <p className="text-gray-600 mb-6">Browse gyms near you and buy a day-pass to get started.</p>
          <Link
            href="/gyms"
            className="inline-block bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Find a Gym
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {passes.map((pass) => {
            const expired = pass.expiresAt && new Date(pass.expiresAt) < new Date();
            const hasPunch = pass.remainingPunches != null;
            return (
              <li
                key={pass.id}
                className={
                  'bg-white border-2 rounded-2xl p-5 transition ' +
                  (expired ? 'opacity-60 border-gray-200' : 'border-gray-900')
                }
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-xl font-bold">{pass.gymName}</div>
                    <div className="text-accent font-semibold">{pass.label}</div>
                  </div>
                  <span
                    className={
                      'text-sm font-bold px-3 py-1 rounded-full ' +
                      (expired
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700')
                    }
                  >
                    {expired ? 'Expired' : 'Active'}
                  </span>
                </div>
                <div className="flex justify-between items-end pt-3 border-t border-gray-100">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Expires</div>
                    <div className="font-semibold">
                      {pass.expiresAt ? new Date(pass.expiresAt).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  {hasPunch && !expired && (
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Scans left</div>
                      <div className="text-2xl font-black text-success">
                        {pass.remainingPunches}
                        <span className="text-sm text-gray-400"> / {pass.totalPunches}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 font-mono text-xs text-gray-500 break-all">
                  {pass.id}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
