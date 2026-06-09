-- ============================================================================
-- 0251: Van Sales (Phase B) — per-tenant enablement + policy settings
-- ----------------------------------------------------------------------------
-- KAKO_VAN_SALES is the PLATFORM master switch; this is the PER-COMPANY toggle +
-- policy layered on top — a tenant uses Van Sales only when BOTH are ON. Company
-- admins manage it on the enablement screen. One row per company (defaults are
-- safe: disabled, count required, no negative stock, no auto-confirm). Additive;
-- INERT until KAKO_VAN_SALES. Company-scoped RLS (mirrors 0240/0245).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_van_sales_settings (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  is_enabled                      boolean NOT NULL DEFAULT false,
  require_physical_count_on_close boolean NOT NULL DEFAULT true,
  allow_negative_van_stock        boolean NOT NULL DEFAULT false,
  auto_confirm_direct_load        boolean NOT NULL DEFAULT false,
  discount_cap_pct                numeric(6,3),
  updated_by                      uuid,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
CREATE INDEX IF NOT EXISTS idx_van_sales_settings_company ON erp_van_sales_settings (company_id);
ALTER TABLE erp_van_sales_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_van_sales_settings_set_company ON erp_van_sales_settings;
CREATE TRIGGER erp_van_sales_settings_set_company BEFORE INSERT ON erp_van_sales_settings
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_van_sales_settings_updated ON erp_van_sales_settings;
CREATE TRIGGER erp_van_sales_settings_updated BEFORE UPDATE ON erp_van_sales_settings
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_van_sales_settings_read ON erp_van_sales_settings;
CREATE POLICY erp_van_sales_settings_read ON erp_van_sales_settings FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_van_sales_settings_write ON erp_van_sales_settings;
CREATE POLICY erp_van_sales_settings_write ON erp_van_sales_settings FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual): DROP TABLE IF EXISTS erp_van_sales_settings; ──────────
