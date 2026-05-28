# iGym

A two-sided fitness marketplace: members find gyms by location, equipment, and goals; gym owners list facilities, sell day-passes, and manage their inventory with AI-assisted equipment identification.

Built with **Expo (React Native)** for the mobile app, **Supabase** for data, **Stripe** for payments, and **Claude (Anthropic)** for the AI matchmaker and equipment identifier.

---

## Project structure

```
iGym/
├── App.js                  # Main app (StripeProvider + ErrorBoundary + IGymApp)
├── app.json                # Expo config
├── babel.config.js
├── package.json
├── .env.example            # Copy to .env, fill in your keys
├── .gitignore
│
├── lib/                    # Shared business logic (also usable from a future Next.js web app)
│   ├── env.js              # Reads EXPO_PUBLIC_* env vars
│   ├── constants.js        # PLAN_TIERS, CLASS_TYPES, PRESET_PASSES, BRAND_WEBSITES, etc.
│   ├── helpers.js          # getDistanceMiles, isOpenNow, getAvgRating, runLocalMatch, uniqueId, parseClaudeJSON
│   ├── ai.js               # Centralized Claude API: matchmakerSearch, identifyEquipmentFromImage, searchEquipmentOnWeb
│   ├── supabase.js         # DB layer: loadUsers, upsertUser, loginUser, loadGyms, upsertGym, savePass, recordPassSale, getPassById, etc.
│   ├── equipment-db.js     # 250+ curated equipment items across 10 brands (Rogue, Life Fitness, Hammer Strength, Precor, Matrix, Peloton, Concept2, StairMaster, Technogym, Cybex)
│   └── gyms-seed.js        # Initial demo owners + real Westerville-OH gym data
│
├── components/
│   └── ErrorBoundary.js    # Recovery screen when the app crashes
│
├── server/                 # Stripe PaymentIntent backend (Node + Express)
│   ├── index.js
│   ├── package.json
│   └── .env.example
│
├── supabase/
│   └── schema.sql          # users + gyms + passes tables + record_pass_sale RPC for atomic revenue updates
│
└── assets/                 # ⚠️ Not auto-created — add icon.png, splash.png, etc. (see "Assets" below)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
cd server && npm install && cd ..
```

If `npx expo install --fix` complains about version mismatches, run it — it'll bump to versions compatible with the installed Expo SDK.

### 2. Environment variables

Copy `.env.example` → `.env` and fill in:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_BACKEND_URL=http://localhost:4242
```

For the server, copy `server/.env.example` → `server/.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
PORT=4242
```

### 3. Provision Supabase

1. Create a project at https://app.supabase.com
2. SQL Editor → paste `supabase/schema.sql` → Run
3. Copy your project URL and anon key into `.env`

The app will auto-seed the 10 real Westerville gyms + 2 demo owner accounts on first launch.

### 4. Run

```bash
# Terminal 1 — Stripe backend
npm run server:dev

