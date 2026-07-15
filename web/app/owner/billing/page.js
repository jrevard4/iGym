'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import env, { hasStripe } from '../../../../lib/env';
import { PLAN_TIERS } from '../../../../lib/constants';
import { useOwnerContext } from '@/lib/ownerContext';

let stripePromise;
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(env.STRIPE_PUBLISHABLE);
  return stripePromise;
}

function buildReturnUrl(plan) {
  const params = new URLSearchParams({ plan });
  return `${window.location.origin}/owner/billing/return?${params.toString()}`;
}

export default function OwnerBillingPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto py-20 text-center text-gray-400">Loading checkout...</div>}>
      <OwnerBillingPageInner />
    </Suspense>
  );
}

function OwnerBillingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { owner, persistOwner } = useOwnerContext();
  const plan = searchParams.get('plan');
  const tier = PLAN_TIERS[plan];

  const [clientSecret, setClientSecret] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [upgraded, setUpgraded] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!tier) return;
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
            amount: tier.price,
            gymName: owner.gymName,
            passLabel: `${tier.name} Plan Subscription`,
            gymId: owner.id,
            userId: owner.id,
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
  }, [tier, owner.gymName, owner.id]);

  const handleDemoUpgrade = async () => {
    setFinalizing(true);
    setSetupError('');
    try {
      await persistOwner({ ...owner, plan });
      setUpgraded(true);
    } catch (err) {
      setSetupError(err.message || 'Something went wrong.');
    } finally {
      setFinalizing(false);
    }
  };

  if (!tier) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Unknown plan</h1>
        <Link href="/owner/analytics" className="text-brand-text hover:underline">← Back to Analytics</Link>
      </div>
    );
  }

  if (upgraded) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-3xl font-black mb-2">You&apos;re upgraded!</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{owner.gymName} is now on the {tier.name} plan.</p>
        <Link
          href="/owner/analytics"
          className="inline-block bg-brand hover:bg-brand-dark text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          Back to Analytics
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <Link href="/owner/analytics" className="text-brand-text hover:underline text-sm font-semibold">
        ← Back to Analytics
      </Link>

      <h1 className="text-3xl font-black mt-4 mb-1">Upgrade to {tier.name}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">Billed monthly. Takes effect immediately.</p>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="font-bold" style={{ color: tier.color }}>{tier.emoji} {tier.name}</span>
          <span className="text-2xl font-black text-gray-900 dark:text-gray-100">${tier.price}/mo</span>
        </div>
        <ul className="space-y-1.5">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="text-success font-bold">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {setupError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {setupError}
        </div>
      )}

      {demoMode ? (
        <div>
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-400 px-4 py-3 rounded-lg text-sm mb-4">
            Demo mode: Stripe isn&apos;t configured (or the payment backend is unreachable), so this will upgrade
            the plan without charging a card.
          </div>
          <button
            onClick={handleDemoUpgrade}
            disabled={finalizing}
            className="w-full bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-lg transition"
          >
            {finalizing ? 'Processing...' : `Upgrade (demo) — $${tier.price}/mo`}
          </button>
        </div>
      ) : clientSecret ? (
        <Elements stripe={getStripe()} options={{ clientSecret, paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] }}>
          <BillingCheckoutForm plan={plan} tier={tier} owner={owner} persistOwner={persistOwner} onSuccess={() => setUpgraded(true)} onError={setSetupError} />
        </Elements>
      ) : (
        <div className="text-center text-gray-400 dark:text-gray-600 py-6">Setting up payment...</div>
      )}
    </div>
  );
}

function BillingCheckoutForm({ plan, tier, owner, persistOwner, onSuccess, onError }) {
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
      confirmParams: { return_url: buildReturnUrl(plan) },
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        await persistOwner({ ...owner, plan });
        onSuccess();
      } catch (err) {
        onError(err.message || 'Payment succeeded but saving your new plan failed. Contact support.');
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
        {submitting ? 'Processing...' : `Pay $${tier.price}/mo`}
      </button>
    </form>
  );
}
