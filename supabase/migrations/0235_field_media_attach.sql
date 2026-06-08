-- ============================================================================
-- 0235: Field media attach — offline-capable visit photos
-- ----------------------------------------------------------------------------
-- Step 1 (Mobile Field Client). Two additive changes:
--
--  1. A dedicated 'field.attach_media' permission, granted to the field roles
--     (salesman, driver). Field reps usually lack 'customers.manage' (the generic
--     attachment gate), so this narrowly authorizes them to attach photos to a
--     visit/customer they are servicing — the offline-media intake checks it.
--
--  2. erp_attachments gains `client_ref` (the device-generated id of the queued
--     photo) + a partial UNIQUE index, so a media upload retried after a lost
--     response is idempotent (no duplicate attachment). NULL for normal uploads.
--
-- Additive + idempotent. Depends on 0043 (field.sales pattern), 0111 (attachments).
-- ============================================================================

-- 1 ── new permission, seeded to the field roles (template + existing tenants) ─
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('salesman','field.attach_media'),
  ('driver','field.attach_media')
ON CONFLICT DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'field.attach_media'
FROM erp_company_roles cr
WHERE cr.role_key IN ('salesman','driver') AND cr.enabled
ON CONFLICT DO NOTHING;

-- 2 ── idempotent media upload key on attachments ────────────────────────────
ALTER TABLE erp_attachments ADD COLUMN IF NOT EXISTS client_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_attachments_client_ref
  ON erp_attachments (company_id, client_ref)
  WHERE client_ref IS NOT NULL;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uq_erp_attachments_client_ref;
-- ALTER TABLE erp_attachments DROP COLUMN IF EXISTS client_ref;
-- DELETE FROM erp_company_role_permissions WHERE permission='field.attach_media';
-- DELETE FROM erp_role_permissions WHERE permission='field.attach_media';
