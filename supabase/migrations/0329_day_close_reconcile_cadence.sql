-- 0329 — End Day: inventory reconciliation cadence + 'Not Due Yet' status.
--
-- Reconciliation may be daily / weekly / monthly / surprise / not_required. When it
-- is not due today, the day can still close while Inventory = Not Due Yet (a
-- blocking reconciliation only gates the close when it is actually due = pending/
-- partial). ADDITIVE; flag-gated (platform.day_close_approval, OFF).

ALTER TABLE erp_day_close_policies
  ADD COLUMN IF NOT EXISTS reconcile_cadence text NOT NULL DEFAULT 'daily'
    CHECK (reconcile_cadence IN ('daily','weekly','monthly','surprise','not_required'));

-- Final reconcile_status domain: a count marks 'reconciled' (variance carries
-- forward separately) — no 'partial' state for inventory.
ALTER TABLE erp_day_close_requests DROP CONSTRAINT IF EXISTS erp_day_close_requests_reconcile_status_check;
ALTER TABLE erp_day_close_requests
  ADD CONSTRAINT erp_day_close_requests_reconcile_status_check
  CHECK (reconcile_status IN ('not_required','not_due_yet','pending','reconciled'));
