-- =====================================================================
-- Roshen KSA — 0012 Persist headers + sample rows on import_batch
--
-- Large files stream raw rows in chunks; the Mapping page must not depend on
-- reading those bulk rows. Store the ordered source headers, a small sample of
-- rows, and the column count on the batch at draft creation so mapping/auto-map
-- works immediately and identically for small and large files.
--
-- Additive only. No data dropped.
-- =====================================================================

alter table import_batch add column if not exists source_headers jsonb;
alter table import_batch add column if not exists sample_rows jsonb;
alter table import_batch add column if not exists column_count int;
