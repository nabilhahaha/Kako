# VANTORA — Master Platform Audit (CTO-Level)

> **Scope & method.** Generated from the actual codebase at `/home/user/Kako` (package
> `kako-fmcg`, v`0.1.0-beta.1`) via systematic exploration of source, migrations, API
> routes, and config. **Facts** are stated with file references. **Assessments** (maturity %,
> readiness, recommendations) are professional judgement derived from those facts and are
> **explicitly marked**. Where something could not be verified it is marked _Unverified_.
>
> **Naming note (fact):** the npm package is `kako-fmcg`; the brand appears as both "Kako"
> and "Vantora" (this document uses Vantora as the product name per request). The Vercel
> project is `kako`.
>
> **Date:** 2026-06-07 · **Branch audited:** `claude/offline-sync-architecture` (PR #125).

---

# Executive Summary

**What Vantora is (fact):** a single, monolithic **Next.js 15 / React 19** multi-tenant ERP
+ field-distribution platform (App Router, TypeScript strict), backed by **Supabase/Postgres**
with **175 SQL migrations** and **~157 tables**, shipping both as a **cloud SaaS** and an
**offline desktop edition** (Tauri 2.x + embedded Postgres + PostgREST). It targets Egyptian
SMB/distribution (currency EGP, Arabic-first i18n, ETA e-invoicing plumbed). It spans **44
app modules** including 8+ industry verticals.

## Current platform maturity — _Assessment_
- **Overall: ~72% production-grade for its core (FMCG/distribution + sales/inventory/finance),
  with a broad but uneven vertical surface.**
- Strong, tested core: sales→invoice→payment→GL is RPC-backed with automatic journal posting,
  idempotency keys, and audited reversal. Multi-tenant RLS is enforced broadly (121+ tables).
- Eight verticals are genuinely implemented (FMCG, wholesale, retail POS, pharmacy, clinic,
  restaurant, laundry, fashion); three are stubs (hotel, salon, electrical); one absent
  (workshop).
- A large, recently-built **offline-first SmartSync** subsystem (this PR) is **code-complete +
  branch-validated but flag-gated off** and not yet exercised in a real deployment.

## Major strengths (fact-based)
1. **Financial integrity primitives**: atomic RPCs (`erp_issue_invoice`, `erp_record_payment`,
   `erp_void_invoice`), journal triggers, **partial-unique idempotency indexes** on invoices
   and payments, audited void.
2. **Mature multi-tenant + RBAC model**: company/branch/user, ~76 permissions, 20 roles,
   plan→module entitlements, super-admin/platform-owner tiers, RLS helpers.
3. **Breadth**: 8 working verticals + FMCG field execution (GPS visits, journeys, van
   reconciliation, surveys, MSL, outlet grading) + 6 ERP connectors (SAP, D365, Odoo,
   NetSuite, generic REST, CSV/SFTP).
4. **Operational tooling**: high-maturity import engine (validation/rollback/monitor), pricing
   engine (UOM + multi-tier + date windows), custom fields, attachments, exports.
5. **Offline desktop edition** with bootstrap/backup/restore/rollback scripts and a licensing
   server.
6. **Engineering hygiene**: TS strict, Vitest unit + Playwright e2e + integration CI, Sentry,
   k6 load script, ~150 architecture docs.

## Major risks (fact-based)
1. **GL is post-facto only** — no manual journal-entry builder found; all GL is trigger-posted
   from sales/payments. Accounting screens appear read-only. _(Risk for businesses needing
   adjusting entries / full books.)_
2. **SmartSync is unproven in production** — comprehensive and branch-validated, but never run
   with the flag on against a live tenant; needs the cutover (env + migrations 0001–0005 +
   real-browser pass). Offline **binary/photo** sync not implemented (require-online).
3. **Vertical unevenness** — hotel/salon/electrical are incomplete; selling them today would
   over-promise.
4. **Reporting has no unified BI/query engine** — scattered per-entity report screens only.
5. **Two parallel audit-log tables** (`erp_audit_logs` + `public.audit_logs`) and **two FMCG
   i18n files** (`fmcg.ts`, `fmcgw1.ts`) suggest some duplication/legacy.
6. **Beta versioning** (`0.1.0-beta.1`) — no released GA baseline.

## Production readiness — _Assessment_
**Cloud SaaS core is production-deployable today for FMCG/distribution + retail/wholesale +
the working verticals**, with the caveats above (GL depth, reporting). **SmartSync and ETA are
NOT production-on** (both intentionally gated). See per-area scores in *Production Readiness*.

## Pilot readiness — _Assessment_
**High.** The core is pilot-ready now; SmartSync has a dedicated, validated cutover runbook
(`PILOT_CUTOVER_CHECKLIST.md`) and passes financial-integrity + concurrency + security
validation on isolated branches. A controlled single-tenant pilot (with or without SmartSync)
is the right next step.

---

# Repository Map

**Type (fact):** single monolithic Next.js app — **not** a monorepo (no workspaces).
`package.json` name `kako-fmcg`, ESM, version `0.1.0-beta.1`.

**Stack (fact):** Next.js 15.1.4 · React 19.0.0 · TypeScript 5.7.2 · Tailwind 3.4.17 ·
Zustand 5 · TanStack Query 5 · Supabase JS · Sentry 10 · Vitest 4.1.7 · Playwright 1.60 ·
Tauri 2.x · Recharts · xlsx.

## Top-level structure (fact)
| Path | Contents |
|---|---|
| `src/app/` | Routes: `(app)/` (44 modules), `api/`, `auth/`, `rest/` (offline PostgREST proxy), `print/` |
| `src/components/` | UI (shadcn-style), feature components (sync, fashion, shared) |
| `src/lib/` | Domain logic: `erp/` (auth, guards, permissions, pricing, import, connectors, eta, workflow), `sync/` (offline engine), `i18n/` (61 message modules), `supabase/`, `offline/`, `edition/` |
| `supabase/migrations/` | **175** SQL migrations (`0001`–`0175`); `demo/` seeds; `functions/` (edge) |
| `docs/` | ~150 markdown architecture/deployment docs incl. `architecture/offline-first-sync.md` and `architecture/sync/proposed-migrations/` (0001–0005, review-only) |
| `scripts/` | `offline/` (13 lifecycle scripts), `release/`, `loadtest/k6-lists.js`, backup/restore |
| `e2e/` | Playwright tests |
| `.github/workflows/` | `ci`, integration, `e2e`, `offline-release`, `release`, `migrate-staging`, `backup` |
| `licensing-server/` | License verification service (offline edition) |
| `src-tauri/` | Desktop shell (offline edition) |

- **Apps (fact):** one (the Next.js app). Offline desktop is the same app wrapped by Tauri.
- **Packages (fact):** none (no internal workspace packages).
- **Shared libraries (fact):** `src/lib/**` (in-repo modules, not published packages).
- **Services (fact):** `licensing-server/`; offline PostgREST gateway (supervised by Tauri).
- **Background jobs (fact):** Vercel Cron → `/api/internal/sync-tick` and `/api/sync/reconcile`
  (both `*/15 * * * *`, `vercel.json`).
- **Scripts (fact):** offline bootstrap/db/migrate/seed/backup/restore/rollback/update/verify,
  release bundlers, k6 load test.
- **Migrations (fact):** 175 in `supabase/migrations/` + 5 review-only sync migrations in
  `docs/architecture/sync/proposed-migrations/`.

---

# Platform Architecture

_All facts; references in `src/lib/erp/{auth-context,guards,permissions}.ts` and migrations
0005/0006/0018._

- **Multi-tenant model:** tenant = **`erp_companies`**. Isolation by `company_id` enforced via
  RLS (`erp_user_company_id()`). 121+ tables have RLS enabled. Platform owner / super admin
  bypass tenancy.
- **Authentication model:** Supabase Auth (cloud); **offline edition** uses local Postgres
  users (`erp_local_users`) + locally-signed PostgREST JWTs (`/auth/v1/*`, migrations
  0174–0175). API-key auth for inbound `/api/v1/[entity]` (`vtk_live_…`, `erp_api_key_resolve()`).
  Cron auth via `CRON_SECRET` bearer.
- **Authorization model:** role→permission grants resolved per request in `getUserContext()`
  (`cache()`-memoized). Guards: `requireAuth/requireSuperAdmin/requireModule/requirePermission/
  requireAnyPermission/requireCapability/requireNonRetailAdmin`. Capability layer (`can/canAny`)
  for granular/legacy aliases. ~76 permissions, 20 roles.
- **Company model:** `erp_companies` (name, tax/CR number, currency EGP, plan_key, business_type,
  modules). Plan→module entitlement via `erp_plan_modules` ∩ `erp_company_modules`.
- **Branch model:** `erp_branches` (company_id, code, is_hq/is_default, region/area). FMCG geography
  layers `erp_regions` → `erp_areas` → branches.
- **User model:** `erp_profiles` (1:1 auth user; `is_super_admin`, `is_platform_owner`) +
  `erp_user_branches` (M:N user↔branch with per-branch `role`, `is_default`, `reports_to`).
  `companyId` derived from the user's default branch. A user may span branches of multiple
  companies; UI uses the default tenant. `topRole` (rank-ordered) drives nav.
- **Permission model:** flat keys stored in `erp_role_permissions` (global) /
  `erp_company_role_permissions` (tenant override); super admin → ALL; `fashion.manage`
  umbrella expands to the fashion.* set. Visibility scope (region/area/branch) enforced
  separately from permissions.
- **RLS model:** SECURITY DEFINER helpers `erp_is_super_admin()`, `erp_is_platform_owner()`,
  `erp_user_company_id()`, `erp_user_branch_ids()`, `erp_has_branch_access(branch)`. Typical
  policy: `USING (erp_is_platform_owner() OR company_id = erp_user_company_id())`. Financial
  RPCs additionally gate on `erp_has_branch_access()`.

---

# Complete Module Inventory

_Status legend:_ ✅ implemented · ⚙️ partial · 🧪 stub/experimental · 🔒 flag-gated.
Readiness % are _Assessments_.

### Core ERP
| Module | Purpose | Status | Rdy% | Main screens | Main APIs (server actions) | Main tables | Missing |
|---|---|---|---|---|---|---|---|
| `sales` | Invoices, orders, returns, pricing, POS, settlement, journey | ✅ | 85 | invoices(+print), orders, returns, pricing, price-book, pos, settlement | createInvoice/issue/recordPayment/void/eta; orders; returns; pricing | erp_invoices, erp_invoice_lines, erp_payments, erp_sales_orders, erp_sales_returns | unified order→invoice automation; richer credit UI |
| `customers` | CRM hub, 360, statements, credit requests | ✅ | 82 | list, [id], 360, statements, statement/print | 8 actions | erp_customers, erp_credit_limit_requests, erp_workflow_instances | dedupe/merge UI |
| `suppliers` | Vendor mgmt, statements | ✅ | 78 | list, [id], statements | 3 | erp_suppliers | aging depth |
| `products` | Catalog, categories, UOM | ✅ | 82 | products | 6 | erp_products_catalog, erp_product_categories | — |
| `inventory` | Stock, movements, counts, expiry, transfers, adjustments, requests, variance, low-stock, labels | ✅ | 84 | 10 screens | count/requests/adjustments/transfers | erp_inventory_stock, erp_stock_movements, erp_stock_counts, erp_transfer_orders | lot/serial depth outside fashion/electrical |
| `warehouses` | Warehouse master | ✅ | 80 | list | 2 | erp_warehouses | — |
| `purchases` | PO + purchase returns | ✅ | 70 | orders, returns | 1 file | erp_purchase_orders, erp_goods_receipts, erp_purchase_returns | receiving UX depth, 3-way match |
| `accounting` | Journal, vouchers, aging, chart, reports | ⚙️ | 55 | journal, vouchers, aging, chart, reports | vouchers (3) | erp_journal_entries/lines, erp_chart_of_accounts, erp_fiscal_periods | **manual GL entry**, period close UX, statements engine |
| `exports` / `attachments` | CSV exports; file attachments | ✅ | 80 | exports | 6 / 3 | (multi) / erp_attachments | parquet/incremental export |

### Field / Distribution (FMCG)
| Module | Purpose | Status | Rdy% | Notes |
|---|---|---|---|---|
| `field` | Rep journey, GPS check-in, van stock, survey, van-reconciliation | ✅ | 85 | erp_visits, erp_work_sessions, erp_fmcg_settings; 11 actions |
| `distribution` | 15 dashboards: compliance, MSL, OOS, perfect-store, assortment, targets, routes, grading, returns-analysis, retail-cockpit | ✅ | 75 | analytics-heavy; erp_rep_targets, erp_routes |
| `fmcg` | API module: pricing, targets, returns, UOMs (22 actions) | ✅ | 82 | erp_prices, erp_product_uoms, erp_targets, erp_return_reasons |
| `rep` | Rep portal | ✅ | 78 | erp_visits, erp_work_sessions |

### Industry verticals
| Module | Status | Rdy% | Tables | Gap |
|---|---|---|---|---|
| `market` (retail POS) | ✅ | 85 | (POS via cashierCheckout) | — |
| `wholesale` | ✅ | 85 | erp_wholesale_tiers/prices/customer_tier | — |
| `pharmacy` | ✅ | 78 | erp_pharmacy_dispenses(+items) | sale is via POS; dispense is a regulatory log |
| `clinic` | ✅ | 80 | erp_patients, erp_clinic_visits/appointments/services | billing depth |
| `restaurant` | ✅ | 80 | erp_restaurant_tables/orders(+items) | payments/splits depth _Unverified_ |
| `laundry` | ✅ | 78 | erp_laundry_orders(+items)/services | — |
| `fashion` | ✅ | 88 | erp_fashion_* (variants/colors/sizes), installments, cash_sessions, expenses | most mature vertical |
| `hotel` | 🧪 | 30 | erp_rooms, erp_bookings | no billing/checkout |
| `salon` | ⚙️ | 55 | erp_salon_appointments/services/tickets | no payment flow |
| `electrical` | 🧪 | 30 | erp_product_serials, warranties, rma | no order/invoice integration |
| workshop | ❌ | 0 | — | absent |

### Dashboards / monitoring / approvals
`dashboard`, `today`, `manager`, `supervisor`, `territory`, `coaching`, `attention`,
`approval-center`, `approvals`, `notifications`, `reports` — ✅ mostly read-only aggregators
(_Assessment_ 60–75%). `copilot` (AI next-best-actions) — ✅ backend, feeds attention/approvals.

### Admin / internal (hidden) modules
- **`settings/` (29 sub-modules, fact):** organization, staff, users, permissions, authz,
  workflows, **field-governance (20 actions)**, **integrations (connections/api-keys/sync/
  webhooks, 18 actions)**, regions, branches, **msl (10)**, outlet-grades, surveys, uom,
  custom-fields, printer, einvoice (ETA), data-onboarding, customer-data, export, backup,
  import, sync, marketplace, integration-hub, onboarding, store, audit-log, updates.
- **`platform/` (10 sub-modules, fact):** companies (13 actions), plans (7), staff (4),
  billing (4), roles (6), activity, analytics, audit, copilot-analytics, drugs. _This is the
  vendor/SaaS control plane._
- **Account/utility:** `account`, `upgrade`, `design` (design-system reference), `collections`
  (receipt print).

---

# Database Inventory

**Fact:** ~157 tables (154 `erp_*`, ~11 `ts_*` trade-spend, ~3 `public.*`) across 175 migrations.
Grouped below; readiness % are _Assessments_ of how fully each is wired into flows.

### Master data
`erp_companies`, `erp_branches`, `erp_user_branches`, `erp_regions`, `erp_areas`,
`erp_products_catalog`, `erp_product_categories`, `erp_product_uoms`, `erp_prices`,
`erp_customers` (+lookups/attributes/opening_balances/change_requests/transfers),
`erp_suppliers` (+opening_balances), `erp_warehouses`, `erp_routes` (+route_customers),
`erp_sequences`. **Rdy ~85%.** Relationships: branch→company, customer/product/warehouse→branch/company.

### Transactions
`erp_sales_orders`(+lines), `erp_invoices`(+lines), `erp_sales_returns`(+lines),
`erp_purchase_orders`(+lines), `erp_goods_receipts`(+lines), `erp_purchase_returns`(+lines),
`erp_stock_requests`(+lines), `erp_transfer_orders`(+lines), `erp_van_transfers`(+lines),
`erp_visits`, `erp_survey_responses`. **Rdy ~85%** (sales path) / ~70% (purchasing).

### Financial
`erp_payments`, `erp_supplier_payments`, `erp_journal_entries`(+lines),
`erp_chart_of_accounts`, `erp_fiscal_periods`, `erp_cost_centers`, `erp_payment_vouchers`,
`erp_receipt_vouchers`, `erp_bank_accounts`, `erp_account_map`, installment tables, cash
sessions/movements, expenses. Key: `erp_invoices.idempotency_key`/`erp_payments.idempotency_key`
(partial-unique). **Rdy ~65%** (posting solid; manual GL/period-close thin).

### Inventory
`erp_inventory_stock` (unique warehouse×product), `erp_stock_movements` (signed, typed),
`erp_stock_counts`(+lines), `erp_stock_adjustments`, `erp_van_reconciliations`(+lines).
**Rdy ~82%.**

### CRM / field
`erp_customers` + change_requests/transfers, `erp_journey_plans`, `erp_rep_targets`,
`erp_targets`, `erp_work_sessions`, `erp_visit_compliance`, `erp_surveys`/responses,
`erp_msl_*`, `erp_outlet_grade*`. **Rdy ~75%.**

### Operations / config
`erp_field_config`/access/sections/templates/versions, `erp_fmcg_settings`, `erp_ops_settings`,
`erp_day_close_skips`, `erp_roles`/role_permissions/company_roles/business_type_roles/role_limits/
role_scope, `erp_plans`/plan_modules/company_modules/business_type_modules, `erp_backups`,
`erp_notifications`, `erp_workflow_instances`, `erp_copilot_queries`. **Rdy ~75%.**

### Audit
`erp_audit_logs`, `public.audit_logs` (**two audit tables — duplication risk**),
`erp_attachments`, signature columns (`voided_by/at`, `approved_by`, `posted_by`, `received_by`).
**Rdy ~70%.**

### Sync (cloud mirror + integration)
`erp_sync_jobs`, `erp_sync_runs`, `erp_integrations`, `erp_webhooks`, `erp_integration_logs`,
`erp_api_keys`; **plus review-only (not yet applied):** `sync_rows`, `sync_ingest`,
`sync_review`, `sync_reconcile`, `sync_reconcile_log`, `sync_impersonation_log`. **Rdy:**
connector sync ~80%; offline mirror/reconcile **flag-gated, ~85% code, 0% in prod**.

### Verticals (tables)
Clinic (`erp_patients`, `erp_clinic_*`), pharmacy (`erp_pharmacy_*`), salon (`erp_salon_*`),
restaurant (`erp_restaurant_*`), hotel (`erp_rooms/bookings`), laundry (`erp_laundry_*`),
fashion (`erp_fashion_*`, installments, cash). Trade-spend (`ts_*`, 11 tables — _separate
sub-system; usage Unverified_).

---

# API Inventory

_All facts (`src/app/api/**`, `src/app/auth/**`, `src/app/rest/**`)._

| Route | Methods | Auth | Status |
|---|---|---|---|
| `/api/health` | GET | public | ✅ live |
| `/api/export` | GET | session + `integrations.manage` + entity perm | ✅ live |
| `/api/v1/[entity]` | POST | API key (`vtk_live_…`) + scope + rate limit | ✅ live (inbound integrations) |
| `/api/internal/sync-tick` | GET/POST | `CRON_SECRET` + service role | ✅ live (connector cron) |
| `/api/sync/pull` | GET | flag + session | 🔒 KAKO_SYNC |
| `/api/sync/push` | POST | flag + session | 🔒 KAKO_SYNC |
| `/api/sync/backup` | GET | flag + session + admin | 🔒 KAKO_SYNC |
| `/api/sync/review` | GET/POST | flag + session + admin | 🔒 KAKO_SYNC |
| `/api/sync/reconcile` | GET/POST | flag + `CRON_SECRET` + service role | 🔒 KAKO_SYNC (cron) |
| `/api/sync/reconcile/status` | GET | flag + session + admin | 🔒 KAKO_SYNC |
| `/api/sync/reconcile/retry` | POST | flag + session + admin | 🔒 KAKO_SYNC |
| `/auth/signout` | POST | session | ✅ |
| `/auth/v1/token` `/user` `/logout` | POST/GET | offline-only (404 on cloud), local JWT | 🔒 KAKO_OFFLINE |
| `/rest/v1/[...path]` | GET/POST/PATCH/PUT/DELETE/HEAD | offline-only, forwards to local PostgREST | 🔒 KAKO_OFFLINE |

> **Observation:** most server-side business logic runs through **Next.js server actions**
> (100+ action files), not REST routes — the API surface above is intentionally small.

---

# Feature Flag Inventory

_All facts (`src/lib/sync/flag.ts`, `src/lib/supabase/config.ts`, `src/lib/edition/`,
`src/lib/offline/runtime.ts`)._

| Flag | Description | Current usage | Default | _Recommended future name_ |
|---|---|---|---|---|
| `KAKO_SYNC` | Server gate for offline-sync subsystem (`/api/sync/*` 404 when off) | This PR's engine/reconcile | **off** | `VANTORA_SYNC` |
| `NEXT_PUBLIC_KAKO_SYNC` | Client gate for offline UX/console (build-time inlined) | offline UX, sync console, badges | **off** | `NEXT_PUBLIC_VANTORA_SYNC` |
| `KAKO_OFFLINE` | Desktop offline edition (standalone output, local origin) | Tauri build, offline auth/REST | **off** | `VANTORA_OFFLINE` |
| `KAKO_EDITION` | Multi-edition packaging: retail/fmcg/pharmacy/restaurant | brand/seed/license/bundle | `retail` | `VANTORA_EDITION` |
| `KAKO_LICENSE_PUBLIC_KEY` | Offline license signature verification key | license server action | unset | `VANTORA_LICENSE_PUBLIC_KEY` |
| `KAKO_REQUIRE_LICENSE` | Soft license enforcement gate | startup | off | `VANTORA_REQUIRE_LICENSE` |
| `CRON_SECRET` | Bearer auth for cron routes | sync-tick, reconcile | unset | keep |
| `ETA_ENVIRONMENT` / `ETA_CLIENT_ID` / `ETA_CLIENT_SECRET` / `ETA_SIGNING_URL` / `ETA_SIGNING_TOKEN` | Egyptian e-invoicing; inert until all set | invoice→ETA | unset | keep |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role | inbound API, sync workers | unset | keep |
| `SUPABASE_JWT_SECRET` | **(added this PR)** mints reconcile impersonation tokens | order reconciliation | unset | keep |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Cloud endpoints (fallback to literals unless offline) | everywhere | literal fallback | keep |
| `KAKO_OFFLINE_JWT_SECRET` / `_PG_PORT` / `_PGRST_PORT` / `_APP_PORT` / `_HOME` | Offline runtime config | offline edition | defaults | rename prefix |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_*` | Error monitoring + source maps | Sentry | unset | keep |

> **Observation:** module/plan **entitlements** (`isModuleGateOpen`, plan→module) act as a
> second, data-driven "feature flag" layer distinct from env flags.

---

# SmartSync Audit

_Facts from `src/lib/sync/**`, routes, and the proposed migrations; behaviors **branch-validated
this session** (branches since deleted). Overall code-complete, **flag-gated off**, **not yet
run in production**._

| Capability | Implementation (fact) | Readiness _(Assessment)_ |
|---|---|---|
| **Offline writes** | `submitOffline` (queue+journal) / `submitOnlineOnly` (graceful block) wired into POS, wholesale, customers, visits, GPS check-in, surveys; financial/stock flows require-online | 90% (binary/photo uploads still require-online) |
| **Outbox** | IndexedDB append-only outbox + orchestrator; status states; flag-off passthrough | 90% |
| **Sync engine (mirror)** | `/api/sync/{push,pull}` → `sync_commit()` exactly-once (`sync_ingest`), LWW + append-only policy, conflict→`sync_review` | 85% (needs prod soak) |
| **Reconciliation** | Pure `reconcile()`/`reconcileOne()` engine, `sync_reconcile` ledger + `sync_reconcile_log`, due/mark RPCs, cron route; **offline orders → real invoices via the same audited cores** | 85% |
| **Impersonation** | Worker acts AS originating cashier (auth.uid()) so audited RPCs run with correct authority + `created_by`; safer than service-role | 90% |
| **JWT hardening** | 60s TTL, unique `jti` per op, `iss`/`purpose` scope, audited to `sync_impersonation_log` before use, fail-closed; pure `mintReconcileToken` (7 unit tests) | 90% |
| **Concurrency protection** | Partial-unique `uq_erp_invoices_idem` / `uq_erp_payments_idem`; `FOR UPDATE` + status guard on issue; `createInvoiceCore` catches 23505 race-loss | 90% (validated; true parallel soak passed on branch) |
| **Replay protection** | idempotency_key dedupe (invoice + payment), unique `jti` (impersonation), ledger exactly-once | 88% |
| **Retry** | capped exponential backoff (30s·2ⁿ, max 1h) via `next_attempt_at` | 90% |
| **Dead-letter** | terminal `failed` (`reason=dead-letter`) after 6 attempts, parked far-future, never dropped | 90% |
| **Operator console** | `settings/sync` reconciliation panel: counts, attention queue, on-demand retry (per record / all); status + retry APIs | 80% |

**SmartSync gaps:** real-browser pass with flag on; production migration apply (0001–0005);
blob/photo offline outbox; mirror→business reconciliation is implemented for **orders +
customers** only (visits/surveys queue to mirror, handlers pending); parallel-load proven via
DB serialization not multi-process HTTP soak; JWT-secret rotation is operational (lockstep).

---

# Financial Integrity Audit

_All facts (migrations 0005/0013/0026/0118/0165 + session validation)._

- **Invoice flow:** `createInvoice(Core)` inserts draft (`erp_next_number` numbering, customer
  status/credit/stock pre-checks) → `erp_issue_invoice` (branch-auth gate, stock-out via
  `erp_stock_movements`, status→issued, customer balance += net) → **trigger
  `trg_erp_journal_on_invoice_issued`** posts DR AR(1200)/CR Revenue(4100).
- **Payment flow:** `erp_record_payment` (idempotency early-return, validation, insert
  `erp_payments`) → **trigger `trg_erp_journal_on_payment`** posts DR Cash(1100)/CR AR(1200),
  updates `paid_amount` + status (paid/partially_paid), customer balance -= amount.
- **Stock movement flow:** all stock changes via typed signed `erp_stock_movements`
  (sale_out/return_in/transfer/adjustment/opening); `erp_inventory_stock` updated; concurrent
  decrements proven race-safe (branch soak: per-warehouse exact, no lost updates).
- **Accounting flow:** auto-posted journal entries (status `posted`) linked by reference_type/
  reference_id to source docs; `erp_void_invoice` posts the mirror reversal + restocks + audits
  (manager-only, unpaid/un-returned only). **Gap:** no manual GL entry builder found.

**Protections (fact):**
| Threat | Protection |
|---|---|
| Duplicate invoices | `uq_erp_invoices_idem` (partial unique on idempotency_key) + `createInvoiceCore` check + 23505 catch |
| Duplicate payments | `uq_erp_payments_idem` + RPC idempotency early-return + `EXCEPTION WHEN unique_violation` no-op |
| Replay attacks | idempotency_key dedupe; impersonation unique `jti`; mirror exactly-once (`sync_ingest`) |
| Double submit | same idempotency_key collapses to one invoice/one payment (validated 6-way concurrent) |
| Double stock deduction | `erp_issue_invoice` `FOR UPDATE` + status≠draft guard → issue exactly once |
| Race conditions | unique indexes serialize; resumable+idempotent cores; reconcile ledger + backoff |

**Validation evidence (this session, isolated branches, since deleted):** offline order →
correct numbering, stock-out, AR journal, payment, balance=0; replay = full no-op; 4 concurrent
workers × 50 sales = 200 invoices/200 payments/0 duplicates; 6-way same-pk collision → exactly
one of everything.

---

# Security Audit

_Facts + observations._
- **Authentication:** Supabase Auth (cloud) / local JWT (offline) / API-key (inbound) / cron
  bearer. Multiple distinct, scoped mechanisms — good separation.
- **Authorization:** centralized guards + permission/capability resolution; tier precedence
  (super admin ≥ platform owner ≥ user) consistent.
- **RLS:** enabled on 121+ tables; tenant + branch isolation via SECURITY DEFINER helpers;
  representative policy gates on `company_id = erp_user_company_id()`.
- **JWT:** offline PostgREST JWTs + the new reconcile impersonation tokens (60s, scoped,
  audited, fail-closed). Validated: expired/absent identity → branch access denied; token
  cannot exceed the user's branch grants.
- **Service-role usage:** confined to server-only routes (inbound API, sync workers); not in
  client bundle (config comment + import sites). Reconcile worker prefers **impersonation over
  service-role** for financial writes (RLS still applies) — a notable security positive.
- **Impersonation:** only the reconcile worker; every mint audited to `sync_impersonation_log`
  with unique `jti`; raw token never logged.
- **Sensitive APIs:** `/api/v1` (scope + rate limit), `/api/export` (perm-gated), cron routes
  (secret), sync admin routes (admin + flag).

**Risks / follow-ups (Assessment):**
1. `SUPABASE_JWT_SECRET` must be rotated in lockstep with the project JWT secret (operational
   hazard if forgotten) — documented but enforce via runbook.
2. Hardcoded cloud URL/anon fallback in `config.ts` (by design; anon key is public) — confirm
   pilot/prod always set explicit envs.
3. Two audit-log tables — consolidate to avoid gaps in coverage.
4. `requires_credit_review` over-limit drafts are not auto-posted (good), but ensure finance
   actually works the queue (process risk, not code).
5. No evidence reviewed of rate-limiting on session routes / brute-force protection on offline
   local auth — _Unverified; recommend review._

---

# Industry Pack Assessment

_Readiness % = Assessment; "missing" from agent findings._

| Pack | Rdy% | Missing | Priority _(Assessment)_ |
|---|---|---|---|
| **FMCG Distribution** | 85 | deeper aggregated BI; binary-offline for proof photos | **P0 (flagship)** |
| **Wholesale Distribution** | 85 | none major | **P0** |
| **Retail (supermarket POS)** | 85 | loyalty depth, shift/cash-up reports | **P0** |
| **Pharmacy** | 78 | insurance/Rx pricing, regulator reporting | P1 |
| **Clinic** | 80 | billing/insurance, EMR depth | P1 |
| **Restaurant** | 78 | split/partial payments _(Unverified)_, KDS hardware | P1 |
| **Laundry** | 75 | SMS/pickup logistics | P2 |
| **Workshop** | 0 | entire module (job cards, labor, parts, RMA) | P2 (net-new) |

> Not requested but present: **Fashion (88%)** — most mature vertical; **Salon (55%, no
> payments)**; **Hotel (30%, no billing)**; **Electrical/RMA (30%)**.

---

# Module Governance Assessment _(recommendation)_

Mapped to the existing plan→module entitlement system (`erp_plan_modules`).

- **Core (every plan):** sales, customers, products, inventory, warehouses, suppliers,
  purchases, accounting (read/posting), dashboard/today, account, notifications, settings
  (org/users/branches), exports.
- **Optional (add-on toggles):** custom-fields, surveys, attachments, workflows, reports hub,
  pricing tiers/price-book, MSL/outlet-grades.
- **Premium (per-vertical packs):** FMCG field execution (journey/GPS/van/distribution),
  wholesale tiers, retail POS, fashion, clinic, pharmacy, restaurant, laundry.
- **Enterprise:** Integration Hub (SAP/D365/Odoo/NetSuite/SFTP), ETA e-invoicing, SmartSync
  offline + reconciliation, multi-company/platform control plane, advanced authz/field-governance,
  API keys + inbound `/api/v1`, backup/restore + offline desktop edition.

**Packaging strategy (recommendation):** sell a **Core ERP** base + one **Industry Pack**
(Premium) + **Enterprise** as integration/offline/e-invoicing upsell. Gate stubs (hotel/salon/
electrical/workshop) out of the sellable catalog until completed. The entitlement plumbing
already exists, so this is largely catalog/marketing configuration, not new engineering.

---

# Missing Features — Prioritized Roadmap _(Assessment)_

**P0 (blocks confident GA of the core):**
- Manual GL / journal entry + period close UX (accounting is currently post-facto only).
- SmartSync pilot cutover executed (env + migrations 0001–0005 + real-browser pass) if offline
  is in the first sale.
- Consolidate the two audit-log tables; confirm audit coverage on all financial mutations.
- Reporting: a minimal unified query/export for sales/AR/inventory (beyond per-screen reports).

**P1:**
- Offline **binary/photo** outbox (proof-of-delivery, attachments) for SmartSync.
- Reconcile handlers for visits/surveys (orders + customers done).
- Restaurant split payments; pharmacy insurance pricing; clinic billing — vertical depth.
- Brute-force / rate-limit review on auth (cloud + offline).

**P2:**
- Complete or formally shelve hotel, salon, electrical; build workshop if demanded.
- Centralized BI/dashboard engine.
- 3-way purchase match; supplier aging depth.
- Trade-spend (`ts_*`) integration clarity / promo management.

**P3:**
- Parquet/incremental export; data warehouse feed.
- Rename `KAKO_*` flags to `VANTORA_*`; remove `fmcgw1.ts` legacy duplication.
- Plugin SDK for third-party vertical packs.

---

# Technical Debt _(facts + observations)_

- **Known issues / duplication:** two audit-log tables (`erp_audit_logs`, `public.audit_logs`);
  two FMCG i18n files (`fmcg.ts`, `fmcgw1.ts`); naming split Kako/Vantora.
- **Refactor candidates:** accounting screens (read-only → add write path); reporting (unify);
  `distribution` (15 overlapping dashboards — consolidate); session-coupled financial actions
  were partially decoupled into cores (`invoice-core`/`cashier-core`) this PR — extend that
  pattern to returns/purchases for reuse + testability.
- **Temporary / phase-gated implementations:** ETA "fully plumbed but guarded (Phase 2)";
  SmartSync entirely behind flags with **review-only** migrations not applied to prod;
  `KAKO_REQUIRE_LICENSE` soft gate.
- **Experimental:** `copilot` (AI next-best-actions) — backend present, surface limited;
  trade-spend `ts_*` subsystem — usage/UI _Unverified_.
- **Stubs not production-safe to sell:** hotel, salon (no payments), electrical, workshop(absent).

---

# Production Readiness Scores _(Assessment)_

| Area | Score | Basis |
|---|---|---|
| **Platform Core** (multi-tenant, auth, RBAC, RLS) | **85%** | mature, broadly enforced; some authz hardening review |
| **CRM** (customers, 360, statements, credit) | **80%** | solid; merge/dedupe + reporting gaps |
| **Sales** (invoice/POS/returns/pricing) | **85%** | RPC-backed, idempotent, audited |
| **Inventory** | **82%** | movements/counts/transfers solid; lot/serial uneven |
| **Financial** | **65%** | posting + integrity strong; **manual GL/period-close/statements thin** |
| **SmartSync** | **85% code / 0% in prod** | validated on branches; cutover + soak pending |
| **Security** | **80%** | strong model; rotation/rate-limit/audit-consolidation follow-ups |
| **Scalability** | **65% _(Unverified)_** | Postgres+RLS+server actions; FK indexing migrations exist (0157–0159), k6 script present, but no load results reviewed |
| **Reporting** | **50%** | per-entity screens; no unified BI engine |

---

# Commercial Readiness

**What can be sold today _(Assessment)_:**
- **FMCG / wholesale distribution** and **retail POS** as the flagship — strongest, most
  complete, with field execution and offline desktop option.
- **Fashion retail** (variants, installments, cashbox) — very mature.
- **Pharmacy, clinic, restaurant, laundry** — sellable as vertical packs with light scoping
  caveats (billing/insurance/payment depth varies).
- **Integration Hub** (SAP/D365/Odoo/NetSuite/SFTP) and **ETA e-invoicing** as enterprise
  upsells (ETA needs certificate/credential onboarding).

**What should NOT be sold yet:**
- **Hotel, salon, electrical/RMA, workshop** (incomplete/absent).
- **SmartSync offline** as a contractual guarantee until the pilot cutover + real-browser pass
  complete (it's pilot-grade, not GA-proven).
- **Full accounting/books** to customers needing manual GL, adjusting entries, or statutory
  financial statements — current GL is auto-posted/read-only.

**Recommended first-customer profile _(Assessment)_:** a single-country (Egypt) **FMCG
distributor or multi-branch retailer/wholesaler**, Arabic-first, 1–20 branches, that needs
sales + inventory + field reps + basic finance, and does **not** require deep statutory
accounting on day one.

**Recommended pilot profile:** one such distributor/retailer, one region, with SmartSync **off**
initially (cloud-only) → enable SmartSync for one route/store per `PILOT_CUTOVER_CHECKLIST.md`
once finance signs off.

**Recommended pricing tiers _(recommendation)_:**
- **Core** — base ERP (sales/inventory/CRM/basic finance), per branch + per user.
- **Industry Pack** — one vertical (FMCG/retail/wholesale/fashion/pharmacy/clinic/restaurant/
  laundry), premium add-on.
- **Enterprise** — Integration Hub + ETA + SmartSync offline + multi-company + API access +
  offline desktop, seat/branch + platform fee.

---

# Final CTO Assessment

**What exists today (fact):** a broad, multi-tenant Egyptian ERP + FMCG field platform —
44 modules, ~157 tables, ~76 permissions/20 roles, RPC-backed financial core with automatic
GL posting and idempotency, 8 working verticals, 6 ERP connectors, ETA e-invoicing (plumbed),
an offline desktop edition, a vendor control plane, and a freshly-built, branch-validated
offline-first SmartSync + reconciliation subsystem (flag-gated).

**What is truly production-ready _(Assessment)_:** the cloud core — sales, inventory, CRM,
multi-tenant/RBAC/RLS, pricing, import, connectors — and the FMCG/wholesale/retail/fashion
verticals; pharmacy/clinic/restaurant/laundry with scoping caveats. ETA code is production-grade
but awaits certification.

**What is pilot-ready _(Assessment)_:** SmartSync offline + offline-order reconciliation (with
the documented cutover); the partial verticals only as design-partner pilots.

**Top 10 gaps before large-scale rollout _(Assessment)_:**
1. Manual GL / journal entry + period close + statutory statements (financial depth).
2. SmartSync production cutover proven end-to-end (flag on, migrations applied, real-browser +
   multi-process load soak) before contractual offline promises.
3. Unified reporting/BI engine (replace scattered per-entity screens).
4. Offline binary/photo outbox (proof-of-delivery) + reconcile handlers for visits/surveys.
5. Consolidate duplicate audit-log tables; verify audit coverage on every financial mutation.
6. Security hardening pass: JWT-secret rotation runbook, auth rate-limiting/brute-force review.
7. Finish or formally shelve hotel/salon/electrical; decide on workshop.
8. Scalability validation: run the k6 suite at target tenant scale; confirm RLS/index plans.
9. Catalog/packaging cleanup: gate incomplete verticals out of the sellable plan matrix.
10. Brand/flag normalization (`KAKO_*` → `VANTORA_*`), remove legacy duplication, cut a GA
    version off `0.1.0-beta.1`.

---

*Prepared from the codebase on the audited branch. Facts are referenced to source; all
percentages, priorities, packaging, and pricing are explicitly-marked assessments for planning,
not measured guarantees. Items marked **Unverified** were not confirmed in this pass and should
be checked before relying on them.*
