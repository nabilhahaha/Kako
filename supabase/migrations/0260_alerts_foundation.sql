-- ============================================================================
-- 0260: Critical Alerts Framework — Phase A1: foundation (rules + instances)
-- ----------------------------------------------------------------------------
-- A platform-level, metadata-driven alert engine. erp_alert_rules holds the
-- configurable rules (global defaults + per-company overrides: source, severity,
-- thresholds, recipients, channels). erp_alerts holds raised instances with the
-- open/acknowledged/snoozed/resolved lifecycle, deduped per condition. Additive;
-- INERT until KAKO_ALERTS. No source/evaluator yet (Phase A2/A3). RLS on both.
-- See docs/architecture/platform/CRITICAL-ALERTS-FRAMEWORK-DESIGN.md.
-- ============================================================================

-- ── Alert rules — metadata (global default company_id IS NULL + per-company) ──
CREATE TABLE IF NOT EXISTS erp_alert_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- NULL = global default
  rule_key             text NOT NULL,
  source_key           text NOT NULL,
  severity             text NOT NULL DEFAULT 'warning'
                         CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  threshold            jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_type       text NOT NULL DEFAULT 'company_admin'
                         CHECK (recipient_type IN ('role', 'company_admin', 'user', 'permission')),
  recipient_ref        text,
  channels             jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  snooze_default_hours integer NOT NULL DEFAULT 24,
  is_active            boolean NOT NULL DEFAULT true,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_rules_company ON erp_alert_rules (company_id, rule_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_rules_global  ON erp_alert_rules (rule_key) WHERE company_id IS NULL;
ALTER TABLE erp_alert_rules ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_alert_rules_set_company ON erp_alert_rules;
CREATE TRIGGER erp_alert_rules_set_company BEFORE INSERT ON erp_alert_rules
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_alert_rules_updated ON erp_alert_rules;
CREATE TRIGGER erp_alert_rules_updated BEFORE UPDATE ON erp_alert_rules
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_alert_rules_read ON erp_alert_rules;
CREATE POLICY erp_alert_rules_read ON erp_alert_rules FOR SELECT
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_alert_rules_write ON erp_alert_rules;
CREATE POLICY erp_alert_rules_write ON erp_alert_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Alert instances — lifecycle (deduped per condition) ─────────────────────
CREATE TABLE IF NOT EXISTS erp_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  rule_key         text NOT NULL,
  source_key       text NOT NULL,
  severity         text NOT NULL DEFAULT 'warning'
                     CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'acknowledged', 'snoozed', 'resolved')),
  entity           text,
  record_id        text,
  dedupe_key       text NOT NULL,
  title            text,
  body             text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by  uuid,
  acknowledged_at  timestamptz,
  snoozed_until    timestamptz,
  resolved_by      uuid,
  resolved_at      timestamptz,
  resolved_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_dedupe ON erp_alerts (company_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_alerts_company_status ON erp_alerts (company_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_snoozed ON erp_alerts (status, snoozed_until) WHERE status = 'snoozed';
ALTER TABLE erp_alerts ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_alerts_set_company ON erp_alerts;
CREATE TRIGGER erp_alerts_set_company BEFORE INSERT ON erp_alerts
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_alerts_updated ON erp_alerts;
CREATE TRIGGER erp_alerts_updated BEFORE UPDATE ON erp_alerts
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_alerts_tenant ON erp_alerts;
CREATE POLICY erp_alerts_tenant ON erp_alerts FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual): DROP TABLE IF EXISTS erp_alerts, erp_alert_rules; ─────
