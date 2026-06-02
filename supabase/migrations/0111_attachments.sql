-- ============================================================================
-- 0111: ERP Attachments — generic, tenant-scoped, RLS-protected
-- ----------------------------------------------------------------------------
-- A single attachments capability for every entity: polymorphic (entity,
-- record_id) link, company-scoped + RLS, file ownership, audit (created_at +
-- uploaded_by; upload/delete also write erp_audit_logs from the app), and SOFT
-- DELETE (deleted_at/by; storage object retained for a later retention purge).
-- File bytes live in a PRIVATE 'attachments' Storage bucket (signed URLs);
-- metadata + access live here. ADDITIVE; held from production.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL,                      -- registry key: customer/invoice/order/customer_change_request/workflow…
  record_id   TEXT NOT NULL,                      -- linked record id (polymorphic, like workflow instances)
  bucket      TEXT NOT NULL DEFAULT 'attachments',
  path        TEXT NOT NULL,                      -- {company_id}/{entity}/{record_id}/{uuid}.{ext}
  file_name   TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  BIGINT,
  uploaded_by UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,   -- ownership
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),                     -- upload date/time
  deleted_at  TIMESTAMPTZ,                                            -- soft delete
  deleted_by  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL
);
-- Hot path: active attachments for a record. Plus company-time + owner lookups.
CREATE INDEX IF NOT EXISTS idx_attach_record ON erp_attachments(company_id, entity, record_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attach_company_created ON erp_attachments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attach_uploader ON erp_attachments(uploaded_by);

-- RLS + company_id trigger (same pattern as other tenant tables).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_attachments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_attachments_set_company ON erp_attachments';
  EXECUTE 'CREATE TRIGGER erp_attachments_set_company BEFORE INSERT ON erp_attachments FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_attachments_tenant" ON erp_attachments';
  EXECUTE 'CREATE POLICY "erp_attachments_tenant" ON erp_attachments FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Private storage bucket + company-prefixed RLS on storage.objects ─────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Objects are stored under {company_id}/... so the first path folder = the tenant.
-- Read/insert/delete are limited to the user's own company prefix (owner bypass).
DROP POLICY IF EXISTS "erp_attachments_obj_read" ON storage.objects;
CREATE POLICY "erp_attachments_obj_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (erp_is_platform_owner() OR (storage.foldername(name))[1] = erp_user_company_id()::text)
  );

DROP POLICY IF EXISTS "erp_attachments_obj_insert" ON storage.objects;
CREATE POLICY "erp_attachments_obj_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = erp_user_company_id()::text
  );

DROP POLICY IF EXISTS "erp_attachments_obj_delete" ON storage.objects;
CREATE POLICY "erp_attachments_obj_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND (erp_is_platform_owner() OR (storage.foldername(name))[1] = erp_user_company_id()::text)
  );

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "erp_attachments_obj_read"/"_insert"/"_delete" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id='attachments';
-- DROP TABLE IF EXISTS erp_attachments;
