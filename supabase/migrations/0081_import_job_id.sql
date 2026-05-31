-- Per-record traceability to the import that created/updated it (rollback prep).
-- Nullable → zero breakage. Only on the V1 importable entities. See INTEGRATION.md.
alter table erp_customers        add column if not exists import_job_id uuid;
alter table erp_suppliers        add column if not exists import_job_id uuid;
alter table erp_products_catalog add column if not exists import_job_id uuid;
alter table erp_branches         add column if not exists import_job_id uuid;
create index if not exists idx_customers_import_job on erp_customers(import_job_id) where import_job_id is not null;
create index if not exists idx_suppliers_import_job on erp_suppliers(import_job_id) where import_job_id is not null;
create index if not exists idx_products_import_job  on erp_products_catalog(import_job_id) where import_job_id is not null;
create index if not exists idx_branches_import_job  on erp_branches(import_job_id) where import_job_id is not null;
