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
| 6 | `06-customers.csv` | Customer | Route, Branch, User | `route_ref` → route **name**; `branch_ref` → branch code; `salesman_ref` → user email |
| 7 | `07-users.csv` | User | Branch, Van, Route | `branch_ref` → branch code; `reports_to` → email; `van_ref`/`route_ref` → code (field roles) |
| 8 | `08-opening-stock.csv` | Opening stock | Warehouse, Product | `warehouse_ref` → wh code; `product_ref` → product code/barcode |
| 9 | `09-journey-plans.csv` | Journey plan | Customer, User | `customer_ref` → code; `salesman_ref` → email |

Import each file in this order: a row that references something not yet imported
will fail validation.

> `feedback-log.csv` is **not** an import file — it's the pilot feedback-capture
> log used by the [First Customer Deployment Plan](../FIRST-CUSTOMER-DEPLOYMENT-PLAN.md)
> (§9). Copy it and fill it in throughout the pilot.

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
- **`category_code`** (products) → product-category code; create categories first
  or let the importer auto-create. **`tax_rate`** ships as a column (14 standard /
  0 exempt) and can also be tuned in **Settings → Products**.
- **`credit_limit`** and **`payment_terms_days`** drive AR controls and invoice
  due dates — set them deliberately per customer. **`payment_type`** = `cash` or
  `credit`; cash customers pair naturally with the **Cash Van** role.
- **Users — `role` must be one of the enforced role keys.** Refined FMCG roles:
  `merchandiser` (assortment/survey/grade, no selling), `cash_van` (cash sell +
  collect, **no credit** — blocked by permission and a DB guard), `salesman`
  (Van Sales Rep, cash **and** credit), `collection_officer` (collect only),
  `credit_controller` (credit approval, no posting). Other keys: `admin`,
  `manager`, `regional_manager`, `area_manager`, `supervisor`, `branch_manager`,
  `accountant`, `warehouse_keeper`, `cashier`, `it_admin`, `viewer`. Assign
  `van_ref`/`route_ref` for field roles.
- **Users**: import provisions the user record + role + branch assignment but
  **not a password**. Each user sets their password via the reset/invite flow,
  or an admin sets it in **Settings → Users**. See the User Onboarding Guide.
- **Pricing** (price lists / price rules) is **not** imported — configure it in
  the app (see the Pricing Setup Guide). Products carry a base `sell_price`.

## Validate against the reference tenant

The example rows match `supabase/pilot/reference-company.sql`. To preview the
exact end-state these templates produce, provision the reference tenant on a
staging project and compare (see `../REFERENCE-COMPANY.md`).
