-- ============================================================================
-- 0110: Platform Foundation #3 — Universal Notification Engine
-- ----------------------------------------------------------------------------
-- Centralized, event-based, multi-channel notification service. Additive:
-- in-app notifications (erp_notifications) are unchanged; the engine adds
-- reusable TEMPLATES, per-user/company PREFERENCES, and a per-channel DISPATCH
-- queue (status/failures → auditability + analytics). erp_notify is re-defined
-- to ALSO enqueue dispatch for any extra channels a template opts into —
-- templates default to {in_app} only, so current behaviour is unchanged until
-- an owner enables email. Email send itself is a thin future adapter draining
-- the queue (no provider wired here). Tenant-isolated via RLS.
-- ============================================================================

-- ── Templates (reusable subject/body per event; channel set) ────────────────
create table if not exists erp_notification_templates (
  key        text primary key,                 -- = the notification event/type key
  event_type text,
  title_ar   text, title_en text,
  body_ar    text, body_en  text,
  channels   text[] not null default '{in_app}',  -- in_app | email | whatsapp | sms | teams | push
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table erp_notification_templates enable row level security;
drop policy if exists erp_notif_tpl_read on erp_notification_templates;
create policy erp_notif_tpl_read on erp_notification_templates for select using ((select auth.uid()) is not null);
drop policy if exists erp_notif_tpl_write on erp_notification_templates;
create policy erp_notif_tpl_write on erp_notification_templates for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

insert into erp_notification_templates (key, event_type, title_ar, title_en, channels) values
  ('workflow_task_assigned','workflow','مهمة موافقة جديدة','New approval task','{in_app}'),
  ('workflow_decided','workflow','تم البت في طلبك','Your request was decided','{in_app}'),
  ('workflow_escalated','workflow','مهمة موافقة مُصعّدة','Escalated approval','{in_app}'),
  ('system','system','إشعار','Notification','{in_app}')
on conflict (key) do nothing;

-- ── Preferences (per-user/company channel opt-in/out by event) ──────────────
create table if not exists erp_notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references erp_companies(id) on delete cascade,
  user_id    uuid not null references erp_profiles(id) on delete cascade,
  event_type text not null,
  channel    text not null,
  enabled    boolean not null default true,
  unique (user_id, event_type, channel)
);
create index if not exists idx_notif_pref_user on erp_notification_preferences(user_id);
alter table erp_notification_preferences enable row level security;
drop policy if exists erp_notif_pref_rw on erp_notification_preferences;
create policy erp_notif_pref_rw on erp_notification_preferences for all
  using ((select erp_is_platform_owner()) or user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Dispatch queue (per-channel delivery record; status / failures) ─────────
create table if not exists erp_notification_dispatch (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references erp_companies(id) on delete cascade,
  user_id      uuid references erp_profiles(id) on delete set null,
  template_key text,
  channel      text not null,
  subject      text, body text,
  payload      jsonb,
  link         text, entity text, record_id text,
  status       text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  attempts     integer not null default 0,
  error        text,
  scheduled_at timestamptz not null default now(),
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notif_dispatch_status  on erp_notification_dispatch(status, scheduled_at);
create index if not exists idx_notif_dispatch_company on erp_notification_dispatch(company_id, created_at desc);
create index if not exists idx_notif_dispatch_user    on erp_notification_dispatch(user_id, created_at desc);
alter table erp_notification_dispatch enable row level security;
-- Read: platform owner, or the recipient / their company members. Writes happen
-- only via the SECURITY DEFINER engine below (and the service-role dispatcher).
drop policy if exists erp_notif_dispatch_read on erp_notification_dispatch;
create policy erp_notif_dispatch_read on erp_notification_dispatch for select
  using ((select erp_is_platform_owner()) or user_id = (select auth.uid())
         or company_id = (select erp_user_company_id()));

-- ── erp_notify (re-defined, ADDITIVE): in-app as before + enqueue extra
--    channels declared on the template, honoring per-user opt-out. ──────────
create or replace function erp_notify(
  p_company uuid, p_user uuid, p_type text, p_title_ar text, p_title_en text,
  p_body text, p_link text, p_entity text, p_record_id text)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_channels text[]; v_ch text;
begin
  -- in-app notification (unchanged)
  insert into erp_notifications(company_id, user_id, type, title_ar, title_en, body, link, entity, record_id)
  values (p_company, p_user, p_type, p_title_ar, p_title_en, p_body, p_link, p_entity, p_record_id);

  -- extra channels from the template (default {in_app} → nothing enqueued)
  select channels into v_channels from erp_notification_templates where key = p_type;
  if v_channels is null then return; end if;
  foreach v_ch in array v_channels loop
    if v_ch = 'in_app' then continue; end if;
    if exists (select 1 from erp_notification_preferences pr
                where pr.user_id = p_user and pr.event_type = p_type and pr.channel = v_ch and pr.enabled = false) then
      continue;  -- user opted out of this channel for this event
    end if;
    insert into erp_notification_dispatch(company_id, user_id, template_key, channel, subject, body, link, entity, record_id, status)
    values (p_company, p_user, p_type, v_ch, coalesce(p_title_en, p_title_ar), p_body, p_link, p_entity, p_record_id, 'queued');
  end loop;
end; $$;

-- ── Central entry for modules: fire by event, resolving the template ────────
create or replace function erp_notify_send(
  p_company uuid, p_user uuid, p_event text, p_payload jsonb default '{}'::jsonb,
  p_link text default null, p_entity text default null, p_record_id text default null)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_t erp_notification_templates;
begin
  select * into v_t from erp_notification_templates where key = p_event;
  perform erp_notify(p_company, p_user, p_event,
    coalesce(v_t.title_ar, p_event), coalesce(v_t.title_en, p_event), v_t.body_en, p_link, p_entity, p_record_id);
end; $$;
revoke all on function erp_notify_send(uuid,uuid,text,jsonb,text,text,text) from public, anon;
grant execute on function erp_notify_send(uuid,uuid,text,jsonb,text,text,text) to authenticated;

-- ── Audit template/preference changes (Foundation #1) ───────────────────────
do $attach$
declare t text;
begin
  foreach t in array array['erp_notification_templates','erp_notification_preferences'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
      execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function erp_audit_capture()', t);
    end if;
  end loop;
end $attach$;

-- ============================================================================
-- ROLLBACK (manual): restore the 0090 body of erp_notify; drop erp_notify_send,
-- the trg_audit_* triggers, and the three new tables. erp_notifications is
-- untouched.
-- ============================================================================
