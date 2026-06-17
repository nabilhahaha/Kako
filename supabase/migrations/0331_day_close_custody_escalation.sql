-- 0331 — End Day: cash-custody escalation threshold (days).
--
-- Outstanding cash older than this many days escalates on the salesman's Today
-- custody card. ADDITIVE; flag-gated (platform.day_close_approval, OFF).

ALTER TABLE erp_day_close_policies
  ADD COLUMN IF NOT EXISTS custody_escalation_days int NOT NULL DEFAULT 7;
