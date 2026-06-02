-- ============================================================================
-- Demo FMCG (Demo Wholesale) — demo users + light sales data
-- ----------------------------------------------------------------------------
-- Demo data only. Creates 8 role-based login accounts (password Demo@1234) on
-- the Demo Wholesale tenant and a light, sales-invoice-focused dataset
-- (1 warehouse + opening stock + 6 invoices). Idempotent. APPLIED to Demo
-- Wholesale; recorded here for reproducibility.
--
-- NOTE on roles: VANTORA's branch-role model is flat (no regional/area tier).
-- "Regional Manager" and "Area Manager" are mapped to the `manager` role
-- (labeled via full_name). All accounts are demo-tenant-scoped.
-- Tenant: Demo Wholesale 1a1dfb3b-9d5c-4a41-9e59-0dbcf3829731
-- Branch: 41eb68f5-8da8-4a5b-80b1-f5a5101aa98d
-- ============================================================================

-- 1) Demo login users (email-confirmed; password = Demo@1234)
DO $users$
DECLARE v_branch UUID := '41eb68f5-8da8-4a5b-80b1-f5a5101aa98d'; v_uid UUID; r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('fmcg.admin@demo.com','FMCG Company Admin','admin'),
    ('fmcg.regional@demo.com','FMCG Regional Manager','manager'),
    ('fmcg.area@demo.com','FMCG Area Manager','manager'),
    ('fmcg.branch@demo.com','FMCG Branch Manager','manager'),
    ('fmcg.supervisor@demo.com','FMCG Sales Supervisor','supervisor'),
    ('fmcg.sales@demo.com','FMCG Sales Rep','salesman'),
    ('fmcg.finance@demo.com','FMCG Finance','accountant'),
    ('fmcg.viewer@demo.com','FMCG Viewer','viewer')
  ) AS u(email, full_name, role) LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = r.email) THEN CONTINUE; END IF;
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user,
      is_anonymous, confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      r.email, crypt('Demo@1234', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', r.full_name), false, false, '', '', '', ''
    ) RETURNING id INTO v_uid;
    INSERT INTO erp_user_branches (user_id, branch_id, role, is_default)
    VALUES (v_uid, v_branch, r.role, true) ON CONFLICT (user_id, branch_id) DO NOTHING;
  END LOOP;
END $users$;

-- 2) Light FMCG sales data (1 warehouse + opening stock + 6 invoices) — see
--    the applied block in the session; idempotent on FWH / FINV-* identifiers.
