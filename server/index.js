// Stripe PaymentIntent backend for iGym.
// Keep the secret key here — never on the mobile client.
//
// Local: `cd server && npm install && cp .env.example .env && npm run dev`
// Deploy: Railway, Render, Fly.io, or any Node host.

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PORT = process.env.PORT || 4242;

if (!STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY missing. Payment endpoints will return 500.');
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn('⚠️  STRIPE_WEBHOOK_SECRET missing. Membership renewals/cancellations won\'t sync to the database.');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  SUPABASE_URL/SUPABASE_ANON_KEY missing. Webhook can\'t write subscription status.');
}

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const app = express();

// Same direct-to-Expo POST as lib/push.js — duplicated here (rather than
// imported) because this is a separate CommonJS process from the ESM lib/
// directory the mobile/web apps share. Never throws — a failed notification
// should never break webhook processing.
async function sendExpoPush(to, title, body, data = {}) {
  if (!to) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify([{ to, title, body, data }]),
    });
  } catch (e) {
    console.warn('[push] send failed', e.message || e);
  }
}

app.use(cors());

// The webhook route needs the raw request body (for Stripe's signature check)
// and must be registered before the global express.json() body parser below,
// which would otherwise consume/parse it first.
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(500).json({ error: 'Webhook not configured' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // A subscription's recurring invoice paid — either the first charge or
      // a renewal. Extend expiresAt to the new billing period end so the
      // member's access keeps rolling forward with no manual repurchase.
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId && supabase) {
          const periodEnd = invoice.lines?.data?.[0]?.period?.end;
          const patch = { status: 'active' };
          if (periodEnd) patch.expiresAt = new Date(periodEnd * 1000).toISOString();
          const { error } = await supabase.from('passes').update(patch).eq('stripeSubscriptionId', subscriptionId);
          if (error) console.error('[webhook] failed to mark pass active:', error.message);
        }
        break;
      }
      // A recurring charge failed — flag the pass so the member/owner can see
      // it's at risk, without immediately cutting off access (Stripe itself
      // will retry the charge per its own retry schedule).
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId && supabase) {
          const { data: pass, error } = await supabase.from('passes')
            .update({ status: 'past_due' }).eq('stripeSubscriptionId', subscriptionId)
            .select().maybeSingle();
          if (error) console.error('[webhook] failed to mark pass past_due:', error.message);
          if (pass?.userId) {
            const { data: user } = await supabase.from('users').select('pushToken').eq('id', pass.userId).maybeSingle();
            if (user?.pushToken) {
              await sendExpoPush(user.pushToken, 'Payment failed', `We couldn't renew your ${pass.label} membership at ${pass.gymName}. Update your card to keep your access.`);
            }
          }
        }
        break;
      }
      // The subscription itself ended (member canceled, or Stripe gave up
      // retrying a failed payment) — this is the final "access ends" signal.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        if (supabase) {
          const { error } = await supabase.from('passes').update({ status: 'canceled' }).eq('stripeSubscriptionId', subscription.id);
          if (error) console.error('[webhook] failed to mark pass canceled:', error.message);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[webhook] handler error:', err.message);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, stripe: !!stripe, supabase: !!supabase });
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Server not configured: STRIPE_SECRET_KEY missing' });

    const { amount, gymName, passLabel, gymId, userId } = req.body || {};
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 50) {
      return res.status(400).json({ error: 'Amount must be at least $0.50' });
    }

    const intent = await stripe.paymentIntents.create({
      amount: cents,
      currency: 'usd',
      description: `${gymName || 'iGym'} — ${passLabel || 'Pass'}`,
      automatic_payment_methods: { enabled: true },
      metadata: {
        gymId: String(gymId || ''),
        userId: String(userId || ''),
        passLabel: String(passLabel || ''),
      },
    });

    res.json({ clientSecret: intent.client_secret, intentId: intent.id });
  } catch (err) {
    console.error('[create-payment-intent]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Recurring membership billing — creates a Stripe Customer + Subscription on
// the fly (no pre-created Price objects needed in the dashboard) and returns
// a PaymentIntent clientSecret for the subscription's first invoice, same as
// /create-payment-intent above. billingIntervalDays comes straight from the
// membership pass's `value` field (the same "billing period in days" the
// owner set when defining the pass).
app.post('/create-subscription', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Server not configured: STRIPE_SECRET_KEY missing' });

    const { amount, gymName, passLabel, gymId, userId, email, billingIntervalDays } = req.body || {};
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 50) {
      return res.status(400).json({ error: 'Amount must be at least $0.50' });
    }
    const intervalDays = Math.max(1, parseInt(billingIntervalDays) || 30);

    const customer = await stripe.customers.create({
      email: email || undefined,
      metadata: { gymId: String(gymId || ''), userId: String(userId || '') },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${gymName || 'iGym'} — ${passLabel || 'Membership'}` },
          unit_amount: cents,
          recurring: { interval: 'day', interval_count: intervalDays },
        },
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { gymId: String(gymId || ''), userId: String(userId || ''), passLabel: String(passLabel || '') },
    });

    res.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (err) {
    console.error('[create-subscription]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cancels at the end of the current billing period rather than immediately,
// so a member who cancels keeps the access they already paid for.
app.post('/cancel-subscription', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Server not configured: STRIPE_SECRET_KEY missing' });
    const { subscriptionId } = req.body || {};
    if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });

    const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    res.json({ ok: true, cancelAtPeriodEnd: subscription.cancel_at_period_end });
  } catch (err) {
    console.error('[cancel-subscription]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`iGym Stripe backend listening on :${PORT}`);
});
