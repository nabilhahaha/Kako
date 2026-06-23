-- ============================================================================
-- VANTORA — Step 7: "Field Verification Demo Co." demo data (STAGING ONLY).
-- Part A (SQL only — NO auth, NO secrets). Additive + idempotent.
--
-- Run ORDER (coordinated; the dataset owner is the demo admin profile):
--   1) Section A1  (this file, top)         — company + branch + module + catalog + radius
--   2) Part B      (seed_fv_demo.mjs --apply) — the 5 auth users + role assignments
--   3) Section A2  (this file, bottom)       — dataset + 25 customers (needs the admin profile)
--
-- Nothing here touches production. Every row is scoped to the fixed demo company id.
-- Reverse: see the ROLLBACK block at the very bottom (commented).
-- ============================================================================

-- Fixed ids so the SQL and the auth script agree, and re-runs stay idempotent.
--   company : 7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6
--   branch  : 7f1d0a2e-0000-4000-8000-00000000b001
--   dataset : 7f1d0a2e-0000-4000-8000-0000000d5701

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION A1 — company, branch, module, City/Channel catalog, radius (no users)
-- ─────────────────────────────────────────────────────────────────────────────

-- Company. The insert trigger (erp_seed_company_roles_trg + business-type module
-- seeding) auto-provisions erp_company_modules + erp_company_roles +
-- erp_company_role_permissions from the 'field_verification_only' template (PKG-1).
INSERT INTO erp_companies (id, name, slug, business_type, city, currency, is_active, is_pilot)
VALUES ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'Field Verification Demo Co.',
        'field-verification-demo', 'field_verification_only', 'Jeddah', 'SAR', true, true)
ON CONFLICT (id) DO NOTHING;

-- HQ branch (the role assignments in Part B land here).
INSERT INTO erp_branches (id, company_id, code, name, name_ar, city, is_active, is_hq)
VALUES ('7f1d0a2e-0000-4000-8000-00000000b001', '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6',
        'MAIN', 'HQ', 'المركز الرئيسي', 'Jeddah', true, true)
ON CONFLICT (company_id, code) DO NOTHING;

-- Ensure ONLY field_verification is enabled (defence in depth over the trigger).
INSERT INTO erp_company_modules (company_id, module, enabled)
VALUES ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'field_verification', true)
ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;

-- Admin-managed City/Channel catalog (the rep dropdowns read ACTIVE values).
INSERT INTO erp_rp_verification_catalog (company_id, kind, value, sort_order, active) VALUES
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'city', 'Jeddah', 1, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'city', 'Makkah', 2, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'city', 'Taif',   3, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'city', 'Medina', 4, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'city', 'Yanbu',  5, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Grocery',     1, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Mini Market', 2, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Supermarket', 3, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Wholesale',   4, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Pharmacy',    5, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Restaurant',  6, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Roastery',    7, true),
  ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 'channel', 'Other',       8, true)
ON CONFLICT (company_id, kind, value) DO NOTHING;

-- Verification radius (default 50 m; admin-configurable via the FV-4c UI).
INSERT INTO erp_rp_verification_settings (company_id, radius_m)
VALUES ('7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6', 50)
ON CONFLICT (company_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION A2 — dataset + 25 customers.  RUN AFTER Part B (needs the admin profile,
-- which the auth seeder creates). Re-runnable; inserts only missing seqs.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_company uuid := '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
  v_dataset uuid := '7f1d0a2e-0000-4000-8000-0000000d5701';
  v_admin   uuid;
BEGIN
  SELECT id INTO v_admin FROM erp_profiles WHERE lower(email) = 'demo.admin@vantora.local';
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'demo.admin profile not found — run Part B (node supabase/demo/seed_fv_demo.mjs --apply) before SECTION A2.';
  END IF;

  INSERT INTO erp_rp_datasets (id, company_id, owner_id, name, source, row_count, valid_count, columns, is_active)
  VALUES (v_dataset, v_company, v_admin, 'Demo Customer Set', 'manual_upload', 25, 25, '{}'::jsonb, true)
  ON CONFLICT (id) DO NOTHING;

  -- 25 customers around Jeddah; salesman split across 3 reps (rep01=9, rep02=8,
  -- rep03=8); imported city/channel are the OLD/current values (reps pick NEW from
  -- the catalog).
  INSERT INTO erp_rp_dataset_customers (dataset_id, company_id, seq, code, name, lat, lng, salesman, city, channel, class, attrs)
  SELECT v_dataset, v_company, gs,
    'C' || lpad(gs::text, 3, '0'),
    'Demo Customer ' || gs,
    21.4858 + ((gs % 5) - 2) * 0.0003,
    39.1925 + ((gs / 5) - 2) * 0.0003,
    CASE WHEN gs <= 9  THEN 'demo.rep01@vantora.local'   -- seq 1–9  (9)
         WHEN gs <= 17 THEN 'demo.rep02@vantora.local'   -- seq 10–17 (8)
         ELSE               'demo.rep03@vantora.local' END, -- seq 18–25 (8)
    (ARRAY['Jeddah','Makkah','Taif','Medina','Yanbu'])[1 + (gs % 5)],
    (ARRAY['Grocery','Mini Market','Supermarket','Wholesale','Pharmacy'])[1 + (gs % 5)],
    (ARRAY['A','B','C'])[1 + (gs % 3)],
    jsonb_build_object('phone', '+96650' || lpad(gs::text, 7, '0'))
  FROM generate_series(1, 25) gs
  WHERE NOT EXISTS (
    SELECT 1 FROM erp_rp_dataset_customers c WHERE c.dataset_id = v_dataset AND c.seq = gs
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual; staging only). Run Part B teardown first to remove the users.
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM erp_rp_dataset_customers     WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_rp_datasets              WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_rp_customer_verifications WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_rp_verification_attempts WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_rp_verification_catalog  WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_rp_verification_settings WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_company_role_permissions WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_company_roles            WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_company_modules          WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_branches                 WHERE company_id = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
-- DELETE FROM erp_companies                WHERE id         = '7f1d0a2e-9c4b-4e6a-b1c2-a1b2c3d4e5f6';
