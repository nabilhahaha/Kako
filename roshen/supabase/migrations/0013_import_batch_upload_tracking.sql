-- =====================================================================
-- Roshen KSA — 0013 Upload tracking on import_batch
--
-- Supports background/resumable large-file uploads: progress + lifecycle is
-- persisted on the batch so a global indicator can show status and the user
-- can navigate away while chunks stream. Cancelled/failed/partial batches
-- never affect sales_fact or SLA (only status='imported' counts).
--
-- Additive only. No data dropped.
-- =====================================================================

alter table import_batch add column if not exists upload_status text;            -- preparing|uploading|paused|completed|failed|cancelled
alter table import_batch add column if not exists uploaded_rows_count int;
alter table import_batch add column if not exists total_rows_count int;
alter table import_batch add column if not exists upload_progress_percent int;
alter table import_batch add column if not exists current_upload_stage text;
alter table import_batch add column if not exists cancelled_by uuid references profile(id) on delete set null;
alter table import_batch add column if not exists cancelled_at timestamptz;
alter table import_batch add column if not exists failed_reason text;
alter table import_batch add column if not exists last_successful_row_index int;
alter table import_batch add column if not exists completed_at timestamptz;
