-- 0328 — End Day: separate Day / Settlement / Reconciliation statuses + carry-forward.
--
-- A day may be operationally CLOSED while cash settlement is partial/none and
-- inventory reconciliation is pending — unless the company opts a track into
-- BLOCKING the close. Outstanding cash is a carried CUSTODY balance shown
-- separately (never the next day's operational opening cash). ADDITIVE; flag-gated
-- (platform.day_close_approval, OFF). The main request.status stays the operational
-- lifecycle; settlement/reconciliation get their own status + figures.

-- Policy: per-track required / blocking / partial / carry-forward flags.
ALTER TABLE erp_day_close_policies
  ADD COLUMN IF NOT EXISTS settle_required        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconcile_required     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settle_blocks_close    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconcile_blocks_close boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_partial_settlement boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_carry_forward     boolean NOT NULL DEFAULT true;

-- Request: independent settlement + reconciliation statuses and figures. (The
-- existing stock_variance / cash_variance columns remain.)
ALTER TABLE erp_day_close_requests
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'not_required'
    CHECK (settlement_status IN ('not_required','pending','partial','settled')),
  ADD COLUMN IF NOT EXISTS reconcile_status  text NOT NULL DEFAULT 'not_required'
    CHECK (reconcile_status IN ('not_required','pending','partial','reconciled')),
  ADD COLUMN IF NOT EXISTS expected_cash   numeric,
  ADD COLUMN IF NOT EXISTS settled_cash    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_cash numeric,
  ADD COLUMN IF NOT EXISTS expected_stock  numeric,
  ADD COLUMN IF NOT EXISTS counted_stock   numeric;

-- Index for "outstanding cash by salesman" / carry-forward custody queries.
CREATE INDEX IF NOT EXISTS erp_day_close_requests_outstanding_idx
  ON erp_day_close_requests (salesman_id, settlement_status)
  WHERE outstanding_cash IS NOT NULL AND outstanding_cash > 0;
