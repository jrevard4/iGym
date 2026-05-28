'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginUser, loadUserPasses } from '../../../lib/supabase';
import { setSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) return setError('Username and password are required.');
    setBusy(true);
    setError('');
    try {
      const user = await loginUser(username, password);
      if (!user) {
        setError('Invalid username or password.');
        setBusy(false);
        return;
      }
      const passes = await loadUserPasses(user.id);
      setSession({ ...user, activePasses: passes });
      router.push('/gyms');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-4xl font-black mb-2">Welcome back</h1>
      <p className="text-gray-600 mb-8">Sign in to view your wallet and find your next gym.</p>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-gray-700">Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-700">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
          />
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
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

      <p className="mt-6 text-center text-sm text-gray-600">
        New to iGym?{' '}
        <Link href="/register" className="text-brand hover:underline font-semibold">
          Create an account
        </Link>
      </p>

      <div className="mt-10 p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
        <strong className="text-gray-700">Demo account:</strong> username <code className="bg-white px-1.5 py-0.5 rounded border">admin</code> password <code className="bg-white px-1.5 py-0.5 rounded border">123</code>
      </div>
    </div>
  );
}
