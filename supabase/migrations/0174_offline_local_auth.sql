-- ============================================================================
-- 0174: Offline local auth — additive table for the offline edition
-- ----------------------------------------------------------------------------
-- The OFFLINE edition (Tauri desktop build, gated by KAKO_OFFLINE) replaces
-- Supabase Auth with a local credential store. This table holds the local
-- login credentials and the company binding for each profile.
--
-- It is ADDITIVE and HARMLESS on the cloud build: nothing in the cloud app
-- reads or writes it. The cloud keeps using Supabase Auth; `auth.uid()` is
-- provided by Supabase there. The offline bootstrap (scripts/offline) installs
-- its own `auth.uid()` shim that reads the local JWT claim — that shim is NOT
-- defined here, so this migration never shadows the real Supabase function.
--
-- Security posture: RLS is enabled with NO permissive policy for `authenticated`,
-- so the password hashes are unreachable through RLS-scoped supabase-js. The
-- offline auth service reads/writes this table only through service-role /
-- SECURITY DEFINER paths (added in P3). Idempotent; safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_local_users (
  id             UUID PRIMARY KEY REFERENCES erp_profiles(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  password_hash  TEXT,                       -- bcrypt; NULL until a password is set
  company_id     UUID REFERENCES erp_companies(id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Covering indexes for the foreign keys (schema-health invariant: a FK's first
-- index column must equal the FK column). The PK index on `id` covers the
-- erp_profiles FK; company_id needs its own.
CREATE INDEX IF NOT EXISTS idx_erp_local_users_company_id ON erp_local_users(company_id);

-- One local credential per email (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_local_users_email ON erp_local_users(lower(email));

-- updated_at maintenance, consistent with the rest of the schema.
DROP TRIGGER IF EXISTS erp_local_users_updated ON erp_local_users;
CREATE TRIGGER erp_local_users_updated
  BEFORE UPDATE ON erp_local_users
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- RLS on, deny-by-default. No policy is added for `authenticated`, so the
-- credential rows are unreachable via RLS-scoped clients. The offline auth
-- service uses service-role / SECURITY DEFINER access (P3). service_role
-- bypasses RLS, so no explicit policy is required for it.
ALTER TABLE erp_local_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_local_users FORCE ROW LEVEL SECURITY;
