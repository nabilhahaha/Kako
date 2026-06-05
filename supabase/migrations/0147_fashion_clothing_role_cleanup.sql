-- ============================================================================
-- 0147: Fashion Store — tighten clothing companies to the store experience only
-- ----------------------------------------------------------------------------
-- A clothing company should expose ONLY the Fashion Store. Today, existing
-- clothing companies carry broad general-retail role permissions and several
-- orphaned enabled modules, which surface generic ERP / FMCG / Electrical
-- sidebar sections (driven by leftover permissions) and dead modules.
--
-- This migration, scoped strictly to business_type = 'clothing':
--   (a) enables ONLY the `fashion` module (disables pos/returns/warehousing/
--       integrations/… that produce no useful Fashion nav),
--   (b) replaces each clothing role's permission set with a curated Fashion set
--       (admin/owner keep staff/branch admin; staff roles get their slice). With
--       fashion.manage acting as the owner umbrella (app side), admin/manager get
--       the whole store from one permission.
-- Other business types are untouched. Idempotent. No table/schema change.
-- ============================================================================

-- Curated per-role Fashion permission map for one clothing company.
CREATE OR REPLACE FUNCTION erp_seed_fashion_role_perms(p_company_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Reset this clothing company's role permissions to the Fashion baseline.
  DELETE FROM erp_company_role_permissions WHERE company_id = p_company_id;
  INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
  SELECT p_company_id, g.role_key, g.permission
  FROM (VALUES
    -- Owner / admin: run the shop + manage staff & branches.
    ('admin','fashion.manage'), ('admin','settings.users'), ('admin','settings.branches'),
    -- Manager: the full store (fashion.manage umbrella), no generic ERP settings.
    ('manager','fashion.manage'),
    -- Cashier / salesperson: sell + collect + cash box.
    ('cashier','fashion.sell'), ('cashier','fashion.installments'), ('cashier','fashion.cashbox'),
    -- Stock keeper: products / inventory / purchasing.
    ('warehouse_keeper','fashion.inventory'), ('warehouse_keeper','fashion.purchase'),
    -- Accountant: reports, cash box, installments, supplier payments.
    ('accountant','fashion.reports'), ('accountant','fashion.cashbox'),
    ('accountant','fashion.installments'), ('accountant','fashion.purchase'),
    -- Viewer: reports only.
    ('viewer','fashion.reports')
  ) AS g(role_key, permission)
  JOIN erp_company_roles cr ON cr.company_id = p_company_id AND cr.role_key = g.role_key
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION erp_seed_fashion_role_perms(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_seed_fashion_role_perms(UUID) TO authenticated, service_role;

-- (a) Modules: only `fashion` enabled for every clothing company.
UPDATE erp_company_modules cm SET enabled = (cm.module = 'fashion')
FROM erp_companies c
WHERE c.id = cm.company_id AND c.business_type = 'clothing';
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'fashion', true FROM erp_companies WHERE business_type = 'clothing'
ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;

-- (b) Backfill existing clothing companies' role permissions.
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN SELECT id FROM erp_companies WHERE business_type = 'clothing' LOOP
    PERFORM erp_seed_fashion_role_perms(c.id);
  END LOOP;
END $$;

-- New clothing companies: tighten AFTER the role-seed trigger has populated the
-- defaults. Trigger name 'erp_companies_zz_clothing_perms' sorts after
-- 'erp_companies_seed_roles', so it runs last.
CREATE OR REPLACE FUNCTION erp_clothing_role_perms_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.business_type = 'clothing' THEN PERFORM erp_seed_fashion_role_perms(NEW.id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS erp_companies_zz_clothing_perms ON erp_companies;
CREATE TRIGGER erp_companies_zz_clothing_perms AFTER INSERT ON erp_companies
  FOR EACH ROW EXECUTE FUNCTION erp_clothing_role_perms_trg();

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS erp_companies_zz_clothing_perms ON erp_companies;
-- DROP FUNCTION IF EXISTS erp_clothing_role_perms_trg();
-- DROP FUNCTION IF EXISTS erp_seed_fashion_role_perms(UUID);
-- (Re-run erp_seed_company_roles(company_id) to restore default role permissions.)
