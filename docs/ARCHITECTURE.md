# VANTORA Business OS — Technical Architecture

> **One platform. Multiple industries. Shared core. Dynamic configuration.**

VANTORA is a multi-tenant business management platform (Business OS) built on a
**single shared codebase and database**. Instead of separate apps per industry,
every company runs on the same core and is shaped by **dynamic configuration**:
its business type, enabled modules, roles/permissions, and (on the roadmap)
organization structure, workflows, dashboards, and custom fields.

This document is the canonical reference for the data model, modules,
permissions, the setup wizard, the marketplace, organization structure,
workflows, and the forward roadmap. It reflects the system **as built**
(migrations `0001`–`0076`, 78 `erp_*` tables) and clearly marks what is
**planned**.

---

## 1. Stack & conventions

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Language | TypeScript (strict) |
| DB / Auth | Supabase (Postgres 17 + GoTrue), Row-Level Security everywhere |
| Styling | Tailwind + HSL CSS-var theme tokens (violet/blue/cyan brand) |
| i18n | Custom lightweight `t()` (ar/en, RTL/LTR), cookie-backed |
| Charts | Recharts | Icons | lucide-react |
| Tests | Vitest (unit + gated DB integration), Playwright (E2E) |
| Observability | Sentry (env-gated) |
| Hosting | Vercel (web) + Supabase (DB) |

Route groups: `(app)` (authenticated product), `(auth)` (login/register),
`(print)` (printable documents), `(legal)`, plus top-level `/setup` (wizard),
`/onboarding`, `/promo/[type]`, and the public landing `/`.

Naming: every tenant table is prefixed `erp_`. Enum/label maps are bilingual
`{ en, ar }`. New migrations are additive and append to `supabase/migrations/`.

---

## 2. Multi-tenancy — the core invariant

The whole platform rests on **tenant isolation enforced by Postgres RLS**, not
application code:

- Every tenant row carries a `company_id` (directly or via `branch_id`).
- RLS policies scope reads/writes to the caller's company using SQL helpers:
  - `erp_user_company_id()` — the caller's company.
  - `erp_user_branch_ids()` — the caller's branches.
  - `erp_is_platform_owner()` / `erp_is_super_admin()` — elevated actors.
- Privileged cross-cutting operations use **SECURITY DEFINER** functions that
  re-check the caller (e.g. `erp_apply_setup_modules`, `erp_self_register_company`,
  `erp_admin_set_password`) — so the app never needs broad table grants.

**Actors**
- *Platform owner* (the vendor): runs the provider panel; belongs to no tenant.
- *Super admin*: platform staff (cross-tenant tooling).
- *Company admin*: a tenant user with branch role `admin` — the company owner.
- *Tenant users*: branch roles (doctor, cashier, salesman, …) with permissions.

---

## 3. Database schema

78 `erp_*` tables today. Grouped by domain (✅ = implemented, 🔜 = roadmap):

### 3.1 Tenancy & identity ✅
`erp_companies` · `erp_branches` · `erp_profiles` · `erp_user_branches`
(membership: user × branch × role) · `erp_audit_logs`

`erp_companies` key columns: `name`, `name_ar`, `business_type`, `plan_key`,
`currency`, `is_active`, `subscription_start/end`, `setup_done`.

### 3.2 Plans, modules & access config ✅
`erp_plans` · `erp_plan_modules` (what a plan unlocks) ·
`erp_company_modules` (**per-company enabled modules** — the dynamic switch) ·
`erp_business_type_modules` / `erp_business_type_roles` (industry **presets**) ·
`erp_roles` · `erp_role_permissions` (global defaults) ·
`erp_company_roles` · `erp_company_role_permissions` (**per-company role config**)

### 3.3 Catalog & partners ✅
`erp_products_catalog` · `erp_product_categories` · `erp_customers` ·
`erp_suppliers` · `erp_price_lists` / `erp_price_list_items` ·
`erp_wholesale_tiers` / `erp_wholesale_prices` / `erp_wholesale_customer_tier`

### 3.4 Sales, purchasing & returns ✅
`erp_invoices` / `erp_invoice_lines` · `erp_sales_orders` / `_lines` ·
`erp_sales_returns` / `_lines` · `erp_purchase_orders` / `_lines` ·
`erp_goods_receipts` / `_lines` · `erp_payments` · `erp_supplier_payments` ·
`erp_sequences` (document numbering)

### 3.5 Inventory & warehousing ✅
`erp_warehouses` · `erp_inventory_stock` · `erp_stock_movements` ·
`erp_transfer_orders` / `_lines` · `erp_stock_requests` / `_lines` ·
`erp_stock_counts` / `_lines`

### 3.6 Accounting ✅
`erp_chart_of_accounts` · `erp_journal_entries` / `erp_journal_lines`
(double-entry) · `erp_account_map` · `erp_cost_centers` ·
`erp_fiscal_periods` · `erp_bank_accounts` ·
`erp_payment_vouchers` / `erp_receipt_vouchers`

### 3.7 Distribution / field sales ✅
`erp_routes` · `erp_rep_targets` (visits/journey plans live on customers +
sales orders)

