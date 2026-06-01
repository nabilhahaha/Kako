#!/usr/bin/env node
// ============================================================================
// VANTORA — Demo account seeder (REVIEW / DRY-RUN by default)
// ----------------------------------------------------------------------------
// Creates the demo login accounts across all nine demo tenants using the SAME
// supported mechanism as real customer onboarding: the Supabase Auth Admin API
// (admin.createUser) for the auth user + password, then a normal table write to
// `erp_user_branches` to grant the role on the tenant's branch (exactly what the
// `admin-create-user` edge function does — create, then assign).
//
//   • DRY RUN by default: prints the plan, touches NOTHING. Add `--apply` to run.
//   • Idempotent: existing accounts are detected; password is re-synced and the
//     branch/role assignment is upserted. Safe to re-run.
//   • Reversible: `--teardown` removes every demo account listed here (cascades
//     to erp_profiles + erp_user_branches).
//   • Demo-only: every account lives in a curated demo tenant with no real data.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \
//     node supabase/demo/seed_demo_accounts.mjs            # dry run (default)
//     node supabase/demo/seed_demo_accounts.mjs --apply    # create / update
//     node supabase/demo/seed_demo_accounts.mjs --teardown --apply  # remove
//
//   DEMO_PASSWORD overrides the shared demo password (default: Demo@2026).
//
// The service-role key is read from the runtime env ONLY — never committed,
// never NEXT_PUBLIC_*. See docs/DEMO-ACCOUNTS.md for the full account plan.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2026';

const APPLY = process.argv.includes('--apply');
const TEARDOWN = process.argv.includes('--teardown');

// ── Demo tenants (company IDs sourced from supabase/demo/demo_tenant_cleanup.sql
//    — the curated one-tenant-per-vertical KEEP list). ───────────────────────
const TENANTS = {
  electric:    { id: '6541791e-0f81-4a11-9f61-51aa34db7ace', label: 'Demo Electric (electrical retail & wholesale)' },
  wholesale:   { id: '1a1dfb3b-9d5c-4a41-9e59-0dbcf3829731', label: 'Demo Wholesale (FMCG distribution / wholesale)' },
  clinic:      { id: '038ef2a1-c751-429c-a9cf-e8e5688f0a4f', label: 'عيادة الحياة (clinic)' },
  pharmacy:    { id: 'db7aba41-321b-4c3f-bd7c-d5fe3ea55130', label: 'صيدلية الشفاء (pharmacy)' },
  restaurant:  { id: '559a2cab-8268-481a-8d17-db1a5ffb57f5', label: 'مطعم اللقمة الهنية (restaurant)' },
  salon:       { id: 'eea15054-f99e-41c2-8e8d-1f3ae02a1846', label: 'صالون الجمال (salon)' },
  laundry:     { id: '20ce97cb-7d46-4ec0-b6b5-db4d0271a7fb', label: 'مغسلة النظافة (laundry)' },
  supermarket: { id: '7c624884-7d6b-4cee-a81d-59dc97f40306', label: 'سوبر ماركت الخير (supermarket / FMCG retail)' },
  hotel:       { id: '5487c3c7-cac6-4d00-9926-0505080dbe6d', label: 'فندق النيل (hotel)' },
};

