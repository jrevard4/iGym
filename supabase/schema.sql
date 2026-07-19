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
  "referralCode" text unique,
  "referredBy" text,
  "referralCount" int default 0,
  "referralCredit" numeric default 0,   -- earned from referred purchases (display-only, not auto-redeemed)
  "pushToken" text,
  "savedSearches" jsonb default '[]'::jsonb,
  "savedWorkouts" jsonb default '[]'::jsonb,
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
  "referralRevenue" numeric default 0,  -- total paid out to customers who referred a paying buyer
  "referralFeeRate" numeric default 0,  -- 0-1 fraction of a referred purchase's price paid to the referrer; 0 = off
  "totalPassRevenue" numeric default 0,
  "platformFeesPaid" numeric default 0,
  "monthlyPassSales" int default 0,
  promotions jsonb default '[]'::jsonb,
  "matchImpressions" int default 0,
  amenities jsonb default '[]'::jsonb,
  branding jsonb default '{}'::jsonb,
  "siteKeywords" jsonb default '[]'::jsonb,  -- auto-extracted from the gym's own website; see /api/sync-keywords
  "pageSettings" jsonb default '{}'::jsonb,  -- per-section show/hide toggles for the owner's public gym page
  "classSchedule" jsonb default '[]'::jsonb, -- recurring weekly class template: [{id, className, dayOfWeek, startTime, durationMinutes, capacity, instructor}]
  suspended boolean default false,           -- platform-admin moderation flag; hides the listing from search/browse
  "pushToken" text,                          -- owner's mobile device Expo push token, registered from the app (see lib/notify.js)
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
  "startsAt" timestamptz,           -- null = active immediately; future date = scheduled for later (e.g. travel)
  "expiresAt" timestamptz,
  "remainingPunches" int,
  "totalPunches" int,
  "stripePaymentId" text,
  "stripeSubscriptionId" text,   -- set only for MEMBERSHIP passes billed as a Stripe Subscription
  "stripeCustomerId" text,
  status text default 'active', -- 'active' | 'past_due' | 'canceled' — driven by Stripe webhook for subscriptions
  created_at timestamptz default now()
);

create index if not exists idx_passes_userId on passes ("userId");
create index if not exists idx_passes_gymId on passes ("gymId");
create index if not exists idx_passes_expiresAt on passes ("expiresAt");
create index if not exists idx_passes_stripeSubscriptionId on passes ("stripeSubscriptionId");

