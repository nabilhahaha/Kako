-- ============================================================================
-- 0091: Data Integration Phase 2A — API Keys + Inbound API log (Core Platform).
-- ----------------------------------------------------------------------------
-- Per-company API keys (hashed at rest, scoped, revocable, rate-limited) and the
-- integration call log that powers the inbound REST API (/api/v1). Entity-based,
-- RLS-first, additive + idempotent. Webhooks (2B) and connectors/sync (2C) are
-- separate later migrations. See docs/INTEGRATION.md §4–6.
-- ============================================================================

create extension if not exists pgcrypto;   -- digest() + gen_random_bytes()

-- ── Per-company API keys ─────────────────────────────────────────────────────
-- Plaintext is shown ONCE on creation and never stored; only the sha256 hash is
-- kept. `prefix` is a non-secret display fragment (e.g. "vtk_live_8f3a…") for
-- lists/logs. `scopes` are entity-based: '{entity}:read' / '{entity}:write'.
create table if not exists erp_api_keys (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references erp_companies(id) on delete cascade,
  name         text not null,
  prefix       text not null,                          -- display only (not secret)
  key_hash     bytea not null,                         -- sha256(plaintext); unique
  scopes       text[] not null default '{}',           -- e.g. {customer:write,product:read}
  last_used_at timestamptz,
  is_active    boolean not null default true,
  created_by   uuid references erp_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  unique (key_hash)
);
create index if not exists idx_api_keys_company on erp_api_keys(company_id);

-- ── Integration call log (inbound now; reused by webhooks 2B / sync 2C) ───────
-- Doubles as the integration audit trail. The trailing-window row count per
-- api_key_id drives rate limiting (no separate counter table).
create table if not exists erp_integration_logs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  api_key_id    uuid references erp_api_keys(id) on delete set null,
  direction     text not null check (direction in ('inbound','outbound')),
  source_system text,
  entity        text,
  operation     text,                                  -- e.g. 'customer.upsert'
  status        text not null check (status in ('ok','error','rejected','rate_limited')),
  http_status   integer,
  request_id    text,                                  -- echoed as X-VANTORA-Request-Id
  payload       jsonb,
  result        jsonb,
  error_message text,
  retry_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists idx_integration_logs_company  on erp_integration_logs(company_id, created_at desc);
create index if not exists idx_integration_logs_key_time on erp_integration_logs(api_key_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Reads: platform owner or company member (so the admin UI can list keys/logs;
-- the UI selects every column EXCEPT key_hash). Writes go through SECURITY
-- DEFINER RPCs (management) or the service-role inbound path (logs) — there are
-- intentionally NO authenticated write policies on these tables.
alter table erp_api_keys enable row level security;
drop policy if exists erp_api_keys_read on erp_api_keys;
create policy erp_api_keys_read on erp_api_keys for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);

alter table erp_integration_logs enable row level security;
drop policy if exists erp_integration_logs_read on erp_integration_logs;
create policy erp_integration_logs_read on erp_integration_logs for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);

-- ── Management RPCs (authenticated; in-function admin/owner guard) ────────────

-- Create a key for the caller's company. Returns the plaintext ONCE. The app
-- additionally gates the UI/action on the integrations.manage permission.
-- search_path includes 'extensions' because digest()/gen_random_bytes() (pgcrypto)
-- live there on Supabase; still pinned (no mutable-search_path lint).
create or replace function erp_api_key_create(p_name text, p_scopes text[])
returns jsonb language plpgsql security definer
set search_path to 'public','extensions','pg_temp' as $$
declare
  v_company uuid := (select erp_user_company_id());
  v_secret  text;
  v_plain   text;
  v_prefix  text;
  v_id      uuid;
  s         text;
