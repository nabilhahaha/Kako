-- ============================================================================
-- 0154: Make `integrations` a real, plan-gated capability with a nav surface
-- ----------------------------------------------------------------------------
-- `integrations` was a licensable module (ALL_MODULES / plan_modules) with NO nav
-- gate — an orphan. The nav now gates the Integrations settings items by the
-- `integrations` module (see navigation.ts), making the chain Plan → Company
-- module → Nav consistent. To avoid hiding it from companies whose plan includes
-- it, enable the company-module by default for all NON-clothing companies, and add
-- it to non-clothing business-type templates for new tenants. The effective gate
-- stays company ∩ plan, so free-plan companies still won't see it. Clothing stays
-- fashion-only. Additive + idempotent. Reversible.
-- ============================================================================

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'integrations', true FROM erp_companies WHERE business_type IS DISTINCT FROM 'clothing'
ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;

INSERT INTO erp_business_type_modules (business_type, module)
SELECT DISTINCT business_type, 'integrations' FROM erp_business_type_modules WHERE business_type <> 'clothing'
ON CONFLICT DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_business_type_modules WHERE module='integrations';
-- UPDATE erp_company_modules SET enabled=false WHERE module='integrations';
-- (and revert the `module: 'integrations'` gates in navigation.ts)
