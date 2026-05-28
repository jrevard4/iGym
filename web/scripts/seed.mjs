#!/usr/bin/env node
//
// Seed Supabase with demo gyms + admin user.
//
// Usage (from the web/ folder):
//   npm run seed
//
// Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
// Idempotent — safe to re-run; uses upsert under the hood.
//
// This script is self-contained: it only imports @supabase/supabase-js (which
// lives in web/node_modules) and the static seed-data file from ../../lib/.
// It does NOT import lib/supabase.js because that file's own dependencies
// would need a separate `npm install` at the project root.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Load .env.local manually (no dotenv dep) ────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const envPath = path.join(webRoot, '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('❌ web/.env.local not found.');
  console.error('   Copy .env.local.example to .env.local and fill in your Supabase keys.');
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.');
  process.exit(1);
}

// ─── Imports ─────────────────────────────────────────────────────────
// @supabase/supabase-js lives in web/node_modules (installed via `npm install`)
const { createClient } = await import('@supabase/supabase-js');
// Static seed data — pure JS, no transitive deps
const { REAL_GYMS_DATA, INITIAL_OWNER_DATA } = await import('../../lib/gyms-seed.js');

// ─── Minimal DB helpers (mirror lib/supabase.js) ─────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function upsertGym(gym) {
  const payload = { ...gym, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('gyms').upsert(payload);
  if (error) throw new Error(`upsertGym(${gym.id}): ${error.message}`);
}

async function loadGyms() {
  const { data, error } = await supabase.from('gyms').select('id, gymName');
  if (error) throw error;
  return data || [];
}

async function loadUsers() {
  const { data, error } = await supabase.from('users').select('id, username');
  if (error) throw error;
  return data || [];
}

async function registerAdminUser() {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', 'admin')
    .maybeSingle();
  if (existing) return { exists: true };

  const { error } = await supabase.from('users').insert({
    id: 'admin1',
    username: 'admin',
    password: '123',
    email: 'admin@igym.com',
    firstName: 'Coach',
    lastName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    favorites: [],
    activePasses: [],
    created_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return { created: true };
}

// ─── Run ─────────────────────────────────────────────────────────────
console.log('🌱 Seeding iGym demo data into Supabase...\n');
console.log(`   Project: ${SUPABASE_URL}\n`);

let existingGyms, existingUsers;
try {
  [existingGyms, existingUsers] = await Promise.all([loadGyms(), loadUsers()]);
} catch (err) {
  console.error('❌ Could not connect to Supabase.');
  console.error('   Did you run supabase/schema.sql in the SQL editor?');
  console.error('   Error:', err.message);
  process.exit(1);
}

console.log(`   Currently in DB: ${existingGyms.length} gyms, ${existingUsers.length} users\n`);

console.log('🏋️  Upserting real gyms...');
for (const g of REAL_GYMS_DATA) {
  await upsertGym(g);
  console.log(`   ✓ ${g.gymName}`);
}

console.log('\n🏪 Upserting demo owner accounts...');
for (const owner of INITIAL_OWNER_DATA) {
  await upsertGym(owner);
  console.log(`   ✓ ${owner.gymName}  (login: ${owner.ownerID} / ${owner.password})`);
}

console.log('\n👤 Demo member account...');
const adminResult = await registerAdminUser();
if (adminResult.exists) console.log('   ✓ admin already exists');
else if (adminResult.error) console.warn(`   ⚠️  ${adminResult.error}`);
else console.log('   ✓ created  (login: admin / 123)');

const [finalGyms, finalUsers] = await Promise.all([loadGyms(), loadUsers()]);
console.log('\n──────────────────────────────────────────────');
console.log(`✅ Seed complete. DB now has ${finalGyms.length} gyms and ${finalUsers.length} users.`);
console.log('──────────────────────────────────────────────\n');
console.log('Next step:  npm run dev');
console.log('Then open:  http://localhost:3000\n');
console.log('Demo logins:');
console.log('   Member  →  admin / 123  →  /login');
console.log('   Owner   →  owner / 123  (mobile app only for now)\n');
