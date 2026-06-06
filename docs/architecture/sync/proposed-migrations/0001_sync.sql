-- ============================================================================
-- PROPOSED MIGRATION — REVIEW ONLY. DO NOT APPLY AUTOMATICALLY.
--
-- This file lives under docs/ (NOT supabase/migrations/) ON PURPOSE: the CI
-- "Apply migrations to STAGING" job only runs files under supabase/migrations/,
-- so nothing here touches any database until a human moves/applies it.
--
-- Backs the offline-safe /api/sync endpoint (design §15). Everything is additive
-- (new tables + functions); it does not alter or read existing business tables,
-- so it cannot change current production behavior. Gated at runtime by KAKO_SYNC.
--
-- Review checklist before applying:
--   [ ] RLS policies below match the tenant model (company scoping).
--   [ ] `sync_commit` optimistic-version semantics acceptable.
--   [ ] Retention/pruning policy for sync_ingest decided.
--   [ ] Whether sync_rows is the source of truth or a mirror reconciled to the
--       business tables (P3) — see design §15.
-- ============================================================================

-- 1. Idempotency ledger — exactly-once: a client_op_id is applied at most once.
create table if not exists public.sync_ingest (
  client_op_id uuid primary key,
  company_id   uuid not null,
  entity       text not null,
  pk           text not null,
  applied_at   timestamptz not null default now()
);
create index if not exists sync_ingest_company_idx on public.sync_ingest (company_id, entity);

-- 2. Cloud mirror — one row per (company, entity, pk), with a monotonic seq used
--    as the pull cursor. Decouples sync from each business table's schema.
create table if not exists public.sync_rows (
  company_id uuid    not null,
  entity     text    not null,
  pk         text    not null,
  version    integer not null default 1,
  updated_at bigint  not null,                 -- client/server epoch ms (LWW input)
  origin     text    not null default 'cloud',
  deleted    boolean not null default false,
  data       jsonb   not null default '{}'::jsonb,
  seq        bigserial,                          -- pull cursor (monotonic)
  primary key (company_id, entity, pk)
);
create index if not exists sync_rows_feed_idx on public.sync_rows (company_id, entity, seq);

-- 3. Rows parked for human resolution (inventory counts conflict workflow §14).
--    Stores BOTH the proposed (counted/local) value and the current cloud value
--    so an admin can resolve from the Sync console without the client present.
create table if not exists public.sync_review (
  id             bigserial primary key,
  company_id     uuid not null,
  entity         text not null,
  pk             text not null,
  client_op_id   uuid not null,
  base_version   integer,
  proposed       jsonb not null default '{}'::jsonb,   -- local counted value
  remote_version integer not null default 0,
  remote         jsonb not null default '{}'::jsonb,   -- cloud value at park time
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolution     text                                   -- 'keep-local' | 'keep-cloud'
);

-- 4. Atomic apply: upsert the mirror row AND record ingest in one statement, so a
--    crash can never record ingest without the row (or vice-versa). Optimistic:
--    callers pass the new version; a stale write is rejected by the PK + the
--    caller's prior getRemote check. Returns the stored version.
create or replace function public.sync_commit(p_company_id uuid, p_row jsonb, p_ingest jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare v_version integer;
begin
  insert into public.sync_rows (company_id, entity, pk, version, updated_at, origin, deleted, data)
  values (
    p_company_id,
    p_row->>'entity', p_row->>'pk', (p_row->>'version')::int,
    (p_row->>'updated_at')::bigint, 'cloud', (p_row->>'deleted')::boolean,
    coalesce(p_row->'data', '{}'::jsonb)
  )
  on conflict (company_id, entity, pk) do update
    set version = excluded.version, updated_at = excluded.updated_at,
        deleted = excluded.deleted, data = excluded.data, seq = nextval('public.sync_rows_seq_seq')
  returning version into v_version;

  insert into public.sync_ingest (client_op_id, company_id, entity, pk)
  values ((p_ingest->>'client_op_id')::uuid, p_company_id, p_ingest->>'entity', p_ingest->>'pk')
  on conflict (client_op_id) do nothing;   -- exactly-once even on a racing retry

  return jsonb_build_object('version', v_version);
end;
$$;

create or replace function public.sync_flag_review(
  p_company_id uuid, p_entity text, p_pk text, p_client_op_id uuid,
  p_base_version integer, p_proposed jsonb, p_remote_version integer, p_remote jsonb)
returns void language sql security definer as $$
  insert into public.sync_review (company_id, entity, pk, client_op_id, base_version, proposed, remote_version, remote)
  values (p_company_id, p_entity, p_pk, p_client_op_id, p_base_version, p_proposed, p_remote_version, p_remote);
$$;

-- 5. RLS — tenant isolation. Each row is readable/writable only within the user's
--    company (reusing the app's erp_user_company_id() helper).
alter table public.sync_ingest enable row level security;
alter table public.sync_rows   enable row level security;
alter table public.sync_review enable row level security;

create policy sync_ingest_tenant on public.sync_ingest
  using (company_id = erp_user_company_id()) with check (company_id = erp_user_company_id());
create policy sync_rows_tenant on public.sync_rows
  using (company_id = erp_user_company_id()) with check (company_id = erp_user_company_id());
create policy sync_review_tenant on public.sync_review
  using (company_id = erp_user_company_id()) with check (company_id = erp_user_company_id());

-- 6. OUTBOX CAPTURE VIA DB TRIGGERS (decision §7) — server/desktop path.
--    For the bundled-Postgres desktop edition (and any server-authoritative
--    deployment), mutations are captured by an AFTER trigger that mirrors the
--    row into sync_rows with a fresh client_op_id, instead of the browser write-
--    seam. This is a TEMPLATE: attach it per synced table once column conventions
--    (company_id, id) are confirmed. Append-only entities skip UPDATE/DELETE.
--
-- create or replace function public.sync_capture() returns trigger
-- language plpgsql as $$
-- declare v_company uuid; v_pk text; v_data jsonb; v_deleted boolean;
-- begin
--   v_deleted := (tg_op = 'DELETE');
--   v_data    := to_jsonb(case when v_deleted then old else new end);
--   v_company := (v_data->>'company_id')::uuid;
--   v_pk      := v_data->>'id';
--   insert into public.sync_rows (company_id, entity, pk, version, updated_at, origin, deleted, data)
--   values (v_company, tg_argv[0], v_pk,
--           coalesce((select version from public.sync_rows
--                     where company_id=v_company and entity=tg_argv[0] and pk=v_pk), 0) + 1,
--           (extract(epoch from now())*1000)::bigint, 'local', v_deleted, v_data)
--   on conflict (company_id, entity, pk) do update
--     set version=excluded.version, updated_at=excluded.updated_at,
--         deleted=excluded.deleted, data=excluded.data, seq=nextval('public.sync_rows_seq_seq');
--   return null;
-- end; $$;
-- -- Attach per table, e.g.:
-- --   create trigger sync_capture_orders after insert or update or delete on public.erp_orders
-- --     for each row execute function public.sync_capture('orders');
--
-- NOTE (review): triggers fire inside the writing txn; keep sync_capture cheap.
-- Append-only tables (visits/orders/audit_logs) should attach AFTER INSERT only.

-- Down (manual): drop function sync_commit, sync_flag_review, sync_capture;
--                drop table sync_review, sync_rows, sync_ingest;
