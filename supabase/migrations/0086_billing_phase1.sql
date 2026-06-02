-- ============================================================================
-- 0086: Billing & Subscriptions — Phase 1 (Core Platform capability).
-- ----------------------------------------------------------------------------
-- Multi-currency, GCC-ready foundation built ON the existing plan system
-- (erp_plans + erp_plan_modules already provide plan-based module access — we
-- reuse, not fork). Adds: a multi-currency price book, per-company subscriptions
-- (system of record), invoice history, an architecture-ready payments table
-- (no gateway coupling), and country-configurable VAT. Owner-only administration
-- via guarded RPCs that also SYNC the legacy erp_companies subscription fields so
-- existing gating/locking keeps working during the transition.
-- Additive + idempotent. Money is stored in MINOR units (integers).
-- ============================================================================

-- Extend the existing plan catalog (additive).
alter table erp_plans add column if not exists name_en   text;
alter table erp_plans add column if not exists trial_days integer not null default 0;
alter table erp_plans add column if not exists is_active  boolean not null default true;

-- Company country (tax/locale determination). Additive nullable.
alter table erp_companies add column if not exists country text;

-- Allowed billing currencies (GCC + EGP + USD).
-- decimals are derived in app code (KWD/BHD/OMR = 3, others = 2).

-- ── Multi-currency price book ────────────────────────────────────────────────
create table if not exists erp_billing_plan_prices (
  id           uuid primary key default gen_random_uuid(),
  plan_key     text not null,
  currency     text not null check (currency in ('SAR','AED','KWD','QAR','BHD','OMR','EGP','USD')),
  interval     text not null check (interval in ('monthly','yearly')),
  amount_minor bigint not null check (amount_minor >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (plan_key, currency, interval)
);

-- ── Subscriptions (one current record per company; system of record) ─────────
create table if not exists erp_billing_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null unique references erp_companies(id) on delete cascade,
  plan_key              text not null,
  currency              text not null check (currency in ('SAR','AED','KWD','QAR','BHD','OMR','EGP','USD')),
  interval              text not null check (interval in ('monthly','yearly')),
  status                text not null default 'trial'
                          check (status in ('trial','active','suspended','cancelled','expired')),
  trial_end             date,
  current_period_start  date,
  current_period_end    date,
  cancel_at             date,
  proration_credit_minor bigint not null default 0,  -- proration architecture (compute later)
  created_by            uuid references erp_profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_billing_subs_status on erp_billing_subscriptions(status);

-- ── Invoice history (+ VAT-ready fields; computation/e-invoicing later) ──────
create sequence if not exists erp_billing_invoice_seq;
create table if not exists erp_billing_invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references erp_companies(id) on delete cascade,
  subscription_id uuid references erp_billing_subscriptions(id) on delete set null,
  number          text not null unique,
  currency        text not null,
  period_start    date,
  period_end      date,
  subtotal_minor  bigint not null default 0,
  tax_minor       bigint not null default 0,
  total_minor     bigint not null default 0,
  tax_country     text,                 -- extension point (VAT-ready)
  tax_rate        numeric,              -- % applied
  buyer_tax_number text,                -- TRN/VAT — extension point
  status          text not null default 'issued' check (status in ('draft','issued','paid','void')),
  issued_at       timestamptz not null default now(),
  due_date        date,
  created_by      uuid references erp_profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_billing_invoices_company on erp_billing_invoices(company_id, issued_at desc);

create table if not exists erp_billing_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references erp_billing_invoices(id) on delete cascade,
  description       text not null,
  qty               numeric not null default 1,
  unit_amount_minor bigint not null default 0,
  amount_minor      bigint not null default 0
);

-- ── Payments (architecture-ready; NO gateway coupling, no logic in Phase 1) ──
create table if not exists erp_billing_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid references erp_billing_invoices(id) on delete set null,
  company_id   uuid not null references erp_companies(id) on delete cascade,
  method       text not null default 'manual' check (method in ('manual','bank_transfer','cash','gateway')),
  provider     text,                 -- gateway name when method='gateway' (future)
  amount_minor bigint not null default 0,
  currency     text not null,
  status       text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  reference    text,
  paid_at      timestamptz,
  created_by   uuid references erp_profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── Country-configurable VAT (the tax extension point) ───────────────────────
