-- ============================================================================
-- 0006: User Profiles + Super Admin support
-- ----------------------------------------------------------------------------
-- Adds an application-level profile per auth user, a super-admin concept that
-- bypasses branch scoping, and fixes the bootstrap problem where a fresh admin
-- (with no branch assignment yet) cannot create the first company / branch.
-- Safe to re-run.
-- ============================================================================

-- ─── 1. Profiles table ───────────────────────────────────────────────────────
-- Mirrors auth.users with app metadata. id == auth.users.id.
CREATE TABLE IF NOT EXISTS erp_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  email           TEXT,
  phone           TEXT,
  avatar_url      TEXT,
  is_super_admin  BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_profiles_updated ON erp_profiles;
CREATE TRIGGER erp_profiles_updated
  BEFORE UPDATE ON erp_profiles
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- ─── 2. Auto-create a profile when an auth user is created ────────────────────
CREATE OR REPLACE FUNCTION erp_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO erp_profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS erp_on_auth_user_created ON auth.users;
CREATE TRIGGER erp_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION erp_handle_new_user();

-- Backfill profiles for any pre-existing auth users.
INSERT INTO erp_profiles (id, full_name, email)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Super-admin helper ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM erp_profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── 4. Branch scoping now respects super admins ──────────────────────────────
-- Super admins see every branch; regular users see only their assignments.
CREATE OR REPLACE FUNCTION erp_user_branch_ids()
RETURNS UUID[] AS $$
  SELECT CASE
    WHEN erp_is_super_admin() THEN (
      SELECT COALESCE(array_agg(id), '{}'::UUID[]) FROM erp_branches
    )
    ELSE (
      SELECT COALESCE(array_agg(branch_id), '{}'::UUID[])
      FROM erp_user_branches
      WHERE user_id = auth.uid()
    )
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── 5. RLS on profiles ───────────────────────────────────────────────────────
ALTER TABLE erp_profiles ENABLE ROW LEVEL SECURITY;

-- Read: own profile, super admins read all, and members who share a branch.
DROP POLICY IF EXISTS "erp_profiles_select" ON erp_profiles;
CREATE POLICY "erp_profiles_select" ON erp_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR erp_is_super_admin()
    OR id IN (
      SELECT user_id FROM erp_user_branches
      WHERE branch_id = ANY(erp_user_branch_ids())
    )
  );

-- A user can update their own profile (but NOT escalate to super admin —
-- enforced by withholding the is_super_admin column from app update payloads).
DROP POLICY IF EXISTS "erp_profiles_update_self" ON erp_profiles;
CREATE POLICY "erp_profiles_update_self" ON erp_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Super admins manage all profiles.
DROP POLICY IF EXISTS "erp_profiles_admin_manage" ON erp_profiles;
CREATE POLICY "erp_profiles_admin_manage" ON erp_profiles FOR ALL
  USING (erp_is_super_admin())
  WITH CHECK (erp_is_super_admin());

-- ─── 6. Super-admin override for companies & branches (bootstrap) ─────────────
-- The 0005 policies require an existing branch assignment, which a brand-new
-- super admin doesn't have. These additional permissive policies let super
-- admins create the first company/branch and manage everything.
DROP POLICY IF EXISTS "erp_companies_superadmin" ON erp_companies;
CREATE POLICY "erp_companies_superadmin" ON erp_companies FOR ALL
  USING (erp_is_super_admin())
  WITH CHECK (erp_is_super_admin());

DROP POLICY IF EXISTS "erp_branches_superadmin" ON erp_branches;
CREATE POLICY "erp_branches_superadmin" ON erp_branches FOR ALL
  USING (erp_is_super_admin())
  WITH CHECK (erp_is_super_admin());

DROP POLICY IF EXISTS "erp_user_branches_superadmin" ON erp_user_branches;
CREATE POLICY "erp_user_branches_superadmin" ON erp_user_branches FOR ALL
  USING (erp_is_super_admin())
  WITH CHECK (erp_is_super_admin());
