// Finalizes a pass purchase after payment succeeds (or in demo mode).
// Mirrors the completion logic in ../../App.js `handlePaymentSubmit`, so the
// pass shape and revenue accounting stay identical between mobile and web.

import { savePass, recordPassSale } from '../../lib/supabase';
import { PLATFORM_FEE_RATE } from '../../lib/constants';

// A bare 'YYYY-MM-DD' (from <input type="date">) is parsed by `new Date()` as
// UTC midnight, which shifts to the previous day once rendered in any
// negative-UTC-offset timezone. Parse the components directly instead so the
// calendar day the user picked is the calendar day that gets stored.
export function parseLocalDate(value) {
  if (!value) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

export async function finalizePassPurchase({ gym, pass, userId, stripePaymentId, startsAt }) {
  const startDate = parseLocalDate(startsAt);
  let expiresAt = null;
  let remainingPunches = null;

  if (pass.type === 'TIME') {
    expiresAt = new Date(startDate.getTime() + (parseInt(pass.value) || 1) * 86400000);
  } else if (pass.type === 'PUNCH') {
    remainingPunches = parseInt(pass.value) || 1;
    expiresAt = new Date(startDate.getTime() + 365 * 86400000);
  } else {
    expiresAt = new Date(startDate.getTime() + 30 * 86400000);
  }

  const platformFee = parseFloat((pass.price * PLATFORM_FEE_RATE).toFixed(2));
  const gymReceives = parseFloat((pass.price - platformFee).toFixed(2));

  const newPass = {
    id: 'QR-' + Math.random().toString(36).slice(2, 11).toUpperCase(),
    gymId: gym.id,
    gymName: gym.gymName,
    label: pass.label,
    price: pass.price,
    platformFee,
    gymReceives,
    type: pass.type,
    value: pass.value,
    purchasedAt: new Date().toISOString(),
    startsAt: startDate.toISOString(),
    expiresAt: expiresAt?.toISOString() || null,
    remainingPunches,
    totalPunches: remainingPunches,
    stripePaymentId: stripePaymentId || 'demo',
  };

  await savePass(newPass, userId);
  await recordPassSale(gym.id, gymReceives, platformFee);

  return newPass;
}
