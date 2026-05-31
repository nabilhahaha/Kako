-- Entity Framework standard fields: add the universally-missing, integration-
-- critical columns to the registry's real entities. All NULLABLE → zero breakage.
-- external_id (stable id from an external system, for import/sync dedupe) and
-- updated_by (last editor). company_id/branch_id/created_at/updated_at/created_by/
-- status already exist where meaningful and are left as-is. See ENTITY-FRAMEWORK.md.

alter table erp_customers        add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_suppliers        add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_products_catalog add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_branches         add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_departments      add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_invoices         add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_sales_orders     add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_clinic_visits    add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;
alter table erp_salon_tickets    add column if not exists external_id text, add column if not exists updated_by uuid references erp_profiles(id) on delete set null;

create unique index if not exists uq_customers_external on erp_customers(company_id, external_id) where external_id is not null;
create unique index if not exists uq_suppliers_external on erp_suppliers(company_id, external_id) where external_id is not null;
create unique index if not exists uq_products_external  on erp_products_catalog(company_id, external_id) where external_id is not null;
