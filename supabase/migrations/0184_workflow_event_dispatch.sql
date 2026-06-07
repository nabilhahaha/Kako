-- ============================================================================
-- 0184: Workflow Platform V1.1 — C1 at-least-once dispatch tracking
-- ----------------------------------------------------------------------------
-- Additive. Lets the event bus track whether each event was dispatched to
-- workflows, so a tick sweep can drain undispatched events (at-least-once start)
-- instead of relying on best-effort in-request dispatch. Reuses the existing
-- dispatcher + erp_workflow_start — no new engine. Gated OFF by default
-- (KAKO_WF_DISPATCH_SWEEP); when off, dispatch_status defaults to 'done' so
-- behavior is exactly V1 (no sweep, nothing pending). Depends on 0176.
-- ----------------------------------------------------------------------------
-- DEFAULT 'done' is deliberate: existing + flag-off events are treated as already
-- handled; only the flag-on emit path inserts 'pending' for the sweep to drain.
-- ============================================================================

ALTER TABLE erp_events ADD COLUMN IF NOT EXISTS dispatch_status   text NOT NULL DEFAULT 'done';
ALTER TABLE erp_events ADD COLUMN IF NOT EXISTS dispatch_attempts int  NOT NULL DEFAULT 0;
ALTER TABLE erp_events ADD COLUMN IF NOT EXISTS dispatched_at     timestamptz;
ALTER TABLE erp_events ADD COLUMN IF NOT EXISTS dispatch_error    text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_events_dispatch_status_chk') THEN
    ALTER TABLE erp_events ADD CONSTRAINT erp_events_dispatch_status_chk
      CHECK (dispatch_status IN ('pending','done','error'));
  END IF;
END $$;

-- The sweep only scans events not yet 'done'; a small partial index keeps it cheap
-- even as the bus grows.
CREATE INDEX IF NOT EXISTS idx_erp_events_pending_dispatch
  ON erp_events (company_id, seq)
  WHERE dispatch_status <> 'done';

-- Down (manual): drop the index, the constraint, and the four columns.
