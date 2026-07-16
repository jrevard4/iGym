'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { loginUser, loadUserPasses, registerGuestUser } from '../../../lib/supabase';
import { setSession } from '@/lib/auth';
import { useT } from '@/lib/PreferencesContext';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const next = searchParams.get('next');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

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
      router.push(next || '/gyms');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  const submitGuest = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await registerGuestUser({ firstName: guestName, email: guestEmail });
      if (result.error) {
        setError(result.error);
        setBusy(false);
        return;
      }
      setSession({ ...result.user, activePasses: [] });
      router.push(next || '/gyms');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-4xl font-black mb-2">Welcome back</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Sign in to view your wallet and find your next gym.</p>

      {guestMode ? (
        <form onSubmit={submitGuest} className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-500">{t('guestCheckoutHint')}</p>
          <label className="block">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('fullName')}</span>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="mt-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('email')}</span>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
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
            {busy ? t('processing') : t('continueAsGuest')}
          </button>
          <button type="button" onClick={() => setGuestMode(false)} className="w-full text-center text-sm text-gray-500 dark:text-gray-500 hover:text-brand-text transition">
            ← Back to sign in
          </button>
        </form>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('username')}</span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('password')}</span>
              <input
                type="password"
                autoComplete="current-password"
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

          {next && (
            <button
              type="button"
              onClick={() => setGuestMode(true)}
              className="w-full mt-3 text-center text-sm font-semibold text-brand-text hover:underline"
            >
              {t('continueAsGuest')} →
            </button>
          )}

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {t('dontHaveAccount')}{' '}
            <Link href="/register" className="text-brand-text hover:underline font-semibold">
              Create an account
            </Link>
          </p>

          <div className="mt-10 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-xs text-gray-500 dark:text-gray-500">
            <strong className="text-gray-700 dark:text-gray-300">Demo account:</strong> username <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border dark:border-gray-700">admin</code> password <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border dark:border-gray-700">123</code>
          </div>
        </>
      )}
    </div>
  );
}
