'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAvgRating, renderStars, isOpenNow, getActivePromotion, uniqueId, buildWorkoutICS, isSectionVisible, getUpcomingClassOccurrences, countBookedForOccurrence } from '../../../../lib/helpers';
import { EQUIP_CATEGORIES, PLATFORM_FEE_RATE, MUSCLE_GROUPS, EXPERIENCE_LEVELS } from '../../../../lib/constants';
import { upsertUser, addGymReview, uploadReviewPhoto, reportEquipmentIssue, loadGymClassBookings, bookClass, sendMessage, loadConversation } from '../../../../lib/supabase';
import { notifyGym } from '../../../../lib/notify';
import { getSession, setSession } from '@/lib/auth';
import { useT } from '@/lib/PreferencesContext';
import GymCard from '@/components/GymCard';
import Reveal from '@/components/Reveal';

function buildCheckoutUrl(gym, pass, ref) {
  const params = new URLSearchParams({
    passId: pass.id,
    label: pass.label,
    price: String(pass.price),
    type: pass.type,
    value: String(pass.value),
  });
  if (ref) params.set('ref', ref);
  return `/checkout/${gym.id}?${params.toString()}`;
}

export default function GymDetailClient({ gym, similarGyms }) {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-6 py-20 text-center text-gray-400">Loading...</div>}>
      <GymDetailClientInner gym={gym} similarGyms={similarGyms} />
    </Suspense>
  );
}

