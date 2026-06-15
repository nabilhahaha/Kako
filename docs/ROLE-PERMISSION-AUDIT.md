# Phase 2 — Role & Permission Audit

**Scope:** FMCG van-sales + ERP. **Tenant validated:** pilot `612af0bd-…` (vantora-staging
`rsjvgehvastmawzwnqcs`). **Date:** 2026-06-15. **Mode:** report only — no changes applied.

> Goal: *No role can access screens, actions, or data outside its responsibility.*

---

## 1. Method & sources

| # | Layer audited | Source |
| --- | --- | --- |
| 1 | Code-defined permissions | `src/lib/erp/permissions.ts` (`Permission` union, `PERMISSION_LABELS`, `ROLE_PERMISSIONS`) |
| 2 | Route guards | every `page.tsx`/`layout.tsx` under `src/app/(app)/` (122 routes) |
| 3 | Navigation visibility | `src/lib/erp/navigation.ts` (`visibleSections`), `nav-profiles.ts`, `bottom-nav-tabs.ts`, `home.ts` |
| 4 | Screen access | server-side guards (`hasPermission` + role/flag checks) |
| 5 | Action permissions | server actions + RPC guards (perm strings) |
| 6 | Live DB role permissions | `erp_role_permissions` (global template) + `erp_company_role_permissions` (pilot) |
| 7 | Assigned vs code | `erp_user_branches` (pilot assignments) vs `ROLE_PERMISSIONS` |

### Authority model (which layer wins at runtime)

`auth-context.ts` resolves `ctx.permissions` as follows:

```
super admin / platform owner ............ ALL permissions (bypass)
company has erp_company_roles config .... erp_company_role_permissions  ← AUTHORITATIVE (pilot)
otherwise (legacy tenant) ............... erp_role_permissions (global template)
code ROLE_PERMISSIONS ................... seed only (new tenants) + cutover tests
```

