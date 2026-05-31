-- ── ETA e-invoicing foundation (additive, safe) ───────────────────────────
-- Adds per-company ETA settings, product ETA code mapping, and per-invoice
-- submission status. No behavior changes until the app is wired + credentials
-- exist. Apply via the staging migrate flow first, then production (manual).

-- 1) Per-company ETA configuration -----------------------------------------
create table if not exists erp_company_eta_settings (
  company_id               uuid primary key references erp_companies(id) on delete cascade,
  tax_registration_number  text,
  taxpayer_activity_code    text,
  branch_id                text not null default '0',
  issuer_name              text,
  address                  jsonb not null default '{}'::jsonb,
  environment              text not null default 'preprod'
                             check (environment in ('preprod','production')),
  enabled                  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table erp_company_eta_settings enable row level security;

create policy erp_company_eta_settings_select on erp_company_eta_settings
  for select using (
    (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
  );
create policy erp_company_eta_settings_manage on erp_company_eta_settings
  for all using (
    (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
  ) with check (
    (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
  );

-- 2) Product → ETA item-code mapping ---------------------------------------
alter table erp_products_catalog
  add column if not exists eta_item_code      text,
  add column if not exists eta_item_code_type text check (eta_item_code_type in ('EGS','GS1')),
  add column if not exists eta_unit_type      text;

-- 3) Per-invoice submission state ------------------------------------------
alter table erp_invoices
  add column if not exists eta_status         text not null default 'not_submitted'
                             check (eta_status in ('not_submitted','submitted','valid','invalid','rejected','cancelled')),
  add column if not exists eta_uuid           text,
  add column if not exists eta_long_id        text,
  add column if not exists eta_submission_uuid text,
  add column if not exists eta_submitted_at   timestamptz,
  add column if not exists eta_error          jsonb;

create index if not exists idx_erp_invoices_eta_status on erp_invoices (branch_id, eta_status);