### 3.8 Vertical modules ✅
- Clinic: `erp_patients` · `erp_clinic_visits` · `erp_clinic_appointments` ·
  `erp_clinic_services` · `erp_clinic_reference` (drug/lab/radiology, pg_trgm)
- Pharmacy: `erp_pharmacy_dispenses` / `_items`
- Restaurant: `erp_restaurant_tables` · `erp_restaurant_orders` / `_items`
- Salon: `erp_salon_services` · `erp_salon_appointments` · `erp_salon_tickets` / `_items`
- Laundry: `erp_laundry_services` · `erp_laundry_orders` / `_items`
- Hotel: `erp_rooms` · `erp_bookings`
- Gaming/services: `erp_work_sessions`
- Legacy: `erp_visits` (pre-ERP base, retained)

### 3.9 E-invoicing (ETA) ✅ (inert until configured)
`erp_company_eta_settings` + invoice `eta_*` columns + product `eta_item_code*`
(see `docs/ETA.md`)

### 3.10 Planned tables 🔜
`erp_departments` · `erp_teams` · `erp_job_titles` (org structure) ·
`erp_workflows` / `erp_workflow_steps` / `erp_workflow_instances` ·
`erp_dashboards` / `erp_dashboard_widgets` · `erp_custom_fields` / `erp_custom_values`

---

## 4. Modules (dynamic configuration)

A **module** is a feature area that can be turned on/off per company. The coarse
set (granted by plans) and finer item-level set:

```
Coarse (ALL_MODULES): sales, inventory, purchasing, accounting, hotel, clinic,
  restaurant, salon, pharmacy, laundry, market, wholesale, distribution
Finer (item-level):   pos, sales_orders, returns, warehousing
```

**Resolution** (in `src/lib/erp/auth-context.ts`): a tenant's visible modules =
`company_modules (enabled)` ∩ `plan_modules`. Platform owner/super admin see all.
The navigation (`src/lib/erp/navigation.ts`) filters sections/items by module
**and** permission, so screens appear only when both gates pass.

Defaults per industry come from `erp_business_type_modules` (a preset, seeded on
company creation). The **App Marketplace** and **Setup Wizard** then mutate
`erp_company_modules` via one guarded RPC.

---

## 5. Permissions & roles

Three-layer, per-tenant, granular:

1. **Catalog** — `erp_roles` + `erp_role_permissions` (29 permissions, global
   defaults). Permissions are dotted capabilities, e.g. `sales.sell`,
   `inventory.adjust`, `accounting.post`, `clinic.doctor`, `settings.users`.
2. **Business-type template** — `erp_business_type_roles` enables only the roles
   that fit the industry (clinic → admin/doctor/receptionist/accountant; FMCG →
   admin/sales_manager/supervisor/salesman/warehouse).
3. **Per-company** — `erp_company_roles` (which roles are on) +
   `erp_company_role_permissions` (the matrix the admin can edit in
   *Settings → Permissions*). This is authoritative; companies without their own
   config fall back to the catalog defaults.

Effective permissions for a user = union over their branch roles, resolved per
the company config. The **planned** dynamic permission model extends each role
with explicit action verbs per module: *view / create / edit / delete / approve
/ export / manage-settings* (`erp_company_role_permissions` gains an `action`
dimension).

---

## 6. Setup Wizard (Smart onboarding)

A **non-breaking layer above** the platform. It does not replace presets — it
**customizes the selected business-type template** based on the user's answers.

- Config: `src/lib/erp/setup-wizard.ts` — a declarative `SetupProfile` per
  business type (and a `GENERIC` profile so *every* type resolves, including
  Custom). Each profile carries: branching **questions**, toggleable **modules**,
  suggested **roles** (preview), suggested **dashboard KPIs** (preview).
- Flow (`/setup`): business questions → required-modules toggles → review
  (business type / enabled modules / suggested roles / KPIs) → *Create My
  Workspace*. Premium dark/glass UI, RTL/LTR, responsive, skippable.
