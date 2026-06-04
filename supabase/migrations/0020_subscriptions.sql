-- ============================================================================
-- 0020: Subscriptions, business type & slug for tenants (SaaS)
-- ----------------------------------------------------------------------------
-- Lets the vendor (platform owner) sell timed subscriptions per company. A
-- company is "active" when is_active = true AND the subscription has not
-- expired. business_type drives future per-industry templates; slug is for
-- per-company URLs. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS subscription_start DATE;
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS subscription_end DATE;

-- Unique slug (only when set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_companies_slug ON erp_companies(slug) WHERE slug IS NOT NULL;

-- Is a given company currently usable? (active flag + not expired)
CREATE OR REPLACE FUNCTION erp_company_active(p_company UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT is_active AND (subscription_end IS NULL OR subscription_end >= CURRENT_DATE)
    FROM erp_companies WHERE id = p_company
  ), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Is the current user's company usable?
CREATE OR REPLACE FUNCTION erp_user_company_active()
RETURNS BOOLEAN AS $$
  SELECT erp_company_active(erp_user_company_id());
$$ LANGUAGE sql STABLE SECURITY DEFINER;
