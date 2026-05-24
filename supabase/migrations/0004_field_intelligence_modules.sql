-- Field Intelligence modules (Roshen PRD)
-- Safe to re-run: all statements are idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dynamic_form_fields — admin-managed dynamic form builder
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dynamic_form_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key    text NOT NULL,
  field_key   text NOT NULL,
  field_type  text NOT NULL
                CHECK (field_type IN (
                  'text', 'number', 'dropdown', 'multi_select',
                  'date', 'time', 'photo', 'gps', 'toggle',
                  'rating', 'notes'
                )),
  label       text NOT NULL,
  label_ar    text,
  section     text,
  options     jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_key, field_key)
);

CREATE INDEX IF NOT EXISTS dynamic_form_fields_form_key_idx
  ON public.dynamic_form_fields(form_key);
CREATE INDEX IF NOT EXISTS dynamic_form_fields_sort_idx
  ON public.dynamic_form_fields(form_key, sort_order);

ALTER TABLE public.dynamic_form_fields ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active fields
DROP POLICY IF EXISTS "dynamic_form_fields_authed_read" ON public.dynamic_form_fields;
CREATE POLICY "dynamic_form_fields_authed_read"
  ON public.dynamic_form_fields FOR SELECT
  USING (
    is_active = true
    AND auth.role() = 'authenticated'
  );

-- Admins have full CRUD
DROP POLICY IF EXISTS "dynamic_form_fields_admin_all" ON public.dynamic_form_fields;
CREATE POLICY "dynamic_form_fields_admin_all"
  ON public.dynamic_form_fields FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.user_type = 'admin_relia'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.user_type = 'admin_relia'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dynamic_form_responses — answers submitted against dynamic fields
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dynamic_form_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key     text NOT NULL,
  entity_id    uuid NOT NULL,
  field_key    text NOT NULL,
  value_text   text,
  value_number numeric,
  value_json   jsonb,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dynamic_form_responses_entity_idx
  ON public.dynamic_form_responses(form_key, entity_id);
CREATE INDEX IF NOT EXISTS dynamic_form_responses_field_idx
  ON public.dynamic_form_responses(form_key, field_key);

ALTER TABLE public.dynamic_form_responses ENABLE ROW LEVEL SECURITY;

-- Users can insert their own responses
DROP POLICY IF EXISTS "dynamic_form_responses_insert_own" ON public.dynamic_form_responses;
CREATE POLICY "dynamic_form_responses_insert_own"
  ON public.dynamic_form_responses FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Users can read their own responses
DROP POLICY IF EXISTS "dynamic_form_responses_select_own" ON public.dynamic_form_responses;
CREATE POLICY "dynamic_form_responses_select_own"
  ON public.dynamic_form_responses FOR SELECT
  USING (created_by = auth.uid());

-- Admins and supervisors can read all responses
DROP POLICY IF EXISTS "dynamic_form_responses_admin_supervisor_read" ON public.dynamic_form_responses;
CREATE POLICY "dynamic_form_responses_admin_supervisor_read"
  ON public.dynamic_form_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN (
          'admin_relia', 'presales_supervisor', 'cashvan_supervisor',
          'regional_manager_roshen'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. competitor_reports — competitor intelligence captured during visits
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitor_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id              uuid REFERENCES public.visits(id) ON DELETE CASCADE,
  competitor_name       text NOT NULL,
  competitor_products   text,
  competitor_promotions text,
  competitor_pricing    text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitor_reports_visit_idx
  ON public.competitor_reports(visit_id);
CREATE INDEX IF NOT EXISTS competitor_reports_competitor_name_idx
  ON public.competitor_reports(competitor_name);

ALTER TABLE public.competitor_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert competitor reports for their own visits
DROP POLICY IF EXISTS "competitor_reports_insert_own_visit" ON public.competitor_reports;
CREATE POLICY "competitor_reports_insert_own_visit"
  ON public.competitor_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = competitor_reports.visit_id AND v.user_id = auth.uid()
    )
  );

