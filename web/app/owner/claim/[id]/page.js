'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getGymById, upsertGym } from '../../../../../lib/supabase';
import { setOwnerSession } from '@/lib/ownerAuth';

export default function ClaimGymPage() {
  const router = useRouter();
  const params = useParams();
  const gymId = params.id;

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ownerID, setOwnerID] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const data = await getGymById(gymId);
      setGym(data);
      setLoading(false);
    })();
  }, [gymId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!ownerID.trim() || !password) return setError('Choose a Management ID and password.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setBusy(true);
    setError('');
    try {
      const fresh = await getGymById(gymId);
      if (fresh?.ownerID) {
        setError('This listing has already been claimed by someone else.');
        setBusy(false);
        return;
      }
      const chosenID = ownerID.trim().toLowerCase();
      const updated = await upsertGym({ ...fresh, ownerID: chosenID, password: password.trim() });
      // upsertGym swallows DB errors and falls back to the input on failure —
      // re-check the write actually landed (e.g. a duplicate Management ID
      // would otherwise silently "succeed" client-side without persisting).
      const verify = await getGymById(gymId);
      if (verify?.ownerID !== chosenID) {
        setError('That Management ID is already taken.');
        setBusy(false);
        return;
      }
      setOwnerSession(updated);
      router.push('/owner');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="max-w-md mx-auto px-6 py-20 text-center text-gray-400">Loading...</div>;
  }

  if (!gym) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Gym not found</h1>
        <Link href="/gyms" className="text-brand hover:underline">← Back to all gyms</Link>
      </div>
    );
  }

  if (gym.ownerID) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Already claimed</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{gym.gymName} already has a registered owner account.</p>
        <Link href="/owner/login" className="text-brand hover:underline">Go to owner sign-in →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <Link href={`/gyms/${gymId}`} className="text-sm font-semibold text-gray-500 dark:text-gray-500 hover:text-brand transition">← Back to {gym.gymName}</Link>
      <h1 className="text-4xl font-black mb-2 mt-4">Claim This Listing</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Set up management credentials for <span className="font-semibold text-gray-900 dark:text-gray-100">{gym.gymName}</span> to unlock the owner portal — inventory, passes, analytics, and more.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Choose a Management ID</span>
          <input
            type="text"
            autoCapitalize="none"
            value={ownerID}
            onChange={(e) => setOwnerID(e.target.value)}
            className="mt-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
          />
        </label>

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-lg transition"
        >
          {busy ? 'Claiming...' : 'Claim this gym'}
        </button>
      </form>
    </div>
  );
}