The pilot **has** company role config, so the **DB (`erp_company_role_permissions`) is the
live authority** — the code `ROLE_PERMISSIONS` is *not* what's enforced. `permission as
Permission` casts (auth-context L145) mean DB permission strings outside the TS union are
coerced through silently.

---

## 2. Pilot reality check

- **7 users, 1 role each** (no privilege aggregation): `admin`, `branch_manager`,
  `supervisor`, `salesman`, `warehouse_keeper`, `accountant`, `viewer`.
- **`erp_company_role_permissions` (pilot) == `erp_role_permissions` (template)** — no
  per-tenant permission drift.
- **`erp_role_scope` / `erp_role_data_scopes` (pilot) — EMPTY.** No table-driven data-scope
  rules; data scoping is enforced by RLS + role-rank logic in code only.
- **`erp_role_limits` (pilot) — EMPTY.** No per-role transaction/approval value caps.

---

## 3. Per-role audit

Permissions below are the **live DB grants** for the role. "Menus" = primary menu via
`nav-profiles.ts`; "More" = the role's allow/deny drawer.

### 3.1 Salesman (pre-sales / van rep) — `/today`

- **Grants (18):** field.sales, field.attach_media, sales.collect, stock_request.create,
  stock.transfer, stock.view, inventory.view, product.search, pricing.view,
  reconciliation.view, report.aggregate.view, target.view, day.close, day.reopen.request,
  cash.handover.request, customer.request, credit.request.create, change_requests.create.
- **Visible menus:** Today, Sell, Collect, Customers, Van Stock (+ "More" allowlist: field,
  approvals(view), coaching, van requests).
- **Accessible screens:** `/today`, `/field/journey`, `/field/route`, `/field/stock`,
  `/field/offline`, `/field/van-sales/*` (sell/collect/return/confirm/request/customers/
  statement/requests), `/field/survey/[id]` (no — needs survey.manage; see Missing).
- **Actions:** sell off van (via `field.sales` + `erp_van_sell`), collect, return, request
  stock load, close day, raise governed requests (reopen, cash handover, customer, credit).
- **CRUD:** no master-data create/edit (no customer.create/edit). Stock transfer initiate only.
- **Approvals:** none (requester only).
- **Data scope:** own branch / own van / own journey (RLS + assignment).
- **Excessive:** `stock.transfer` (rep can *initiate* a transfer) — low risk, plausible for
  van-to-warehouse returns. `report.aggregate.view` — aggregated reports to a rep, review.
- **Missing:** `sales.sell` (sells via field.sales path only — OK), `customers.manage` (uses
  van picker — OK), `customer.create` (cannot onboard even via governed request? has
  customer.request — OK). **`visit.override_gps` — not held (cannot override GPS radius;
  effectively superadmin-only).**
- **Risk:** LOW. Tightly scoped.

### 3.2 Van Sales — `cash_van` (true van seller) — `/today`

- **Grants (16):** field.sales, field.attach_media, sales.sell, sales.collect,
  customers.manage, customer.create, stock_request.create, stock.transfer, stock.view,
  inventory.view, product.search, pricing.view, reconciliation.view, report.aggregate.view,
  target.view, day.close.
- **vs Salesman:** ADDS sales.sell, customers.manage, customer.create. **DROPS** all
  governed-request perms.
- **Excessive:** `customers.manage` + `customer.create` give a van seller direct customer
  master-data write (bypasses the governed customer-request flow the Requests Hub enforces
  for salesmen). Inconsistent with "no direct master-data writes by field reps."
- **Missing:** `day.reopen.request`, `cash.handover.request`, `customer.request`,
  `credit.request.create`, `change_requests.create` — **cash_van cannot use the Requests Hub
  governance flows** (reopen / cash handover / customer change). Functional gap for the role
  that most needs cash handover.
- **Risk:** MEDIUM — direct customer writes + no governed cash-handover path.
- **Note:** not assigned in the pilot (pilot van rep = `salesman`). Latent until used.

### 3.3 Merchandiser — `/today` (fallback)

- **Grants (17):** field.sales, field.attach_media, assortment.manage, survey.manage,
  grade.manage, journey.create, customer.create, customers.manage, day.close, inventory.view,
  stock.view, product.search, pricing.view, reconciliation.view, report.aggregate.view,
  target.view, change_requests.create.
- **Accessible screens:** field screens + `/settings/msl`, `/settings/surveys`,
  `/settings/outlet-grades` (holds the manage perms), `/distribution/*` aggregated dashboards.
- **Actions:** build MSL / surveys / grading; record visits; **no selling, no collecting**
  (correct — merchandiser is execution/audit, not transactional).
- **Excessive:** `journey.create` + `customers.manage` + `customer.create` — master-data
  create at an execution role. Review whether merchandiser should own journey planning.
- **Missing:** none for its function.
- **Risk:** MEDIUM (master-data create) + **no `nav-profiles` entry → falls back to the FULL
  desktop nav (permission-filtered) instead of a tailored mobile-first menu** — UX/consistency
  gap, not a security hole.

### 3.4 Supervisor — `/approvals/queue`

- **Grants (27):** approvals — day.approve_close_exception, visit.approve_out_of_route,
  day.reopen.approve, customer.request.approve, change_requests.approve, cash.handover.confirm,
  stock.transfer.approve; ops — reconciliation.manage, customer.transfer, route.create,
  journey.create, stock_request.approve; transact — sales.sell, sales.collect, sales.discount,
  sales.return, customers.manage, customers.change_status; read — reports.view, pricing.view,
  product.search, stock.view, target.view, report.aggregate.view.
- **Visible menus:** Approvals, Team, Coverage, Van Recon, Reports (denylist hides POS/
  invoices/products/inventory/warehouses).
- **Approvals:** day-close exceptions, out-of-route visits, day reopen, customer requests,
  change requests, cash handover, stock transfers. **NOT reconciliation.approve** (manage only).
- **Excessive:** `route.create` + `journey.create` — master-data creation at supervisor level
  (review vs area_manager+). `sales.sell`/`sales.return` — supervisor can transact directly
  (cover-for-rep; intended but widens surface).
- **Missing / SoD note:** holds `reconciliation.manage` but **not** `reconciliation.approve`
  — supervisor computes recon, branch_manager+ approves. This is *good* segregation; flagged
  as intentional.
- **Risk:** MEDIUM (broad transactional + master-data create on an approver role — the same
  person can create a route/journey and approve transfers into it).

### 3.5 Warehouse Keeper — `/inventory/requests`

- **Grants (17):** inventory.view, inventory.adjust, inventory.count, inventory.transfer,
  inventory.adjustment.approve, stock.view, stock.adjust, stock.transfer, stock.transfer.approve,
  stock_request.approve, purchasing.manage, reconciliation.view, reconciliation.manage,
  product.search, uom.manage, fashion.inventory, fashion.purchase.
- **Visible menus:** Requests, Stock, Receive, Transfers, Approvals (denylist hides POS/
  invoices/collections/cashbox).
- **Actions/CRUD:** adjust + count + transfer stock; approve stock requests (load reps);
  receive POs (purchasing.manage); run reconciliation; manage UoM.
- **Excessive / SoD:** **`inventory.adjust` + `inventory.adjustment.approve` on the same role
  → self-approval of stock adjustments** (no maker-checker). **`stock.transfer` +
  `stock.transfer.approve` similarly self-approvable.** **`fashion.inventory` +
  `fashion.purchase` — cross-vertical permissions on a generic warehouse role** (dormant in
  FMCG, but bleed). `purchasing.manage` — keeper can run purchasing/receiving (common, review).
- **Missing:** `reconciliation.approve` (runs but cannot settle — branch_manager+ approves;
  intentional SoD).
- **Risk:** HIGH for self-approval of adjustments/transfers (inventory shrinkage concealment).

### 3.6 Warehouse Manager — *no dedicated role*

- There is **no `warehouse_manager` role**. Warehouse management authority is split between
  `warehouse_keeper` (operations + approvals above) and `branch_manager` (reconciliation.approve,
  purchasing.po.approve). **Finding:** if "Warehouse Manager" is an intended distinct role with
  approve-but-not-execute authority, it does not exist — recommend modeling it to break the
  keeper self-approval SoD (§3.5).

### 3.7 Finance / Accountant — `/collections`

- **Grants (18):** accounting.view, accounting.post, accounting.voucher.approve,
  sales.collect, cash.handover.confirm, credit.request.approve, customers.change_status,
  suppliers.manage, sales.invoice.cancel, sales.payment.writeoff, stock.view, reports.view,
  report.aggregate.view, pricing.view, fashion.cashbox, fashion.installments, fashion.purchase,
  fashion.reports.
- **Visible menus:** Collect, Accounting, Vouchers, Aging, Suppliers (denylist hides POS/
  field/rep).
- **Actions:** collect, post journals, confirm cash handovers, approve credit-limit requests,
  manage suppliers, change customer status (credit hold).
- **Excessive / SoD:** **`accounting.post` + `accounting.voucher.approve` → posts AND approves
  vouchers (no maker-checker).** **`sales.invoice.cancel` + `sales.payment.writeoff`** — high-
  impact financial reversals on a single role; pair with `customers.change_status`. **`fashion.*`
  bleed** (cross-vertical, dormant in FMCG).
- **Variants present in template (not assigned in pilot):** `credit_controller` (credit focus,
  no posting), `collection_officer` (collect only) — finer-grained finance roles exist but
  unused.
- **Risk:** HIGH (voucher self-approval + invoice cancel + payment write-off concentrated).

### 3.8 Company Admin — `/dashboard`

- **Grants (90 of 97).** Effectively all operational + settings perms.
- **Missing (genuine gaps for the admin's job):** **`assortment.manage`, `survey.manage`,
  `grade.manage`** → the company admin **cannot open `/settings/msl`, `/settings/surveys`,
  `/settings/outlet-grades`** (those manage perms sit only on `merchandiser`). **`visit.override_gps`,
  `day.reopen.override`** — not held by admin (superadmin/platform-owner only). The request-
  side perms (customer.request, cash.handover.request, day.reopen.request) are correctly
  excluded (admin approves, not requests).
- **Excessive:** by design (admin is the tenant superuser) — but holds cross-vertical perms
  (clinic.doctor/reception, hotel.manage, restaurant.manage, etc.) regardless of the tenant's
  business type. For a single-vertical FMCG tenant these are dormant nav-gated, low risk.
- **Risk:** MEDIUM — admin **cannot self-serve retail-execution setup** (surveys/MSL/grading);
  must rely on a merchandiser or superadmin. Verify this is intended ownership.

### 3.9 Platform Owner — `/platform`

- **Grants:** ALL permissions via `isPlatformOwner` bypass (`hasPermission` returns true
  unconditionally). Platform routes gated `platformOwnerOnly` / `platformPerm`.
- **Data scope:** cross-tenant (vendor apex). View-as + company 360 + audit.
- **Excessive:** unbounded by definition (apex tier) — expected. The only control is that
  *company* settings pages still render for them; no tenant-data mutation is implied beyond
  platform tooling.
- **Risk:** ACCEPTED (apex). Ensure platform-owner accounts are MFA-protected (out of scope).

---

## 4. Permission Source of Truth

**Layers (in enforcement order):**
1. **Code** — `Permission` union + `PERMISSION_LABELS` (`permissions.ts`). Compile-time only.
2. **DB grants** — `erp_company_role_permissions` (per-tenant, authoritative) / `erp_role_permissions`
   (template). This is what `ctx.permissions` is built from.
3. **Route guards** — server-component `hasPermission(ctx, …)` + role/flag checks in `page.tsx`.
   These are **server-side** (Next.js server components), not browser checks.
4. **RLS** — Postgres row-level security. **Verified: enabled on every key business table**
   (`erp_customers`, `erp_invoices`, `erp_inventory_stock`, `erp_payments`, `erp_journal_entries`,
   `erp_routes`, `erp_stock_requests`, `erp_van_load_manifests`, `erp_van_reconciliations`,
   `erp_company_role_permissions`). Policies are predominantly **company-scoped (tenant isolation)**,
   not per-permission — RLS stops cross-tenant reads but generally does **not** stop an in-tenant
   role that lacks a perm from reading its own company's rows.
5. **API / RPC** — `SECURITY DEFINER` functions. **Verified: 27 of 217 `erp_*` functions check
   `erp_user_has_perm`; 82 check apex/tenant identity.** The **governance/approval** RPCs check
   permissions in-function (`erp_close_day`, all `erp_request_*`/`erp_decide_*`,
   `erp_approve_*`/`erp_settle_van_reconciliation`/`erp_compute_van_reconciliation`,
   `erp_transfer_customer`/`erp_transfer_user`). **However, several mutation RPCs do NOT** —
   `erp_van_sell`, `erp_van_return`, `erp_settle_collection`, `erp_van_sell_with_payment`,
   `erp_issue_invoice`, `erp_record_payment`, `erp_record_supplier_payment`,
   `erp_post_payment_voucher`, `erp_post_receipt_voucher`, `erp_approve_stock_request` —
   they scope company but **rely on the caller (route/action guard) + RLS** for permission.
   See the dedicated remediation plan `REMEDIATION-BACKEND-ENFORCEMENT.md`.

### 4.1 Enforcement matrix by permission category

Legend: ✅ enforced · ⚠️ partial / inconsistent · ❌ not enforced · 🔒 tenant-scope only.

| Category (key prefix) | In Code | In DB | Route Guard | RLS | API / RPC |
| --- | --- | --- | --- | --- | --- |
| Sales — transact (`sales.sell/collect/return/discount`) | ✅ | ✅ | ⚠️ (sell/invoices ✅; POS/orders/returns pages ❌ no guard) | 🔒 | ⚠️ `erp_van_sell`/`erp_settle_collection`/`erp_van_return` **do NOT** check perm in-RPC (caller-guarded) |
| Sales — financial control (`sales.invoice.cancel`, `sales.payment.writeoff`, `sales.price.override`, `sales.order.cancel`) | ❌ **not in union** | ✅ | ⚠️ (string-cast only) | 🔒 | ⚠️ verify each RPC checks it |
| Customers (`customers.manage/approve/change_status`, `customer.create/edit/transfer/import`) | ✅ | ✅ | ⚠️ (`/customers` ✅ approve; `/customers/[id]` ✅; transfer ✅; 360/print ❌) | 🔒 | ⚠️ partial |
| Customer governance (`customer.request[.approve]`) | ✅ | ✅ | ✅ (hub + inbox guards) | 🔒 | ✅ (`erp_request_customer_change`/`erp_decide_customer_request`) |
| Inventory (`inventory.view/adjust/transfer/count`, `stock.*`) | ⚠️ (`inventory.adjustment.approve` not in union) | ✅ | ❌ **most `/inventory/*` pages have NO perm guard** | 🔒 | ✅ (adjust/transfer RPCs check perm) |
| Stock requests (`stock_request.create/approve`) | ✅ | ✅ | ✅ (`/inventory/requests`, van request) | 🔒 | ✅ (`erp_approve_stock_request`) |
| Reconciliation (`reconciliation.view/manage/approve`) | ✅ | ✅ | ⚠️ (`/field/van-reconciliation` renders card if unperm’d, no redirect) | 🔒 | ✅ |
| Purchasing (`purchasing.manage/return`, `purchasing.po.approve`) | ⚠️ (`po.approve` not in union) | ✅ | ⚠️ (`/purchases/returns` ✅; `/purchases/orders` ❌) | 🔒 | ⚠️ verify |
| Accounting (`accounting.view/post`, `accounting.voucher.approve`) | ⚠️ (`voucher.approve` not in union) | ✅ | ✅ (`/accounting/*` guarded) | 🔒 | ⚠️ verify voucher-approve RPC |
| Field ops (`field.sales`, `day.*`, `visit.*`, `cash.handover.*`) | ✅ | ✅ (`visit.override_gps`/`day.reopen.override` unassigned) | ✅ (field + van-sales suite) | 🔒 | ✅ (`erp_close_day`, reopen/handover RPCs) |
| Settings / governance (`settings.*`, `workflow.manage`, `integrations.manage`) | ✅ | ✅ | ✅ (settings pages guarded; several admin-role/superadmin only) | 🔒 | ⚠️ mixed |
| Change requests (`change_requests.create/approve/manage`) | ❌ **not in union** | ✅ | ⚠️ (`/change-requests` flag-gated, no perm guard) | 🔒 | ⚠️ verify |
| Retail exec (`assortment.manage`, `survey.manage`, `grade.manage`, `target.*`) | ✅ | ✅ | ✅ (settings + distribution pages) | 🔒 | ⚠️ mixed |
| Trade spend (`trade_spend.manage`) | ❌ **not in union** | ✅ | ⚠️ (flag-gated page, `reports.view` only) | 🔒 | ⚠️ verify |
| Verticals (`clinic.*`, `hotel.manage`, `restaurant.manage`, `salon.manage`, `pharmacy.dispense`, `laundry.manage`, `market.pos`, `fashion.*`, `electrical.rma`, `wholesale.pricing`) | ✅ | ✅ | ❌ **most vertical pages rely on module gate + nav only, no page perm guard** (electrical ✅, pharmacy partial) | 🔒 | ⚠️ mixed |
| Platform (`platformOwnerOnly`, `platformPerm`) | n/a (separate `PlatformPermission`) | `erp_platform_*` | ✅ (owner/platformPerm guards) | 🔒 | ✅ |

### 4.2 Drift & enforcement findings

1. **Code → DB drift** — permissions defined in code but **never granted** in the DB to any role
   (candidates for unused/dead-in-practice): **`visit.override_gps`, `day.reopen.override`**
   (apex-only at runtime). Also `product.create` is in code and held only by admin/manager.
2. **DB → Code drift** — permissions enforced in the DB but **missing from the code union**
   (12): `accounting.voucher.approve`, `change_requests.create/approve/manage`,
   `customers.delete`, `inventory.adjustment.approve`, `purchasing.po.approve`,
   `sales.invoice.cancel`, `sales.order.cancel`, `sales.payment.writeoff`, `sales.price.override`,
   `trade_spend.manage`. Guarding these needs a string cast → fragile; risk of inconsistent or
   absent checks.
3. **Permissions that exist but are unused** — `customers.delete` (no UI/route references it),
   `day.reopen.override` (Phase 2/3, unassigned), `visit.override_gps` (unassigned).
   `sales.order.cancel`, `sales.price.override`, `change_requests.manage` need a call-site
   audit to confirm they are actually checked somewhere (else they are granted-but-dead).
4. **Screens that rely only on UI hiding (nav visibility ≠ enforcement)** — nav items in
   `navigation.ts`/`nav-profiles.ts` are *visibility only*. A screen is only truly protected by
   its **server-component guard + RLS + RPC**. Screens with **no page-level perm guard** (rely on
   module gate + RLS): all `/inventory/*` except requests, `/warehouses`, `/suppliers`,
   `/collections`, `/cashbox`, `/sales/pos|orders|returns|journey|report|settlement`, `/reports`,
   and most clinic/restaurant/salon/laundry/hotel/fashion/market screens (see F7).
5. **Screens protected only by frontend checks** — **none identified.** This app's page guards run
   in **server components** (server-side), so there is no pure client-side gate. The exposure is
   instead screens with *no* guard relying on RLS (item 4), and conditional **buttons/actions**
   hidden in the client (e.g., `/inventory/requests`, `/products`, `/customers`) where the action’s
   real protection must be the **server action / RPC**, not the hidden button.
6. **Missing backend enforcement (defense-in-depth gaps)** —
   - Read routes in item 4 depend on **company-scoped RLS only**; RLS does not enforce the
     per-permission intent (e.g., a `viewer` reading `/collections` data). Add page guards or
     permission-aware RLS where the data is sensitive.
   - The **12 DB-only permissions** (item 2) must each be confirmed to have a server action / RPC
     check; any without one is granted but unenforced.
   - **Client-hidden actions** must be re-checked in their server action (not assumed safe because
     the button is hidden).

> **Bottom line:** tenant isolation is solid (RLS everywhere) and the **governance/approval** RPCs
> enforce permissions in-function. The gaps are (a) within-tenant **read** screens guarded by
> module+RLS only, (b) high-impact **financial/inventory** permissions that live in the DB but not
> the code union, and (c) **mutation RPCs that rely on the caller for permission** (van
> sell/return/collect, invoice issue, payment record, voucher post, stock-request approve). Every
> *critical* action should additionally carry an RPC-level `erp_user_has_perm` check for
> defense-in-depth — see `REMEDIATION-BACKEND-ENFORCEMENT.md`.

---

## 5. Cross-cutting findings

### F1 — Code↔DB permission drift (12 DB-only permission strings) — MEDIUM
These are granted in the DB and enforced at runtime, but are **absent from the TS `Permission`
union** (`permissions.ts`), so no type-safe call site can reference them:

```
accounting.voucher.approve   inventory.adjustment.approve   sales.invoice.cancel
change_requests.create       purchasing.po.approve          sales.order.cancel
change_requests.approve      customers.delete               sales.payment.writeoff
change_requests.manage       trade_spend.manage             sales.price.override
```
**Impact:** any guard on these must use a string cast; risk of a permission that is *granted*
but *never checked* (dead grant) or checked inconsistently. **Action:** add them to the union +
`PERMISSION_LABELS`, then confirm each has a real guard (server action / RLS / route).

### F2 — Code-declared permissions with ZERO DB assignment — LOW/MEDIUM
`visit.override_gps` and `day.reopen.override` are declared in code and referenced by guards
(`/field/journey` `canOverrideGps`; reopen-past-lock) but **held by no role** in the DB →
effectively superadmin/platform-owner only. If field supervisors are meant to authorize a GPS
override, the grant is **missing**. Verify intended.

### F3 — 6 DB roles not modeled in code — MEDIUM (UX/consistency)
`cash_van`, `collection_officer`, `credit_controller`, `inventory_controller`, `merchandiser`,
`procurement` exist in the DB (template + pilot) but have **no `BranchRole` / `ROLE_PERMISSIONS`
/ `nav-profiles` entry**. Effect: they get the full desktop nav (permission-filtered) and the
`resolveHomePath` fallback rather than a tailored landing + primary menu. No privilege escalation
(perms still filter), but inconsistent UX and stale code defaults. `merchandiser` and `cash_van`
are first-class FMCG roles and should be modeled.

### F4 — Separation-of-duties (self-approval) — HIGH
| Role | Make | Approve | Risk |
| --- | --- | --- | --- |
| warehouse_keeper | inventory.adjust | inventory.adjustment.approve | conceal shrinkage |
| warehouse_keeper | stock.transfer | stock.transfer.approve | self-move stock |
| accountant | accounting.post | accounting.voucher.approve | self-approve vouchers |
Same role holds both maker and checker. Recommend splitting the approve perm to a manager
role (branch_manager already holds `reconciliation.approve`, `purchasing.po.approve`,
`inventory.adjustment.approve`? — verify) or a dedicated Warehouse Manager (§3.6).

### F5 — High-impact financial perms concentrated on accountant — HIGH
`sales.invoice.cancel` + `sales.payment.writeoff` + `accounting.voucher.approve` +
`customers.change_status` on one role. Recommend gating cancel/write-off behind a separate
approval or a controller role with value limits (`erp_role_limits` is currently empty).

### F6 — Cross-vertical permission bleed — LOW
`warehouse_keeper` and `accountant` carry `fashion.*` perms; `admin`/`manager` carry
clinic/hotel/restaurant/salon perms regardless of business type. Nav modules hide the UI, so
risk is low, but the grants are broader than the tenant's responsibility surface.

### F7 — Routes with NO server-side permission guard — REVIEW
Several feature routes rely on **nav visibility + module gate only**, with no `hasPermission`
in the page itself (URL-reachable if the module is on):
`/inventory`, `/inventory/count`, `/inventory/transfers`, `/inventory/expiry`,
`/inventory/low-stock`, `/warehouses`, `/suppliers`, `/collections`, `/cashbox`,
`/sales/pos`, `/sales/orders`, `/sales/returns`, `/sales/journey`, `/sales/report`,
`/sales/settlement`, `/reports`, plus most clinic/restaurant/salon/laundry/hotel/fashion
screens. These depend on the module gate + RLS for protection. **Action:** confirm RLS fully
covers the data on each, or add an explicit page guard for defense-in-depth.

### F8 — `admin` vs `manager` template inconsistency — LOW
`manager` holds `clinic.manage` and `customers.delete`; `admin` holds `clinic.doctor`/
`clinic.reception` but **not** `clinic.manage`. Minor template inconsistency between the two
"superuser" roles. Both still near-full.

---

## 6. Risk register (ranked)

| ID | Finding | Severity | Type |
| --- | --- | --- | --- |
| F4 | Self-approval (warehouse adjust/transfer; accountant vouchers) | **HIGH** | SoD |
| F5 | Accountant holds invoice-cancel + payment-writeoff + voucher-approve | **HIGH** | SoD / financial |
| F1 | 12 DB permission strings absent from code union (possible dead grants) | MEDIUM | Drift |
| F2 | `visit.override_gps` / `day.reopen.override` held by no role | MEDIUM | Missing grant |
| F3 | 6 DB roles unmodeled in code (merchandiser, cash_van, …) | MEDIUM | Drift / UX |
| §3.2 | cash_van: direct customer writes + no governed cash-handover path | MEDIUM | Least-privilege |
| §3.8 | admin cannot configure MSL / surveys / grading | MEDIUM | Missing grant |
| F7 | Feature routes guarded by module+RLS only (no page perm check) | REVIEW | Defense-in-depth |
| F6 | Cross-vertical permission bleed (fashion/clinic on generic roles) | LOW | Over-grant |
| F8 | admin/manager template inconsistency | LOW | Hygiene |

---

## 7. Proposed remediation (for approval — NOT yet applied)

1. **SoD split (F4/F5):** move `inventory.adjustment.approve`, `stock.transfer.approve`,
   `accounting.voucher.approve` off the maker roles to a manager/controller; gate
   `sales.invoice.cancel` + `sales.payment.writeoff` behind approval or value limits. Model a
   **Warehouse Manager** role (§3.6) to own warehouse approvals.
2. **Close the code↔DB drift (F1/F3):** add the 12 missing permission strings to the
   `Permission` union + labels, and add `BranchRole` + `ROLE_PERMISSIONS` + `nav-profiles`
   entries for the 6 unmodeled roles (merchandiser, cash_van, collection_officer,
   credit_controller, inventory_controller, procurement). Then verify each new permission has a
   live guard (no dead grants).
3. **Fill missing grants (F2 / §3.8 / §3.2):** decide owners — grant `visit.override_gps` to
   supervisor (or keep superadmin-only); grant `assortment.manage`/`survey.manage`/`grade.manage`
   to admin (or confirm merchandiser-owned); give `cash_van` the governed-request perms
   (cash.handover.request, customer.request) and reconsider its direct `customers.manage`.
4. **Defense-in-depth (F7):** add explicit page guards to the module-only routes, or document
   the RLS coverage that makes them safe.
5. **Trim cross-vertical bleed (F6):** scope `fashion.*` off warehouse_keeper/accountant, and
   gate vertical perms on admin/manager by business type.

All remediation is reversible (permission rows + code constants), staging-first, and would be
applied per-tenant via `erp_company_role_permissions` without touching other tenants'
templates. **Awaiting approval before any change.**
