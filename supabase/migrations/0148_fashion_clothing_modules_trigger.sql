-- ============================================================================
-- 0148: New clothing companies must also be tightened to fashion-only MODULES
-- ----------------------------------------------------------------------------
-- 0147 added the `erp_companies_zz_clothing_perms` trigger to tighten role
-- PERMISSIONS for newly-created clothing companies, and a one-time backfill that
-- tightened existing clothing companies' MODULES to fashion-only. But the trigger
-- itself only tightened permissions — module seeding still runs through
-- `erp_companies_seed_roles → erp_seed_company_modules`, which enables the broad
-- business-type default set (accounting / analytics / crm / pos / inventory / …).
-- So every clothing company created AFTER 0147 re-acquired ~11 enabled modules,
-- re-leaking generic ERP / FMCG sidebar sections.
--
-- AFTER-ROW triggers fire in trigger-name order:
--   erp_companies_seed_fashion → erp_companies_seed_roles (seeds modules) →
--   erp_companies_zz_clothing_perms (runs LAST)
-- so the zz trigger is the correct place to also enforce fashion-only modules:
-- by the time it runs, the broad set is already seeded and can be tightened to
-- stick. Clothing-scoped, idempotent, no schema change.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_clothing_role_perms_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.business_type = 'clothing' THEN
    -- (a) curated Fashion role permission set (from 0147)
    PERFORM erp_seed_fashion_role_perms(NEW.id);
    -- (b) fashion-only modules: disable the broad business-type defaults that the
    --     earlier seed-roles trigger enabled, leaving ONLY the fashion module.
    UPDATE erp_company_modules SET enabled = (module = 'fashion') WHERE company_id = NEW.id;
    INSERT INTO erp_company_modules (company_id, module, enabled)
    VALUES (NEW.id, 'fashion', true)
    ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;
  END IF;
  RETURN NEW;
END $$;

-- Backfill: re-tighten any existing clothing company whose modules drifted broad
-- (e.g. companies created between 0147 and this migration). Idempotent.
UPDATE erp_company_modules cm SET enabled = (cm.module = 'fashion')
FROM erp_companies c
WHERE c.id = cm.company_id AND c.business_type = 'clothing';
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'fashion', true FROM erp_companies WHERE business_type = 'clothing'
ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the 0147 definition of erp_clothing_role_perms_trg() (permissions only)
-- and re-run erp_seed_company_modules(company_id) for the affected companies.
