-- 0322 — Return Approval Workflow, delegation (primary + backup approver).
--
-- Adds a SECONDARY (backup) approver to the policy and per-rule, so a higher (or
-- explicitly named) level can step in when the primary approver is unavailable —
-- e.g. Supervisor absent → Branch Manager approves — WITHOUT editing the policy.
-- The audit fields (requested_by / approved_by / approved_at / rejected_by /
-- rejected_at / rejection_reason) already exist on erp_sales_returns (migration
-- 0320); nothing to add there. ADDITIVE, flag-gated (platform.return_approval).

ALTER TABLE erp_return_approval_policies
  ADD COLUMN IF NOT EXISTS backup_approver_role    text,  -- supervisor | branch_manager | company_admin
  ADD COLUMN IF NOT EXISTS backup_approver_user_id uuid;

ALTER TABLE erp_return_approval_rules
  ADD COLUMN IF NOT EXISTS backup_approver_level   text;  -- supervisor | branch_manager | company_admin
