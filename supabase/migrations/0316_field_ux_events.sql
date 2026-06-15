-- 0316 — Field UX telemetry (Smart Next Customer pilot).
--
-- Lightweight, append-only event log to measure the navigation-flow impact
-- during the pilot. Captured client-side, written through a flag-gated server
-- action (only when platform.smart_next_customer is ON for the company), so it is
-- additive + reversible (disable the flag → no new events). Company-scoped RLS;
-- a rep writes only their own rows. No PII beyond customer_id (already visible
-- under RLS). Used by supabase/pilot/smart-next-metrics.sql.

create table if not exists erp_field_ux_events (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  user_id         uuid not null default auth.uid(),
  event_type      text not null,           -- visit_started | visit_completed | smart_next_viewed | navigate_clicked | resume_shown | resume_clicked
  customer_id     uuid,
  work_session_id uuid,
  meta            jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now()
);

create index if not exists erp_field_ux_events_co_time_idx on erp_field_ux_events (company_id, occurred_at);
create index if not exists erp_field_ux_events_user_time_idx on erp_field_ux_events (user_id, occurred_at);
create index if not exists erp_field_ux_events_type_idx on erp_field_ux_events (company_id, event_type);

alter table erp_field_ux_events enable row level security;

drop policy if exists erp_field_ux_events_select on erp_field_ux_events;
create policy erp_field_ux_events_select on erp_field_ux_events
  for select using (company_id = erp_user_company_id());

drop policy if exists erp_field_ux_events_insert on erp_field_ux_events;
create policy erp_field_ux_events_insert on erp_field_ux_events
  for insert with check (company_id = erp_user_company_id() and user_id = auth.uid());

comment on table erp_field_ux_events is
  'Append-only field UX telemetry for the Smart Next Customer pilot. Written only while platform.smart_next_customer is enabled.';
