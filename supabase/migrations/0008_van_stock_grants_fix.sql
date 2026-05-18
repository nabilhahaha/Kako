-- 0008 — Van Stock RLS / grants hardening
--
-- Fixes "permission denied for table van_stock_uploads" that surfaces when
-- the GRANT statements from 0007 didn't take effect (e.g. the migration was
-- run in pieces, a prior statement aborted the transaction, or the project
-- was provisioned before the role grants existed).
--
-- This script is idempotent — re-running it is safe. It re-applies every
-- privilege needed by the van-stock feature and re-declares each policy.

-- ─── 1. Schema usage (Supabase grants this by default, but make sure) ──────
grant usage on schema public to authenticated;
grant usage on schema public to anon;

-- ─── 2. Table-level privileges ─────────────────────────────────────────────
grant select, insert         on public.van_stock_uploads to authenticated;
grant select, insert, delete on public.van_stock         to authenticated;

-- ─── 3. RLS — re-declare every policy idempotently ─────────────────────────
alter table public.van_stock_uploads enable row level security;
alter table public.van_stock         enable row level security;

drop policy if exists "van_stock_uploads select" on public.van_stock_uploads;
create policy "van_stock_uploads select" on public.van_stock_uploads
  for select to authenticated using (true);

drop policy if exists "van_stock_uploads insert by RM/TM" on public.van_stock_uploads;
create policy "van_stock_uploads insert by RM/TM" on public.van_stock_uploads
  for insert to authenticated with check (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
  );

drop policy if exists "van_stock select" on public.van_stock;
create policy "van_stock select" on public.van_stock
  for select to authenticated using (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid()
                 and p.role = 'salesman'
                 and p.is_active
                 and p.warehouse_code = van_stock.warehouse_code)
  );

drop policy if exists "van_stock insert by RM/TM" on public.van_stock;
create policy "van_stock insert by RM/TM" on public.van_stock
  for insert to authenticated with check (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
  );

drop policy if exists "van_stock delete by RM/TM" on public.van_stock;
create policy "van_stock delete by RM/TM" on public.van_stock
  for delete to authenticated using (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
  );

-- ─── 4. Sanity check (run manually after the script to verify) ─────────────
-- SELECT
--   has_table_privilege('authenticated', 'public.van_stock_uploads', 'INSERT') AS can_insert_uploads,
--   has_table_privilege('authenticated', 'public.van_stock',         'INSERT') AS can_insert_stock,
--   has_table_privilege('authenticated', 'public.van_stock',         'SELECT') AS can_select_stock;
--
-- All three should return true. If can_insert_uploads is false, the GRANT in
-- step 2 above didn't run. Re-run step 2 in isolation.
