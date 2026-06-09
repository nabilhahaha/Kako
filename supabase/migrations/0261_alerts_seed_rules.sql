-- ============================================================================
-- 0261: Critical Alerts Framework — Phase A3: seed global rules (ready sources)
-- ----------------------------------------------------------------------------
-- Registers default GLOBAL alert rules (company_id IS NULL) for the three ready
-- sources shipped in A3. Companies inherit these and may override severity /
-- thresholds / recipients / channels per company. The rules are active, but the
-- engine only evaluates them when KAKO_ALERTS is ON — the flag is the master gate;
-- no tenant fires alerts until enabled. Idempotent. Additive.
-- ============================================================================

INSERT INTO erp_alert_rules (company_id, rule_key, source_key, severity, threshold, recipient_type, recipient_ref, channels, is_active)
VALUES
  (NULL, 'pending_approvals', 'pending_approvals', 'warning',
   '{"olderThanHours": 24}'::jsonb, 'company_admin', NULL, '["in_app"]'::jsonb, true),
  (NULL, 'overdue_requests',  'overdue_requests',  'high',
   '{}'::jsonb, 'company_admin', NULL, '["in_app"]'::jsonb, true),
  (NULL, 'credit_limit',      'credit_limit',      'high',
   '{"criticalOverPct": 25}'::jsonb, 'role', 'manager', '["in_app"]'::jsonb, true)
ON CONFLICT (rule_key) WHERE company_id IS NULL DO NOTHING;

-- ── Rollback (manual):
--   DELETE FROM erp_alert_rules WHERE company_id IS NULL
--     AND rule_key IN ('pending_approvals','overdue_requests','credit_limit');
