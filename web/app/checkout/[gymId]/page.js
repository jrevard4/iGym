'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadGyms } from '../../../../lib/supabase';
import env, { hasStripe } from '../../../../lib/env';
import { PLATFORM_FEE_RATE } from '../../../../lib/constants';
import { getSession } from '@/lib/auth';
import { finalizePassPurchase, parseLocalDate } from '../../../lib/checkout';

let stripePromise;
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(env.STRIPE_PUBLISHABLE);
  return stripePromise;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function buildReturnUrl(gym, pass, startsAt, referralCode) {
  const params = new URLSearchParams({
    gymId: gym.id,
    passId: pass.id,
    label: pass.label,
    price: String(pass.price),
    type: pass.type,
    value: String(pass.value),
    startsAt,
  });
  if (referralCode) params.set('ref', referralCode);
  return `${window.location.origin}/checkout/return?${params.toString()}`;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-6 py-20 text-center text-gray-400">Loading checkout...</div>}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const { gymId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const pass = useMemo(() => ({
    id: searchParams.get('passId') || 'dp',
    label: searchParams.get('label') || 'Day Pass',
    price: parseFloat(searchParams.get('price')) || 0,
    type: searchParams.get('type') || 'TIME',
    value: searchParams.get('value') || '1',
  }), [searchParams]);
  const referralCode = searchParams.get('ref');

  const [session, setUserSession] = useState(undefined); // undefined = still checking
  const [gym, setGym] = useState(null);
  const [loadingGym, setLoadingGym] = useState(true);
  const [clientSecret, setClientSecret] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [purchasedPass, setPurchasedPass] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [startsAt, setStartsAt] = useState(todayISODate());

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace(`/login?next=/checkout/${gymId}?${searchParams.toString()}`);
      return;
    }
    setUserSession(s);
  }, [gymId, router, searchParams]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const gyms = await loadGyms();
        setGym(gyms.find((g) => g.id === gymId) || null);
      } finally {
        setLoadingGym(false);
      }
    })();
  }, [session, gymId]);

  useEffect(() => {
    if (!session || !gym || pass.price <= 0) return;
    (async () => {
      if (!hasStripe) {
        setDemoMode(true);
        return;
      }
      try {
        const res = await fetch(`${env.BACKEND_URL}/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: pass.price,
            gymName: gym.gymName,
            passLabel: pass.label,
            gymId: gym.id,
            userId: session.id,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setClientSecret(json.clientSecret);
      } catch (err) {
        console.warn('Backend unreachable, falling back to demo mode:', err.message);
        setDemoMode(true);
      }
    })();
  }, [session, gym, pass.price, pass.label]);

  const handleDemoPurchase = async () => {
    setFinalizing(true);
    setSetupError('');
    try {
      const newPass = await finalizePassPurchase({ gym, pass, userId: session.id, stripePaymentId: 'demo', startsAt, referralCode });
      setPurchasedPass(newPass);
    } catch (err) {
      setSetupError(err.message || 'Something went wrong.');
    } finally {
      setFinalizing(false);
    }
  };

  if (session === undefined || loadingGym) {
    return <div className="max-w-md mx-auto px-6 py-20 text-center text-gray-400">Loading checkout...</div>;
  }

  if (!gym) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Gym not found</h1>
        <Link href="/gyms" className="text-brand hover:underline">← Back to all gyms</Link>
      </div>
    );
  }

  if (pass.price <= 0) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Invalid pass</h1>
        <p className="text-gray-600 mb-4">This pass couldn&apos;t be checked out. Please go back and pick a pass again.</p>
        <Link href={`/gyms/${gym.id}`} className="text-brand hover:underline">← Back to {gym.gymName}</Link>
      </div>
    );
  }

  if (purchasedPass) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-3xl font-black mb-2">Pass purchased!</h1>
        <p className="text-gray-600 mb-6">
          {purchasedPass.label} at {gym.gymName} is now in your wallet.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-sm mb-6 break-all">
          {purchasedPass.id}
        </div>
        <Link
          href="/wallet"
          className="inline-block bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          View in Wallet
        </Link>
      </div>
    );
  }

  const fee = pass.price * PLATFORM_FEE_RATE;
  const gymGets = pass.price - fee;

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <Link href={`/gyms/${gym.id}`} className="text-brand hover:underline text-sm font-semibold">
        ← Back to {gym.gymName}
      </Link>

      <h1 className="text-3xl font-black mt-4 mb-1">Checkout</h1>
      <p className="text-gray-600 mb-6">Complete your purchase to get instant access.</p>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mb-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="font-bold">🎟️ {pass.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {pass.type === 'PUNCH' ? `${pass.value} scans included` : `Valid ${pass.value} day(s)`}
              {startsAt !== todayISODate() && ` — starting ${parseLocalDate(startsAt).toLocaleDateString()}`}
            </div>
          </div>
          <div className="text-2xl font-black">${pass.price.toFixed(2)}</div>
        </div>
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2 mt-2">
          {gym.gymName} receives ${gymGets.toFixed(2)} after 12% iGym fee
        </div>
        <label className="block mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-bold">
            When should this pass start?
          </span>
          <input
            type="date"
            value={startsAt}
            min={todayISODate()}
            onChange={(e) => setStartsAt(e.target.value || todayISODate())}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
          />
          <span className="block mt-1 text-xs text-gray-500">
            Traveling soon? Pick a future date and this pass will activate then instead of today.
          </span>
        </label>
      </div>

      {setupError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {setupError}
        </div>
      )}

      {demoMode ? (
        <div>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-4">
            Demo mode: Stripe isn&apos;t configured (or the payment backend is unreachable), so this will create the
            pass without charging a card.
          </div>
          <button
            onClick={handleDemoPurchase}
            disabled={finalizing}
            className="w-full bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-lg transition"
          >
            {finalizing ? 'Processing...' : `Complete purchase (demo) — $${pass.price.toFixed(2)}`}
          </button>
        </div>
      ) : clientSecret ? (
        // paymentMethodOrder surfaces Apple Pay / Google Pay as buttons at the
        // top of PaymentElement when the browser/device is eligible and the
        // Stripe account has them enabled — no separate integration needed.
        <Elements stripe={getStripe()} options={{ clientSecret, paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] }}>
          <CheckoutForm
            gym={gym}
            pass={pass}
            userId={session.id}
            startsAt={startsAt}
            referralCode={referralCode}
            onSuccess={setPurchasedPass}
            onError={setSetupError}
          />
        </Elements>
      ) : (
        <div className="text-center text-gray-400 py-6">Setting up payment...</div>
      )}
    </div>
  );
}

function CheckoutForm({ gym, pass, userId, startsAt, referralCode, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: buildReturnUrl(gym, pass, startsAt, referralCode) },
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        const newPass = await finalizePassPurchase({ gym, pass, userId, stripePaymentId: paymentIntent.id, startsAt, referralCode });
        onSuccess(newPass);
      } catch (err) {
        onError(err.message || 'Payment succeeded but saving the pass failed. Contact support.');
      }
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-lg transition"
      >
        {submitting ? 'Processing...' : `Pay $${pass.price.toFixed(2)}`}
      </button>
    </form>
  );
}
