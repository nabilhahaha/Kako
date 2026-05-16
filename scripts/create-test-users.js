#!/usr/bin/env node
// Create 8 FieldSync test users via Supabase Admin API.
//
// Usage (Node >= 20.6):
//   node --env-file=.env --env-file=.env.local scripts/create-test-users.js
//
// Required env:
//   SUPABASE_URL              (or VITE_SUPABASE_URL — falls back automatically)
//   SUPABASE_SERVICE_ROLE_KEY (NEVER commit; put it in .env.local, which is gitignored)
//
// Behaviour:
//   - Creates each auth user with email_confirm:true so they can log in immediately.
//   - The on_auth_user_created trigger inserts the matching public.users row.
//   - Then UPDATEs public.users.user_type + full_name for each.
//   - Idempotent: if the email already exists, we look it up and continue to the UPDATE step.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'TestPass2026!';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env. Required: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Put SUPABASE_SERVICE_ROLE_KEY in .env.local (gitignored).');
  console.error('  Run: node --env-file=.env --env-file=.env.local scripts/create-test-users.js');
  process.exit(1);
}

const USERS = [
  { email: 'admin@test.relia.sa',                user_type: 'admin_relia',             full_name: 'Test Admin' },
  { email: 'presales_rep@test.relia.sa',         user_type: 'presales_rep',            full_name: 'Test Presales Rep' },
  { email: 'presales_supervisor@test.relia.sa',  user_type: 'presales_supervisor',     full_name: 'Test Presales Supervisor' },
  { email: 'cashvan_supervisor@test.relia.sa',   user_type: 'cashvan_supervisor',      full_name: 'Test Cashvan Supervisor' },
  { email: 'regional_manager@test.relia.sa',     user_type: 'regional_manager_roshen', full_name: 'Test Regional Manager' },
  { email: 'trade_marketing@test.relia.sa',      user_type: 'trade_marketing_manager', full_name: 'Test Trade Marketing' },
  { email: 'top_management_relia@test.relia.sa', user_type: 'top_management_relia',    full_name: 'Test Top Mgmt Relia' },
  { email: 'top_management_roshen@test.relia.sa',user_type: 'top_management_roshen',   full_name: 'Test Top Mgmt Roshen' },
];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isExistsError(err) {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  return (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    err.status === 422 ||
    msg.includes('already') ||
    msg.includes('registered')
  );
}

async function findUserIdByEmail(email) {
  // listUsers is paginated; emails are unique, so first hit wins.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureAuthUser({ email }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error) return { id: data.user.id, created: true };
  if (isExistsError(error)) {
    const id = await findUserIdByEmail(email);
    if (!id) throw new Error(`exists per API but not found via listUsers: ${email}`);
    return { id, created: false };
  }
  throw error;
}

async function setRole({ id, user_type, full_name }) {
  const { error } = await admin
    .from('users')
    .update({ user_type, full_name })
    .eq('id', id);
  if (error) throw error;
}

async function verify() {
  const { data, error } = await admin
    .from('users')
    .select('email, user_type, full_name')
    .in('email', USERS.map((u) => u.email))
    .order('email');
  if (error) throw error;
  return data ?? [];
}

async function main() {
  console.log(`→ Target: ${SUPABASE_URL}\n`);
  const results = [];
  for (const u of USERS) {
    try {
      const { id, created } = await ensureAuthUser(u);
      await setRole({ id, user_type: u.user_type, full_name: u.full_name });
      const tag = created ? 'CREATED' : 'EXISTS ';
      console.log(`  ${tag}  ${u.email.padEnd(40)} → ${u.user_type}`);
      results.push({ email: u.email, status: tag.trim(), id });
    } catch (err) {
      console.log(`  FAIL    ${u.email.padEnd(40)} → ${err.message ?? err}`);
      results.push({ email: u.email, status: 'FAIL', error: err.message ?? String(err) });
    }
  }

  console.log('\n→ Verifying public.users…');
  const rows = await verify();
  const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r]));
  let allGood = true;
  for (const u of USERS) {
    const row = byEmail.get(u.email.toLowerCase());
    if (!row) {
      console.log(`  ✗ MISSING  ${u.email}`);
      allGood = false;
    } else if (row.user_type !== u.user_type) {
      console.log(`  ✗ WRONG    ${u.email}  expected=${u.user_type} got=${row.user_type}`);
      allGood = false;
    } else {
      console.log(`  ✓ OK       ${u.email}  → ${row.user_type}`);
    }
  }

  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n→ Summary: ${results.length - failed}/${results.length} processed, verify ${allGood ? 'PASS' : 'FAIL'}`);
  if (failed > 0 || !allGood) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
