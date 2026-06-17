-- 0318 — Visit outcomes: every visit must produce a measurable outcome.
--
-- One row per recorded visit outcome (transaction or non-transaction). Drives the
-- "End Visit" gate (a visit cannot end without an outcome), customer history, and
-- supervisor reporting. Append-only; company-scoped RLS; a rep writes only their
-- own rows. Additive — no change to existing tables/flows.

create table if not exists erp_visit_outcomes (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  salesman_id     uuid not null default auth.uid(),
  customer_id     uuid not null,
  work_session_id uuid,
  visit_date      date not null default current_date,
  -- new_sale | collection | return | no_sale | customer_closed | not_available | gps_exception | other
  outcome         text not null,
  reason          text,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists erp_visit_outcomes_cust_idx on erp_visit_outcomes (customer_id, created_at desc);
create index if not exists erp_visit_outcomes_co_date_idx on erp_visit_outcomes (company_id, visit_date);
create index if not exists erp_visit_outcomes_sm_date_idx on erp_visit_outcomes (salesman_id, visit_date);

alter table erp_visit_outcomes enable row level security;

drop policy if exists erp_visit_outcomes_select on erp_visit_outcomes;
create policy erp_visit_outcomes_select on erp_visit_outcomes
  for select using (company_id = erp_user_company_id());

drop policy if exists erp_visit_outcomes_insert on erp_visit_outcomes;
create policy erp_visit_outcomes_insert on erp_visit_outcomes
  for insert with check (company_id = erp_user_company_id() and salesman_id = auth.uid());

comment on table erp_visit_outcomes is
  'Recorded outcome of each customer visit (transaction or non-transaction). Enforces "no empty visits" + feeds customer history and supervisor reports.';
