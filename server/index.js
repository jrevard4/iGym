// Stripe PaymentIntent backend for iGym.
// Keep the secret key here — never on the mobile client.
//
// Local: `cd server && npm install && cp .env.example .env && npm run dev`
// Deploy: Railway, Render, Fly.io, or any Node host.

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PORT = process.env.PORT || 4242;

if (!STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY missing. Payment endpoints will return 500.');
}

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, stripe: !!stripe });
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

// Optional: webhook endpoint for future reconciliation.
// Stripe -> POST /webhook -> verify signature -> mark pass paid in Supabase.
// Skeleton only; install per https://stripe.com/docs/webhooks
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // const sig = req.headers['stripe-signature'];
  // const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  // switch(event.type) { case 'payment_intent.succeeded': ... }
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`iGym Stripe backend listening on :${PORT}`);
});
