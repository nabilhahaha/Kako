-- Phase 5: lightweight audit log
-- Insert from the application layer when an admin/supervisor performs
-- a meaningful action (CRUD on users/products, approvals, uploads).

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs(entity);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin_relia'
    )
  );

DROP POLICY IF EXISTS "audit_logs_authed_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_authed_insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (actor_id = auth.uid());
