#!/usr/bin/env node
// ============================================================================
// Offline first-run seed (Phase P0)
// ----------------------------------------------------------------------------
//   node scripts/offline/seed.mjs
// Creates ONE local company (business_type from the active edition) + a default
// HQ branch + an admin user bound to it, and a local credential row
// (erp_local_users) the offline auth service will verify (P3).
//
// Runs as the local superuser (RLS bypassed) and reuses the schema's own
// provisioning triggers (role + module seeding) so the company is shaped like a
// cloud-provisioned one. Idempotent: if a company already exists it does
// nothing (the offline store is single-tenant).
// ============================================================================

import { randomUUID } from 'node:crypto';
import { psql, psqlScalar, editionId, editionBusinessType, log } from './lib.mjs';

const env = process.env;
const adminEmail = env.KAKO_OFFLINE_ADMIN_EMAIL || 'admin@kako.local';
const adminPassword = env.KAKO_OFFLINE_ADMIN_PASSWORD || 'admin';
const businessType = editionBusinessType(env);
const companyName = env.KAKO_OFFLINE_COMPANY_NAME || 'Offline Store';

function alreadySeeded() {
  return psqlScalar('SELECT count(*)::int FROM erp_companies;') !== '0';
}

// Repair installs seeded with the legacy branch role 'owner'. The app's
// BranchRole type, ROLE_RANK, and the role-permission tables do NOT know
// 'owner', so such a user logs in with topRole=viewer and ZERO permissions and
// is bounced from every gated home — i.e. login never reaches the dashboard.
// 'admin' is the cloud-equivalent company-owner role (rank 8, provisioned by the
// company triggers). Offline-only + idempotent (no-op once converted).
// Also flips erp_companies.setup_done → true: it defaults to false, and the
// (app) layout sends a company admin to /setup while false. The offline store is
// already provisioned here, so mark onboarding complete or the (now-admin) user
// lands on the wizard instead of the dashboard. Both updates idempotent.
function ensureOfflineProvisioned() {
  psql(`
    UPDATE erp_user_branches SET role = 'admin' WHERE role = 'owner';
    UPDATE erp_companies SET setup_done = true WHERE setup_done = false;
  `);
}

// Print the offline login so operators always know the test account, even when
// the company already exists and the seed itself is skipped.
function printCredentials() {
  const email = psqlScalar("SELECT email FROM erp_local_users WHERE is_active ORDER BY email LIMIT 1;") || adminEmail;
  const pw = env.KAKO_OFFLINE_ADMIN_PASSWORD ? '(set via KAKO_OFFLINE_ADMIN_PASSWORD)' : "admin (default)";
  log(`offline login →  email: ${email}   password: ${pw}`);
}

function seed() {
  ensureOfflineProvisioned();
  if (alreadySeeded()) {
    log('company already present — seed skipped (single-tenant offline)');
    printCredentials();
    return;
  }

  const userId = randomUUID();
  const companyId = randomUUID();
  const branchId = randomUUID();
  const esc = (s) => String(s).replace(/'/g, "''");

  log(`seed edition=${editionId(env)} business_type=${businessType}`);
  // One transaction: auth user (→ profile via trigger) → company (→ roles +
  // modules via triggers) → edition module tightening → HQ branch → user-branch
  // link → local credential.
  psql(`
BEGIN;

-- Admin auth user; the erp_handle_new_user trigger creates the matching profile.
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
VALUES ('${userId}', '${esc(adminEmail)}', 'authenticated', 'authenticated',
        jsonb_build_object('full_name', 'Administrator'), now());

-- Company; insert triggers seed default roles + modules (+ clothing perms).
-- setup_done=true: this seed fully provisions the store, so skip the /setup
-- onboarding wizard (the (app) layout would otherwise redirect the admin there).
INSERT INTO erp_companies (id, name, business_type, is_active, setup_done)
VALUES ('${companyId}', '${esc(companyName)}', '${businessType}', true, true);

-- Retail (clothing) edition: enable ONLY the fashion module, matching the cloud
-- retail provisioning (migration 0147 does this for clothing companies).
${businessType === 'clothing' ? `
UPDATE erp_company_modules SET enabled = (module = 'fashion') WHERE company_id = '${companyId}';
INSERT INTO erp_company_modules (company_id, module, enabled)
VALUES ('${companyId}', 'fashion', true)
ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;
` : ''}

-- Default HQ branch.
INSERT INTO erp_branches (id, company_id, code, name, is_hq, is_active)
VALUES ('${branchId}', '${companyId}', 'MAIN', 'Main Branch', true, true);

-- Default (non-van) warehouse — required for stock + POS checkout.
INSERT INTO erp_warehouses (branch_id, code, name, is_van, is_active)
VALUES ('${branchId}', 'WH', 'Main Warehouse', false, true);

-- Bind the admin to the branch (default) so erp_user_company_id() resolves.
-- Role MUST be 'admin' (the cloud company-owner role the app + permission tables
-- recognize); 'owner' is unknown to BranchRole/ROLE_RANK → zero permissions.
INSERT INTO erp_user_branches (user_id, branch_id, role, is_default)
VALUES ('${userId}', '${branchId}', 'admin', true);

-- Local credential (bcrypt via pgcrypto); the offline auth service verifies it.
INSERT INTO erp_local_users (id, email, password_hash, company_id, is_active)
VALUES ('${userId}', '${esc(adminEmail)}',
        extensions.crypt('${esc(adminPassword)}', extensions.gen_salt('bf')),
        '${companyId}', true);

COMMIT;
`);
  log(`seeded company "${companyName}" + admin ${adminEmail}`);
  printCredentials();
}

try {
  seed();
} catch (e) {
  process.stderr.write(`✗ seed failed: ${e.message}\n`);
  process.exit(1);
}