-- Users can read their own reports
DROP POLICY IF EXISTS "competitor_reports_select_own" ON public.competitor_reports;
CREATE POLICY "competitor_reports_select_own"
  ON public.competitor_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = competitor_reports.visit_id AND v.user_id = auth.uid()
    )
  );

-- Admins and managers can read all competitor reports
DROP POLICY IF EXISTS "competitor_reports_admin_manager_read" ON public.competitor_reports;
CREATE POLICY "competitor_reports_admin_manager_read"
  ON public.competitor_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN (
          'admin_relia', 'regional_manager_roshen',
          'trade_marketing_manager', 'presales_supervisor',
          'cashvan_supervisor'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. competitor_photos — photos attached to competitor reports
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitor_photos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_report_id uuid NOT NULL REFERENCES public.competitor_reports(id) ON DELETE CASCADE,
  photo_url            text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitor_photos_report_idx
  ON public.competitor_photos(competitor_report_id);

ALTER TABLE public.competitor_photos ENABLE ROW LEVEL SECURITY;

-- Users can insert photos for their own competitor reports
DROP POLICY IF EXISTS "competitor_photos_insert_own" ON public.competitor_photos;
CREATE POLICY "competitor_photos_insert_own"
  ON public.competitor_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.competitor_reports cr
      JOIN public.visits v ON v.id = cr.visit_id
      WHERE cr.id = competitor_photos.competitor_report_id
        AND v.user_id = auth.uid()
    )
  );

-- Users can read photos for their own competitor reports
DROP POLICY IF EXISTS "competitor_photos_select_own" ON public.competitor_photos;
CREATE POLICY "competitor_photos_select_own"
  ON public.competitor_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.competitor_reports cr
      JOIN public.visits v ON v.id = cr.visit_id
      WHERE cr.id = competitor_photos.competitor_report_id
        AND v.user_id = auth.uid()
    )
  );

-- Admins and managers can read all competitor photos
DROP POLICY IF EXISTS "competitor_photos_admin_manager_read" ON public.competitor_photos;
CREATE POLICY "competitor_photos_admin_manager_read"
  ON public.competitor_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN (
          'admin_relia', 'regional_manager_roshen',
          'trade_marketing_manager', 'presales_supervisor',
          'cashvan_supervisor'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. action_plans — follow-up actions linked to visits/customers
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.action_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id             uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  customer_id          uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  action_description   text NOT NULL,
  responsible_person   text,
  responsible_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_date             date,
  priority             text NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at         timestamptz,
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_plans_customer_idx
  ON public.action_plans(customer_id);
CREATE INDEX IF NOT EXISTS action_plans_visit_idx
  ON public.action_plans(visit_id);
CREATE INDEX IF NOT EXISTS action_plans_status_idx
  ON public.action_plans(status);
CREATE INDEX IF NOT EXISTS action_plans_responsible_idx
  ON public.action_plans(responsible_user_id);
CREATE INDEX IF NOT EXISTS action_plans_due_date_idx
  ON public.action_plans(due_date);

ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;

-- Creators can read and update their own action plans
DROP POLICY IF EXISTS "action_plans_creator_access" ON public.action_plans;
CREATE POLICY "action_plans_creator_access"
  ON public.action_plans FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Responsible users can read and update action plans assigned to them
DROP POLICY IF EXISTS "action_plans_responsible_access" ON public.action_plans;
CREATE POLICY "action_plans_responsible_access"
  ON public.action_plans FOR ALL
  USING (responsible_user_id = auth.uid())
  WITH CHECK (responsible_user_id = auth.uid());

-- Admins can read all action plans
DROP POLICY IF EXISTS "action_plans_admin_read" ON public.action_plans;
CREATE POLICY "action_plans_admin_read"
  ON public.action_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN (
          'admin_relia', 'regional_manager_roshen',
          'presales_supervisor', 'cashvan_supervisor'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 6. visit_product_checks — product availability captured during visits
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_product_checks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id            uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_available        boolean NOT NULL DEFAULT true,
  stock_level         text CHECK (stock_level IN ('full', 'low', 'out_of_stock')),
  shelf_share_percent integer,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visit_product_checks_visit_idx
  ON public.visit_product_checks(visit_id);
CREATE INDEX IF NOT EXISTS visit_product_checks_product_idx
  ON public.visit_product_checks(product_id);

ALTER TABLE public.visit_product_checks ENABLE ROW LEVEL SECURITY;

-- Users can insert product checks for their own visits
DROP POLICY IF EXISTS "visit_product_checks_insert_own" ON public.visit_product_checks;
CREATE POLICY "visit_product_checks_insert_own"
  ON public.visit_product_checks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_product_checks.visit_id AND v.user_id = auth.uid()
    )
  );

