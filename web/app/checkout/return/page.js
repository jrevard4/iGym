'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { loadGyms } from '../../../../lib/supabase';
import env from '../../../../lib/env';
import { getSession } from '@/lib/auth';
import { finalizePassPurchase } from '../../../lib/checkout';

// Landing spot for payment methods that require an off-site redirect step
// (most test-card payments resolve on /checkout/[gymId] without ever coming here).
export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-6 py-20 text-center text-gray-400">Confirming your payment...</div>}>
      <CheckoutReturnPageInner />
    </Suspense>
  );
}

function CheckoutReturnPageInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('checking'); // checking | success | failed
  const [error, setError] = useState('');
  const [purchasedPass, setPurchasedPass] = useState(null);
  const [gym, setGym] = useState(null);

  const gymId = searchParams.get('gymId');
  const clientSecret = searchParams.get('payment_intent_client_secret');

  useEffect(() => {
    (async () => {
      const session = getSession();
      if (!session || !gymId || !clientSecret) {
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

      const gyms = await loadGyms();
      const foundGym = gyms.find((g) => g.id === gymId) || null;
      if (!foundGym) {
        setStatus('failed');
        setError('Gym not found.');
        return;
      }
      setGym(foundGym);

      const pass = {
        id: searchParams.get('passId') || 'dp',
        label: searchParams.get('label') || 'Day Pass',
        price: parseFloat(searchParams.get('price')) || 0,
        type: searchParams.get('type') || 'TIME',
        value: searchParams.get('value') || '1',
      };

      try {
        const newPass = await finalizePassPurchase({
          gym: foundGym,
          pass,
          userId: session.id,
          stripePaymentId: paymentIntent.id,
          startsAt: searchParams.get('startsAt'),
          referralCode: searchParams.get('ref'),
        });
        setPurchasedPass(newPass);
        setStatus('success');
      } catch (err) {
        setStatus('failed');
        setError(err.message || 'Payment succeeded but saving the pass failed. Contact support.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'checking') {
    return <div className="max-w-md mx-auto px-6 py-20 text-center text-gray-400">Confirming your payment...</div>;
  }

  if (status === 'failed') {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Payment not completed</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        {gymId && (
          <Link href={`/gyms/${gymId}`} className="text-brand-text dark:text-blue-400 hover:underline">← Back to gym</Link>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-3xl font-black mb-2">Pass purchased!</h1>
      <p className="text-gray-600 mb-6">
        {purchasedPass?.label} at {gym?.gymName} is now in your wallet.
      </p>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-sm mb-6 break-all">
        {purchasedPass?.id}
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
