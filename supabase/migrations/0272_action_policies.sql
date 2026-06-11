-- ============================================================================
-- 0272 — erp_action_policies: tenant-scoped governance for Critical Actions
-- ----------------------------------------------------------------------------
-- Per-tenant configuration of the FMCG Critical Action catalog
-- (src/lib/erp/critical-actions-catalog.ts). Each row OVERRIDES the code
-- default for one action in one company: risk level, reason/approval
-- requirement, notification + escalation targets, reversal permission/policy,
-- enable/disable, and an effective-date window. The app resolves the effective
-- policy (this table) and falls back to the catalog default when absent.
--
-- Reusable across industries: the catalog keys are business-type agnostic, so
-- this table governs any vertical that uses the standard (FMCG-first).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_action_policies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  action_key         text NOT NULL,
  enabled            boolean NOT NULL DEFAULT true,
  risk_level         text NOT NULL DEFAULT 'medium'
                       CHECK (risk_level IN ('low','medium','high','critical')),
  reason_required    boolean NOT NULL DEFAULT false,
  approval_required  boolean NOT NULL DEFAULT false,
  notify_targets     text[] NOT NULL DEFAULT '{}',
  escalation_targets text[] NOT NULL DEFAULT '{}',
  reversal_allowed   boolean NOT NULL DEFAULT false,
  reversal_policy    text NOT NULL DEFAULT 'reversible'
                       CHECK (reversal_policy IN ('reversible','reverse_entry','approval_to_reverse','irreversible')),
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_to       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid
);

-- Resolution picks the most recent currently-effective row per (company, action).
CREATE INDEX IF NOT EXISTS idx_action_policies_lookup
  ON erp_action_policies (company_id, action_key, effective_from DESC);

-- One ACTIVE (open-ended) policy per action per tenant; historical/closed rows
-- (effective_to set) may coexist for effective-dated changes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_policies_open
  ON erp_action_policies (company_id, action_key)
  WHERE effective_to IS NULL;

-- ── RLS: read = tenant members; write = company admin / platform owner ───────
ALTER TABLE erp_action_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_action_policies_select ON erp_action_policies;
CREATE POLICY erp_action_policies_select ON erp_action_policies
  FOR SELECT USING (
    erp_is_platform_owner() OR erp_is_super_admin() OR company_id = erp_user_company_id()
  );

DROP POLICY IF EXISTS erp_action_policies_write ON erp_action_policies;
CREATE POLICY erp_action_policies_write ON erp_action_policies
  FOR ALL USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  )
  WITH CHECK (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON erp_action_policies TO authenticated;
GRANT ALL ON erp_action_policies TO service_role;

-- ── Resolver: the currently-effective policy for (company, action) ───────────
CREATE OR REPLACE FUNCTION erp_resolve_action_policy(p_company uuid, p_action text)
RETURNS erp_action_policies
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM erp_action_policies
  WHERE company_id = p_company
    AND action_key = p_action
    AND enabled = true
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION erp_resolve_action_policy(uuid, text) TO authenticated, service_role;

-- ── Seed defaults from the catalog (idempotent per company) ──────────────────
-- Mirrors src/lib/erp/critical-actions-catalog.ts. Kept in sync by
-- critical-actions-catalog.test.ts (DB-default ↔ TS-default key parity).
CREATE OR REPLACE FUNCTION erp_seed_action_policies(p_company uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_inserted integer;
BEGIN
  WITH defaults(action_key, risk_level, reason_required, approval_required,
                notify_targets, escalation_targets, reversal_allowed, reversal_policy) AS (
    VALUES
      ('invoice.finalize','high',false,false, ARRAY['branch_manager'], ARRAY['finance'], true,'reverse_entry'),
      ('collection.post','high',false,false, ARRAY['branch_manager'], ARRAY['finance'], true,'reverse_entry'),
      ('collection.adjust','critical',true,true, ARRAY['finance','branch_manager','company_admin'], ARRAY['company_admin'], true,'approval_to_reverse'),
      ('return.approve','high',false,true, ARRAY['salesman','branch_manager'], ARRAY['branch_manager'], true,'reverse_entry'),
      ('return.reject','medium',true,false, ARRAY['salesman'], ARRAY['supervisor'], true,'reversible'),
      ('customer.creditLimitOverride','high',true,true, ARRAY['finance','sales_manager'], ARRAY['finance'], true,'reversible'),
      ('customer.statusChange','high',true,false, ARRAY['salesman','branch_manager'], ARRAY['branch_manager'], true,'reversible'),
      ('customer.gpsChangeApproval','medium',false,true, ARRAY['supervisor','salesman'], ARRAY['supervisor'], true,'reversible'),
      ('customer.dataUpdateApproval','medium',false,true, ARRAY['supervisor'], ARRAY['company_admin'], true,'reversible'),
      ('pricing.listModify','high',true,false, ARRAY['sales_manager'], ARRAY['finance'], true,'reversible'),
      ('tradeSpend.approve','high',false,true, ARRAY['finance','sales_manager'], ARRAY['finance'], true,'approval_to_reverse'),
      ('tradeSpend.cancel','high',true,true, ARRAY['finance','sales_manager'], ARRAY['company_admin'], false,'irreversible'),
      ('van.reconcile','high',true,true, ARRAY['supervisor','finance','branch_manager'], ARRAY['finance'], true,'approval_to_reverse'),
      ('van.loadConfirm','medium',false,false, ARRAY['supervisor','inventory_controller'], ARRAY['supervisor'], true,'reverse_entry'),
      ('van.unloadConfirm','medium',false,false, ARRAY['supervisor','inventory_controller'], ARRAY['supervisor'], true,'reverse_entry'),
      ('stock.transferApprove','high',false,true, ARRAY['inventory_controller','branch_manager'], ARRAY['branch_manager'], true,'reverse_entry'),
      ('stock.adjust','high',true,false, ARRAY['inventory_controller','branch_manager'], ARRAY['branch_manager'], true,'reverse_entry'),
      ('route.reassign','medium',true,false, ARRAY['salesman','supervisor'], ARRAY['supervisor'], true,'reversible'),
      ('salesman.reassign','medium',true,false, ARRAY['salesman','supervisor'], ARRAY['supervisor'], true,'reversible'),
      ('supervisor.approve','high',false,false, ARRAY['approver_queue','salesman'], ARRAY['company_admin'], true,'approval_to_reverse'),
      ('expiry.writeOff','high',true,false, ARRAY['inventory_controller','branch_manager'], ARRAY['company_admin'], false,'irreversible'),
      ('expiry.disposalApprove','critical',true,true, ARRAY['company_admin','finance','inventory_controller'], ARRAY['company_admin'], false,'irreversible')
  )
  INSERT INTO erp_action_policies (company_id, action_key, risk_level, reason_required,
        approval_required, notify_targets, escalation_targets, reversal_allowed, reversal_policy)
  SELECT p_company, d.action_key, d.risk_level, d.reason_required, d.approval_required,
         d.notify_targets, d.escalation_targets, d.reversal_allowed, d.reversal_policy
  FROM defaults d
  WHERE NOT EXISTS (
    SELECT 1 FROM erp_action_policies p
    WHERE p.company_id = p_company AND p.action_key = d.action_key AND p.effective_to IS NULL
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION erp_seed_action_policies(uuid) TO authenticated, service_role;

-- Seed every existing tenant with the catalog defaults (idempotent).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM erp_companies LOOP
    PERFORM erp_seed_action_policies(c.id);
  END LOOP;
END $$;
