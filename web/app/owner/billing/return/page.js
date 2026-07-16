'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import env from '../../../../../lib/env';
import { PLAN_TIERS } from '../../../../../lib/constants';
import { useOwnerContext } from '@/lib/ownerContext';

// Landing spot for payment methods that require an off-site redirect step
// (most test-card payments resolve on /owner/billing without ever coming here).
export default function OwnerBillingReturnPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto py-20 text-center text-gray-400 dark:text-gray-600">Confirming your payment...</div>}>
      <OwnerBillingReturnPageInner />
    </Suspense>
  );
}

function OwnerBillingReturnPageInner() {
  const searchParams = useSearchParams();
  const { owner, persistOwner } = useOwnerContext();
  const [status, setStatus] = useState('checking'); // checking | success | failed
  const [error, setError] = useState('');

  const plan = searchParams.get('plan');
  const tier = PLAN_TIERS[plan];
  const clientSecret = searchParams.get('payment_intent_client_secret');

  useEffect(() => {
    (async () => {
      if (!tier || !clientSecret) {
        setStatus('failed');
        setError('Missing checkout information.');
        return;
      }

      const stripe = await loadStripe(env.STRIPE_PUBLISHABLE);
      const { paymentIntent, error: retrieveError } = await stripe.retrievePaymentIntent(clientSecret);
      if (retrieveError || paymentIntent?.status !== 'succeeded') {
        setStatus('failed');
        setError(retrieveError?.message || 'Payment was not completed.');
        return;
      }

      try {
        await persistOwner({ ...owner, plan });
        setStatus('success');
      } catch (err) {
        setStatus('failed');
        setError(err.message || 'Payment succeeded but saving your new plan failed. Contact support.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'checking') {
    return <div className="max-w-md mx-auto py-20 text-center text-gray-400 dark:text-gray-600">Confirming your payment...</div>;
  }

  if (status === 'failed') {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Payment not completed</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <Link href="/owner/analytics" className="text-brand-text hover:underline">← Back to Analytics</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">🎉</div>
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
