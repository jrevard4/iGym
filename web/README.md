# iGym — Web

Next.js 15 (App Router) website that shares data with the iGym mobile app via the same Supabase backend.

Members can browse gyms, see equipment and reviews, log in, and view their wallet. Buying a pass is currently a stub — the next step is wiring Stripe Checkout (see "What's left" below).

---

## What's in this folder

```
web/
├── app/
│   ├── layout.js              # Root layout (Header + Footer)
│   ├── page.js                # Landing page
│   ├── globals.css            # Tailwind directives
│   ├── login/page.js          # Member login
│   ├── register/page.js       # Member signup
│   ├── wallet/page.js         # Logged-in member's pass list
│   └── gyms/
│       ├── page.js            # Directory with search + filters
│       └── [id]/page.js       # Gym detail (equipment, reviews, passes)
├── components/
│   ├── Header.js              # Sticky top nav (auth-aware)
│   ├── Footer.js
│   └── GymCard.js             # Shared gym card used in the directory
├── lib/
│   └── auth.js                # localStorage session helper
├── next.config.mjs            # Allows imports from ../lib
├── tailwind.config.js
├── postcss.config.js
├── jsconfig.json              # @/ → web/, @shared/ → ../lib/
├── package.json
└── .env.local.example
```

The directory and detail pages import directly from `../lib/supabase.js`, `../lib/constants.js`, `../lib/helpers.js` — the **same** files the mobile app uses. Changes there flow to both apps.

---

## Setup

### 1. Install

```bash
cd web
npm install
```

### 2. Env vars

Copy `.env.local.example` → `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_BACKEND_URL=http://localhost:4242
```

Use the **same Supabase project** as the mobile app — the data is shared. The `lib/env.js` patch at the project root lets one module work in both Expo (`EXPO_PUBLIC_*`) and Next.js (`NEXT_PUBLIC_*`) without code changes.

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000.

If you haven't seeded Supabase yet, the gym list will be empty. Run the mobile app once first — it auto-seeds 10 Westerville gyms + 2 demo owners. After that the web app sees the same data.

---

## Demo accounts

Same as the mobile app (auto-seeded by it):

| Type   | Username   | Password |
|--------|------------|----------|
| Member | `admin`    | `123`    |
| Owner  | `owner`    | `123`    |
| Owner  | `zenowner` | `123`    |

---

## What's shipped vs what's left

### ✅ Shipped (member side)

- **Landing page** with hero, value props, CTA
- **Gym directory** at `/gyms` — search by name/location/description, filter by class & price, sort by distance/rating/price, "open now" toggle, browser geolocation for distance calc
- **Gym detail** at `/gyms/[id]` — full info, equipment list with category filter, member reviews, pass tiers with platform-fee breakdown
- **Login** at `/login` — same auth as mobile (plain-text password check via Supabase)
- **Register** at `/register` — full account creation, redirects to gyms
- **Wallet** at `/wallet` — list of active passes (gated to logged-in users), refreshes from DB so passes bought in the mobile app appear here
- **Auth-aware header** — switches between Login/Get Started and user name + Sign out
- **Tailwind-based UI** matching the mobile app's color palette and typography

### ⏳ Left to build

1. **Real Stripe Checkout.** The "Buy Pass" button currently shows an alert pointing users to the mobile app. To finish:
   - Use the existing `server/index.js` `/create-payment-intent` endpoint (the mobile app already calls this)
   - Add `@stripe/stripe-js` to `web/package.json` and use Stripe Elements or Checkout in the browser
   - On success, call `savePass` + `recordPassSale` from `../lib/supabase.js` (same flow as the mobile app's `handlePaymentSubmit`)
2. **Owner dashboard.** All the screens the mobile app has (front desk scanner, inventory, analytics, subscription) need web counterparts. The underlying `lib/` calls work; the JSX needs to be rewritten with Tailwind.
3. **Equipment search + AI identifier for owners.** The shared `lib/ai.js` already exposes `matchmakerSearch`, `identifyEquipmentFromImage`, and `searchEquipmentOnWeb` — they're plain `fetch` calls and work the same in Next.js. Wire them into web pages when you build the owner dashboard.
4. **AI Matchmaker for members.** Same shared module — drop into the directory page above the filter bar.
5. **Mapbox or Google Maps view.** The mobile app uses `react-native-maps` which doesn't work on web. Use `mapbox-gl` or `@vis.gl/react-google-maps` for the web map view.
6. **Production auth.** Current setup stores user objects in `localStorage` to match the mobile app. Before launch, swap to **Supabase Auth + `@supabase/ssr`** so sessions are server-validated cookies. Pattern:
   ```bash
   npm install @supabase/ssr
   ```
   Then add `middleware.js` at the web/ root and replace `web/lib/auth.js` with `createServerClient` / `createBrowserClient` from `@supabase/ssr`.
7. **SEO.** Convert `/gyms` and `/gyms/[id]` to Server Components and pre-render gym pages with `generateStaticParams` for SEO. The current implementation is client-only because it needs interactive filters — split into a server-rendered shell + client island for filters.

---

## How the shared lib works

The mobile app and web app share `../lib/` (project root). Each Next.js page imports directly from there:

```js
// web/app/gyms/page.js
import { loadGyms } from '../../../lib/supabase';
import { getDistanceMiles } from '../../../lib/helpers';
import { CLASS_TYPES } from '../../../lib/constants';
```

Two things make this work:

1. **`next.config.mjs`** has `experimental.externalDir = true`, which permits imports outside the `web/` folder.
2. **`lib/env.js`** checks both `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` so the same Supabase config code works in both apps.

If you ever want to publish `lib/` as an internal package, drop a `lib/package.json` with `{ "name": "@igym/shared" }` and add it to both apps' dependencies with `"@igym/shared": "file:../lib"`.

---

## Common issues

**"Cannot find module '../../../lib/supabase'"** — make sure `next.config.mjs` has `experimental.externalDir: true` and that you ran `npm install` after the config exists.

**Empty gym list** — Supabase hasn't been seeded yet. Run the mobile app once, or paste `lib/gyms-seed.js` data manually in the Supabase SQL editor.

**Geolocation prompt every page load** — that's the browser's behavior the first time. Once granted, it caches. Default location (Columbus, OH) is used if the user denies.

**Tailwind classes don't apply** — `tailwind.config.js` `content` paths must cover where your JSX lives. They already do for `app/` and `components/`, but if you add a new top-level folder, add it to the array.

---

## Scripts

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build
npm start            # Run production build on :3000
npm run lint         # Next.js ESLint
```
