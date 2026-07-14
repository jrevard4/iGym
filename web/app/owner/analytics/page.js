'use client';

import { useState } from 'react';
import { PLAN_TIERS } from '../../../../lib/constants';
import { useOwnerContext } from '@/lib/ownerContext';

export default function OwnerAnalyticsPage() {
  const { owner, persistOwner } = useOwnerContext();
  const [copied, setCopied] = useState(false);
  const plan = PLAN_TIERS[owner.plan || 'free'];
  const planAllows = (feature) => !!plan.limits?.[feature];

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

  const upgradePlan = async (newPlan) => {
    if (!confirm(`Upgrade to ${PLAN_TIERS[newPlan].name} — $${PLAN_TIERS[newPlan].price}/month? (Demo: upgrade is instant.)`)) return;
    await persistOwner({ ...owner, plan: newPlan });
  };

  const toggleFeatured = async () => {
    await persistOwner({ ...owner, featured: !owner.featured });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">Analytics</h1>
        <p className="text-gray-600">Revenue, referrals, plan, and search visibility for your gym.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 mb-4">💰 Revenue overview</h2>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Total earned" value={`$${(owner.totalPassRevenue || 0).toFixed(2)}`} color="text-gray-900" />
          <Stat label="Platform fees (12%)" value={`$${(owner.platformFeesPaid || 0).toFixed(2)}`} color="text-danger" />
          <Stat label="Passes sold" value={owner.monthlyPassSales || 0} color="text-success" />
          <Stat label="Referrals" value={owner.referralCount || 0} color="text-accent" />
        </div>
      </div>

      <div className="bg-gray-900 text-white rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
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

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 mb-4">⭐ Subscription & placement</h2>
        <div className="flex justify-between items-center mb-4">
          <span className="font-bold" style={{ color: plan.color }}>{plan.emoji} {plan.name} Plan</span>
          <span className="text-brand font-bold">${plan.price}/mo</span>
        </div>
        <div className="flex gap-2 mb-4">
          {Object.keys(PLAN_TIERS).filter((k) => k !== owner.plan).map((k) => (
            <button key={k} onClick={() => upgradePlan(k)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-sm font-semibold py-2 rounded-lg transition">
              {PLAN_TIERS[k].price > plan.price ? 'Upgrade to' : 'Switch to'} {PLAN_TIERS[k].name}
            </button>
          ))}
        </div>
        <div className="flex justify-between items-center border-t border-gray-100 pt-4">
          <div>
            <div className="font-semibold text-sm">⭐ Featured placement</div>
            <div className="text-xs text-gray-500">{planAllows('featured') ? 'Appear at the top of member searches.' : 'Pro plan required.'}</div>
          </div>
          <input type="checkbox" checked={!!owner.featured} onChange={toggleFeatured} disabled={!planAllows('featured')} className="w-5 h-5 accent-warning" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-sm uppercase text-gray-500 mb-4">Facility overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Equipment" value={(owner.equipment || []).length} color="text-brand" />
          <Stat label="Pass tiers" value={(owner.passes || []).length} color="text-success" />
          <Stat label="Trainers" value={(owner.trainers || []).length} color="text-warning" />
          <Stat label="Classes" value={(owner.classes || []).length} color="text-accent" />
          <Stat label="Search views" value={owner.matchImpressions || 0} color="text-purple-600" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className={'text-2xl font-black ' + color}>{value}</div>
      <div className="text-xs text-gray-500 font-semibold mt-1">{label}</div>
    </div>
  );
}