create table if not exists erp_country_vat (
  country   text primary key,        -- ISO-3166 alpha-2
  name_en   text not null,
  name_ar   text not null,
  vat_rate  numeric not null default 0,
  is_active boolean not null default true
);
insert into erp_country_vat (country, name_en, name_ar, vat_rate) values
  ('SA','Saudi Arabia','السعودية',15),
  ('AE','United Arab Emirates','الإمارات',5),
  ('KW','Kuwait','الكويت',0),
  ('QA','Qatar','قطر',0),
  ('BH','Bahrain','البحرين',10),
  ('OM','Oman','عُمان',5),
  ('EG','Egypt','مصر',14),
  ('US','United States','الولايات المتحدة',0)
on conflict (country) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table erp_billing_plan_prices    enable row level security;
alter table erp_billing_subscriptions  enable row level security;
alter table erp_billing_invoices        enable row level security;
alter table erp_billing_invoice_lines   enable row level security;
alter table erp_billing_payments        enable row level security;
alter table erp_country_vat             enable row level security;

-- Price book + VAT config: any authenticated user may read; owner writes.
drop policy if exists erp_bpp_read on erp_billing_plan_prices;
create policy erp_bpp_read on erp_billing_plan_prices for select using ((select auth.uid()) is not null);
drop policy if exists erp_bpp_write on erp_billing_plan_prices;
create policy erp_bpp_write on erp_billing_plan_prices for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

drop policy if exists erp_cvat_read on erp_country_vat;
create policy erp_cvat_read on erp_country_vat for select using ((select auth.uid()) is not null);
drop policy if exists erp_cvat_write on erp_country_vat;
create policy erp_cvat_write on erp_country_vat for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- Subscriptions / invoices / lines / payments: owner (all) or the tenant reads
-- its OWN. Writes are owner-only (via the guarded RPCs below) in Phase 1.
drop policy if exists erp_bsub_read on erp_billing_subscriptions;
create policy erp_bsub_read on erp_billing_subscriptions for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_bsub_write on erp_billing_subscriptions;
create policy erp_bsub_write on erp_billing_subscriptions for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

drop policy if exists erp_binv_read on erp_billing_invoices;
create policy erp_binv_read on erp_billing_invoices for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_binv_write on erp_billing_invoices;
create policy erp_binv_write on erp_billing_invoices for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

drop policy if exists erp_binvl_read on erp_billing_invoice_lines;
create policy erp_binvl_read on erp_billing_invoice_lines for select using (
  (select erp_is_platform_owner())
  or exists (select 1 from erp_billing_invoices i
             where i.id = invoice_id and i.company_id = (select erp_user_company_id())));
drop policy if exists erp_binvl_write on erp_billing_invoice_lines;
create policy erp_binvl_write on erp_billing_invoice_lines for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

drop policy if exists erp_bpay_read on erp_billing_payments;
create policy erp_bpay_read on erp_billing_payments for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_bpay_write on erp_billing_payments;
create policy erp_bpay_write on erp_billing_payments for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- ── Owner-only RPCs (SECURITY DEFINER; search_path pinned; anon revoked) ─────

-- Upsert a price-book entry.
create or replace function erp_billing_set_plan_price(
  p_plan_key text, p_currency text, p_interval text, p_amount_minor bigint)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  insert into erp_billing_plan_prices(plan_key, currency, interval, amount_minor)
  values (p_plan_key, p_currency, p_interval, p_amount_minor)
  on conflict (plan_key, currency, interval)
  do update set amount_minor = excluded.amount_minor, is_active = true, updated_at = now();
  perform erp_log_audit('set_price','billing_plan_price', p_plan_key,
    jsonb_build_object('currency',p_currency,'interval',p_interval,'amount_minor',p_amount_minor), null);
end; $$;

-- Create/replace a company's subscription, then SYNC legacy erp_companies fields.
create or replace function erp_billing_subscribe(
  p_company uuid, p_plan_key text, p_currency text, p_interval text, p_trial_days integer default 0)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_start date := current_date;
  v_period_end date := case when p_interval='yearly' then v_start + interval '1 year' else v_start + interval '1 month' end;
  v_trialing boolean := coalesce(p_trial_days,0) > 0;
  v_trial_end date := case when v_trialing then v_start + (p_trial_days || ' days')::interval else null end;
  v_status text := case when v_trialing then 'trial' else 'active' end;
  v_legacy_end date := case when v_trialing then v_trial_end else v_period_end end;
  v_id uuid;
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  insert into erp_billing_subscriptions(company_id, plan_key, currency, interval, status,
     trial_end, current_period_start, current_period_end, created_by)
  values (p_company, p_plan_key, p_currency, p_interval, v_status,
     v_trial_end, v_start, v_period_end, auth.uid())
  on conflict (company_id) do update set
     plan_key = excluded.plan_key, currency = excluded.currency, interval = excluded.interval,
     status = excluded.status, trial_end = excluded.trial_end,
     current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
     updated_at = now()
  returning id into v_id;

  -- Keep the legacy gating fields in sync (lock screen / subscriptionState).
  update erp_companies set
     plan_key = p_plan_key, currency = p_currency,
     subscription_start = v_start, subscription_end = v_legacy_end, is_active = true
   where id = p_company;

  perform erp_log_audit('subscribe','billing_subscription', p_company::text,
    jsonb_build_object('plan',p_plan_key,'currency',p_currency,'interval',p_interval,'status',v_status), p_company);
  return v_id;
