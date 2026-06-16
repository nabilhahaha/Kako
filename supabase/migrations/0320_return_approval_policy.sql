-- 0320 — Return Approval Workflow, Phase A (schema foundation).
--
-- POLICY-DRIVEN, configurable return approval. Per company:
--   • a MODE: disabled / open / approval
--   • an ordered list of RULES matching on any dimension (return type, value band,
--     customer, customer class, salesman, route, product category) → auto / approval
--     / block. First matching active rule (by priority) wins; else the mode default.
-- Nothing hardcoded. ADDITIVE + flag-gated (platform.return_approval, default OFF):
-- when OFF the existing Direct (open) return behaviour is unchanged.
--
-- NOTE: erp_return_policies already exists but models a DIFFERENT concern (return
-- SOURCE rules), so the approval workflow gets its own tables here.

-- 1) Return status: add the approval-workflow states. ('completed' = posted return;
--    'approved' already exists.)
ALTER TYPE erp_return_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE erp_return_status ADD VALUE IF NOT EXISTS 'rejected';

-- 2) Approval fields on the return header (return_type / approval_stage / approved_by
--    already exist; value lives in total_amount / net_return_value).
ALTER TABLE erp_sales_returns
  ADD COLUMN IF NOT EXISTS requested_by     uuid,
  ADD COLUMN IF NOT EXISTS requested_at     timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by      uuid,
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approval_level   text;

CREATE INDEX IF NOT EXISTS erp_sales_returns_status_idx ON erp_sales_returns (branch_id, status);

-- 3) Per-company policy: mode + default approver.
CREATE TABLE IF NOT EXISTS erp_return_approval_policies (
  company_id       uuid PRIMARY KEY,
  mode             text NOT NULL DEFAULT 'open' CHECK (mode IN ('disabled','open','approval')),
  approver_role    text,           -- supervisor | branch_manager | company_admin
  approver_user_id uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

-- 4) Configurable approval RULES (the policy engine's data).
CREATE TABLE IF NOT EXISTS erp_return_approval_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,
  priority            int  NOT NULL DEFAULT 100,
  active              boolean NOT NULL DEFAULT true,
  -- match criteria (NULL = "any"); all set criteria must hold (AND).
  return_type         text CHECK (return_type IN ('saleable','damage')),
  min_value           numeric,
  max_value           numeric,
  customer_id         uuid,
  customer_class      text,
  salesman_id         uuid,
  route_id            uuid,
  product_category_id uuid,
  -- outcome
  result              text NOT NULL CHECK (result IN ('auto','approval','block')),
  approver_level      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid
);
CREATE INDEX IF NOT EXISTS erp_return_approval_rules_co_idx ON erp_return_approval_rules (company_id, active, priority);

ALTER TABLE erp_return_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_return_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_return_approval_policies_rw ON erp_return_approval_policies;
CREATE POLICY erp_return_approval_policies_rw ON erp_return_approval_policies
  FOR ALL USING (company_id = erp_user_company_id()) WITH CHECK (company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_return_approval_rules_rw ON erp_return_approval_rules;
CREATE POLICY erp_return_approval_rules_rw ON erp_return_approval_rules
  FOR ALL USING (company_id = erp_user_company_id()) WITH CHECK (company_id = erp_user_company_id());