begin
  if v_company is null then raise exception 'no company'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company)))
    then raise exception 'forbidden'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'name required'; end if;

  -- Validate scope FORMAT only ('{entity}:read' | '{entity}:write'); which
  -- entities are actually served is enforced by the route handler (registry).
  foreach s in array coalesce(p_scopes, '{}') loop
    if s !~ '^[a-z_]+:(read|write)$' then raise exception 'invalid scope: %', s; end if;
  end loop;

  v_secret := encode(gen_random_bytes(24), 'hex');     -- 48 hex chars
  v_plain  := 'vtk_live_' || v_secret;
  v_prefix := substr(v_plain, 1, 16);                  -- display fragment

  insert into erp_api_keys (company_id, name, prefix, key_hash, scopes, created_by)
  values (v_company, btrim(p_name), v_prefix, digest(v_plain, 'sha256'),
          coalesce(p_scopes, '{}'), auth.uid())
  returning id into v_id;

  -- plaintext returned once; never persisted.
  return jsonb_build_object('id', v_id, 'prefix', v_prefix, 'api_key', v_plain);
end; $$;
revoke all on function erp_api_key_create(text, text[]) from public, anon;
grant execute on function erp_api_key_create(text, text[]) to authenticated;

-- Revoke (deactivate) a key owned by the caller's company.
create or replace function erp_api_key_revoke(p_id uuid)
returns boolean language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_api_keys where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company)))
    then raise exception 'forbidden'; end if;
  update erp_api_keys set is_active = false, revoked_at = now()
    where id = p_id and revoked_at is null;
  return true;
end; $$;
revoke all on function erp_api_key_revoke(uuid) from public, anon;
grant execute on function erp_api_key_revoke(uuid) to authenticated;

-- ── Inbound-path RPCs (service_role only; called by the /api/v1 route) ────────

-- Resolve a presented key by its hash: returns identity + scopes for an active,
-- non-revoked key and stamps last_used_at. Service-role only — never anon.
create or replace function erp_api_key_resolve(p_hash bytea)
returns table(key_id uuid, company_id uuid, scopes text[])
language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  return query
    update erp_api_keys k set last_used_at = now()
    where k.key_hash = p_hash and k.is_active and k.revoked_at is null
    returning k.id, k.company_id, k.scopes;
end; $$;
revoke all on function erp_api_key_resolve(bytea) from public, anon, authenticated;
grant execute on function erp_api_key_resolve(bytea) to service_role;

-- Write an integration log row. Service-role only (the inbound caller has no JWT).
create or replace function erp_integration_log(
  p_company_id uuid, p_api_key_id uuid, p_direction text, p_source text,
  p_entity text, p_operation text, p_status text, p_http_status integer,
  p_request_id text, p_payload jsonb, p_result jsonb, p_error text)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_id uuid;
begin
  insert into erp_integration_logs (
    company_id, api_key_id, direction, source_system, entity, operation, status,
    http_status, request_id, payload, result, error_message, completed_at)
  values (p_company_id, p_api_key_id, p_direction, p_source, p_entity, p_operation,
          p_status, p_http_status, p_request_id, p_payload, p_result, p_error, now())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function erp_integration_log(uuid,uuid,text,text,text,text,text,integer,text,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function erp_integration_log(uuid,uuid,text,text,text,text,text,integer,text,jsonb,jsonb,text)
  to service_role;

-- ── Audit key lifecycle (create / revoke / delete) to erp_audit_logs ─────────
create or replace function erp_api_keys_audit()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_api_key', 'api_key',
    coalesce(new.id, old.id)::text,
    jsonb_build_object('name', coalesce(new.name, old.name),
                       'prefix', coalesce(new.prefix, old.prefix),
                       'scopes', coalesce(new.scopes, old.scopes)),
    coalesce(new.company_id, old.company_id));
  return coalesce(new, old);
end; $$;
revoke all on function erp_api_keys_audit() from public, anon, authenticated;

drop trigger if exists erp_api_keys_audit_t on erp_api_keys;
create trigger erp_api_keys_audit_t
  after insert or update or delete on erp_api_keys
  for each row execute function erp_api_keys_audit();
