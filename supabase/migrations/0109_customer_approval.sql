-- ============================================================================
-- 0109: Customer Approval Workflow (pilot) — staged-change model
-- ----------------------------------------------------------------------------
-- A 4-state customer approval (draft/pending/approved/rejected) on top of the
-- existing generic Workflow & Approval Engine (0088-0090). Per-company,
-- permission-based, reusable. ADDITIVE + idempotent; default behaviour unchanged
-- (governance OFF + status defaults to 'approved'); held from production.
--
-- Decisions: create -> Pending (governance ON); rejection reason mandatory +
-- history (engine); Pending/Rejected block sales; sensitive updates STAGE a
-- change request (customer stays sellable on old values; new values apply on
-- approval, discard on reject); approval gated by the `customers.approve`
-- permission (each company grants it). `is_approved` kept as the existing-gate
-- mirror (= approval_status='approved').
-- ============================================================================

-- ── A. Customer status + rejection reason (is_approved kept as the mirror) ───
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected'));
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
-- Backfill: today is_approved=false means "awaiting approval" -> pending.
UPDATE erp_customers SET approval_status = 'pending' WHERE is_approved = false AND approval_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_erp_customers_approval_status ON erp_customers(company_id, approval_status);

-- ── B. Per-company governance toggle (default OFF = today's behaviour) ────────
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS customers_require_approval BOOLEAN NOT NULL DEFAULT false;

-- ── C. Staged change requests for sensitive edits (mirrors credit-limit) ─────
CREATE TABLE IF NOT EXISTS erp_customer_change_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  changes      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason       TEXT,
  requested_by UUID,
  decided_by   UUID,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_ccr_customer ON erp_customer_change_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_ccr_company_status ON erp_customer_change_requests(company_id, status);
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_customer_change_requests ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_ccr_set_company ON erp_customer_change_requests';
  EXECUTE 'CREATE TRIGGER erp_ccr_set_company BEFORE INSERT ON erp_customer_change_requests FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_ccr_tenant" ON erp_customer_change_requests';
  EXECUTE 'CREATE POLICY "erp_ccr_tenant" ON erp_customer_change_requests FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── D. customers.approve permission default (admin/manager; companies grant more)
INSERT INTO erp_role_permissions (role_key, permission)
SELECT v.role_key, 'customers.approve'
FROM (VALUES ('admin'), ('manager')) AS v(role_key)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = v.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── E. Engine: permission-based approver type (reusable for all governance) ──
-- E1. "does the current user hold permission P in company C" (company override,
--     else global default; admin/manager are seeded with the permission in D).
CREATE OR REPLACE FUNCTION erp_user_has_permission(p_company uuid, p_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT erp_is_platform_owner() OR erp_is_super_admin() OR EXISTS (
    SELECT 1 FROM erp_user_branches ub JOIN erp_branches b ON b.id = ub.branch_id
    WHERE b.company_id = p_company AND ub.user_id = auth.uid()
      AND (
        EXISTS (SELECT 1 FROM erp_company_role_permissions crp
                WHERE crp.company_id = p_company AND crp.role_key = ub.role AND crp.permission = p_perm)
        OR ( NOT EXISTS (SELECT 1 FROM erp_company_role_permissions crp2
                         WHERE crp2.company_id = p_company AND crp2.role_key = ub.role)
             AND EXISTS (SELECT 1 FROM erp_role_permissions rp
                         WHERE rp.role_key = ub.role AND rp.permission = p_perm) )
      )
  );
$$;
REVOKE ALL ON FUNCTION erp_user_has_permission(uuid, text) FROM anon, authenticated, public;

-- E2. allow 'permission' approver_type on steps
ALTER TABLE erp_workflow_steps DROP CONSTRAINT IF EXISTS erp_workflow_steps_approver_type_check;
ALTER TABLE erp_workflow_steps ADD CONSTRAINT erp_workflow_steps_approver_type_check
  CHECK (approver_type IN ('company_admin', 'user', 'role', 'manager', 'department_head', 'permission'));

-- E3. authorize 'permission' tasks (sequential steps; make_tasks already creates
--     a single claimable task whose assignee_type/ref is the step's).
CREATE OR REPLACE FUNCTION erp_workflow_user_can_act(p_company uuid, p_type text, p_ref text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
  SELECT (select erp_is_platform_owner())
      OR (p_type = 'company_admin' and (select erp_is_company_admin(p_company)))
      OR (p_type = 'user' and p_ref = auth.uid()::text)
      OR (p_type = 'permission' and erp_user_has_permission(p_company, p_ref))
      OR (p_type = 'role' and exists (
            select 1 from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
            where b.company_id = p_company and ub.user_id = auth.uid() and ub.role = p_ref));
$$;

-- ── F. Point the customer-onboarding template at the permission ──────────────
UPDATE erp_workflow_steps s
   SET approver_type = 'permission', approver_ref = 'customers.approve'
  FROM erp_workflow_definitions d
 WHERE s.definition_id = d.id AND d.company_id IS NULL AND d.key = 'customer_onboarding';

-- ── G. Seed the customer-update (sensitive change) workflow (global template) ─
DO $$
DECLARE v_def uuid;
BEGIN
  SELECT id INTO v_def FROM erp_workflow_definitions WHERE company_id IS NULL AND key = 'customer_update';
  IF v_def IS NULL THEN
    INSERT INTO erp_workflow_definitions (company_id, key, entity, name_ar, name_en)
    VALUES (NULL, 'customer_update', 'customer_change_request', 'اعتماد تعديل عميل', 'Customer change approval')
    RETURNING id INTO v_def;
    INSERT INTO erp_workflow_steps (definition_id, step_no, name_ar, name_en, approver_type, approver_ref)
    VALUES (v_def, 1, 'اعتماد التعديل', 'Change approval', 'permission', 'customers.approve');
  END IF;
END $$;

-- ── Rollback (manual) — see git for the prior approver_type/template state ───
