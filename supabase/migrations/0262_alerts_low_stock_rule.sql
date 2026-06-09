-- ============================================================================
-- 0262: Critical Alerts Framework — Phase A3b: low_stock global rule
-- ----------------------------------------------------------------------------
-- Seeds the GLOBAL rule for the low_stock source (products below min_stock).
-- Active; the KAKO_ALERTS flag remains the master gate. Idempotent, additive.
-- ============================================================================

INSERT INTO erp_alert_rules (company_id, rule_key, source_key, severity, threshold, recipient_type, recipient_ref, channels, is_active)
VALUES
  (NULL, 'low_stock', 'low_stock', 'warning', '{}'::jsonb, 'role', 'warehouse_keeper', '["in_app"]'::jsonb, true)
ON CONFLICT (rule_key) WHERE company_id IS NULL DO NOTHING;

-- ── Rollback (manual): DELETE FROM erp_alert_rules WHERE company_id IS NULL AND rule_key='low_stock'; ──
