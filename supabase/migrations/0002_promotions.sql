-- Phase 4 schema additions
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- Promotions (trade marketing campaigns)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promotions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  name_ar         text,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  channel_types   text[] NOT NULL DEFAULT '{}',
  product_ids     uuid[] NOT NULL DEFAULT '{}',
  expected_roi    numeric,
  actual_roi      numeric,
  trade_spend     numeric,
  notes           text,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promotions_status_idx ON public.promotions(status);
CREATE INDEX IF NOT EXISTS promotions_dates_idx
  ON public.promotions(start_date, end_date);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotions_authed_read" ON public.promotions;
CREATE POLICY "promotions_authed_read"
  ON public.promotions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "promotions_trade_marketing_write" ON public.promotions;
CREATE POLICY "promotions_trade_marketing_write"
  ON public.promotions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN ('trade_marketing_manager', 'admin_relia')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN ('trade_marketing_manager', 'admin_relia')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Status values for the multi-stage near-expiry flow
-- ─────────────────────────────────────────────────────────────────────────
-- The flow:
--   pending → (supervisor approves) → supervisor_approved
--   supervisor_approved → (regional approves) → approved
--   any → (anyone rejects) → rejected
--
-- This block only documents the convention; it doesn't constrain values
-- (the column may be free-text in your existing schema).
COMMENT ON COLUMN public.near_expiry_records.status IS
  'pending | supervisor_approved | approved | rejected';