-- ─── CHECK-INS ─────────────────────────────────────────────────────
-- One row per successful pass scan (front desk or in-app). Powers the
-- member streak/visit-count gamification — nothing else persists this today.
create table if not exists checkins (
  id text primary key,
  "userId" text references users(id) on delete cascade,
  "gymId" text references gyms(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists idx_checkins_userId on checkins ("userId");
create index if not exists idx_checkins_gymId on checkins ("gymId");

-- ─── CLASS BOOKINGS ────────────────────────────────────────────────
-- One row per member's reservation for a specific weekly occurrence of a
-- class defined in gyms."classSchedule". "classDate" is the actual calendar
-- date of that occurrence (the schedule entry itself is just a weekly
-- day-of-week + time template), so the same recurring class produces a
-- fresh row — and its own capacity count — every week.
create table if not exists "classBookings" (
  id text primary key,
  "gymId" text references gyms(id) on delete cascade,
  "classScheduleId" text not null,
  "className" text,
  "userId" text references users(id) on delete cascade,
  username text,
  "classDate" date not null,
  status text default 'booked', -- 'booked' | 'waitlisted' | 'cancelled'
  "reminderSent" boolean default false, -- dedup flag for the class-reminder push job (see /api/send-class-reminders)
  created_at timestamptz default now()
);

create index if not exists idx_classBookings_gymId on "classBookings" ("gymId");
create index if not exists idx_classBookings_userId on "classBookings" ("userId");
create index if not exists idx_classBookings_occurrence on "classBookings" ("gymId", "classScheduleId", "classDate");

-- ─── MESSAGES ──────────────────────────────────────────────────────
-- A conversation is implicitly keyed by (gymId, userId) — one thread per
-- member per gym, with senderRole distinguishing who wrote each line.
create table if not exists messages (
  id text primary key,
  "gymId" text references gyms(id) on delete cascade,
  "userId" text references users(id) on delete cascade,
  username text,               -- the member's username, denormalized for the owner's inbox list
  "senderRole" text not null,  -- 'member' | 'owner'
  text text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation on messages ("gymId", "userId");

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

-- Atomically bumps the referring user's referralCount. Called once when a
-- new user registers with a valid ?ref= code.
create or replace function increment_referral_count(
  p_referral_code text
) returns void as $$
begin
  update users set "referralCount" = coalesce("referralCount", 0) + 1
  where "referralCode" = p_referral_code;
end;
$$ language plpgsql security definer;

-- Atomically bumps a gym's referralCount when another gym owner registers
-- using its referral code.
create or replace function increment_gym_referral_count(
  p_referral_code text
) returns void as $$
begin
  update gyms set "referralCount" = coalesce("referralCount", 0) + 1
  where "referralCode" = p_referral_code;
end;
$$ language plpgsql security definer;

-- Atomically credits a referrer when someone they referred buys a pass or
-- membership: bumps the referrer's spendable-looking (but display-only,
-- never auto-redeemed) credit balance, and the gym's cumulative payout total.
create or replace function record_referral_reward(
  p_referrer_user_id text,
  p_amount numeric,
  p_gym_id text
) returns void as $$
begin
  update users set "referralCredit" = coalesce("referralCredit", 0) + p_amount
  where id = p_referrer_user_id;
  update gyms set "referralRevenue" = coalesce("referralRevenue", 0) + p_amount
  where id = p_gym_id;
end;
$$ language plpgsql security definer;

-- Atomically bumps a gym's search-interest counter whenever it appears in
-- AI matchmaker or local-match results.
create or replace function increment_match_impressions(
  p_gym_id text
) returns void as $$
begin
  update gyms set "matchImpressions" = coalesce("matchImpressions", 0) + 1
  where id = p_gym_id;
end;
$$ language plpgsql security definer;

-- ─── STORAGE (equipment photos) ────────────────────────────────────
-- Public bucket for owner-uploaded equipment photos + muscle-diagram images.
-- Buckets/policies are just rows in storage.buckets/storage.objects, so this
-- stays paste-and-run like the rest of this file — no dashboard clicking needed.
insert into storage.buckets (id, name, public)
values ('equipment-photos', 'equipment-photos', true)
on conflict (id) do nothing;

create policy "Public read equipment photos" on storage.objects
  for select using (bucket_id = 'equipment-photos');
create policy "Public upload equipment photos" on storage.objects
  for insert with check (bucket_id = 'equipment-photos');

-- Public bucket for a member's optional photo attached to a review — shown
-- as a lightweight "photo verified" trust signal on the gym page.
insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

create policy "Public read review photos" on storage.objects
  for select using (bucket_id = 'review-photos');
create policy "Public upload review photos" on storage.objects
  for insert with check (bucket_id = 'review-photos');

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

-- ─── MIGRATION (run once if your `users`/`gyms` tables already exist) ──
-- `create table if not exists` above won't add columns to a live table.
-- If you provisioned this schema before the referral/promotions/impressions
-- columns were added, run this block once in the SQL editor — it's additive
-- and safe to run against existing rows.
--
-- alter table users add column if not exists "referralCode" text unique;
-- alter table users add column if not exists "referredBy" text;
-- alter table users add column if not exists "referralCount" int default 0;
-- alter table gyms  add column if not exists promotions jsonb default '[]'::jsonb;
-- alter table gyms  add column if not exists "matchImpressions" int default 0;
--
-- Phase 2 additions:
-- alter table users add column if not exists "pushToken" text;
-- alter table users add column if not exists "savedSearches" jsonb default '[]'::jsonb;
-- create table if not exists checkins (
--   id text primary key,
--   "userId" text references users(id) on delete cascade,
--   "gymId" text references gyms(id) on delete cascade,
--   created_at timestamptz default now()
-- );
-- create index if not exists idx_checkins_userId on checkins ("userId");
-- create index if not exists idx_checkins_gymId on checkins ("gymId");
--
-- Phase 3 additions:
-- alter table passes add column if not exists "startsAt" timestamptz;
--
-- Phase 4 additions (equipment photo storage — see STORAGE section above):
-- insert into storage.buckets (id, name, public)
-- values ('equipment-photos', 'equipment-photos', true)
-- on conflict (id) do nothing;
-- create policy "Public read equipment photos" on storage.objects
--   for select using (bucket_id = 'equipment-photos');
-- create policy "Public upload equipment photos" on storage.objects
--   for insert with check (bucket_id = 'equipment-photos');
--
-- Phase 5 additions (amenity filters + gym branding sync):
-- alter table gyms add column if not exists amenities jsonb default '[]'::jsonb;
-- alter table gyms add column if not exists branding jsonb default '{}'::jsonb;
--
-- Phase 6 additions (purchase-linked referral fee):
-- alter table users add column if not exists "referralCredit" numeric default 0;
-- alter table gyms  add column if not exists "referralFeeRate" numeric default 0;
-- (record_referral_reward function is created unconditionally above via `create or replace`)
--
-- Phase 7 additions (AI workout history):
-- alter table users add column if not exists "savedWorkouts" jsonb default '[]'::jsonb;
--
-- Phase 8 additions (automated gym-site keyword indexing):
-- alter table gyms add column if not exists "siteKeywords" jsonb default '[]'::jsonb;
--
-- Phase 9 additions (review photos, owner responses, equipment reports —
-- all additive fields inside existing jsonb columns, no new columns needed
-- except the storage bucket):
-- insert into storage.buckets (id, name, public)
-- values ('review-photos', 'review-photos', true)
-- on conflict (id) do nothing;
-- create policy "Public read review photos" on storage.objects
--   for select using (bucket_id = 'review-photos');
-- create policy "Public upload review photos" on storage.objects
--   for insert with check (bucket_id = 'review-photos');
--
-- Phase 10 additions (owner-controlled page section visibility):
-- alter table gyms add column if not exists "pageSettings" jsonb default '{}'::jsonb;
--
-- Phase 11 additions (recurring membership billing, class booking, in-app
-- messaging, platform-admin moderation):
-- alter table passes add column if not exists "stripeSubscriptionId" text;
-- alter table passes add column if not exists "stripeCustomerId" text;
-- alter table passes add column if not exists status text default 'active';
-- create index if not exists idx_passes_stripeSubscriptionId on passes ("stripeSubscriptionId");
-- alter table gyms add column if not exists "classSchedule" jsonb default '[]'::jsonb;
-- alter table gyms add column if not exists suspended boolean default false;
-- create table if not exists "classBookings" (
--   id text primary key,
--   "gymId" text references gyms(id) on delete cascade,
--   "classScheduleId" text not null,
--   "className" text,
--   "userId" text references users(id) on delete cascade,
--   username text,
--   "classDate" date not null,
--   status text default 'booked',
--   created_at timestamptz default now()
-- );
-- create index if not exists idx_classBookings_gymId on "classBookings" ("gymId");
-- create index if not exists idx_classBookings_userId on "classBookings" ("userId");
-- create index if not exists idx_classBookings_occurrence on "classBookings" ("gymId", "classScheduleId", "classDate");
-- create table if not exists messages (
--   id text primary key,
--   "gymId" text references gyms(id) on delete cascade,
--   "userId" text references users(id) on delete cascade,
--   username text,
--   "senderRole" text not null,
--   text text not null,
--   read boolean default false,
--   created_at timestamptz default now()
-- );
-- create index if not exists idx_messages_conversation on messages ("gymId", "userId");
--
-- Phase 12 additions (push notifications, waitlist auto-promotion, class
-- reminder job):
-- alter table gyms add column if not exists "pushToken" text;
-- alter table "classBookings" add column if not exists "reminderSent" boolean default false;