- Persistence: only **modules** are written, via `erp_apply_setup_modules`
  (SECURITY DEFINER, admin-only, scoped to the caller's company); it also sets
  `companies.setup_done = true`. Roles are auto-seeded by the DB; dashboards are
  per-vertical — so those appear as a review/preview.
- Trigger: the `(app)` layout redirects a fresh company (`setup_done = false`)
  whose business type has a profile to `/setup`, **once**. Existing companies
  were backfilled `setup_done = true` (never prompted).

---

## 7. App Marketplace

*Settings → App Marketplace* (`/settings/marketplace`). The company admin can
**enable/disable any module at any time** without recreating the workspace —
each module is shown as an installable "app" card with an Installed badge.

It reuses the **same guarded write path** as the wizard
(`erp_apply_setup_modules`), so there is one safe place that mutates
`erp_company_modules`. Nav exposure is gated on the `settings.users` permission;
the page double-checks the `admin` role.

---

## 8. Organization structure (🔜 planned)

Today: **Companies → Branches → Users (by branch role)**. Planned expansion to a
full org model on the same core:

```
Company
 └─ Branches
     └─ Departments        (erp_departments)
         └─ Teams          (erp_teams)
             └─ Users  ─ Job title (erp_job_titles) ─ Reporting line (manager_id)
```

- `erp_departments(company_id, branch_id, name, manager_id)`
- `erp_teams(department_id, name, lead_id)`
- `erp_job_titles(company_id, name)` + `erp_user_branches.job_title_id`,
  `manager_id` for reporting lines.
- UI: *Settings → Organization* with department/team CRUD and an org chart.
- All RLS-scoped by `company_id`; reporting lines power workflow routing (§9) and
  scoped dashboards (§10).

---

## 9. Workflows / approvals (🔜 planned)

A per-company **approval engine** configured without code:

- `erp_workflows(company_id, entity, trigger, is_active)` — e.g. approve an
  invoice over a threshold, a purchase order, a stock transfer, an expense.
- `erp_workflow_steps(workflow_id, order, approver_type, approver_ref)` —
  approver types: branch manager, department manager, finance, governance, named
  role/user; supports **one-step** and **multi-step** chains.
- `erp_workflow_instances(workflow_id, entity_id, current_step, status)` —
  runtime state per document, with a final notification step.
- Resolution uses the org reporting lines (§8). Documents gain a `status` of
  `pending_approval` while an instance is open.
- Delivery in stages: (1) schema + config UI + mock runner, (2) wire to real
  documents (invoices/POs/expenses), (3) notifications.

---

## 10. Dashboards (scalable, 🔜 dynamic)

Today: each vertical renders a **purpose-built dashboard** (clinic queue,
restaurant floor, distribution KPIs, …) selected by `resolveHomePath()` and
gated by modules/permissions — already "different per business type, module, and
role."

Planned **dynamic** layer:
- `erp_dashboards(company_id, role, name)` + `erp_dashboard_widgets(dashboard_id,
  type, config, position)`.
- A widget catalog (KPI card, chart, list, map) bound to existing report queries.
- Dashboards vary by **company type · enabled modules · user role · branch ·
  department**. Setup-wizard KPI suggestions seed the first dashboard.

---

## 11. Custom fields / form builder (🔜 planned)

Let admins add fields without code:
- `erp_custom_fields(company_id, entity, key, label, type, options, required)`.
- Values stored in a `jsonb custom` column on the target entity (or
  `erp_custom_values`), rendered dynamically in forms and shown in print/exports.
- Start with one entity (e.g. products or customers), then generalize.

---

## 12. Accounting (how money flows)

Issuing a sale (or vertical billing) posts a **balanced double-entry** via
SECURITY DEFINER functions: stock-out + AR/Revenue journal + customer balance in
one transaction. A deferred constraint enforces `sum(debit) = sum(credit)` on
`erp_journal_lines`. The chart of accounts, vouchers, fiscal periods, and
financial reports read off these entries — so every vertical's revenue lands in
the same books.

---

## 13. Security & operations

- **RLS** on every tenant table; writes to sensitive config (modules, passwords)
  only via guarded SECURITY DEFINER functions.
- **HTTP security headers** (HSTS, nosniff, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) on every response.
- **Sentry** error monitoring (env-gated). **PWA** installable shell + offline.
- **CI**: typecheck + build, unit + DB-integration tests, Playwright smoke,
  staging-migrate + manual production-migrate, daily backups. See
  `docs/STAGING.md`, `docs/BACKUPS.md`, `docs/TESTING.md`, `docs/E2E.md`.
- **i18n**: ar/en with a parity test + a key-usage test (no raw keys reach UI).

---

## 14. Future roadmap

| Phase | Item | Status |
|---|---|---|
| 1 | Dynamic modules + per-company config | ✅ done |
| 1 | Industry presets + Smart Setup Wizard (all types + Custom) | ✅ done |
| 1 | App Marketplace (enable/disable anytime) | ✅ done |
| 1 | Granular per-company permission matrix | ✅ done |
| 2 | Organization structure (departments / teams / job titles / reporting) | 🔜 |
| 2 | Dynamic permission **actions** (view/create/edit/delete/approve/export) | 🔜 |
| 3 | Workflow / approval builder (multi-step) | 🔜 |
| 3 | Dynamic dashboard builder (widgets per role/branch/department) | 🔜 |
| 4 | Custom fields / form builder | 🔜 |
| 4 | AI Business Assistant (reports/sales/inventory Q&A) — env-gated arch | 🔜 |
| 5 | Data Integration Layer — Excel/CSV import (map/validate/import) + saved templates | 🔜 (see `docs/INTEGRATION.md`) |
| 5 | External integration — REST API, per-company API keys, webhooks, sync logs | 🔜 (see `docs/INTEGRATION.md`) |
| Ops | Real staging env + managed backups/PITR; ETA e-invoicing go-live | owner action |

**Guiding principle for every phase:** one shared core, dynamic configuration,
no per-industry forks, no duplicated logic, nothing hardcoded — so VANTORA
serves a one-person shop and an enterprise from the same platform.
