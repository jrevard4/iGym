'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAvgRating, renderStars, isOpenNow, getActivePromotion } from '../../../../lib/helpers';
import { EQUIP_CATEGORIES, PLATFORM_FEE_RATE } from '../../../../lib/constants';
import { getSession } from '@/lib/auth';

export default function GymDetailClient({ gym }) {
  const [equipFilter, setEquipFilter] = useState('All');

  if (!gym) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Gym not found</h1>
        <Link href="/gyms" className="text-brand hover:underline">← Back to all gyms</Link>
      </div>
    );
  }

  const open = isOpenNow(gym);
  const avg = getAvgRating(gym.gymReviews);
  const promo = getActivePromotion(gym);
  const equipment = (gym.equipment || []).filter(
    (eq) => equipFilter === 'All' || eq.category === equipFilter
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link href="/gyms" className="text-brand hover:underline text-sm font-semibold">
        ← Back to all gyms
      </Link>

      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {gym.featured && (
            <span className="bg-warning text-white text-xs font-extrabold px-2 py-1 rounded">
              ⭐ FEATURED
            </span>
          )}
          <h1 className="text-4xl font-black">{gym.gymName}</h1>
        </div>
        <p className="text-gray-600">{gym.location}</p>
      </div>

      {promo && (
        <div className="bg-brand/10 text-brand font-bold text-sm px-4 py-3 rounded-xl mb-6">
          🔥 {promo.title}
          {promo.detail && <span className="font-normal"> — {promo.detail}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {open !== null && (
          <span className={'text-sm font-bold px-3 py-1.5 rounded-lg ' + (open ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
            {open ? '● Open Now' : '● Closed'}
          </span>
        )}
        {avg > 0 && (
          <span className="bg-amber-50 text-amber-700 text-sm font-bold px-3 py-1.5 rounded-lg">
            ★ {avg.toFixed(1)} ({gym.gymReviews?.length || 0} reviews)
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-10">
        {/* Info column */}
        <div className="md:col-span-2 space-y-5">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Phone</div>
                <div className="text-gray-900 mt-1">{gym.phone || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Pricing</div>
                <div className="text-gray-900 mt-1">{gym.pricing || '—'}</div>
              </div>
              {gym.hoursDisplay && (
                <div className="sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Hours</div>
                  <div className="text-gray-900 mt-1">{gym.hoursDisplay}</div>
                </div>
              )}
              {gym.website && (
                <div className="sm:col-span-2">
                  <a href={gym.website} target="_blank" rel="noopener" className="text-brand hover:underline text-sm font-semibold">
                    Visit website ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          {gym.description && (
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 leading-relaxed">{gym.description}</p>
            </div>
          )}
        </div>

        {/* Passes column */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">🎟️ Access Passes</h2>
          {(gym.passes || []).length > 0 ? (
            gym.passes.map((pass) => <PassCard key={pass.id} pass={pass} gym={gym} />)
          ) : gym.dayPassPrice > 0 ? (
            <PassCard
              gym={gym}
              pass={{
                id: 'dp',
                label: 'Day Pass',
                price: gym.dayPassPrice,
                type: 'TIME',
                value: 1,
              }}
            />
          ) : (
            <p className="text-sm text-gray-500 italic">No passes available.</p>
          )}
        </div>
      </div>

      {/* Equipment */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">
          Equipment <span className="text-gray-400 font-normal">({equipment.length})</span>
        </h2>

        <div className="flex flex-wrap gap-2 mb-4">
          {['All', ...EQUIP_CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => setEquipFilter(cat)}
              className={
                'px-4 py-2 rounded-full text-sm font-semibold transition ' +
                (equipFilter === cat
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
              }
            >
              {cat}
            </button>
          ))}
        </div>

        {equipment.length === 0 ? (
          <p className="text-gray-500 italic">No equipment in this category.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {equipment.map((eq) => (
              <li key={eq.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="font-bold text-sm">{eq.name}</div>
                  <span className="bg-brand/10 text-brand text-xs font-bold px-2 py-0.5 rounded shrink-0">
                    {eq.category}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mb-1">Target: {eq.targetArea}</div>
                {eq.instructions && (
                  <div className="text-xs text-gray-500 line-clamp-2">{eq.instructions}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviews */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Member Reviews</h2>
        {(gym.gymReviews || []).length === 0 ? (
          <p className="text-gray-500 italic">Be the first to review this gym!</p>
        ) : (
          <ul className="space-y-3">
            {gym.gymReviews.map((r) => (
              <li key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">@{r.username}</span>
                  <span className="text-warning text-sm">{renderStars(r.rating)}</span>
                </div>
                <p className="text-sm text-gray-700">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Pass purchase card ──────────────────────────────────────────────────
function PassCard({ pass, gym }) {
  const router = useRouter();
  const [buying, setBuying] = useState(false);
  const fee = pass.price * PLATFORM_FEE_RATE;
  const gymGets = pass.price - fee;

  const onBuy = () => {
    const session = getSession();
    if (!session) {
      // Bounce to login and come back
      window.location.href = `/login?next=/gyms/${gym.id}`;
      return;
    }
    setBuying(true);
    const params = new URLSearchParams({
      passId: pass.id,
      label: pass.label,
      price: String(pass.price),
      type: pass.type,
      value: String(pass.value),
    });
    router.push(`/checkout/${gym.id}?${params.toString()}`);
  };

  return (
    <div className="bg-success text-white rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-bold">🎟️ {pass.label}</div>
          <div className="text-xs text-white/80 mt-0.5">
            {pass.type === 'TIME' ? `Valid ${pass.value} day(s)` : `${pass.value} scans included`}
          </div>
        </div>
        <div className="text-2xl font-black">${Number(pass.price).toFixed(2)}</div>
      </div>
      <div className="text-xs text-white/80 border-t border-white/20 pt-2 mt-2">
        Gym receives ${gymGets.toFixed(2)} after 12% iGym fee
      </div>
      <button
        onClick={onBuy}
        disabled={buying}
        className="mt-3 w-full bg-white text-success font-bold py-2 rounded-lg hover:bg-white/90 transition disabled:opacity-60"
      >
        {buying ? 'Processing...' : 'Buy Pass'}
      </button>
    </div>
  );
}
