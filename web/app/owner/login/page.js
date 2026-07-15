'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginOwner } from '../../../../lib/supabase';
import { setOwnerSession } from '@/lib/ownerAuth';

export default function OwnerLoginPage() {
  const router = useRouter();
  const [ownerID, setOwnerID] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!ownerID || !password) return setError('Enter your Management ID and password.');
    setBusy(true);
    setError('');
    try {
      const owner = await loginOwner(ownerID, password);
      if (!owner) {
        setError('Invalid management credentials.');
        setBusy(false);
        return;
      }
      setOwnerSession(owner);
      router.push('/owner');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-gray-500 dark:text-gray-500 hover:text-brand transition">← Back to iGym</Link>
      <h1 className="text-4xl font-black mb-2 mt-4">Gym Owner Portal</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Manage your facility, inventory, and members.</p>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Management ID</span>
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
          {busy ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-10 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-xs text-gray-500 dark:text-gray-500">
        <strong className="text-gray-700 dark:text-gray-300">Demo accounts:</strong> <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border dark:border-gray-700">owner</code> / <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border dark:border-gray-700">123</code> (Iron Paradise), <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border dark:border-gray-700">zenowner</code> / <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border dark:border-gray-700">123</code> (Zen Wellness)
      </div>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-500">
        New gym owner? Register your business from the iGym mobile app for now.
      </p>
    </div>
  );
}
