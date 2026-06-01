-- ============================================================================
-- Demo tenant cleanup — ARCHIVE (suspend) junk/test tenants for clean demos
-- ----------------------------------------------------------------------------
-- Demo-readiness only. NON-DESTRUCTIVE and REVERSIBLE: sets is_active = false
-- (the platform's existing "suspended" state) on junk/test tenants so they drop
-- out of the active demo surface, WITHOUT deleting any data. Re-enable any tenant
-- by setting is_active = true again.
--
-- Keeps ACTIVE: one clean demo tenant per vertical (curated allow-list below),
-- with Demo Electric as the primary demo environment.
--
-- SAFETY:
--   * No DELETE. No schema change. No tenant data touched beyond is_active.
--   * Idempotent (re-running is a no-op).
--   * Review the KEEP allow-list before applying. Production apply held for
--     approval per the standing process.
-- ============================================================================

-- Curated KEEP list — one clean, populated tenant per vertical for demos.
-- (Demo Electric is the primary; the rest give a clean per-vertical walkthrough.)
WITH keep AS (
  SELECT unnest(ARRAY[
    '6541791e-0f81-4a11-9f61-51aa34db7ace',  -- Demo Electric (PRIMARY — electrical)
    '1a1dfb3b-9d5c-4a41-9e59-0dbcf3829731',  -- Demo Wholesale (FMCG/distribution demo)
    '038ef2a1-c751-429c-a9cf-e8e5688f0a4f',  -- عيادة الحياة (clinic demo)
    'db7aba41-321b-4c3f-bd7c-d5fe3ea55130',  -- صيدلية الشفاء (pharmacy demo)
    '559a2cab-8268-481a-8d17-db1a5ffb57f5',  -- مطعم اللقمة الهنية (restaurant demo)
    'eea15054-f99e-41c2-8e8d-1f3ae02a1846',  -- صالون الجمال (salon demo)
    '20ce97cb-7d46-4ec0-b6b5-db4d0271a7fb',  -- مغسلة النظافة (laundry demo)
    '7c624884-7d6b-4cee-a81d-59dc97f40306',  -- سوبر ماركت الخير (supermarket demo)
    '5487c3c7-cac6-4d00-9926-0505080dbe6d'   -- فندق النيل (hotel demo)
  ]::uuid[]) AS id
)
-- Archive (suspend) every OTHER tenant: junk/test/empty/duplicate companies.
UPDATE erp_companies c
SET is_active = false
WHERE c.id NOT IN (SELECT id FROM keep)
  AND c.is_active = true;

-- Ensure all KEEP tenants are active (idempotent).
UPDATE erp_companies c
SET is_active = true
WHERE c.id IN (
    '6541791e-0f81-4a11-9f61-51aa34db7ace','1a1dfb3b-9d5c-4a41-9e59-0dbcf3829731',
    '038ef2a1-c751-429c-a9cf-e8e5688f0a4f','db7aba41-321b-4c3f-bd7c-d5fe3ea55130',
    '559a2cab-8268-481a-8d17-db1a5ffb57f5','eea15054-f99e-41c2-8e8d-1f3ae02a1846',
    '20ce97cb-7d46-4ec0-b6b5-db4d0271a7fb','7c624884-7d6b-4cee-a81d-59dc97f40306',
    '5487c3c7-cac6-4d00-9926-0505080dbe6d'
  )
  AND c.is_active = false;
