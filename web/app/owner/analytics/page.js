'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAN_TIERS } from '../../../../lib/constants';
import { computeCheckinHeatmap, computeRecurringRevenueStats } from '../../../../lib/helpers';
import { loadGymCheckins, loadGymPasses } from '../../../../lib/supabase';
import { useOwnerContext } from '@/lib/ownerContext';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function OwnerAnalyticsPage() {
  const router = useRouter();
  const { owner, persistOwner } = useOwnerContext();
  const [copied, setCopied] = useState(false);
  const [heatmap, setHeatmap] = useState(null);
  const [recurring, setRecurring] = useState(null);
  const plan = PLAN_TIERS[owner.plan || 'free'];
  const planAllows = (feature) => !!plan.limits?.[feature];

  useEffect(() => {
    (async () => {
      const checkins = await loadGymCheckins(owner.id);
      setHeatmap(computeCheckinHeatmap(checkins));
    })();
  }, [owner.id]);

  useEffect(() => {
    (async () => {
      const passes = await loadGymPasses(owner.id);
      setRecurring(computeRecurringRevenueStats(passes));
    })();
  }, [owner.id]);

  const shareReferral = async () => {
    const text = `List your gym on iGym! Use referral code ${owner.referralCode} when you register your business.`;
    if (navigator.share) {
      try { await navigator.share({ title: 'iGym', text }); } catch { /* cancelled */ }
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const upgradePlan = (newPlan) => {
    router.push(`/owner/billing?plan=${newPlan}`);
  };

  const downgradePlan = async (newPlan) => {
    if (!confirm(`Switch to ${PLAN_TIERS[newPlan].name} — $${PLAN_TIERS[newPlan].price}/month?`)) return;
    await persistOwner({ ...owner, plan: newPlan });
  };

  const toggleFeatured = async () => {
    await persistOwner({ ...owner, featured: !owner.featured });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">Analytics</h1>
        <p className="text-gray-600 dark:text-gray-400">Revenue, referrals, plan, and search visibility for your gym.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-4">💰 Revenue overview</h2>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Total earned" value={`$${(owner.totalPassRevenue || 0).toFixed(2)}`} color="text-gray-900 dark:text-gray-100" />
          <Stat label="Platform fees (12%)" value={`$${(owner.platformFeesPaid || 0).toFixed(2)}`} color="text-danger" />
          <Stat label="Passes sold" value={owner.monthlyPassSales || 0} color="text-success" />
          <Stat label="Referrals" value={owner.referralCount || 0} color="text-accent" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-1">🔁 Recurring revenue</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Auto-renewing memberships only — one-time passes aren&apos;t counted.</p>
        {!recurring ? (
          <p className="text-gray-400 dark:text-gray-400 italic text-sm">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat label="MRR" value={`$${recurring.mrr.toFixed(2)}`} color="text-success" />
              <Stat label="Active" value={recurring.activeCount} color="text-brand-text dark:text-blue-400" />
              <Stat label="Past due" value={recurring.pastDueCount} color={recurring.pastDueCount > 0 ? 'text-danger' : 'text-gray-400'} />
            </div>
            {recurring.pastDue.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">⚠ At risk of lapsing</div>
                <ul className="space-y-1.5">
                  {recurring.pastDue.map((p) => (
                    <li key={p.id} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{p.label} — ${Number(p.price).toFixed(2)}</span>
                      <a href={`/owner/messages?userId=${p.userId}`} className="text-xs font-semibold text-brand-text dark:text-blue-400 hover:underline">Message</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-gray-900 dark:bg-gray-950 text-white rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap border border-transparent dark:border-gray-800">
        <div>
          <div className="font-bold mb-1">🎁 Invite another gym</div>
          <div className="text-sm text-gray-300">
            Your code: <span className="font-mono font-bold text-white">{owner.referralCode}</span>
            {owner.referralCount > 0 && <span className="ml-2 text-gray-400">· {owner.referralCount} joined so far</span>}
          </div>
        </div>
        <button onClick={shareReferral} className="bg-white text-gray-900 font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition shrink-0">
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-4">⭐ Subscription & placement</h2>
        <div className="flex justify-between items-center mb-4">
          <span className="font-bold" style={{ color: plan.color }}>{plan.emoji} {plan.name} Plan</span>
          <span className="text-brand-text dark:text-blue-400 font-bold">${plan.price}/mo</span>
        </div>
        <div className="flex gap-2 mb-4">
          {Object.keys(PLAN_TIERS).filter((k) => k !== owner.plan).map((k) => {
            const isUpgrade = PLAN_TIERS[k].price > plan.price;
            return (
              <button
                key={k}
                onClick={() => (isUpgrade ? upgradePlan(k) : downgradePlan(k))}
                className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-semibold py-2 rounded-lg transition"
              >
                {isUpgrade ? 'Upgrade to' : 'Switch to'} {PLAN_TIERS[k].name}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-4">
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">⭐ Featured placement</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{planAllows('featured') ? 'Appear at the top of member searches.' : 'Pro plan required.'}</div>
          </div>
          <input type="checkbox" checked={!!owner.featured} onChange={toggleFeatured} disabled={!planAllows('featured')} className="w-5 h-5 accent-warning" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-4">Facility overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Equipment" value={(owner.equipment || []).length} color="text-brand-text dark:text-blue-400" />
          <Stat label="Pass tiers" value={(owner.passes || []).length} color="text-success" />
          <Stat label="Trainers" value={(owner.trainers || []).length} color="text-warning" />
          <Stat label="Classes" value={(owner.classes || []).length} color="text-accent" />
          <Stat label="Search views" value={owner.matchImpressions || 0} color="text-purple-600" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 dark:text-gray-400 mb-1">📊 Busiest times</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Based on front-desk check-ins.</p>
        {!heatmap ? (
          <p className="text-gray-400 dark:text-gray-400 italic text-sm">Loading...</p>
        ) : !heatmap.peak ? (
          <p className="text-gray-400 dark:text-gray-400 italic text-sm">No check-ins recorded yet.</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">🔥 Peak time: {heatmap.peakLabel}</p>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                {heatmap.grid.map((hours, day) => {
                  const max = Math.max(1, ...heatmap.byHour);
                  return (
                    <div key={day} className="flex items-center gap-1 mb-1">
                      <span className="w-8 text-xs text-gray-400 dark:text-gray-400 font-semibold shrink-0">{DAY_LABELS[day]}</span>
                      {hours.map((count, hour) => (
                        <span
                          key={hour}
                          title={`${DAY_LABELS[day]} ${hour}:00 — ${count} check-in${count === 1 ? '' : 's'}`}
                          className={'w-3.5 h-3.5 rounded-sm shrink-0' + (count === 0 ? ' bg-gray-100 dark:bg-gray-800' : '')}
                          style={count === 0 ? undefined : { backgroundColor: `rgba(0, 122, 255, ${0.15 + 0.85 * (count / max)})` }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className={'text-2xl font-black ' + color}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">{label}</div>
    </div>
  );
}