# Terminal 2 — Expo
npm start
```

Press `i` for iOS, `a` for Android.

### 5. Assets (icon, splash, favicon)

`app.json` references `./assets/icon.png`, `./assets/splash.png`, `./assets/adaptive-icon.png`, `./assets/favicon.png`. Expo doesn't ship these — create an `assets/` folder and drop PNG files (or use the placeholder generator at https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

---

## Demo accounts (auto-seeded)

| Type   | Username   | Password |
|--------|------------|----------|
| Member | `admin`    | `123`    |
| Owner  | `owner`    | `123`    | (Iron Paradise — Pro plan)
| Owner  | `zenowner` | `123`    | (Zen Wellness — Basic plan)

---

## What was built (fixes + improvements over the original)

**Architecture**
- Split single-file App.js into shareable `lib/` modules — data, helpers, AI calls, and DB layer can be reused from a future Next.js website
- Wrapped app in `<ErrorBoundary>` so a render crash shows a recovery screen instead of a white screen
- Wrapped app in `<StripeProvider>` (was imported in original but never rendered — `useStripe()` would have been a no-op)
- Moved all config to `EXPO_PUBLIC_*` env vars; no more hardcoded API keys in source

**Persistence bugs fixed**
- Original `saveUsers(db)` and `saveOwners(db)` were no-ops — every gym review, trainer add, equipment edit, pass scan, and equipment review was lost on reload. All replaced with proper `upsertUser` / `upsertGym` / `updatePass` / `deletePass` / `addGymReview` calls
- Front desk QR scanner now does a direct DB lookup (`getPassById`) instead of iterating a stale local cache — works even if the buyer signed up on a different device
- `recordPassSale` uses a Postgres RPC for atomic counter increments — no more race condition where two simultaneous purchases lose one of the updates

**UX additions**
- Pull-to-refresh on the gym list
- Live local search that filters as you type (equipment search)
- Better empty states with explanatory text

---

## The equipment manufacturer pulling feature

Gym owners populate inventory three ways:

1. **Browse repository** (`OWNER_EQUIP_REPO`) — curated catalog of 250+ items from 10 major brands, one-tap add to inventory
2. **In-app search** (`OWNER_EQUIP_SEARCH`) — local filter across the catalog by brand, name, muscle group, category
3. **AI web search** (Pro plan + API key) — Claude searches the live web for any equipment matching a query and returns structured specs ready to add
4. **AI photo identifier** (Pro plan + API key) — point camera at equipment, Claude identifies brand/model from the image and auto-fills name, specs, instructions, workouts, maintenance

There is no real manufacturer API to pull from (manufacturers don't expose product feeds), so the design is curated catalog + AI augmentation. Each brand card also deep-links to the manufacturer's website for owners who want to browse there.

---

## Known limitations (security TODO before production)

1. **Plain-text passwords.** Current code stores `password` directly in the `users` and `gyms` tables to match the original app's behavior. Production must migrate to **Supabase Auth** (`supabase.auth.signInWithPassword`) which handles hashing + session tokens automatically.
2. **Row Level Security is disabled** on the Supabase tables. The anon key currently reads/writes everything. Before production, enable RLS and write policies so users can only modify their own rows.
3. **Anthropic API key stored in AsyncStorage on-device.** Acceptable for individual users; gym owner Pro features should route through your own backend with a server-side key.
4. **Map view (`react-native-maps`)** only renders on iOS/Android. The future web app needs a different map (Mapbox GL JS or Google Maps JS).

---

## The website (future work)

Stack chosen: **Next.js 15 App Router**.

The `lib/` folder is plain JavaScript with no React Native imports — `constants.js`, `helpers.js`, `ai.js`, `supabase.js`, `equipment-db.js`, and `gyms-seed.js` can all be imported from a Next.js project as-is. Recommended layout when you build the web app:

```
iGym-web/                       (sibling repo, or a monorepo workspace)
├── app/
│   ├── (member)/
│   │   ├── page.tsx            # Splash / hero / login
│   │   ├── gyms/page.tsx       # Gym search & map (Mapbox)
│   │   ├── gyms/[id]/page.tsx  # Gym detail
│   │   └── wallet/page.tsx
│   ├── (owner)/
│   │   ├── dashboard/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── equipment-search/page.tsx
│   │   └── analytics/page.tsx
│   └── api/
│       ├── stripe/route.ts     # Same Stripe backend logic, moved to a Route Handler
│       └── ai/route.ts         # Server-side Claude proxy (avoids exposing API key to browser)
├── lib/                        # ← Symlink or copy from this repo
└── package.json                # next, @supabase/supabase-js, stripe, @anthropic-ai/sdk
```

Since both apps point to the same Supabase project, members can buy a pass on the web and present the QR in the mobile app, and gym owners can manage inventory from either platform.

---

## Where to look next

| File / area | What you might want to change |
|---|---|
| `lib/equipment-db.js` | Add more equipment items (this is the catalog) |
| `lib/gyms-seed.js` | Replace the Westerville seed data with your launch market |
| `lib/constants.js` | Pricing tiers, platform fee rate, member premium price |
| `lib/ai.js` | System prompts and JSON schemas for Claude calls |
| `server/index.js` | Stripe webhook for reconciliation, Connect for split payouts |
| `supabase/schema.sql` | Add RLS policies before production |

---

## Scripts

```bash
npm start             # Expo dev server
npm run android       # Launch on Android emulator/device
npm run ios           # Launch on iOS simulator/device
npm run web           # Run via react-native-web (limited — no maps, no Stripe SDK)
npm run server        # Start Stripe backend
npm run server:dev    # Start Stripe backend with --watch
```

---

## License

Private. © 2026 iGym.
