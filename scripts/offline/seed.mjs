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

function seed() {
  if (alreadySeeded()) { log('company already present — seed skipped (single-tenant offline)'); return; }

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
INSERT INTO erp_companies (id, name, business_type, is_active)
VALUES ('${companyId}', '${esc(companyName)}', '${businessType}', true);

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

-- Bind the admin to the branch (default) so erp_user_company_id() resolves.
INSERT INTO erp_user_branches (user_id, branch_id, role, is_default)
VALUES ('${userId}', '${branchId}', 'owner', true);

-- Local credential (bcrypt via pgcrypto); the offline auth service verifies it.
INSERT INTO erp_local_users (id, email, password_hash, company_id, is_active)
VALUES ('${userId}', '${esc(adminEmail)}',
        extensions.crypt('${esc(adminPassword)}', extensions.gen_salt('bf')),
        '${companyId}', true);

COMMIT;
`);
  log(`seeded company "${companyName}" + admin ${adminEmail}`);
}

try {
  seed();
} catch (e) {
  process.stderr.write(`✗ seed failed: ${e.message}\n`);
  process.exit(1);
}