end; $$;

-- Transition status (suspend/cancel/activate/expire) + sync legacy is_active.
create or replace function erp_billing_set_status(p_company uuid, p_status text)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  if p_status not in ('trial','active','suspended','cancelled','expired') then
    raise exception 'invalid status'; end if;
  update erp_billing_subscriptions set status = p_status, updated_at = now(),
     cancel_at = case when p_status='cancelled' then current_date else cancel_at end
   where company_id = p_company;
  update erp_companies set is_active = (p_status in ('trial','active')) where id = p_company;
  perform erp_log_audit('set_status','billing_subscription', p_company::text,
    jsonb_build_object('status',p_status), p_company);
end; $$;

-- Issue an invoice for a company's current subscription from the price book.
-- VAT computed from the company's country (country-configurable); e-invoicing
-- fields are present but populated later.
create or replace function erp_billing_issue_invoice(p_company uuid)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_sub erp_billing_subscriptions;
  v_amount bigint;
  v_country text;
  v_rate numeric := 0;
  v_tax bigint := 0;
  v_id uuid;
  v_number text;
  v_plan_name text;
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  select * into v_sub from erp_billing_subscriptions where company_id = p_company;
  if v_sub.id is null then raise exception 'no subscription'; end if;
  select amount_minor into v_amount from erp_billing_plan_prices
    where plan_key = v_sub.plan_key and currency = v_sub.currency and interval = v_sub.interval and is_active;
  if v_amount is null then raise exception 'no price set for this plan/currency/interval'; end if;

  select country into v_country from erp_companies where id = p_company;
  if v_country is not null then
    select vat_rate into v_rate from erp_country_vat where country = v_country and is_active;
    v_rate := coalesce(v_rate, 0);
  end if;
  v_tax := round(v_amount * v_rate / 100.0);
  v_number := 'INV-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('erp_billing_invoice_seq')::text, 5, '0');
  select coalesce(name_en, name_ar, key) into v_plan_name from erp_plans where key = v_sub.plan_key;

  insert into erp_billing_invoices(company_id, subscription_id, number, currency, period_start, period_end,
     subtotal_minor, tax_minor, total_minor, tax_country, tax_rate, status, issued_at, due_date, created_by)
  values (p_company, v_sub.id, v_number, v_sub.currency, v_sub.current_period_start, v_sub.current_period_end,
     v_amount, v_tax, v_amount + v_tax, v_country, v_rate, 'issued', now(), current_date + 14, auth.uid())
  returning id into v_id;

  insert into erp_billing_invoice_lines(invoice_id, description, qty, unit_amount_minor, amount_minor)
  values (v_id, coalesce(v_plan_name,'Subscription') || ' (' || v_sub.interval || ')', 1, v_amount, v_amount);

  perform erp_log_audit('issue_invoice','billing_invoice', v_id::text,
    jsonb_build_object('company',p_company,'number',v_number,'total_minor',v_amount+v_tax), p_company);
  return v_id;
end; $$;

revoke all on function erp_billing_set_plan_price(text,text,text,bigint) from public, anon;
revoke all on function erp_billing_subscribe(uuid,text,text,text,integer) from public, anon;
revoke all on function erp_billing_set_status(uuid,text) from public, anon;
revoke all on function erp_billing_issue_invoice(uuid) from public, anon;
grant execute on function erp_billing_set_plan_price(text,text,text,bigint) to authenticated;
grant execute on function erp_billing_subscribe(uuid,text,text,text,integer) to authenticated;
grant execute on function erp_billing_set_status(uuid,text) to authenticated;
grant execute on function erp_billing_issue_invoice(uuid) to authenticated;
