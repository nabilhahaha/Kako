-- ============================================================================
-- 0155: Normalize the clothing business-type template to fashion-only
-- ----------------------------------------------------------------------------
-- Clothing companies are intentionally fashion-only (curated roles + the 0148
-- module-tightening trigger). The template still carried the broad default set,
-- forcing a seed-then-tighten dance. Make it correct-by-construction so new
-- clothing companies seed fashion-only directly (the 0148 trigger remains as a
-- belt-and-suspenders safety net). Also re-tighten any clothing company whose
-- modules drifted. TEST-data-safe. Reversible.
-- ============================================================================

DELETE FROM erp_business_type_modules WHERE business_type = 'clothing' AND module <> 'fashion';
INSERT INTO erp_business_type_modules (business_type, module) VALUES ('clothing', 'fashion')
ON CONFLICT DO NOTHING;

UPDATE erp_company_modules cm SET enabled = (cm.module = 'fashion')
FROM erp_companies c WHERE c.id = cm.company_id AND c.business_type = 'clothing';

-- Rollback: re-add the broad clothing template rows (see 0036/0098 seed) if needed.
