// Supabase data layer.
// Every function returns a sensible empty value when Supabase isn't configured,
// so the app stays usable during local development without a backend.
//
// NOTE: Plain-text passwords are stored to match the existing app behavior.
// Production should migrate to Supabase Auth (see README — "Security TODO").

import { createClient } from '@supabase/supabase-js';
import env, { hasSupabase } from './env';
import { uniqueId } from './helpers';

export const supabase = hasSupabase
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

function warn(scope, err) {
  if (err) console.warn(`[supabase:${scope}]`, err.message || err);
}

// ─── USERS ───────────────────────────────────────────────────────────
export async function loadUsers() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('users').select('*');
  warn('loadUsers', error);
  return data || [];
}

export async function upsertUser(user) {
  if (!supabase) return user;
  const payload = { ...user, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('users').upsert(payload).select().single();
  warn('upsertUser', error);
  return data || user;
}

export async function registerUser(input) {
  const normalized = { ...input, username: input.username?.trim().toLowerCase() };
  if (!supabase) {
    return { user: { id: uniqueId('u_'), ...normalized } };
  }
  const { data: existing } = await supabase.from('users')
    .select('id').eq('username', normalized.username).maybeSingle();
  if (existing) return { error: 'Username already taken' };

  const row = { id: normalized.id || uniqueId('u_'), ...normalized, created_at: new Date().toISOString() };
  const { data, error } = await supabase.from('users').insert(row).select().single();
  if (error) return { error: error.message };
  return { user: data };
}

export async function loginUser(username, password) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('users').select('*')
    .eq('username', username.trim().toLowerCase())
    .eq('password', password.trim())
    .maybeSingle();
  warn('loginUser', error);
  return data;
}

export async function toggleFavoriteDB(userId, gymId, isFav) {
  if (!supabase) return;
  const { data: user } = await supabase.from('users').select('favorites').eq('id', userId).maybeSingle();
  const current = user?.favorites || [];
  const next = isFav ? [...new Set([...current, gymId])] : current.filter(id => id !== gymId);
  const { error } = await supabase.from('users').update({ favorites: next }).eq('id', userId);
  warn('toggleFavoriteDB', error);
}

// ─── GYMS ────────────────────────────────────────────────────────────
export async function loadGyms() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('gyms').select('*');
  warn('loadGyms', error);
  return data || [];
}

export async function upsertGym(gym) {
  if (!supabase) return gym;
  const payload = { ...gym, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('gyms').upsert(payload).select().single();
  warn('upsertGym', error);
  return data || gym;
}

export async function loginOwner(ownerID, password) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('gyms').select('*')
    .eq('ownerID', ownerID.trim().toLowerCase())
    .eq('password', password.trim())
    .maybeSingle();
  warn('loginOwner', error);
  return data;
}

export async function addGymReview(gymId, review) {
  if (!supabase) return;
  const { data: gym, error: readErr } = await supabase.from('gyms')
    .select('gymReviews').eq('id', gymId).maybeSingle();
  warn('addGymReview:read', readErr);
  const updated = [review, ...(gym?.gymReviews || [])];
  const { error } = await supabase.from('gyms').update({ gymReviews: updated }).eq('id', gymId);
  warn('addGymReview:write', error);
}

// Atomic increment via Postgres RPC (defined in supabase/schema.sql).
// Falls back to read-modify-write if the RPC isn't installed.
export async function recordPassSale(gymId, gymReceives, platformFee) {
  if (!supabase) return;
  const { error: rpcErr } = await supabase.rpc('record_pass_sale', {
    p_gym_id: gymId,
    p_gym_receives: gymReceives,
    p_platform_fee: platformFee,
  });
  if (!rpcErr) return;

  // Fallback (race-prone — install the RPC to fix)
  console.warn('[recordPassSale] RPC missing, falling back. Install supabase/schema.sql.');
  const { data: gym } = await supabase.from('gyms')
    .select('totalPassRevenue, platformFeesPaid, monthlyPassSales').eq('id', gymId).maybeSingle();
  if (!gym) return;
  await supabase.from('gyms').update({
    totalPassRevenue: (gym.totalPassRevenue || 0) + gymReceives,
    platformFeesPaid: (gym.platformFeesPaid || 0) + platformFee,
    monthlyPassSales: (gym.monthlyPassSales || 0) + 1,
  }).eq('id', gymId);
}

// ─── PASSES ──────────────────────────────────────────────────────────
export async function savePass(pass, userId) {
  if (!supabase) return pass;
  const row = { ...pass, userId, created_at: new Date().toISOString() };
  const { data, error } = await supabase.from('passes').insert(row).select().single();
  warn('savePass', error);
  return data || pass;
}

export async function loadUserPasses(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('passes').select('*')
    .eq('userId', userId)
    .order('created_at', { ascending: false });
  warn('loadUserPasses', error);
  return data || [];
}

// Used by the front desk QR scanner — direct DB lookup so we don't depend
// on a stale local cache of all users.
export async function getPassById(passId) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('passes').select('*')
    .eq('id', passId).maybeSingle();
  warn('getPassById', error);
  return data;
}

export async function updatePass(passId, patch) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('passes')
    .update(patch).eq('id', passId).select().single();
  warn('updatePass', error);
  return data;
}

export async function deletePass(passId) {
  if (!supabase) return;
  const { error } = await supabase.from('passes').delete().eq('id', passId);
  warn('deletePass', error);
}

// All passes ever sold at a given gym — used in the Owner Members tab.
export async function loadGymPasses(gymId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('passes').select('*')
    .eq('gymId', gymId)
    .order('purchasedAt', { ascending: false });
  warn('loadGymPasses', error);
  return data || [];
}

// ─── SEED ────────────────────────────────────────────────────────────
export async function seedRealGymsIfNeeded(realGyms) {
  if (!supabase || !realGyms?.length) return;
  for (const gym of realGyms) {
    // upsert is idempotent — safe to re-run
    await upsertGym(gym);
  }
}

// Legacy no-op aliases. Existing code calls saveUsers(db) / saveOwners(db)
// after mutating local state — we now do per-record upserts at the call sites,
// so these just exist to avoid touching old call sites that haven't migrated.
export async function saveUsers() {}
export async function saveGyms() {}
