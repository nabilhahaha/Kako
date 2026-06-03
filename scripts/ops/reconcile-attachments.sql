-- ============================================================================
-- Storage ↔ Database attachment reconciliation (DR consistency check).
-- Run AFTER any restore (DB PITR + Storage) and weekly, on staging/production
-- (read-only). Attachments live in Supabase Storage; their metadata lives in
-- erp_attachments. A DB-only restore (or a Storage-only restore) can leave the
-- two out of sync — this finds both directions.
--   psql "$DATABASE_URL" -f scripts/ops/reconcile-attachments.sql
-- ============================================================================

\echo '== 1) MISSING FILES: active DB rows whose Storage object is gone (data loss risk) =='
SELECT a.id, a.company_id, a.entity, a.record_id, a.file_name, a.path, a.created_at
FROM erp_attachments a
LEFT JOIN storage.objects o ON o.bucket_id = a.bucket AND o.name = a.path
WHERE a.deleted_at IS NULL AND o.name IS NULL
ORDER BY a.created_at DESC
LIMIT 200;

\echo '== 2) ORPHAN FILES: Storage objects in the attachments bucket with no active DB row (bloat / mismatch) =='
SELECT o.name, o.bucket_id, o.created_at
FROM storage.objects o
LEFT JOIN erp_attachments a ON a.bucket = o.bucket_id AND a.path = o.name AND a.deleted_at IS NULL
WHERE o.bucket_id = 'attachments' AND a.id IS NULL
ORDER BY o.created_at DESC
LIMIT 200;

\echo '== 3) SUMMARY =='
SELECT
  (SELECT count(*) FROM erp_attachments WHERE deleted_at IS NULL) AS active_db_rows,
  (SELECT count(*) FROM storage.objects WHERE bucket_id='attachments') AS storage_objects,
  (SELECT count(*) FROM erp_attachments a LEFT JOIN storage.objects o
      ON o.bucket_id=a.bucket AND o.name=a.path
     WHERE a.deleted_at IS NULL AND o.name IS NULL) AS missing_files,
  (SELECT count(*) FROM storage.objects o LEFT JOIN erp_attachments a
      ON a.bucket=o.bucket_id AND a.path=o.name AND a.deleted_at IS NULL
     WHERE o.bucket_id='attachments' AND a.id IS NULL) AS orphan_files;

-- Interpretation:
--   missing_files > 0  → P1: files referenced by the app are gone. Restore Storage
--                        to the matching point, or quarantine the rows. Escalate L3.
--   orphan_files  > 0  → cleanup candidates (post-restore residue or hard-deleted
--                        rows). Safe to leave; purge only after confirming.
-- A consistent system: missing_files = 0. Record the result in the ops log.
