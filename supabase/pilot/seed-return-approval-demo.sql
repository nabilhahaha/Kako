-- Return Approval Workflow — demo enablement (staging).
-- Applied to "Nile FMCG (DEMO)" (company 60995681-9fc8-4969-a4e1-998a1bfe9fe6).
-- Realizes the canonical examples as DATA (nothing hardcoded):
--   • Saleable ≤ 500  → auto-post
--   • Saleable > 500  → approval (mode default: Supervisor, backup Branch Manager)
--   • Damage (any)    → approval (Branch Manager, backup Company Admin)
-- Re-runnable: flags upsert, policy upserts, rules are reset then re-seeded.

\set co '60995681-9fc8-4969-a4e1-998a1bfe9fe6'

-- 1) Capabilities ON (platform → company opt-in).
INSERT INTO erp_feature_flags(company_id, feature_key, enabled)
SELECT :'co'::uuid, k, true
FROM (VALUES ('platform.return_approval'), ('platform.return_approval_sla')) AS f(k)
ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled = excluded.enabled;

-- 2) Policy: approval mode + delegation (primary Supervisor, backup Branch Manager).
INSERT INTO erp_return_approval_policies(company_id, mode, approver_role, backup_approver_role)
VALUES (:'co'::uuid, 'approval', 'supervisor', 'branch_manager')
ON CONFLICT (company_id) DO UPDATE
  SET mode = excluded.mode, approver_role = excluded.approver_role,
      backup_approver_role = excluded.backup_approver_role, updated_at = now();

-- 3) Rules (first match by priority wins; all set criteria AND).
DELETE FROM erp_return_approval_rules WHERE company_id = :'co'::uuid;
INSERT INTO erp_return_approval_rules
  (company_id, priority, active, return_type, min_value, max_value, result, approver_level, backup_approver_level)
VALUES
  (:'co'::uuid, 1,  true, 'damage',   NULL, NULL, 'approval', 'branch_manager', 'company_admin'),
  (:'co'::uuid, 10, true, 'saleable', NULL, 500,  'auto',     NULL,             NULL);
-- Saleable > 500 falls through to the mode default = approval (Supervisor).