function GymDetailClientInner({ gym: initialGym, similarGyms = [] }) {
  // Local mirror of the gym prop so review/report submissions can update the
  // page immediately without a full reload — see submitReview/reportIssue.
  const [gym, setGym] = useState(initialGym);
  const [equipFilter, setEquipFilter] = useState('All');
  const [shared, setShared] = useState(false);
  const [classBookings, setClassBookings] = useState([]);
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');
  const t = useT();

  useEffect(() => {
    if (!gym?.id || !(gym.classSchedule || []).length) return;
    loadGymClassBookings(gym.id).then(setClassBookings);
  }, [gym?.id, gym?.classSchedule]);

  if (!gym) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Gym not found</h1>
        <Link href="/gyms" className="text-brand-text dark:text-blue-400 hover:underline">{t('backToAllGyms')}</Link>
      </div>
    );
  }

  const shareMatch = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `I found ${gym.gymName} on iGym — check it out!`;
    if (navigator.share) {
      try { await navigator.share({ title: gym.gymName, text, url }); } catch { /* cancelled */ }
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const open = isOpenNow(gym);
  const avg = getAvgRating(gym.gymReviews);
  const promo = getActivePromotion(gym);
  const equipment = (gym.equipment || []).filter(
    (eq) => equipFilter === 'All' || eq.category === equipFilter
  );

  const allPasses = gym.passes || [];
  const membershipTiers = allPasses.filter((p) => p.type === 'MEMBERSHIP');
  const otherPasses = allPasses.filter((p) => p.type !== 'MEMBERSHIP');

  const brand = gym.branding || {};
  const claimed = !!gym.ownerID;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link href="/gyms" className="text-brand-text dark:text-blue-400 hover:underline text-sm font-semibold">
        {t('backToAllGyms')}
      </Link>

      {brand.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.heroImageUrl} alt="" className="w-full h-40 object-cover rounded-2xl mt-4" />
      )}

      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="w-8 h-8 rounded object-contain bg-white border border-gray-200" />
          )}
          {gym.featured && (
            <span className="bg-warning text-white text-xs font-extrabold px-2 py-1 rounded">
              ⭐ {t('featured')}
            </span>
          )}
          {claimed && (
            <span className="bg-blue-50 dark:bg-blue-950 text-brand-text dark:text-blue-400 text-xs font-extrabold px-2 py-1 rounded">
              ✓ {t('verified')}
            </span>
          )}
          <h1 className="text-4xl font-black">{gym.gymName}</h1>
          <button
            onClick={shareMatch}
            aria-label={t('shareMatch')}
            title={t('shareMatch')}
            className="text-gray-400 dark:text-gray-400 hover:text-brand-text dark:hover:text-blue-400 transition text-lg"
          >
            {shared ? '✓' : '🔗'}
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">{gym.location}</p>
        {!claimed && (
          <Link href={`/owner/claim/${gym.id}`} className="inline-block mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-brand-text dark:hover:text-blue-400 transition">
            {t('claimListing')}
          </Link>
        )}
      </div>

      {promo && (
        <div className="bg-brand/10 text-brand-text dark:text-blue-400 font-bold text-sm px-4 py-3 rounded-xl mb-6">
          🔥 {promo.title}
          {promo.detail && <span className="font-normal"> — {promo.detail}</span>}
        </div>
      )}

      {gym.referralFeeRate > 0 && <ReferralShareButton gym={gym} />}

      <div className="flex flex-wrap gap-2 mb-6">
        {open !== null && (
          <span className={'text-sm font-bold px-3 py-1.5 rounded-lg ' + (open ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400')}>
            {open ? `● ${t('openNow')}` : `● ${t('closed')}`}
          </span>
        )}
        {avg > 0 && (
          <span className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-sm font-bold px-3 py-1.5 rounded-lg">
            ★ {avg.toFixed(1)} ({gym.gymReviews?.length || 0} reviews)
          </span>
        )}
      </div>

      {/* Membership tier comparison */}
      {membershipTiers.length > 0 && (
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">🏋️ Membership Plans</h2>
          <div className={'grid gap-4 ' + (membershipTiers.length > 1 ? 'sm:grid-cols-2' : 'sm:max-w-sm')}>
            {membershipTiers.map((tier) => (
              <MembershipTierCard key={tier.id} tier={tier} gym={gym} referralCode={ref} />
            ))}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-3 gap-6 mb-10">
        {/* Info column */}
        <div className="md:col-span-2 space-y-5">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">Phone</div>
                <div className="text-gray-900 dark:text-gray-100 mt-1">{gym.phone || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">Pricing</div>
                <div className="text-gray-900 dark:text-gray-100 mt-1">{gym.pricing || '—'}</div>
              </div>
              {gym.hoursDisplay && (
                <div className="sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">Hours</div>
                  <div className="text-gray-900 dark:text-gray-100 mt-1">{gym.hoursDisplay}</div>
                </div>
              )}
              {gym.website && (
                <div className="sm:col-span-2">
                  <a href={gym.website} target="_blank" rel="noopener" className="text-brand-text dark:text-blue-400 hover:underline text-sm font-semibold">
                    {t('visitWebsite')}
                  </a>
                </div>
              )}
            </div>
          </div>

          {gym.description && (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{gym.description}</p>
            </div>
          )}
        </div>

        {/* Passes column — hidden only when every pass on offer is already shown above as a membership tier */}
        {!(otherPasses.length === 0 && membershipTiers.length > 0) && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">🎟️ {t('accessPasses')}</h2>
            {otherPasses.length > 0 ? (
              otherPasses.map((pass) => <PassCard key={pass.id} pass={pass} gym={gym} referralCode={ref} />)
            ) : allPasses.length === 0 && gym.dayPassPrice > 0 ? (
              <PassCard
                gym={gym}
                referralCode={ref}
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
        )}
      </div>

      {/* Classes */}
      {isSectionVisible(gym, 'showClasses') && (gym.classSchedule || []).length > 0 && (
        <ClassesSection gym={gym} bookings={classBookings} onBooked={(b) => setClassBookings((prev) => [...prev, b])} />
      )}

      {/* Equipment */}
      {isSectionVisible(gym, 'showEquipment') && (
        <Reveal as="section" className="mb-10">
          <h2 className="text-2xl font-bold mb-4">
            {t('equipment')} <span className="text-gray-400 dark:text-gray-400 font-normal">({equipment.length})</span>
          </h2>

          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter equipment by category">
            {['All', ...EQUIP_CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setEquipFilter(cat)}
                aria-pressed={equipFilter === cat}
                className={
                  'px-4 py-2 rounded-full text-sm font-semibold transition ' +
                  (equipFilter === cat
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700')
                }
              >
                {cat}
              </button>
            ))}
          </div>

          {equipment.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 italic">No equipment in this category.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              {equipment.map((eq) => (
                <EquipmentCard key={eq.id} eq={eq} gym={gym} />
              ))}
            </ul>
          )}
        </Reveal>
      )}

      {/* AI Workout Generator */}
      {isSectionVisible(gym, 'showWorkoutGenerator') && <WorkoutGeneratorSection gym={gym} />}

      {/* Similar gyms */}
      {isSectionVisible(gym, 'showSimilarGyms') && similarGyms.length > 0 && (
        <Reveal as="section" className="mb-10">
          <h2 className="text-2xl font-bold mb-4">You might also like</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {similarGyms.map((g) => <GymCard key={g.id} gym={g} />)}
          </div>
        </Reveal>
      )}

      {/* Message the gym */}
      <Reveal as="section" className="mb-10">
        <MessageWidget gym={gym} />
      </Reveal>

      {/* Reviews */}
      <Reveal as="section">
        <h2 className="text-2xl font-bold mb-4">{t('memberReviews')}</h2>
        {(gym.gymReviews || []).length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 italic mb-4">Be the first to review this gym!</p>
        ) : (
          <ul className="space-y-3 mb-4">
            {gym.gymReviews.map((r) => (
              <li key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                    @{r.username}
                    {r.photoUrl && <span className="ml-2 text-[10px] font-bold text-success align-middle">📷 Photo verified</span>}
                  </span>
                  <span className="text-warning text-sm">{renderStars(r.rating)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{r.text}</p>
                {r.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photoUrl} alt="" className="mt-2 w-24 h-24 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                )}
                {r.ownerResponse && (
                  <div className="mt-3 pl-3 border-l-2 border-brand/30 dark:border-blue-400/30">
                    <div className="text-xs font-bold text-gray-700 dark:text-gray-300">Response from {gym.gymName}</div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{r.ownerResponse.text}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <ReviewForm gym={gym} onSubmitted={(updatedGym) => setGym(updatedGym)} />
      </Reveal>
    </div>
  );
}

// ─── Review submission form ───────────────────────────────────────────────
function ReviewForm({ gym, onSubmitted }) {
  const session = getSession();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!session) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <Link href={`/login?next=/gyms/${gym.id}`} className="text-brand-text dark:text-blue-400 hover:underline font-semibold">Log in</Link> to leave a review.
      </p>
    );
  }

  if (done) {
    return <p className="text-sm text-success font-semibold">✓ Thanks for sharing your experience!</p>;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      let photoUrl = null;
      if (photo) photoUrl = await uploadReviewPhoto(photo);
      const review = {
        id: uniqueId('gr_'), userId: session.id, username: session.username,
        rating, text: text.trim(), date: new Date().toISOString(),
        ...(photoUrl && { photoUrl }),
      };
      await addGymReview(gym.id, review);
      onSubmitted({ ...gym, gymReviews: [review, ...(gym.gymReviews || [])] });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not post your review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Leave a review</h3>
      <div className="flex gap-1" role="group" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} className="text-2xl leading-none">
            {rating >= n ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Share your experience at this gym..."
        className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      />
      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Add a photo (optional) — builds trust with other members</label>
        <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="text-xs text-gray-700 dark:text-gray-300" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button type="submit" disabled={submitting || !text.trim()} className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60">
        {submitting ? 'Posting...' : 'Post review'}
      </button>
    </form>
  );
}

// ─── Equipment card (member view) ──────────────────────────────────────────
function EquipmentCard({ eq, gym }) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submitReport = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      const session = getSession();
      await reportEquipmentIssue(gym.id, eq.id, note.trim(), session?.username);
      setDone(true);
      setReporting(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <li className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-start gap-2 mb-1">
        <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{eq.name}</div>
        <span className="bg-brand/10 text-brand-text dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded shrink-0">
          {eq.category}
        </span>
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Target: {eq.targetArea}</div>
      {eq.outOfService && (
        <div className="text-xs font-bold text-danger mb-1">⚠ Temporarily out of service</div>
      )}
      {eq.instructions && (
        <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{eq.instructions}</div>
      )}
      {eq.videoUrl && (
        <a
          href={eq.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs font-semibold text-brand-text dark:text-blue-400 hover:underline"
        >
          ▶ Watch demo ↗
        </a>
      )}

      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        {done ? (
          <p className="text-xs text-success font-semibold">✓ Thanks — the owner has been notified.</p>
        ) : reporting ? (
          <form onSubmit={submitReport} className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's wrong with it?"
              autoFocus
              className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded outline-none focus:border-brand"
            />
            <button type="submit" disabled={submitting || !note.trim()} className="text-xs font-semibold text-brand-text dark:text-blue-400 disabled:opacity-60">Send</button>
            <button type="button" onClick={() => setReporting(false)} className="text-xs text-gray-400">✕</button>
          </form>
        ) : (
          <button onClick={() => setReporting(true)} className="text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-danger transition">
            ⚠ Report a problem
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Pass purchase card ──────────────────────────────────────────────────
function PassCard({ pass, gym, referralCode }) {
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
    router.push(buildCheckoutUrl(gym, pass, referralCode));
  };

  return (
    <div className="bg-success text-white rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-bold">🎟️ {pass.label}</div>
          <div className="text-xs text-white/80 mt-0.5">
            {pass.type === 'PUNCH' ? `${pass.value} scans included` : `Valid ${pass.value} day(s)`}
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

// ─── Membership tier comparison card ─────────────────────────────────────
function MembershipTierCard({ tier, gym, referralCode }) {
  const router = useRouter();
  const [buying, setBuying] = useState(false);

  const onChoose = () => {
    const session = getSession();
    if (!session) {
      window.location.href = `/login?next=/gyms/${gym.id}`;
      return;
    }
    setBuying(true);
    router.push(buildCheckoutUrl(gym, tier, referralCode));
  };

  return (
    <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-700 rounded-2xl p-5 flex flex-col">
      <div className="font-black text-lg text-gray-900 dark:text-gray-100">{tier.label}</div>
      <div className="text-3xl font-black mt-1 text-gray-900 dark:text-gray-100">
        ${Number(tier.price).toFixed(2)}
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          {' '}/ {Number(tier.value) === 30 ? 'mo' : `${tier.value} days`}
        </span>
      </div>
      <ul className="mt-4 space-y-2 flex-1">
        {(tier.features || []).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="text-success font-bold">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onChoose}
        disabled={buying}
        className="mt-4 w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-lg transition disabled:opacity-60"
      >
        {buying ? 'Processing...' : `Choose ${tier.label}`}
      </button>
    </div>
  );
}

// ─── AI workout generator ──────────────────────────────────────────────────
// Builds a workout grounded in this specific gym's actual equipment list —
// the AI is instructed server-side to only reference items from gym.equipment.
function WorkoutGeneratorSection({ gym }) {
  const [selectedMuscles, setSelectedMuscles] = useState([]);
  const [experienceLevel, setExperienceLevel] = useState('Intermediate');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState(null);

  const toggleMuscle = (m) => {
    setSelectedMuscles((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const res = await fetch('/api/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym, muscleGroups: selectedMuscles, goal, experienceLevel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Workout generation failed.');
      setPlan(data);
      saveToHistory(data);
    } catch (err) {
      setError(err.message || 'Workout generation failed.');
    } finally {
      setLoading(false);
    }
  };

  // Best-effort: a signed-in member's last 10 AI workouts are saved to their
  // account so they can revisit them from the Wallet page. Silently no-ops
  // for guests/anonymous browsing — this is a convenience, not a gate.
  const saveToHistory = async (workoutData) => {
    const session = getSession();
    if (!session) return;
    const record = {
      id: uniqueId('wk_'),
      gymId: gym.id,
      gymName: gym.gymName,
      title: workoutData.title,
      muscleGroups: selectedMuscles,
      exercises: workoutData.exercises || [],
      estimatedDuration: workoutData.estimatedDuration || '',
      createdAt: new Date().toISOString(),
    };
    const updated = [record, ...(session.savedWorkouts || [])].slice(0, 10);
    const nextSession = { ...session, savedWorkouts: updated };
    setSession(nextSession);
    upsertUser(nextSession);
  };

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-bold mb-1">✨ AI Workout Generator</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Builds a workout using only the equipment {gym.gymName} actually has.
      </p>

      <div className="bg-gradient-to-br from-violet-600 to-brand rounded-2xl p-5">
        <p className="text-white/90 text-xs font-semibold uppercase mb-2">Target muscle group(s)</p>
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Select target muscle groups">
          {MUSCLE_GROUPS.map((m) => {
            const active = selectedMuscles.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMuscle(m)}
                aria-pressed={active}
                className={'px-3 py-1.5 rounded-full text-xs font-semibold transition ' + (active ? 'bg-white text-brand-text dark:text-blue-400' : 'bg-white/15 text-white hover:bg-white/25')}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value)}
            aria-label="Experience level"
            className="px-4 py-2.5 rounded-lg border-0 outline-none bg-white/15 text-white [&>option]:text-gray-900"
          >
            {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Optional goal, e.g. 'training for a 5K'"
            aria-label="Optional goal or notes"
            className="flex-1 px-4 py-2.5 rounded-lg border-0 outline-none focus:ring-2 focus:ring-white/50"
          />
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="bg-white text-brand-text dark:text-blue-400 font-bold px-6 py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-60"
        >
          {loading ? 'Building your workout...' : 'Generate Workout'}
        </button>
        {error && <p className="text-white/90 text-sm mt-3">{error}</p>}
      </div>

      {plan && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mt-4">
          <div className="flex justify-between items-start gap-3 mb-2">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{plan.title}</h3>
            {plan.estimatedDuration && (
              <span className="bg-brand/10 text-brand-text dark:text-blue-400 text-xs font-bold px-2.5 py-1 rounded shrink-0">
                ⏱ {plan.estimatedDuration}
              </span>
            )}
          </div>
          {plan.summary && <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{plan.summary}</p>}

          <ul className="space-y-3">
            {(plan.exercises || []).map((ex, i) => (
              <li key={i} className="border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{i + 1}. {ex.name}</div>
                  <span className="bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-xs font-bold px-2 py-0.5 rounded shrink-0">
                    {ex.equipment}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Target: {ex.targetMuscle} · {ex.sets} sets × {ex.reps}{ex.restSeconds ? ` · rest ${ex.restSeconds}s` : ''}
                </div>
                {ex.instructions && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{ex.instructions}</div>
                )}
              </li>
            ))}
          </ul>

          {plan.notes && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 italic">{plan.notes}</p>
          )}

          <button
            onClick={() => downloadICS(plan)}
            className="mt-4 text-xs font-semibold text-brand-text dark:text-blue-400 hover:underline"
          >
            📅 Add to calendar
          </button>
        </div>
      )}
    </section>
  );
}

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

// ─── Classes & booking ─────────────────────────────────────────────────────
function ClassesSection({ gym, bookings, onBooked }) {
  const occurrences = getUpcomingClassOccurrences(gym, 2);
  const [bookingId, setBookingId] = useState(null);
  const session = getSession();
  const myBookedKeys = new Set(
    bookings.filter((b) => b.userId === session?.id && b.status !== 'cancelled').map((b) => `${b.classScheduleId}|${b.classDate}`)
  );

  const book = async (occ) => {
    if (!session) { window.location.href = `/login?next=/gyms/${gym.id}`; return; }
    setBookingId(`${occ.id}|${occ.classDate}`);
    try {
      const booking = await bookClass({
        gymId: gym.id, classScheduleId: occ.id, className: occ.className, classDate: occ.classDate,
        capacity: occ.capacity, userId: session.id, username: session.username,
      });
      onBooked(booking);
    } finally {
      setBookingId(null);
    }
  };

  if (occurrences.length === 0) return null;

  return (
    <Reveal as="section" className="mb-10">
      <h2 className="text-2xl font-bold mb-4">🧘 Classes</h2>
      <ul className="grid sm:grid-cols-2 gap-3">
        {occurrences.map((occ) => {
          const key = `${occ.id}|${occ.classDate}`;
          const booked = countBookedForOccurrence(bookings, occ.id, occ.classDate);
          const full = occ.capacity > 0 && booked >= occ.capacity;
          const alreadyBooked = myBookedKeys.has(key);
          return (
            <li key={key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{occ.className}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {new Date(occ.classDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {occ.startTime}
                {occ.instructor && ` · ${occ.instructor}`}
              </div>
              <div className="flex justify-between items-center mt-3">
                <span className={'text-xs font-bold ' + (full ? 'text-danger' : 'text-gray-500 dark:text-gray-400')}>
                  {occ.capacity > 0 ? `${booked}/${occ.capacity} booked` : `${booked} booked`}
                </span>
                {alreadyBooked ? (
                  <span className="text-xs font-bold text-success">✓ Booked</span>
                ) : (
                  <button
                    onClick={() => book(occ)}
                    disabled={bookingId === key}
                    className="bg-brand hover:bg-brand-dark text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
                  >
                    {bookingId === key ? '...' : full ? 'Join waitlist' : 'Book'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Reveal>
  );
}

// ─── Message the gym ────────────────────────────────────────────────────────
function MessageWidget({ gym }) {
  const session = getSession();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const loadThread = async () => {
    setOpen(true);
    if (session) setThread(await loadConversation(gym.id, session.id));
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !session) return;
    setSending(true);
    try {
      const msg = await sendMessage(gym.id, session.id, session.username, 'member', text.trim());
      setThread((prev) => [...prev, msg]);
      setText('');
      notifyGym(gym.id, `New message from @${session.username}`, msg.text);
    } finally {
      setSending(false);
    }
  };

  if (!session) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <Link href={`/login?next=/gyms/${gym.id}`} className="text-brand-text dark:text-blue-400 hover:underline font-semibold">Log in</Link> to message {gym.gymName}.
      </p>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
      {!open ? (
        <button onClick={loadThread} className="text-sm font-bold text-gray-900 dark:text-gray-100">
          💬 Message {gym.gymName}
        </button>
      ) : (
        <>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">💬 Message {gym.gymName}</h2>
          {thread.length > 0 && (
            <ul className="space-y-2 mb-3 max-h-64 overflow-y-auto">
              {thread.map((m) => (
                <li key={m.id} className={'text-sm px-3 py-2 rounded-lg max-w-[85%] ' + (m.senderRole === 'member' ? 'bg-brand/10 text-gray-900 dark:text-gray-100 ml-auto' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100')}>
                  {m.text}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={send} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
              autoFocus
            />
            <button type="submit" disabled={sending || !text.trim()} className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 rounded-lg transition disabled:opacity-60">
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// ─── Referral share button ────────────────────────────────────────────────
// Only rendered when the gym has a referral fee configured. Any logged-in
// member can share their own link; whoever buys through it earns nothing
// themselves, but the referrer gets credited once the purchase completes.
function ReferralShareButton({ gym }) {
  const [copied, setCopied] = useState(false);
  const session = getSession();
  if (!session?.referralCode) return null;

  const link = `${window.location.origin}/gyms/${gym.id}?ref=${session.referralCode}`;
  const ratePct = Math.round(gym.referralFeeRate * 1000) / 10;

  const share = async () => {
    const text = `Check out ${gym.gymName} on iGym!`;
    if (navigator.share) {
      try { await navigator.share({ title: 'iGym', text, url: link }); }
      catch { /* user cancelled the share sheet */ }
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={share}
      className="mb-6 w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
    >
      {copied ? 'Link copied!' : `🎁 Refer a friend, earn ${ratePct}%`}
    </button>
  );
}
