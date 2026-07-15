'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { registerUser, redeemReferral } from '../../../lib/supabase';
import { US_STATES } from '../../../lib/constants';
import { setSession } from '@/lib/auth';

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', username: '', password: '',
    address: '', city: '', state: '', zip: '',
    referredBy: searchParams.get('ref') || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const required = ['firstName','lastName','email','username','password','address','city','state','zip'];
    const missing = required.filter((k) => !form[k]);
    if (missing.length) return setError('Please fill in all fields.');
    setBusy(true);
    setError('');
    try {
      const referralCode = form.username.trim().toUpperCase().slice(0, 6) + (Date.now() % 1000);
      const referredBy = form.referredBy.trim().toUpperCase() || null;
      const { referredBy: _rb, ...rest } = form;
      const result = await registerUser({ ...rest, referralCode, referredBy, favorites: [], activePasses: [], phone: '' });
      if (result.error) {
        setError(result.error);
        setBusy(false);
        return;
      }
      if (referredBy) redeemReferral(referredBy);
      setSession({ ...result.user, activePasses: [] });
      router.push('/gyms');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  const cls = 'w-full px-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none';

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-4xl font-black mb-2">Create your account</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Buy day-passes at any iGym partner gym.</p>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input className={cls} placeholder="First name" value={form.firstName} onChange={update('firstName')} />
          <input className={cls} placeholder="Last name" value={form.lastName} onChange={update('lastName')} />
        </div>
        <input className={cls} type="email" placeholder="Email" value={form.email} onChange={update('email')} />
        <input className={cls} placeholder="Street address" value={form.address} onChange={update('address')} />
        <div className="grid grid-cols-3 gap-3">
          <input className={cls} placeholder="City" value={form.city} onChange={update('city')} />
          <select className={cls + ' bg-white'} value={form.state} onChange={update('state')}>
            <option value="">State</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={cls} placeholder="Zip" value={form.zip} onChange={update('zip')} />
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <input className={cls + ' mt-3'} placeholder="Choose a username" value={form.username} onChange={update('username')} autoComplete="username" />
          <input className={cls + ' mt-3'} type="password" placeholder="Choose a password" value={form.password} onChange={update('password')} autoComplete="new-password" />
        </div>

        <input
          className={cls}
          placeholder="Referral code (optional)"
          value={form.referredBy}
          onChange={update('referredBy')}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-lg transition mt-2"
        >
          {busy ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        Already have one?{' '}
        <Link href="/login" className="text-brand hover:underline font-semibold">Sign in</Link>
      </p>
    </div>
  );
}
