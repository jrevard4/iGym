-- iGym Supabase schema
-- Paste into https://app.supabase.com/project/_/sql to provision your database.
--
-- ⚠️  Passwords are stored in plaintext to match the existing app.
--    Migrate to Supabase Auth before production — see README.

create extension if not exists "pgcrypto";

-- ─── USERS ─────────────────────────────────────────────────────────
create table if not exists users (
  id text primary key,
  username text unique not null,
  password text not null,
  email text,
  "firstName" text,
  "lastName" text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  favorites jsonb default '[]'::jsonb,
  "activePasses" jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── GYMS ──────────────────────────────────────────────────────────
create table if not exists gyms (
  id text primary key,
  "ownerID" text unique,
  password text,
  "gymName" text not null,
  name text,
  location text,
  lat double precision,
  lon double precision,
  phone text,
  website text,
  email text,
  "businessTaxID" text,
  pricing text,
  "monthlyPrice" numeric default 0,
  "dayPassPrice" numeric default 0,
  "openHour" int default 6,
  "closeHour" int default 22,
  "hoursDisplay" text,
  description text,
  classes jsonb default '[]'::jsonb,
  equipment jsonb default '[]'::jsonb,
  passes jsonb default '[]'::jsonb,
  trainers jsonb default '[]'::jsonb,
  "gymReviews" jsonb default '[]'::jsonb,
  plan text default 'free',
  featured boolean default false,
  "referralCode" text,
  "referralCount" int default 0,
  "referralRevenue" numeric default 0,
  "totalPassRevenue" numeric default 0,
  "platformFeesPaid" numeric default 0,
  "monthlyPassSales" int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_gyms_lat_lon on gyms (lat, lon);
create index if not exists idx_gyms_plan on gyms (plan);
create index if not exists idx_gyms_featured on gyms (featured);

-- ─── PASSES ────────────────────────────────────────────────────────
create table if not exists passes (
  id text primary key,
  "userId" text references users(id) on delete cascade,
  "gymId" text references gyms(id) on delete cascade,
  "gymName" text,
  label text,
  price numeric,
  "platformFee" numeric,
  "gymReceives" numeric,
  type text,                       -- 'TIME' | 'PUNCH'
  value int,
  "purchasedAt" timestamptz,
  "expiresAt" timestamptz,
  "remainingPunches" int,
  "totalPunches" int,
  "stripePaymentId" text,
  created_at timestamptz default now()
);

create index if not exists idx_passes_userId on passes ("userId");
create index if not exists idx_passes_gymId on passes ("gymId");
create index if not exists idx_passes_expiresAt on passes ("expiresAt");

-- ─── ATOMIC REVENUE RPC ────────────────────────────────────────────
-- Increments the gym's revenue counters without read-modify-write races.
create or replace function record_pass_sale(
  p_gym_id text,
  p_gym_receives numeric,
  p_platform_fee numeric
) returns void as $$
begin
  update gyms set
    "totalPassRevenue" = coalesce("totalPassRevenue", 0) + p_gym_receives,
    "platformFeesPaid" = coalesce("platformFeesPaid", 0) + p_platform_fee,
    "monthlyPassSales" = coalesce("monthlyPassSales", 0) + 1
  where id = p_gym_id;
end;
$$ language plpgsql security definer;

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────
-- For an MVP using a single ANON key, RLS is left disabled — the anon key
-- can read/write everything. Before production, enable RLS and tighten policies.
--
-- alter table users  enable row level security;
-- alter table gyms   enable row level security;
-- alter table passes enable row level security;
--
-- Example policy: users can only see their own passes
-- create policy "users see their own passes" on passes
--   for select using (auth.uid()::text = "userId");
