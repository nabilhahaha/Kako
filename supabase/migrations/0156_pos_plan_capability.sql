-- ============================================================================
-- 0156: Close the `pos` plan gap — generic POS becomes a grantable capability
-- ----------------------------------------------------------------------------
-- `pos` is plan-gateable (ALL_MODULES) and has a nav surface (/sales/pos quick-sale,
-- gated by module:'pos') but was in NO plan, so the effective gate (company ∩ plan)
-- could never open it — the generic POS was unreachable for every tenant. Add `pos`
-- to the paid plans (so the owner can grant it via the Plans & Modules editor) and
-- enable it by default for the clearest retail case (business_type 'general').
-- Other verticals keep their own POS (market/fashion/restaurant/…). Additive,
-- idempotent, reversible.
-- ============================================================================

INSERT INTO erp_plan_modules (plan_key, module)
SELECT key, 'pos' FROM erp_plans WHERE key IN ('standard', 'pro', 'unlimited')
ON CONFLICT DO NOTHING;

INSERT INTO erp_business_type_modules (business_type, module) VALUES ('general', 'pos')
ON CONFLICT DO NOTHING;

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'pos', true FROM erp_companies WHERE business_type = 'general'
ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_plan_modules WHERE module='pos';
-- DELETE FROM erp_business_type_modules WHERE business_type='general' AND module='pos';
-- UPDATE erp_company_modules SET enabled=false WHERE module='pos';
