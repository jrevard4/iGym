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
//
// NOTE: both bundlers only statically inline literal `process.env.VAR_NAME`
// expressions — dynamic/bracket access (`process.env[name]`) is invisible to
// their inliners and always resolves to undefined in a browser/client bundle.
// So each var must be written out as its own literal expression below.

const env = {
  SUPABASE_URL:       process.env.NEXT_PUBLIC_SUPABASE_URL          || process.env.EXPO_PUBLIC_SUPABASE_URL          || '',
  SUPABASE_ANON_KEY:  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY     || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY     || '',
  STRIPE_PUBLISHABLE: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  BACKEND_URL:        process.env.NEXT_PUBLIC_BACKEND_URL          || process.env.EXPO_PUBLIC_BACKEND_URL          || 'http://localhost:4242',
};

export const hasSupabase = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
export const hasStripe   = !!env.STRIPE_PUBLISHABLE;

export default env;
