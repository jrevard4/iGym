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

// Lighter-friction checkout path: auto-registers a minimal account (random
// username/password the guest never sees or needs) instead of making a
// first-time buyer fill out the full registration form before paying.
export async function registerGuestUser({ firstName, email }) {
  const username = `guest_${uniqueId('')}`;
  const password = uniqueId('gp_');
  return registerUser({
    username, password,
    firstName: firstName?.trim() || 'Guest',
    lastName: '', email: email?.trim() || '',
    favorites: [], activePasses: [],
  });
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

// Records a referral at signup: looks up the referring user by code and
// atomically bumps their referralCount via RPC (falls back to read-modify-write).
// Silently no-ops if the code doesn't match anyone — referral is a bonus, not a gate.
export async function redeemReferral(referralCode) {
  if (!supabase || !referralCode) return;
  const { error: rpcErr } = await supabase.rpc('increment_referral_count', { p_referral_code: referralCode });
  if (!rpcErr) return;

  const { data: referrer } = await supabase.from('users')
    .select('id, referralCount').eq('referralCode', referralCode).maybeSingle();
  if (!referrer) return;
  await supabase.from('users').update({ referralCount: (referrer.referralCount || 0) + 1 }).eq('id', referrer.id);
}

// Single-user lookup — used where the full userDatabase isn't preloaded
// (e.g. the web owner portal, which doesn't mirror the whole users table client-side).
export async function getUserById(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  warn('getUserById', error);
  return data;
}

// Resolves a shared referral code back to the referring user at purchase
// time (as opposed to redeemReferral, which only fires once at signup).
export async function getUserByReferralCode(referralCode) {
  if (!supabase || !referralCode) return null;
  const { data, error } = await supabase.from('users')
    .select('id').eq('referralCode', referralCode).maybeSingle();
  warn('getUserByReferralCode', error);
  return data;
}

// Atomic credit via Postgres RPC (defined in supabase/schema.sql).
// Falls back to read-modify-write if the RPC isn't installed.
export async function recordReferralReward(referrerUserId, amount, gymId) {
  if (!supabase || !referrerUserId || !amount) return;
  const { error: rpcErr } = await supabase.rpc('record_referral_reward', {
    p_referrer_user_id: referrerUserId,
    p_amount: amount,
    p_gym_id: gymId,
  });
  if (!rpcErr) return;

  console.warn('[recordReferralReward] RPC missing, falling back. Install supabase/schema.sql.');
  const [{ data: user }, { data: gym }] = await Promise.all([
    supabase.from('users').select('referralCredit').eq('id', referrerUserId).maybeSingle(),
    supabase.from('gyms').select('referralRevenue').eq('id', gymId).maybeSingle(),
  ]);
  if (user) {
    await supabase.from('users').update({ referralCredit: (user.referralCredit || 0) + amount }).eq('id', referrerUserId);
  }
  if (gym) {
    await supabase.from('gyms').update({ referralRevenue: (gym.referralRevenue || 0) + amount }).eq('id', gymId);
  }
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

// Mirrors redeemReferral() but for gym-to-gym referrals (an owner referring
// another owner to list their gym). Silently no-ops on an unknown code.
export async function redeemGymReferral(referralCode) {
  if (!supabase || !referralCode) return;
  const { error: rpcErr } = await supabase.rpc('increment_gym_referral_count', { p_referral_code: referralCode });
  if (!rpcErr) return;

  const { data: referrer } = await supabase.from('gyms')
    .select('id, referralCount').eq('referralCode', referralCode).maybeSingle();
  if (!referrer) return;
  await supabase.from('gyms').update({ referralCount: (referrer.referralCount || 0) + 1 }).eq('id', referrer.id);
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

// Owner reply to a specific review — same read-modify-write shape as
// addGymReview, just patching one entry's ownerResponse instead of
// prepending a new one.
export async function respondToReview(gymId, reviewId, responseText) {
  if (!supabase) return;
  const { data: gym, error: readErr } = await supabase.from('gyms')
    .select('gymReviews').eq('id', gymId).maybeSingle();
  warn('respondToReview:read', readErr);
  const updated = (gym?.gymReviews || []).map((r) =>
    r.id === reviewId ? { ...r, ownerResponse: { text: responseText, respondedAt: new Date().toISOString() } } : r
  );
  const { error } = await supabase.from('gyms').update({ gymReviews: updated }).eq('id', gymId);
  warn('respondToReview:write', error);
}

// Crowdsourced equipment issue report from a MEMBER (not the owner) — reads
// the gym's equipment array, appends a note to the matching item's
// memberReports list, and writes the whole array back. Never marks the item
// out-of-service itself (that stays an owner-only action) — it just raises
// a flag the owner sees in their Inventory alerts (computeEquipmentAlerts).
export async function reportEquipmentIssue(gymId, equipmentId, note, reportedBy) {
  if (!supabase) return;
  const { data: gym, error: readErr } = await supabase.from('gyms')
    .select('equipment').eq('id', gymId).maybeSingle();
  warn('reportEquipmentIssue:read', readErr);
  const report = { id: uniqueId('rpt_'), note, reportedBy: reportedBy || 'Anonymous', reportedAt: new Date().toISOString() };
  const updated = (gym?.equipment || []).map((eq) =>
    eq.id === equipmentId ? { ...eq, memberReports: [report, ...(eq.memberReports || [])] } : eq
  );
  const { error } = await supabase.from('gyms').update({ equipment: updated }).eq('id', gymId);
  warn('reportEquipmentIssue:write', error);
}

// Uploads a review's attached photo to the public 'review-photos' bucket —
// mirrors uploadEquipmentPhoto below. A photo attached to a review is shown
// as a lightweight trust signal ("photo verified") on the gym page.
export async function uploadReviewPhoto(file) {
  if (!supabase || !file) return null;
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uniqueId('rv_')}.${ext}`;
  const { error } = await supabase.storage.from('review-photos').upload(path, file);
  if (error) { warn('uploadReviewPhoto', error); return null; }
  const { data } = supabase.storage.from('review-photos').getPublicUrl(path);
  return data.publicUrl;
}

// React Native equivalent of uploadReviewPhoto/uploadEquipmentPhoto — mobile's
// image picker returns a local file:// URI, not a browser File object, so
// there's nothing to hand to Storage's .upload() directly. Expo's fetch
// polyfill can read a local URI back out as a blob, which IS a type
// supabase-js accepts, so that's the bridge: fetch the local file, upload
// the resulting blob under the same public bucket web's photos already use.
export async function uploadPhotoFromUri(bucket, uri) {
  if (!supabase || !uri) return null;
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = (uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
    const path = `${uniqueId('ph_')}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });
    if (error) { warn('uploadPhotoFromUri', error); return null; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    warn('uploadPhotoFromUri', e);
    return null;
  }
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

// Fire-and-forget: bumps a gym's search-interest counter when it shows up
// in AI matchmaker or local-match results. Never throws — this is a nice-to-have
// analytics signal, not something that should ever block a search from rendering.
export async function incrementMatchImpressions(gymId) {
  if (!supabase || !gymId) return;
  try {
    await supabase.rpc('increment_match_impressions', { p_gym_id: gymId });
  } catch (e) { warn('incrementMatchImpressions', e); }
}

// Single-gym lookup by id — used by the claim-listing flow, which needs a
// fresh read (not the client's stale `gyms` list) right before writing.
export async function getGymById(gymId) {
  if (!supabase || !gymId) return null;
  const { data, error } = await supabase.from('gyms').select('*').eq('id', gymId).maybeSingle();
  warn('getGymById', error);
  return data;
}

// ─── PASSES ──────────────────────────────────────────────────────────
export async function savePass(pass, userId) {
  if (!supabase) return pass;
  const row = { ...pass, userId, created_at: new Date().toISOString() };
  const { data, error } = await supabase.from('passes').insert(row).select().single();
  // Unlike the other functions here, a failed insert must not be swallowed:
  // callers (mobile checkout, web checkout) treat a resolved promise as
  // "the purchase was saved" and tell the user they now have access.
  if (error) throw new Error(error.message);
  return data;
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

// ─── CHECK-INS ───────────────────────────────────────────────────────
// One row per successful pass scan — powers streak/visit-count gamification.
export async function recordCheckin(userId, gymId) {
  if (!supabase || !userId || !gymId) return;
  const row = { id: uniqueId('chk_'), userId, gymId, created_at: new Date().toISOString() };
  const { error } = await supabase.from('checkins').insert(row);
  warn('recordCheckin', error);
}

export async function loadUserCheckins(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('checkins').select('*')
    .eq('userId', userId)
    .order('created_at', { ascending: false });
  warn('loadUserCheckins', error);
  return data || [];
}

// Gym-side mirror of loadUserCheckins — every check-in across all members,
// used for the owner-facing busiest-hours heatmap.
export async function loadGymCheckins(gymId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('checkins').select('*')
    .eq('gymId', gymId)
    .order('created_at', { ascending: false });
  warn('loadGymCheckins', error);
  return data || [];
}

// ─── CLASS BOOKINGS ──────────────────────────────────────────────────
// Books a specific weekly occurrence of a class (see lib/helpers.js
// getUpcomingClassOccurrences). Capacity is enforced by counting existing
// 'booked' rows for that exact (gymId, classScheduleId, classDate) triple —
// over capacity gets 'waitlisted' instead of rejected outright, so a member
// still has a shot if someone else cancels.
export async function bookClass({ gymId, classScheduleId, className, classDate, capacity, userId, username }) {
  if (!supabase) return { id: uniqueId('cb_'), status: 'booked' };
  const { count, error: countErr } = await supabase.from('classBookings')
    .select('id', { count: 'exact', head: true })
    .eq('gymId', gymId).eq('classScheduleId', classScheduleId).eq('classDate', classDate).eq('status', 'booked');
  warn('bookClass:count', countErr);

  const status = capacity && (count || 0) >= capacity ? 'waitlisted' : 'booked';
  const row = {
    id: uniqueId('cb_'), gymId, classScheduleId, className, classDate,
    userId, username, status, created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('classBookings').insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// Cancels a booking, and if it was holding a confirmed seat (not already
// waitlisted/cancelled), promotes the longest-waiting waitlisted member into
// it — otherwise a freed seat would just sit empty until someone happens to
// re-check the page. Returns the promoted booking (or null) so the caller
// can notify that member; this function only touches the database.
export async function cancelClassBooking(bookingId) {
  if (!supabase) return { promoted: null };
  const { data: original } = await supabase.from('classBookings').select('*').eq('id', bookingId).maybeSingle();
  const { error } = await supabase.from('classBookings').update({ status: 'cancelled' }).eq('id', bookingId);
  warn('cancelClassBooking', error);
  if (!original || original.status !== 'booked') return { promoted: null };

  const { data: nextInLine } = await supabase.from('classBookings').select('*')
    .eq('gymId', original.gymId).eq('classScheduleId', original.classScheduleId).eq('classDate', original.classDate)
    .eq('status', 'waitlisted')
    .order('created_at', { ascending: true })
    .limit(1).maybeSingle();
  if (!nextInLine) return { promoted: null };

  const { data: promoted, error: promoteErr } = await supabase.from('classBookings')
    .update({ status: 'booked' }).eq('id', nextInLine.id).select().single();
  warn('cancelClassBooking:promote', promoteErr);
  return { promoted: promoted || null };
}

export async function loadUserClassBookings(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('classBookings').select('*')
    .eq('userId', userId).neq('status', 'cancelled')
    .order('classDate', { ascending: true });
  warn('loadUserClassBookings', error);
  return data || [];
}

// Every active booking at a gym — used both to compute per-occurrence
// capacity (see countBookedForOccurrence in lib/helpers.js) and to show the
// owner a roster of who's booked into each upcoming class.
export async function loadGymClassBookings(gymId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('classBookings').select('*')
    .eq('gymId', gymId).neq('status', 'cancelled')
    .order('classDate', { ascending: true });
  warn('loadGymClassBookings', error);
  return data || [];
}

// Every active booking platform-wide — used by the cross-gym "Upcoming
// Classes" browse page (web/app/classes/page.js) to compute accurate
// booked/capacity counts without a separate query per gym.
export async function loadAllClassBookings() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('classBookings').select('*')
    .neq('status', 'cancelled')
    .order('classDate', { ascending: true });
  warn('loadAllClassBookings', error);
  return data || [];
}

// ─── MESSAGES ────────────────────────────────────────────────────────
// A conversation is implicitly keyed by (gymId, userId) — see supabase/schema.sql.
export async function sendMessage(gymId, userId, username, senderRole, text) {
  if (!supabase || !text?.trim()) return null;
  const row = {
    id: uniqueId('msg_'), gymId, userId, username, senderRole, text: text.trim(),
    read: false, created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadConversation(gymId, userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('messages').select('*')
    .eq('gymId', gymId).eq('userId', userId)
    .order('created_at', { ascending: true });
  warn('loadConversation', error);
  return data || [];
}

// Marks every message from the *other* party in a thread as read — a member
// reading marks the owner's messages read, and vice versa.
export async function markConversationRead(gymId, userId, readerRole) {
  if (!supabase) return;
  const otherRole = readerRole === 'owner' ? 'member' : 'owner';
  const { error } = await supabase.from('messages')
    .update({ read: true })
    .eq('gymId', gymId).eq('userId', userId).eq('senderRole', otherRole);
  warn('markConversationRead', error);
}

// One row per distinct member conversation at a gym, newest message first —
// powers the owner's inbox list without loading every message up front.
export async function loadGymConversations(gymId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('messages').select('*')
    .eq('gymId', gymId)
    .order('created_at', { ascending: false });
  warn('loadGymConversations', error);
  const byUser = new Map();
  (data || []).forEach((m) => {
    if (!byUser.has(m.userId)) {
      byUser.set(m.userId, { userId: m.userId, username: m.username, lastMessage: m, unreadCount: 0 });
    }
    const convo = byUser.get(m.userId);
    if (m.senderRole === 'member' && !m.read) convo.unreadCount++;
  });
  return [...byUser.values()];
}

// ─── STORAGE ─────────────────────────────────────────────────────────
// Uploads an equipment photo (or muscle-diagram image) to the public
// 'equipment-photos' bucket and returns its public URL. Unlike mobile's
// pickEditMedia (which just stores a local device file URI), this makes the
// photo actually visible to anyone viewing the gym, not just the uploader.
export async function uploadEquipmentPhoto(file) {
  if (!supabase || !file) return null;
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uniqueId('eq_')}.${ext}`;
  const { error } = await supabase.storage.from('equipment-photos').upload(path, file);
  if (error) { warn('uploadEquipmentPhoto', error); return null; }
  const { data } = supabase.storage.from('equipment-photos').getPublicUrl(path);
  return data.publicUrl;
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