-- Users can read product checks for their own visits or supervised reps
DROP POLICY IF EXISTS "visit_product_checks_select_own_or_supervised" ON public.visit_product_checks;
CREATE POLICY "visit_product_checks_select_own_or_supervised"
  ON public.visit_product_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      JOIN public.users u ON u.id = v.user_id
      WHERE v.id = visit_product_checks.visit_id
        AND (
          v.user_id = auth.uid()
          OR u.supervisor_id = auth.uid()
        )
    )
  );

-- Admins can read all product checks
DROP POLICY IF EXISTS "visit_product_checks_admin_read" ON public.visit_product_checks;
CREATE POLICY "visit_product_checks_admin_read"
  ON public.visit_product_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN ('admin_relia', 'regional_manager_roshen')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 7. visit_issues — pricing/display/distribution issues per visit
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_issues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  issue_type  text NOT NULL
                CHECK (issue_type IN ('pricing', 'display', 'visibility', 'distribution', 'other')),
  description text NOT NULL,
  severity    text NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('low', 'medium', 'high')),
  photo_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visit_issues_visit_idx
  ON public.visit_issues(visit_id);
CREATE INDEX IF NOT EXISTS visit_issues_type_idx
  ON public.visit_issues(issue_type);

ALTER TABLE public.visit_issues ENABLE ROW LEVEL SECURITY;

-- Users can insert issues for their own visits
DROP POLICY IF EXISTS "visit_issues_insert_own" ON public.visit_issues;
CREATE POLICY "visit_issues_insert_own"
  ON public.visit_issues FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_issues.visit_id AND v.user_id = auth.uid()
    )
  );

-- Users can read issues for their own visits or supervised reps
DROP POLICY IF EXISTS "visit_issues_select_own_or_supervised" ON public.visit_issues;
CREATE POLICY "visit_issues_select_own_or_supervised"
  ON public.visit_issues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      JOIN public.users u ON u.id = v.user_id
      WHERE v.id = visit_issues.visit_id
        AND (
          v.user_id = auth.uid()
          OR u.supervisor_id = auth.uid()
        )
    )
  );

-- Admins can read all issues
DROP POLICY IF EXISTS "visit_issues_admin_read" ON public.visit_issues;
CREATE POLICY "visit_issues_admin_read"
  ON public.visit_issues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_type IN ('admin_relia', 'regional_manager_roshen')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 8. sync_logs — offline-first sync tracking per user
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entity        text NOT NULL,
  entity_id     uuid,
  action        text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
  error_message text,
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  synced_at     timestamptz
);

CREATE INDEX IF NOT EXISTS sync_logs_user_idx
  ON public.sync_logs(user_id);
CREATE INDEX IF NOT EXISTS sync_logs_status_idx
  ON public.sync_logs(status);
CREATE INDEX IF NOT EXISTS sync_logs_user_status_idx
  ON public.sync_logs(user_id, status);
CREATE INDEX IF NOT EXISTS sync_logs_created_at_idx
  ON public.sync_logs(created_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own sync logs
DROP POLICY IF EXISTS "sync_logs_own_access" ON public.sync_logs;
CREATE POLICY "sync_logs_own_access"
  ON public.sync_logs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- Storage bucket for competitor photos
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('competitor-photos', 'competitor-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "competitor_photos_public_read" ON storage.objects;
CREATE POLICY "competitor_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'competitor-photos');

DROP POLICY IF EXISTS "competitor_photos_authed_insert" ON storage.objects;
CREATE POLICY "competitor_photos_authed_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'competitor-photos'
    AND auth.role() = 'authenticated'
  );
