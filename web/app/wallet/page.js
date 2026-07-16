'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession } from '@/lib/auth';
import { loadUserPasses, loadUserCheckins, getUserById, upsertUser, updatePass, loadUserClassBookings, cancelClassBooking } from '../../../lib/supabase';
import { computeCheckinStats, buildWorkoutICS } from '../../../lib/helpers';
import env from '../../../lib/env';

function downloadICS(workout) {
  const ics = buildWorkoutICS(workout);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(workout.title || 'workout').replace(/[^a-z0-9]+/gi, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [classBookings, setClassBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState(null);

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
        const [fresh, checkinRows, freshUser, bookings] = await Promise.all([
          loadUserPasses(session.id),
          loadUserCheckins(session.id),
          getUserById(session.id),
          loadUserClassBookings(session.id),
        ]);
        setPasses(fresh);
        setCheckins(checkinRows);
        setClassBookings(bookings);
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

  const cancelMembership = async (pass) => {
    if (!confirm(`Cancel auto-renew for ${pass.label}? You'll keep access until it expires on ${new Date(pass.expiresAt).toLocaleDateString()}.`)) return;
    setCancelingId(pass.id);
    try {
      await fetch(`${env.BACKEND_URL}/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: pass.stripeSubscriptionId }),
      });
      await updatePass(pass.id, { status: 'canceled' });
      setPasses((prev) => prev.map((p) => (p.id === pass.id ? { ...p, status: 'canceled' } : p)));
    } catch (err) {
      alert(err.message || 'Could not cancel — please try again.');
    } finally {
      setCancelingId(null);
    }
  };

  const cancelBooking = async (booking) => {
    if (!confirm(`Cancel your spot in ${booking.className}?`)) return;
    await cancelClassBooking(booking.id);
    setClassBookings((prev) => prev.filter((b) => b.id !== booking.id));
  };

  // The referral/workouts sections only mount once loading finishes, so the
  // browser's native "scroll to #hash on load" already ran (and found
  // nothing) by the time they exist — nav links like Header's "Invite &
  // Earn" (/wallet#referral) need this manual retry once the DOM has caught up.
  useEffect(() => {
    if (loading || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading]);

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

      {user.referralCode && <div id="referral"><ReferralCard user={user} /></div>}

      {(user.savedWorkouts || []).length > 0 && (
        <div id="workouts"><WorkoutHistoryCard user={user} onChange={(updated) => setUser(updated)} /></div>
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
                {pass.stripeSubscriptionId && !expired && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                    {pass.status === 'canceled' ? (
                      <span className="text-xs font-semibold text-gray-500">Auto-renew canceled — access ends on expiry</span>
                    ) : pass.status === 'past_due' ? (
                      <span className="text-xs font-semibold text-danger">⚠ Last payment failed — update your card to keep this membership</span>
                    ) : (
                      <span className="text-xs font-semibold text-brand-text dark:text-blue-400">🔁 Auto-renews every {pass.value} day(s)</span>
                    )}
                    {pass.status !== 'canceled' && (
                      <button
                        onClick={() => cancelMembership(pass)}
                        disabled={cancelingId === pass.id}
                        className="text-xs font-semibold text-danger hover:underline disabled:opacity-60"
                      >
                        {cancelingId === pass.id ? 'Canceling...' : 'Cancel auto-renew'}
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-gray-100 font-mono text-xs text-gray-500 break-all">
                  {pass.id}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {classBookings.length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-3">📅 Booked Classes</h2>
          <ul className="space-y-2">
            {classBookings.map((b) => (
              <li key={b.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex justify-between items-center gap-3">
                <div>
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{b.className}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(b.classDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {b.status === 'waitlisted' && <span className="ml-2 font-semibold text-warning">Waitlisted</span>}
                  </div>
                </div>
                <button onClick={() => cancelBooking(b)} className="text-xs font-semibold text-danger hover:underline shrink-0">Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Streak card ──────────────────────────────────────────────────────────
function StreakCard({ checkins }) {
  const stats = computeCheckinStats(checkins);
  // Mirrors the mobile Profile tab's nudge: at risk when there's a live
  // streak but no check-in yet today (i.e. it'll break if they skip today).
  const lastCheckinMs = checkins.length > 0 ? Math.max(...checkins.map((c) => new Date(c.created_at).getTime())) : 0;
  const checkedInToday = lastCheckinMs > 0 && new Date(lastCheckinMs).toDateString() === new Date().toDateString();
  const streakAtRisk = stats.currentStreak > 0 && !checkedInToday;

  return (
    <div className="mb-8">
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
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
      {streakAtRisk && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-3">
          <span className="text-sm font-bold text-amber-800">⏰ Don&apos;t lose your streak — check in today!</span>
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

  const markComplete = async (id) => {
    const today = dayKey(new Date());
    const updated = {
      ...user,
      savedWorkouts: workouts.map((w) => {
        if (w.id !== id) return w;
        const completions = w.completions || [];
        if (completions.some((c) => dayKey(c) === today)) return w; // already marked today
        return { ...w, completions: [new Date().toISOString(), ...completions] };
      }),
    };
    setSession(updated);
    onChange(updated);
    await upsertUser(updated);
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mb-8">
      <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-4">✨ Recent AI Workouts</h2>
      <ul className="space-y-2">
        {workouts.map((w) => {
          const expanded = expandedId === w.id;
          const stats = computeCheckinStats((w.completions || []).map((c) => ({ created_at: c })));
          const doneToday = (w.completions || []).some((c) => dayKey(c) === dayKey(new Date()));
          return (
            <li key={w.id} className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : w.id)}
                className="w-full flex justify-between items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div>
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{w.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {w.gymName} · {(w.muscleGroups || []).join(', ') || 'Full body'} · {new Date(w.createdAt).toLocaleDateString()}
                    {stats.totalVisits > 0 && ` · ✓ ${stats.totalVisits}x done${stats.currentStreak > 1 ? ` · 🔥 ${stats.currentStreak}-day streak` : ''}`}
                  </div>
                </div>
                <span className="text-gray-400 dark:text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && (
                <div className="px-4 pb-4">
                  <ul className="space-y-2 mb-3">
                    {(w.exercises || []).map((ex, i) => (
                      <li key={i} className="text-xs text-gray-700 dark:text-gray-300">
                        <span className="font-semibold">{i + 1}. {ex.name}</span> — {ex.sets} × {ex.reps} ({ex.equipment})
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3 items-center">
                    <button
                      onClick={() => markComplete(w.id)}
                      disabled={doneToday}
                      className="bg-success text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60 transition"
                    >
                      {doneToday ? '✓ Done today' : 'Mark complete today'}
                    </button>
                    <button onClick={() => downloadICS(w)} className="text-brand-text text-xs font-semibold hover:underline">📅 Add to calendar</button>
                    <button onClick={() => remove(w.id)} className="text-danger text-xs font-semibold hover:underline">Remove</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
