-- ============================================================================
-- 0092: Data Integration Phase 2B — Outbound Webhooks (Core Platform).
-- ----------------------------------------------------------------------------
-- Per-company webhook subscriptions + a delivery queue/log. Events are emitted
-- entity-agnostically from DB triggers; delivery is HMAC-signed and driven by
-- pg_cron + pg_net (async HTTP) with exponential-backoff retry and dead-letter
-- auto-disable. Entity-based, RLS-first, additive + idempotent. See
-- docs/INTEGRATION.md §4. (2A = inbound API; 2C = connectors/sync.)
-- ============================================================================

create extension if not exists pgcrypto;   -- hmac() (extensions schema)

-- pg_net (async HTTP) powers outbound delivery. It's a Supabase extension and is
-- absent from vanilla Postgres (e.g. the CI integration-test DB), so enabling it
-- must not hard-fail the migration there — delivery simply stays inactive until
-- pg_net exists (staging/production have it). erp_webhook_tick references net.*
-- with deferred name resolution, so it still creates cleanly without pg_net.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable here; webhook delivery inactive until it is enabled.';
end $$;

-- ── Subscriptions ────────────────────────────────────────────────────────────
create table if not exists erp_webhooks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  name          text not null,
  url           text not null,                       -- https only (validated in RPC)
  secret        text not null,                       -- HMAC signing secret (whsec_…)
  events        text[] not null default '{}',        -- subscribed event keys
  is_active     boolean not null default true,
  disabled_reason text,
  last_delivery_at timestamptz,
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists idx_webhooks_company on erp_webhooks(company_id);

-- ── Delivery queue + per-attempt log ─────────────────────────────────────────
create table if not exists erp_webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references erp_companies(id) on delete cascade,
  webhook_id      uuid not null references erp_webhooks(id) on delete cascade,
  event           text not null,
  entity          text,
  entity_id       text,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending','sent','delivered','failed','dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  net_request_id  bigint,
  signature       text,
  last_status_code integer,
  last_error      text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);
create index if not exists idx_webhook_deliveries_due on erp_webhook_deliveries(status, next_attempt_at);
create index if not exists idx_webhook_deliveries_webhook on erp_webhook_deliveries(webhook_id, created_at desc);
create index if not exists idx_webhook_deliveries_company on erp_webhook_deliveries(company_id, created_at desc);

-- ── RLS (read = owner/company member; writes via RPCs / triggers only) ───────
alter table erp_webhooks enable row level security;
drop policy if exists erp_webhooks_read on erp_webhooks;
create policy erp_webhooks_read on erp_webhooks for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

alter table erp_webhook_deliveries enable row level security;
drop policy if exists erp_webhook_deliveries_read on erp_webhook_deliveries;
create policy erp_webhook_deliveries_read on erp_webhook_deliveries for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

