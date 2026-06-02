-- ============================================================================
-- 0098: Capability-Seed Slice — universal new-company capability seeding
-- ----------------------------------------------------------------------------
-- Closes the new-company seeding gap left by 0095: that backfill enabled
-- crm/workflow/analytics/field_ops for every EXISTING company, but only added
-- erp_business_type_modules recommendations for SOME business types — so a NEWLY
-- created company of an unseeded type (general/clothing/bakery/cafe/restaurant/
-- services/auto_parts/bookstore/butchery/workshop/supermarket) would seed those
-- capabilities OFF, and universal nav gating would hide their sections.
--
-- This migration seeds crm/workflow/analytics into erp_business_type_modules for
-- EVERY business type that lacks them (data-driven from the distinct types
-- already present), and field_ops for the field-relevant types only. New
-- companies then enable tier-appropriate capabilities via erp_seed_company_modules
-- (0036) on creation, making the universal nav binding (this slice's app change)
-- regression-safe.
--
-- ADDITIVE + idempotent. No schema change, no deletions, no permission changes,
-- no plan changes (plan gate unchanged). integrations is intentionally NOT seeded
-- (stays opt-in / permission-gated). Protected verticals untouched.
-- ============================================================================

-- crm / workflow / analytics → EVERY business type already present (universal).
-- Data-driven: cross-join the distinct existing business types with the three
-- capability keys; guarded by NOT EXISTS so it only adds what is missing.
INSERT INTO erp_business_type_modules (business_type, module)
SELECT bt.business_type, cap.module
FROM (SELECT DISTINCT business_type FROM erp_business_type_modules) bt
CROSS JOIN (VALUES ('crm'), ('workflow'), ('analytics')) AS cap(module)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_business_type_modules e
  WHERE e.business_type = bt.business_type AND e.module = cap.module
);

-- field_ops → field-relevant types only (reps in the field). Not universal —
-- a clinic/salon/hotel doesn't need it. (delivery/wholesale already partly seeded
-- by 0063/0095; general/electronics added here.) Guarded; only types present.
INSERT INTO erp_business_type_modules (business_type, module)
SELECT v.business_type, 'field_ops'
FROM (VALUES ('delivery'), ('wholesale'), ('electronics'), ('general')) AS v(business_type)
WHERE EXISTS (SELECT 1 FROM erp_business_type_modules b WHERE b.business_type = v.business_type)
  AND NOT EXISTS (
    SELECT 1 FROM erp_business_type_modules e
    WHERE e.business_type = v.business_type AND e.module = 'field_ops'
  );

-- Consistency backfill (no-op after 0095): re-affirm crm/workflow/analytics
-- enabled for existing companies whose business type now recommends them, so the
-- seed is self-contained and idempotent. Never disables or overwrites anything.
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT c.id, m.module, true
FROM erp_companies c
JOIN erp_business_type_modules m ON m.business_type = c.business_type
WHERE m.module IN ('crm', 'workflow', 'analytics')
  AND NOT EXISTS (
    SELECT 1 FROM erp_company_modules cm WHERE cm.company_id = c.id AND cm.module = m.module
  );
