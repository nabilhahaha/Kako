-- 0011 — Damage requests UPDATE policy fix
--
-- The 0010 migration created the TM update policy with only a USING clause:
--
--   for update to authenticated using (
--     status = 'submitted'
--     and exists (... role = 'trade_marketing' ...)
--   );
--
-- Postgres' default behaviour when WITH CHECK is omitted is to apply the
-- USING expression to the new row too. After TM flips the status from
-- 'submitted' to 'tm_approved' / 'tm_rejected', the new row's status no
-- longer matches the policy → 'new row violates row-level security policy
-- for table damage_requests'.
--
-- Fix: explicit WITH CHECK that only confirms the caller is still a TM.
-- Write-once is preserved because USING still gates by status='submitted'
-- on the row being modified.

drop policy if exists "damage_requests update by TM" on public.damage_requests;
create policy "damage_requests update by TM" on public.damage_requests
  for update to authenticated
  using (
    status = 'submitted'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'trade_marketing'
        and is_active
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'trade_marketing'
        and is_active
    )
  );

-- Sanity (run after the policy is applied):
-- SELECT policyname, qual, with_check FROM pg_policies
-- WHERE tablename = 'damage_requests' AND policyname = 'damage_requests update by TM';
