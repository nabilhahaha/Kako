-- ============================================================================
-- 0151: Pre-pilot hardening (PR-1) — date-range indexes + storage limits
-- ----------------------------------------------------------------------------
-- The FK/attribution indexes already exist (0068_perf_indexes). What the new
-- commercial sales-facts view adds is company-wide DATE-RANGE scanning over
-- invoices/orders; these composite (branch_id, created_at) indexes serve that
-- (the view joins branch→company then filters created_at between from/to).
-- Also tightens Storage: photo buckets get a size cap + image-only mime allow-list.
-- ============================================================================

-- ── Date-range scan support for erp_cp_sales_facts ─────────────────────────
create index if not exists idx_erp_invoices_branch_created on erp_invoices(branch_id, created_at);
create index if not exists idx_erp_invoices_created on erp_invoices(created_at);
create index if not exists idx_erp_sales_orders_branch_created on erp_sales_orders(branch_id, created_at);
create index if not exists idx_erp_sales_orders_created on erp_sales_orders(created_at);
-- alert/commission/incentive period lookups already covered by 0136/0144/0145 indexes.

-- ── Storage hardening: cap photo size + restrict to images ─────────────────
-- Guarded: the local test-bootstrap stub of storage.buckets lacks these columns,
-- so we only apply on a real Supabase (where the columns exist).
do $$
declare v_has_size boolean; v_has_mime boolean;
begin
  if to_regclass('storage.buckets') is null then return; end if;
  select exists(select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='file_size_limit') into v_has_size;
  select exists(select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types') into v_has_mime;
  if v_has_size then
    execute $u$update storage.buckets set file_size_limit = 10485760 where id in ('field-evidence','visit-photos','near-expiry-photos')$u$;  -- 10 MB
  end if;
  if v_has_mime then
    execute $u$update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id in ('field-evidence','visit-photos','near-expiry-photos')$u$;
  end if;
end $$;

-- ============================================================================
-- ROLLBACK (manual): drop the four idx_erp_*_created* indexes; reset the bucket
-- file_size_limit / allowed_mime_types to null.
-- ============================================================================
