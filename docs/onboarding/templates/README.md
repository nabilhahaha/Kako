# Master-Data Import Templates

CSV templates for onboarding a new FMCG distributor via the in-app importer
(**Settings → Import**, requires `integrations.manage`; user import also needs
`user.import`). Headers match the importer's entity fields exactly. Example rows
mirror the certified **reference tenant** (Nile FMCG) so you can cross-check;
**replace them with the distributor's real data**.

## Import order (respects foreign-key dependencies)

| # | File | Entity | Depends on | Ref fields resolve by |
|---|---|---|---|---|
| 1 | `01-branches.csv` | Branch | — | — |
| 2 | `02-warehouses.csv` | Warehouse / Van | Branch | `branch_ref` → branch **code** |
| 3 | `03-products.csv` | Product | — | — |
| 4 | `04-suppliers.csv` | Supplier | — | — |
| 5 | `05-routes.csv` | Route | Branch (Region) | `branch_ref` → branch code |
| 6 | `06-customers.csv` | Customer | Route | `route_id` → route **name** |
| 7 | `07-users.csv` | User | Branch | `branch_ref` → branch code; `reports_to` → email |
| 8 | `08-opening-stock.csv` | Opening stock | Warehouse, Product | `warehouse_ref` → wh code; `product_ref` → product code/barcode |
| 9 | `09-journey-plans.csv` | Journey plan | Customer, User | `customer_ref` → code; `salesman_ref` → email |

Import each file in this order: a row that references something not yet imported
will fail validation.

## How to import each file

1. **Settings → Import** → choose the entity → upload the CSV.
2. **Map columns** — headers already match the field keys, so mapping is 1:1
   (or pick a source preset: ERPNext / Odoo / Generic). You can save a mapping
   template for reuse.
3. **Validate** (dry-run) — rows with **errors are blocked**, **warnings import**.
   Fix errors in the CSV and re-upload.
4. **Import** with mode **`insert`** (first load) or **`upsert`** (re-runs;
   dedupes on `external_id`/`code`). Every row is stamped with `import_job_id`
   for a full audit trail.

## Field notes

- **Required** (validation blocks if blank): branch `code`+`name`; warehouse
  `branch_ref`+`code`+`name`; product `code`+`name`; supplier `code`+`name`;
  route `code`+`name`; customer `name`; user `full_name`+`email`; stock
  `warehouse_ref`+`product_ref`+`quantity`.
- **`is_van`** = `true` for van warehouses, `false` for fixed warehouses.
- **`tax_rate`** is not an import column — set product VAT in **Settings →
  Products** after import (see the Pricing Setup Guide). 0% for water/dairy
  basics, standard VAT otherwise.
- **`credit_limit`** and **`payment_terms_days`** drive AR controls and invoice
  due dates — set them deliberately per customer.
- **Users**: import provisions the user record + role + branch assignment but
  **not a password**. Each user sets their password via the reset/invite flow,
  or an admin sets it in **Settings → Users**. See the User Onboarding Guide.
- **Pricing** (price lists / price rules) is **not** imported — configure it in
  the app (see the Pricing Setup Guide). Products carry a base `sell_price`.

## Validate against the reference tenant

The example rows match `supabase/pilot/reference-company.sql`. To preview the
exact end-state these templates produce, provision the reference tenant on a
staging project and compare (see `../REFERENCE-COMPANY.md`).
