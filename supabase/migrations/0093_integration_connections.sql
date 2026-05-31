-- ============================================================================
-- 0093: Data Integration Phase 2C-1 — Connector Framework + Connection store.
-- ----------------------------------------------------------------------------
-- Per-company external "connections" (REST/OData/file), each bound to an adapter
-- (generic_rest / csv_sftp now; sap/oracle/dynamics later). NON-secret config
-- lives in `config jsonb`; the sensitive credential lives in Supabase Vault and
-- the row keeps only a `secret_id` reference. Entity-based, RLS-first, additive +
-- idempotent. Live pull/push transport is the Sync Engine (2C-2). See
-- docs/INTEGRATION.md §4–6.
-- ============================================================================

-- ── Connection store ─────────────────────────────────────────────────────────
create table if not exists erp_integrations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references erp_companies(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('rest','odata','file')),
  direction       text not null check (direction in ('in','out','both')),
  adapter         text not null,                       -- 'generic_rest' | 'csv_sftp' | future
  config          jsonb not null default '{}'::jsonb,  -- NON-secret config only
  secret_id       uuid,                                -- vault.secrets reference (credential)
  is_active       boolean not null default true,
  sync_cursor     text,                                -- delta watermark (2C-2)
  last_synced_at  timestamptz,
  last_test_at    timestamptz,
  last_test_ok    boolean,
  last_test_message text,
  created_by      uuid references erp_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);
create index if not exists idx_integrations_company on erp_integrations(company_id);

-- ── RLS (read = owner/company member; the secret is NOT in this table) ───────
alter table erp_integrations enable row level security;
drop policy if exists erp_integrations_read on erp_integrations;
create policy erp_integrations_read on erp_integrations for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

-- ── Management RPCs (authenticated; in-function admin/owner guard) ───────────
-- The credential is written to Supabase Vault (vault.create_secret); only its
-- uuid is stored on the row. Vault refs use deferred name resolution, so these
-- create cleanly even where the vault schema is absent (e.g. vanilla-PG CI).
create or replace function erp_integration_create(
  p_name text, p_kind text, p_direction text, p_adapter text, p_config jsonb, p_secret text)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := (select erp_user_company_id()); v_id uuid; v_secret_id uuid;
begin
  if v_company is null then raise exception 'no company'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_name is null or btrim(p_name)='' then raise exception 'name required'; end if;
  if p_kind not in ('rest','odata','file') then raise exception 'invalid kind'; end if;
  if p_direction not in ('in','out','both') then raise exception 'invalid direction'; end if;
  if p_adapter !~ '^[a-z_]+$' then raise exception 'invalid adapter'; end if;
  if p_secret is not null and btrim(p_secret) <> '' then
    v_secret_id := vault.create_secret(p_secret, 'erp_int_'||gen_random_uuid()::text, 'VANTORA integration credential');
  end if;
  insert into erp_integrations (company_id, name, kind, direction, adapter, config, secret_id, created_by)
  values (v_company, btrim(p_name), p_kind, p_direction, p_adapter, coalesce(p_config,'{}'::jsonb), v_secret_id, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_integration_create(text,text,text,text,jsonb,text) from public, anon;
grant execute on function erp_integration_create(text,text,text,text,jsonb,text) to authenticated;

create or replace function erp_integration_update(p_id uuid, p_config jsonb, p_is_active boolean)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_integrations where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  update erp_integrations set
    config = coalesce(p_config, config),
    is_active = coalesce(p_is_active, is_active)
  where id = p_id;
  return true;
end; $$;
revoke all on function erp_integration_update(uuid,jsonb,boolean) from public, anon;
grant execute on function erp_integration_update(uuid,jsonb,boolean) to authenticated;

-- Set / rotate the Vault-stored credential.
create or replace function erp_integration_set_secret(p_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid; v_sid uuid;
begin
  select company_id, secret_id into v_company, v_sid from erp_integrations where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_secret is null or btrim(p_secret)='' then raise exception 'secret required'; end if;
  if v_sid is null then
    v_sid := vault.create_secret(p_secret, 'erp_int_'||gen_random_uuid()::text, 'VANTORA integration credential');
    update erp_integrations set secret_id = v_sid where id = p_id;
  else
    perform vault.update_secret(v_sid, p_secret);
  end if;
  return true;
end; $$;
revoke all on function erp_integration_set_secret(uuid,text) from public, anon;
grant execute on function erp_integration_set_secret(uuid,text) to authenticated;

create or replace function erp_integration_revoke(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_integrations where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  update erp_integrations set is_active=false, revoked_at=now() where id=p_id and revoked_at is null;
  return true;
end; $$;
revoke all on function erp_integration_revoke(uuid) from public, anon;
grant execute on function erp_integration_revoke(uuid) to authenticated;

-- Structural test: confirms the Vault credential round-trips (stored + decryptable)
-- without revealing it and without an external call (live connectivity = 2C-2).
create or replace function erp_integration_test(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid; v_sid uuid; v_secret_ok boolean := true; v_ok boolean; v_msg text;
begin
  select company_id, secret_id into v_company, v_sid from erp_integrations where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if v_sid is not null then
    select (decrypted_secret is not null and length(decrypted_secret) > 0) into v_secret_ok
    from vault.decrypted_secrets where id = v_sid;
    v_secret_ok := coalesce(v_secret_ok, false);
  end if;
  v_ok := v_secret_ok;
  v_msg := case when v_sid is null then 'No credential set'
                when v_secret_ok then 'Credential stored in Vault and decryptable'
                else 'Credential could not be read from Vault' end;
  update erp_integrations set last_test_at = now(), last_test_ok = v_ok, last_test_message = v_msg where id = p_id;
  return jsonb_build_object('ok', v_ok, 'message', v_msg);
end; $$;
revoke all on function erp_integration_test(uuid) from public, anon;
grant execute on function erp_integration_test(uuid) to authenticated;

-- ── Audit connection lifecycle ───────────────────────────────────────────────
create or replace function erp_integrations_audit()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_integration', 'integration', coalesce(new.id, old.id)::text,
    jsonb_build_object('name', coalesce(new.name, old.name), 'adapter', coalesce(new.adapter, old.adapter),
                       'kind', coalesce(new.kind, old.kind), 'direction', coalesce(new.direction, old.direction)),
    coalesce(new.company_id, old.company_id));
  return coalesce(new, old);
end; $$;
revoke all on function erp_integrations_audit() from public, anon, authenticated;
drop trigger if exists erp_integrations_audit_t on erp_integrations;
create trigger erp_integrations_audit_t after insert or update or delete on erp_integrations
  for each row execute function erp_integrations_audit();
