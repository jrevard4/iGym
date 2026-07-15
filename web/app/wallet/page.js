'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession } from '@/lib/auth';
import { loadUserPasses, loadUserCheckins, getUserById, upsertUser } from '../../../lib/supabase';
import { computeCheckinStats } from '../../../lib/helpers';

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setUser(session);

    // Refresh passes from DB so any pass purchased on mobile shows up here too,
    // and re-fetch the user row so referralCredit reflects purchases other
    // people made using this member's shared link (the cached session won't).
    (async () => {
      try {
        const [fresh, checkinRows, freshUser] = await Promise.all([
          loadUserPasses(session.id),
          loadUserCheckins(session.id),
          getUserById(session.id),
        ]);
        setPasses(fresh);
        setCheckins(checkinRows);
        const merged = { ...session, ...(freshUser || {}), activePasses: fresh };
        setUser(merged);
        setSession(merged);
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
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Active passes for {user.firstName || user.username}. Open the iGym mobile app to scan in at the front desk.
      </p>

      {checkins.length > 0 && <StreakCard checkins={checkins} />}

      {user.referralCode && <ReferralCard user={user} />}

      {(user.savedWorkouts || []).length > 0 && (
        <WorkoutHistoryCard user={user} onChange={(updated) => setUser(updated)} />
      )}

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
            const upcoming = !expired && pass.startsAt && new Date(pass.startsAt) > new Date();
            const hasPunch = pass.remainingPunches != null;
            return (
              <li
                key={pass.id}
                className={
                  'bg-white dark:bg-gray-900 border-2 rounded-2xl p-5 transition ' +
                  (expired ? 'opacity-60 border-gray-200 dark:border-gray-800' : upcoming ? 'border-amber-300 dark:border-amber-700' : 'border-gray-900 dark:border-gray-600')
                }
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{pass.gymName}</div>
                    <div className="text-accent font-semibold">{pass.label}</div>
                  </div>
                  <span
                    className={
                      'text-sm font-bold px-3 py-1 rounded-full ' +
                      (expired
                        ? 'bg-red-100 text-red-700'
                        : upcoming
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700')
                    }
                  >
                    {expired ? 'Expired' : upcoming ? `Starts ${new Date(pass.startsAt).toLocaleDateString()}` : 'Active'}
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

// ─── Streak card ──────────────────────────────────────────────────────────
function StreakCard({ checkins }) {
  const stats = computeCheckinStats(checkins);
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-8">
      <div className="flex justify-between items-center">
        <span className="font-bold text-indigo-700">🔥 {stats.currentStreak}-day streak</span>
        <span className="font-semibold text-indigo-700">{stats.totalVisits} visits</span>
      </div>
      {stats.badges.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {stats.badges.map((b) => (
            <span key={b.threshold} className="bg-white border border-indigo-200 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
              🏅 {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Referral card ────────────────────────────────────────────────────────
function ReferralCard({ user }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== 'undefined'
    ? `${window.location.origin}/register?ref=${user.referralCode}`
    : '';

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'iGym', text: 'Find your next gym on iGym:', url: link }); }
      catch { /* user cancelled the share sheet */ }
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-900 text-white rounded-2xl p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="font-bold mb-1">🎁 Invite a friend</div>
        <div className="text-sm text-gray-300">
          Your code: <span className="font-mono font-bold text-white">{user.referralCode}</span>
          {user.referralCount > 0 && <span className="ml-2 text-gray-400">· {user.referralCount} joined so far</span>}
        </div>
        {user.referralCredit > 0 && (
          <div className="text-sm text-success font-semibold mt-1">
            💰 ${Number(user.referralCredit).toFixed(2)} earned from referrals
          </div>
        )}
      </div>
      <button
        onClick={share}
        className="bg-white text-gray-900 font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition shrink-0"
      >
        {copied ? 'Link copied!' : 'Share iGym'}
      </button>
    </div>
  );
}

// ─── AI workout history ────────────────────────────────────────────────────
function WorkoutHistoryCard({ user, onChange }) {
  const [expandedId, setExpandedId] = useState(null);
  const workouts = user.savedWorkouts || [];

  const remove = async (id) => {
    const updated = { ...user, savedWorkouts: workouts.filter((w) => w.id !== id) };
    setSession(updated);
    onChange(updated);
    await upsertUser(updated);
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mb-8">
      <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-500 mb-4">✨ Recent AI Workouts</h2>
      <ul className="space-y-2">
        {workouts.map((w) => {
          const expanded = expandedId === w.id;
          return (
            <li key={w.id} className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : w.id)}
                className="w-full flex justify-between items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div>
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{w.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                    {w.gymName} · {(w.muscleGroups || []).join(', ') || 'Full body'} · {new Date(w.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-gray-400 dark:text-gray-600 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && (
                <div className="px-4 pb-4">
                  <ul className="space-y-2 mb-2">
                    {(w.exercises || []).map((ex, i) => (
                      <li key={i} className="text-xs text-gray-700 dark:text-gray-300">
                        <span className="font-semibold">{i + 1}. {ex.name}</span> — {ex.sets} × {ex.reps} ({ex.equipment})
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => remove(w.id)} className="text-danger text-xs font-semibold hover:underline">Remove</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
