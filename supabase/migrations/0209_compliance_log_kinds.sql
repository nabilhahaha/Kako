-- ============================================================================
-- 0209: Global Tax Compliance — log kinds + direction (Phase 5G, Part 1.5)
-- ----------------------------------------------------------------------------
-- AUGMENTS erp_compliance_logs (0207) to distinguish the reusable log classes:
-- request / response / error / warning / status_change / submission (Part 1.5),
-- plus inbound/outbound direction for authority traffic. Additive + INERT; the
-- lifecycle engine / connectors write these once active (PAUSED). Depends on 0207.
-- ============================================================================

ALTER TABLE erp_compliance_logs
  ADD COLUMN IF NOT EXISTS log_kind  text NOT NULL DEFAULT 'event',
  ADD COLUMN IF NOT EXISTS direction text;

ALTER TABLE erp_compliance_logs DROP CONSTRAINT IF EXISTS erp_compliance_logs_kind_chk;
ALTER TABLE erp_compliance_logs ADD CONSTRAINT erp_compliance_logs_kind_chk
  CHECK (log_kind IN ('request','response','error','warning','status_change','submission','event'));

ALTER TABLE erp_compliance_logs DROP CONSTRAINT IF EXISTS erp_compliance_logs_direction_chk;
ALTER TABLE erp_compliance_logs ADD CONSTRAINT erp_compliance_logs_direction_chk
  CHECK (direction IS NULL OR direction IN ('inbound','outbound'));
