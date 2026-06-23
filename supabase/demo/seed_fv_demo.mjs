#!/usr/bin/env node
// ============================================================================
// VANTORA — Step 7 Part B: "Field Verification Demo Co." auth users (STAGING).
// ----------------------------------------------------------------------------
// Creates the 6 demo login accounts for the Field Verification demo tenant using
// the SAME supported mechanism as real onboarding: the Supabase Auth Admin API
// (admin.createUser) for the auth user + password (the erp_profiles row is created
// by the on-auth-user trigger), then a table write to erp_user_branches to grant
// the role on the HQ branch.
//
//   • DRY RUN by default: prints the plan, touches NOTHING. Add `--apply` to run.
//   • Idempotent: existing accounts are detected; password re-synced; role upserted.
//   • Reversible: `--teardown --apply` deletes the 6 accounts (cascades to
//     erp_profiles + erp_user_branches).
//   • Run Section A1 of seed_fv_demo.sql FIRST (company + HQ branch must exist).
//     Run Section A2 (dataset + customers) AFTER this (it needs the admin profile).
//
// Usage (set the env in YOUR shell — never commit, never NEXT_PUBLIC_ the key):
//   NEXT_PUBLIC_SUPABASE_URL=https://rsjvgehvastmawzwnqcs.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<staging service-role key> \
//   DEMO_PASSWORD=<choose one> \
//     node supabase/demo/seed_fv_demo.mjs            # dry run (default)
//     node supabase/demo/seed_fv_demo.mjs --apply    # create / update
//     node supabase/demo/seed_fv_demo.mjs --teardown --apply  # remove
//
// No secret is read from anywhere but the runtime env. Nothing is committed.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2026';

const APPLY = process.argv.includes('--apply');
const TEARDOWN = process.argv.includes('--teardown');

// The fixed demo company id — MUST match seed_fv_demo.sql.
const COMPANY_ID = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';

// The 6 demo accounts (role_key valid for the field_verification_only template).
const ACCOUNTS = [
  { email: 'demo.admin@vantora.local',      role: 'admin',      name: 'Demo Admin' },
  { email: 'demo.supervisor@vantora.local', role: 'supervisor', name: 'Demo Supervisor' },
  { email: 'demo.rep01@vantora.local',      role: 'salesman',   name: 'Demo Rep 01' },
  { email: 'demo.rep02@vantora.local',      role: 'salesman',   name: 'Demo Rep 02' },
  { email: 'demo.rep03@vantora.local',      role: 'salesman',   name: 'Demo Rep 03' },
  { email: 'demo.viewer@vantora.local',     role: 'viewer',     name: 'Demo Viewer' },
];

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!URL || !SERVICE_KEY) {
  die('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env first.');
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// email → auth user-id (paginated) so the run is idempotent.
async function loadUsersByEmail() {
  const map = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) die(`listUsers failed: ${error.message}`);
    for (const u of data.users) map.set(u.email?.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  return map;
}

// The demo company's HQ branch (where the role is granted).
async function hqBranch() {
  const { data, error } = await admin
    .from('erp_branches')
    .select('id, is_hq, created_at')
    .eq('company_id', COMPANY_ID)
    .order('is_hq', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) die(`branch lookup failed: ${error.message}`);
  return data?.[0]?.id ?? null;
}

async function seed() {
  const branchId = await hqBranch();
  if (!branchId) die('No HQ branch for the demo company — run Section A1 of seed_fv_demo.sql first.');
  const byEmail = await loadUsersByEmail();
  const summary = [];

  for (const acc of ACCOUNTS) {
    let userId = byEmail.get(acc.email.toLowerCase());

    if (!APPLY) {
      summary.push({ ...acc, status: `DRY-RUN: ${userId ? 'would update + assign' : 'would create + assign'}` });
      continue;
    }

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: acc.email, password: PASSWORD, email_confirm: true,
        user_metadata: { full_name: acc.name },
      });
      if (error) { summary.push({ ...acc, status: `ERR create: ${error.message}` }); continue; }
      userId = data.user.id;
      summary.push({ ...acc, _action: 'created' });
    } else {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: PASSWORD, user_metadata: { full_name: acc.name },
      });
      if (error) { summary.push({ ...acc, status: `ERR update: ${error.message}` }); continue; }
      summary.push({ ...acc, _action: 'updated' });
    }

    const { error: aErr } = await admin
      .from('erp_user_branches')
      .upsert({ user_id: userId, branch_id: branchId, role: acc.role, is_default: true },
              { onConflict: 'user_id,branch_id' });
    const last = summary[summary.length - 1];
    last.status = aErr ? `ERR assign: ${aErr.message}` : `${last._action} + assigned ${acc.role}`;
  }
  return summary;
}

async function teardown() {
  const byEmail = await loadUsersByEmail();
  const summary = [];
  for (const acc of ACCOUNTS) {
    const userId = byEmail.get(acc.email.toLowerCase());
    if (!userId) { summary.push({ ...acc, status: 'absent' }); continue; }
    if (!APPLY) { summary.push({ ...acc, status: 'DRY-RUN: would delete' }); continue; }
    const { error } = await admin.auth.admin.deleteUser(userId);
    summary.push({ ...acc, status: error ? `ERR delete: ${error.message}` : 'deleted' });
  }
  return summary;
}

(async () => {
  const mode = TEARDOWN ? 'TEARDOWN' : 'SEED';
  console.log(`\nVANTORA — Field Verification demo accounts — ${mode} — ${APPLY ? 'APPLY (live writes)' : 'DRY RUN (no changes)'}`);
  console.log(`Target: ${URL}  ·  Company: ${COMPANY_ID}`);
  console.log(`Password: ${TEARDOWN ? '(n/a)' : PASSWORD}  ·  Accounts: ${ACCOUNTS.length}\n`);

  const summary = TEARDOWN ? await teardown() : await seed();
  for (const s of summary) {
    console.log(`  ${s.email.padEnd(32)} ${String(s.role).padEnd(12)} ${s.status}`);
  }
  if (!APPLY) console.log(`\n(DRY RUN — re-run with --apply to make changes.)`);
  console.log('');
})();