-- ── Management RPCs (authenticated; in-function admin/owner guard) ───────────
create or replace function erp_webhook_create(p_name text, p_url text, p_events text[])
returns jsonb language plpgsql security definer
set search_path to 'public','extensions','pg_temp' as $$
declare v_company uuid := (select erp_user_company_id()); v_secret text; v_id uuid; e text;
begin
  if v_company is null then raise exception 'no company'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_name is null or btrim(p_name)='' then raise exception 'name required'; end if;
  if p_url !~* '^https://' then raise exception 'url must be https'; end if;
  if p_events is null or array_length(p_events,1) is null then raise exception 'select at least one event'; end if;
  foreach e in array p_events loop
    if e !~ '^[a-z_]+\.[a-z_]+$' then raise exception 'invalid event: %', e; end if;
  end loop;
  v_secret := 'whsec_' || encode(gen_random_bytes(24),'hex');
  insert into erp_webhooks (company_id, name, url, secret, events, created_by)
  values (v_company, btrim(p_name), p_url, v_secret, p_events, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end; $$;
revoke all on function erp_webhook_create(text,text,text[]) from public, anon;
grant execute on function erp_webhook_create(text,text,text[]) to authenticated;

create or replace function erp_webhook_revoke(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_webhooks where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  update erp_webhooks set is_active=false, revoked_at=now(), disabled_reason='revoked by user'
    where id=p_id and revoked_at is null;
  return true;
end; $$;
revoke all on function erp_webhook_revoke(uuid) from public, anon;
grant execute on function erp_webhook_revoke(uuid) to authenticated;

-- Enqueue a test ('ping') delivery for a webhook the caller's company owns.
create or replace function erp_webhook_send_test(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_webhooks where id=p_id and is_active;
  if v_company is null then raise exception 'not found or inactive'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  insert into erp_webhook_deliveries (company_id, webhook_id, event, payload)
  values (v_company, p_id, 'ping', jsonb_build_object('message','VANTORA webhook test','at', now()));
  return true;
end; $$;
revoke all on function erp_webhook_send_test(uuid) from public, anon;
grant execute on function erp_webhook_send_test(uuid) to authenticated;

-- ── Emit (internal; called by capture triggers) ─────────────────────────────
-- Fan-out: enqueue one delivery per active subscription whose `events` contains
-- the event. Cheap no-op when the company has no matching subscription.
create or replace function erp_webhook_emit(p_company_id uuid, p_event text, p_entity text, p_entity_id text, p_payload jsonb)
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_count integer;
begin
  insert into erp_webhook_deliveries (company_id, webhook_id, event, entity, entity_id, payload)
  select p_company_id, w.id, p_event, p_entity, p_entity_id, coalesce(p_payload,'{}'::jsonb)
  from erp_webhooks w
  where w.company_id = p_company_id and w.is_active and p_event = any(w.events);
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function erp_webhook_emit(uuid,text,text,text,jsonb) from public, anon, authenticated;

-- ── Capture triggers (entity-agnostic; FAILSAFE — never break the host write) ─
create or replace function erp_webhook_capture()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare rec jsonb; v_company uuid; v_entity text := tg_argv[0]; v_event text; v_id text;
begin
  begin
    rec := to_jsonb(new);
    v_id := rec->>'id';
    if (rec ? 'company_id') and (rec->>'company_id') is not null then
      v_company := (rec->>'company_id')::uuid;
    elsif (rec ? 'branch_id') and (rec->>'branch_id') is not null then
      select company_id into v_company from erp_branches where id = (rec->>'branch_id')::uuid;
    end if;
    if v_company is not null then
      v_event := v_entity || '.' || (case when tg_op='INSERT' then 'created' else 'updated' end);
      perform erp_webhook_emit(v_company, v_event, v_entity, v_id, jsonb_build_object('id', v_id, 'data', rec));
    end if;
  exception when others then
    null;  -- webhook capture must never abort the underlying business transaction
  end;
  return new;
end; $$;
revoke all on function erp_webhook_capture() from public, anon, authenticated;

create or replace function erp_webhook_workflow_capture()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  begin
    if new.status is distinct from old.status and new.status in ('approved','rejected') then
      perform erp_webhook_emit(new.company_id, 'approval.completed', new.entity, new.record_id::text,
        jsonb_build_object('workflow_instance', new.id, 'entity', new.entity, 'record_id', new.record_id, 'status', new.status));
    end if;
  exception when others then null; end;
  return new;
end; $$;
revoke all on function erp_webhook_workflow_capture() from public, anon, authenticated;

drop trigger if exists erp_webhook_capture_customer on erp_customers;
create trigger erp_webhook_capture_customer after insert or update on erp_customers
  for each row execute function erp_webhook_capture('customer');
drop trigger if exists erp_webhook_capture_supplier on erp_suppliers;
create trigger erp_webhook_capture_supplier after insert or update on erp_suppliers
  for each row execute function erp_webhook_capture('supplier');
drop trigger if exists erp_webhook_capture_product on erp_products_catalog;
create trigger erp_webhook_capture_product after insert or update on erp_products_catalog
  for each row execute function erp_webhook_capture('product');
drop trigger if exists erp_webhook_capture_invoice on erp_invoices;
create trigger erp_webhook_capture_invoice after insert on erp_invoices
  for each row execute function erp_webhook_capture('invoice');
drop trigger if exists erp_webhook_capture_approval on erp_workflow_instances;
create trigger erp_webhook_capture_approval after update on erp_workflow_instances
  for each row execute function erp_webhook_workflow_capture();

-- ── Delivery worker (pg_cron → pg_net), HMAC-signed, backoff + dead-letter ───
create or replace function erp_webhook_tick()
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare r record; v_body jsonb; v_sig text; v_req bigint; v_back interval;
begin
  -- 1) Reconcile in-flight 'sent' deliveries from pg_net responses
  for r in
    select d.id, d.webhook_id, d.attempts, resp.status_code, resp.error_msg
    from erp_webhook_deliveries d
    join net._http_response resp on resp.id = d.net_request_id
    where d.status = 'sent'
  loop
    if r.status_code is not null and r.status_code between 200 and 299 then
      update erp_webhook_deliveries set status='delivered', delivered_at=now(), last_status_code=r.status_code, last_error=null where id=r.id;
      update erp_webhooks set last_delivery_at=now() where id=r.webhook_id;
    elsif r.attempts >= 6 then
      update erp_webhook_deliveries set status='dead', last_status_code=r.status_code,
        last_error=coalesce(r.error_msg, 'http_'||coalesce(r.status_code::text,'error')) where id=r.id;
      update erp_webhooks set is_active=false, disabled_reason='disabled after repeated delivery failures' where id=r.webhook_id;
      begin
        perform erp_notify(w.company_id, w.created_by, 'webhook_disabled', 'تم تعطيل Webhook', 'Webhook disabled',
          'Webhook "'||w.name||'" disabled after repeated delivery failures.', '/settings/integrations/webhooks', 'webhook', w.id::text)
        from erp_webhooks w where w.id=r.webhook_id and w.created_by is not null;
      exception when others then null; end;
    else
      v_back := make_interval(mins => least((2 ^ r.attempts)::int, 60));
      update erp_webhook_deliveries set status='failed', next_attempt_at=now()+v_back,
        last_status_code=r.status_code, last_error=coalesce(r.error_msg, 'http_'||coalesce(r.status_code::text,'error')) where id=r.id;
    end if;
  end loop;

  -- 2) Send due pending/failed deliveries (HMAC-signed)
  for r in
    select d.id, d.event, d.entity, d.entity_id, d.payload, d.created_at, w.url, w.secret
    from erp_webhook_deliveries d
    join erp_webhooks w on w.id = d.webhook_id
    where d.status in ('pending','failed') and d.next_attempt_at <= now() and d.attempts < 6 and w.is_active
    order by d.created_at limit 50
  loop
    v_body := jsonb_build_object('id', r.id, 'event', r.event, 'entity', r.entity,
                'entity_id', r.entity_id, 'occurred_at', r.created_at, 'data', r.payload);
    v_sig := encode(extensions.hmac(v_body::text, r.secret, 'sha256'), 'hex');
    v_req := net.http_post(
      url := r.url, body := v_body,
      headers := jsonb_build_object('Content-Type','application/json',
        'X-VANTORA-Event', r.event, 'X-VANTORA-Delivery', r.id::text, 'X-VANTORA-Signature', 'sha256='||v_sig),
      timeout_milliseconds := 8000);
    update erp_webhook_deliveries set status='sent', attempts=attempts+1, signature=v_sig, net_request_id=v_req, last_error=null where id=r.id;
  end loop;

  -- 3) Timeout sweep: 'sent' with no response after 5 min -> retry
  update erp_webhook_deliveries set status='failed', next_attempt_at=now()+interval '2 minutes'
  where status='sent' and net_request_id is not null
    and created_at < now() - interval '5 minutes'
    and not exists (select 1 from net._http_response resp where resp.id = net_request_id);
end; $$;
revoke all on function erp_webhook_tick() from public, anon, authenticated;

-- ── Audit webhook lifecycle ──────────────────────────────────────────────────
create or replace function erp_webhooks_audit()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_webhook', 'webhook', coalesce(new.id, old.id)::text,
    jsonb_build_object('name', coalesce(new.name, old.name), 'url', coalesce(new.url, old.url),
                       'events', coalesce(new.events, old.events)),
    coalesce(new.company_id, old.company_id));
  return coalesce(new, old);
end; $$;
revoke all on function erp_webhooks_audit() from public, anon, authenticated;
drop trigger if exists erp_webhooks_audit_t on erp_webhooks;
create trigger erp_webhooks_audit_t after insert or update or delete on erp_webhooks
  for each row execute function erp_webhooks_audit();

-- ── Schedule the delivery worker (pg_cron), idempotently ─────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    if exists (select 1 from cron.job where jobname='erp-webhook-tick') then
      perform cron.unschedule('erp-webhook-tick');
    end if;
    perform cron.schedule('erp-webhook-tick', '* * * * *', 'select erp_webhook_tick();');
  end if;
end $$;