// ── Account manifest ────────────────────────────────────────────────────────
//   • One ADMIN login per tenant (role `admin`).
//   • Role-based logins for Clinic + Electrical (the two primary demo paths).
//   Role keys are valid for each tenant's business type (see migration 0034).
const ACCOUNTS = [
  // — Tenant admins (9) — electric keeps its existing electric@demo.com admin —
  { tenant: 'electric',    email: 'electric@demo.com',          role: 'admin',            name: 'Demo Electric Admin' },
  { tenant: 'wholesale',   email: 'admin.wholesale@demo.com',   role: 'admin',            name: 'Demo Wholesale Admin' },
  { tenant: 'clinic',      email: 'admin.clinic@demo.com',      role: 'admin',            name: 'Clinic Admin' },
  { tenant: 'pharmacy',    email: 'admin.pharmacy@demo.com',    role: 'admin',            name: 'Pharmacy Admin' },
  { tenant: 'restaurant',  email: 'admin.restaurant@demo.com',  role: 'admin',            name: 'Restaurant Admin' },
  { tenant: 'salon',       email: 'admin.salon@demo.com',       role: 'admin',            name: 'Salon Admin' },
  { tenant: 'laundry',     email: 'admin.laundry@demo.com',     role: 'admin',            name: 'Laundry Admin' },
  { tenant: 'supermarket', email: 'admin.supermarket@demo.com', role: 'admin',            name: 'Supermarket Admin' },
  { tenant: 'hotel',       email: 'admin.hotel@demo.com',       role: 'admin',            name: 'Hotel Admin' },

  // — Clinic role-based demo users (3) —
  { tenant: 'clinic',   email: 'clinic.doctor@demo.com',    role: 'doctor',           name: 'Dr. Demo (طبيب)' },
  { tenant: 'clinic',   email: 'clinic.reception@demo.com', role: 'receptionist',     name: 'Reception Demo (استقبال)' },
  { tenant: 'clinic',   email: 'clinic.cashier@demo.com',   role: 'cashier',          name: 'Cashier Demo (صندوق)' },

  // — Electrical role-based demo users (3) —
  { tenant: 'electric', email: 'electric.technician@demo.com', role: 'technician',       name: 'Tech Demo (فني)' },
  { tenant: 'electric', email: 'electric.cashier@demo.com',    role: 'cashier',          name: 'Cashier Demo (صندوق)' },
  { tenant: 'electric', email: 'electric.warehouse@demo.com',  role: 'warehouse_keeper', name: 'Warehouse Demo (مخزن)' },
];

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!URL || !SERVICE_KEY) {
  die('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env first.');
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Build an email → auth user-id map (paginated) so the run is idempotent.
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

// The tenant's default (or earliest) branch — where the role is granted.
async function branchFor(companyId) {
  const { data, error } = await admin
    .from('erp_branches')
    .select('id, is_default, created_at')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) die(`branch lookup failed for ${companyId}: ${error.message}`);
  return data?.[0]?.id ?? null;
}

async function seed() {
  const byEmail = await loadUsersByEmail();
  const summary = [];

  for (const acc of ACCOUNTS) {
    const tenant = TENANTS[acc.tenant];
    const branchId = await branchFor(tenant.id);
    if (!branchId) { summary.push({ ...acc, status: 'SKIP — no branch' }); continue; }

    let userId = byEmail.get(acc.email.toLowerCase());
    let action;

    if (!APPLY) {
      action = userId ? 'would update + assign' : 'would create + assign';
      summary.push({ ...acc, tenantLabel: tenant.label, status: `DRY-RUN: ${action}` });
      continue;
    }

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: acc.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: acc.name },
      });
      if (error) { summary.push({ ...acc, status: `ERR create: ${error.message}` }); continue; }
      userId = data.user.id;
      action = 'created';
    } else {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        user_metadata: { full_name: acc.name },
      });
      if (error) { summary.push({ ...acc, status: `ERR update: ${error.message}` }); continue; }
      action = 'updated';
    }

    // Grant the role on the tenant branch (idempotent on user_id+branch_id).
    const { error: aErr } = await admin
      .from('erp_user_branches')
      .upsert({ user_id: userId, branch_id: branchId, role: acc.role, is_default: true },
              { onConflict: 'user_id,branch_id' });
    if (aErr) { summary.push({ ...acc, status: `ERR assign: ${aErr.message}` }); continue; }

    summary.push({ ...acc, tenantLabel: tenant.label, status: `${action} + assigned ${acc.role}` });
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
  console.log(`\nVANTORA demo accounts — ${mode} — ${APPLY ? 'APPLY (live writes)' : 'DRY RUN (no changes)'}`);
  console.log(`Target: ${URL}`);
  console.log(`Password: ${TEARDOWN ? '(n/a)' : PASSWORD}  ·  Accounts: ${ACCOUNTS.length}\n`);

  const summary = TEARDOWN ? await teardown() : await seed();
  for (const s of summary) {
    console.log(`  ${s.email.padEnd(30)} ${String(s.role).padEnd(16)} ${s.status}`);
  }
  if (!APPLY) console.log(`\n(DRY RUN — re-run with --apply to make changes.)`);
  console.log('');
})();
