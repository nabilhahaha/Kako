-- ============================================================================
-- PROPOSED MIGRATION — REVIEW ONLY. DO NOT APPLY AUTOMATICALLY.
--
-- Under docs/ on purpose (CI only applies supabase/migrations/). Additive: backs
-- the sync_rows → business-tables reconciliation worker (design §15 P3 / §19).
-- Depends on 0001_sync.sql (sync_rows). Gated at runtime by KAKO_SYNC.
--
-- Review checklist:
--   [ ] Reconcilable entity allow-list matches the hybrid policy (§18).
--   [ ] Retention/pruning for sync_reconcile_log decided.
--   [ ] Service-role worker is the only writer of the ledger (RLS below is the
--       tenant read-guard for the Sync console).
-- ============================================================================

-- 1. Reconciliation ledger — one row per mirror record, the source of truth for
--    "has this offline-created record become a real business row yet?". The PK
--    (company,entity,pk) makes processing exactly-once.
create table if not exists public.sync_reconcile (
  company_id      uuid not null,
  entity          text not null,
  pk              text not null,
  status          text not null default 'pending'
                    check (status in ('pending','done','failed','skipped')),
  business_id     text,                                  -- resulting erp_* row id
  attempts        int  not null default 0,
  last_error      text,
  reason          text,                                  -- e.g. 'no-handler', 'dead-letter'
  next_attempt_at timestamptz not null default now(),    -- backoff gate
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (company_id, entity, pk)
);
create index if not exists sync_reconcile_due_idx
  on public.sync_reconcile (status, next_attempt_at);

-- 2. Append-only audit of every reconciliation attempt (audit trail preserved).
create table if not exists public.sync_reconcile_log (
  id          bigserial primary key,
  company_id  uuid not null,
  entity      text not null,
  pk          text not null,
  status      text not null,                              -- done|failed|dead-letter|skipped
  business_id text,
  attempts    int,
  error       text,
  at          timestamptz not null default now()
);
create index if not exists sync_reconcile_log_feed_idx
  on public.sync_reconcile_log (company_id, entity, pk, at);

-- 3. RLS — tenant read isolation for the Sync console (the worker writes via the
--    service role, which bypasses RLS).
alter table public.sync_reconcile     enable row level security;
alter table public.sync_reconcile_log enable row level security;
create policy sync_reconcile_tenant on public.sync_reconcile
  using (company_id = erp_user_company_id()) with check (company_id = erp_user_company_id());
create policy sync_reconcile_log_tenant on public.sync_reconcile_log
  using (company_id = erp_user_company_id()) with check (company_id = erp_user_company_id());

-- 4. Claim a due batch: mirror rows (sync_rows) for the given reconcilable
--    entities whose ledger row is absent, or pending/failed and past its backoff.
--    Ordered by the mirror's monotonic seq (oldest first). SECURITY DEFINER so the
--    service-role worker can read across the mirror; returns only the fields the
--    engine needs. A NULL ledger row is treated as due (first sight).
create or replace function public.sync_reconcile_due(p_entities text[], p_limit int default 100)
returns table (company_id uuid, entity text, pk text, data jsonb, deleted boolean)
language sql security definer as $$
  select r.company_id, r.entity, r.pk, r.data, r.deleted
  from public.sync_rows r
  left join public.sync_reconcile l
    on l.company_id = r.company_id and l.entity = r.entity and l.pk = r.pk
  where r.entity = any(p_entities)
    and (l.status is null
         or (l.status in ('pending','failed') and l.next_attempt_at <= now()))
  order by r.seq asc
  limit p_limit;
$$;

-- 5. Upsert a ledger outcome + append an audit-log row, atomically.
create or replace function public.sync_reconcile_mark(
  p_company_id uuid, p_entity text, p_pk text, p_status text,
  p_business_id text, p_attempts int, p_error text, p_reason text, p_next_attempt_at timestamptz)
returns void language plpgsql security definer as $$
begin
  insert into public.sync_reconcile (company_id, entity, pk, status, business_id, attempts, last_error, reason, next_attempt_at, updated_at)
  values (p_company_id, p_entity, p_pk, p_status, p_business_id, coalesce(p_attempts,0), p_error, p_reason, coalesce(p_next_attempt_at, now()), now())
  on conflict (company_id, entity, pk) do update
    set status = excluded.status, business_id = coalesce(excluded.business_id, public.sync_reconcile.business_id),
        attempts = excluded.attempts, last_error = excluded.last_error, reason = excluded.reason,
        next_attempt_at = excluded.next_attempt_at, updated_at = now();

  insert into public.sync_reconcile_log (company_id, entity, pk, status, business_id, attempts, error)
  values (p_company_id, p_entity, p_pk, p_status, p_business_id, p_attempts, p_error);
end;
$$;

-- Down (manual): drop function sync_reconcile_mark, sync_reconcile_due;
--                drop table sync_reconcile_log, sync_reconcile;
