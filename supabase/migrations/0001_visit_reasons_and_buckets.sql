-- Phase 2/3 schema additions
-- Safe to re-run: all statements are idempotent.
--
-- Run this once in: Supabase Dashboard → SQL Editor → New query → paste → Run

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Join table: visits ↔ visit_reasons_master
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_reasons (
  visit_id   uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  reason_id  uuid NOT NULL REFERENCES public.visit_reasons_master(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visit_id, reason_id)
);

CREATE INDEX IF NOT EXISTS visit_reasons_reason_id_idx
  ON public.visit_reasons(reason_id);

ALTER TABLE public.visit_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_reasons_select_own_or_supervised" ON public.visit_reasons;
CREATE POLICY "visit_reasons_select_own_or_supervised"
  ON public.visit_reasons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      JOIN public.users u ON u.id = v.user_id
      WHERE v.id = visit_reasons.visit_id
        AND (
          v.user_id = auth.uid()
          OR u.supervisor_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "visit_reasons_insert_own_visit" ON public.visit_reasons;
CREATE POLICY "visit_reasons_insert_own_visit"
  ON public.visit_reasons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_reasons.visit_id AND v.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Storage buckets
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-photos', 'visit-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('near-expiry-photos', 'near-expiry-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Public read, authenticated insert
DROP POLICY IF EXISTS "fieldsync_photos_public_read" ON storage.objects;
CREATE POLICY "fieldsync_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('visit-photos', 'near-expiry-photos'));

DROP POLICY IF EXISTS "fieldsync_photos_authed_insert" ON storage.objects;
CREATE POLICY "fieldsync_photos_authed_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('visit-photos', 'near-expiry-photos')
    AND auth.role() = 'authenticated'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Realtime publication for the supervisor live map
-- ─────────────────────────────────────────────────────────────────────────
-- Adds visits to the supabase_realtime publication if not already there.
-- Wrapped in DO so re-runs don't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'visits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
  END IF;
END
$$;
