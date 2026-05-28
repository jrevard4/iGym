// Env loader — works in both Expo and Next.js.
//
//   Expo: EXPO_PUBLIC_* vars get inlined at build time
//         (https://docs.expo.dev/guides/environment-variables/).
//   Next.js: NEXT_PUBLIC_* vars get inlined for client-side use
//         (https://nextjs.org/docs/app/building-your-application/configuring/environment-variables).
//
// Each lookup checks the Next.js-style name first, then falls back to Expo style,
// so one shared module serves both apps without changes.
//
// Never put server-only secrets here. The Stripe secret key lives in server/.env.

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
};

const env = {
  SUPABASE_URL:       pick('NEXT_PUBLIC_SUPABASE_URL',         'EXPO_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY:  pick('NEXT_PUBLIC_SUPABASE_ANON_KEY',    'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  STRIPE_PUBLISHABLE: pick('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY','EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  BACKEND_URL:        pick('NEXT_PUBLIC_BACKEND_URL',          'EXPO_PUBLIC_BACKEND_URL') || 'http://localhost:4242',
};

export const hasSupabase = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
export const hasStripe   = !!env.STRIPE_PUBLISHABLE;

export default env;
