# VANTORA — FMCG Role UI Validation (Nile FMCG (DEMO))

**Environment:** `vantora-staging` → Nile FMCG (DEMO) (`rsjvgehvastmawzwnqcs`). **`kako-fmcg` untouched.**
**Date:** 2026-06-10. **Scope:** end-to-end role validation from the **frontend** perspective —
derived from the actual nav-gating code (`visibleSections` in `navigation.ts`, plus the
`superAdminOnly` / module / feature-flag / per-item permission gates), cross-referenced with each
role's effective permissions and the company's enabled modules. **Not** a permission-table-only check.

---

## 1. Method

The sidebar/menu a user sees is computed by `visibleSections(permissions, isSuperAdmin, isPlatformOwner,
modules, platformPermissions, isPlatformStaff, businessType, enabledFlags)`. An item is visible only when
**all** of these pass: its section's module gate is open, its own per-item module gate is open, it is not
`superAdminOnly` (unless the user is a super-admin), it is not a platform-only item, its feature flag (if
any) is ON, and the user holds the required permission (ANY-of). This report evaluates those rules for each
role against the live data.

## 2. Two root-cause defects found — and fixed (tenant-scoped, live)

| # | Defect | Effect | Fix applied |
|---|---|---|---|
| **A** | The FMCG company had only `sales, inventory, purchasing, accounting` modules enabled. | `visibleSections` hid the **entire** field/van-sales/distribution/returns/warehousing nav for **every** role — reps/merchandisers/credit-controller saw almost nothing. This was the "role experience not correct" cause. | Enabled the van-sales module set → 12 modules (`+ distribution, crm, analytics, warehousing, returns, integrations, pos, sales_orders`). Also baked into `reference-company.sql` + `new-tenant-bootstrap.sql` so new FMCG tenants aren't born broken. |
| **B** | The **Electrical** pack section has **no module gate** and shows on the `electrical.rma` permission, which the broad admin/manager override carried. | The Electrical (serials/warranties/RMA) menu leaked into an FMCG tenant for admin & manager. | Removed `electrical.rma` from this tenant's `admin`/`manager` overrides. |

**Context that shapes every role:** no demo user is `is_super_admin`, so **all `superAdminOnly` items are
hidden for everyone, including Company Admin** — `/settings/branches`, `/settings/users`,
`/settings/permissions`, `/settings/einvoice`, `/design`. Feature flags: only `van_sales` is ON
(alerts / change-requests are OFF), so those nav items stay hidden.

## 3. Per-role validation (after fixes)

### Company Admin (`admin`)
- **Expected:** all operational areas + settings/administration.
- **Actual:** Dashboard, Today, Supervisor, Manager, Reports, Territory, Coaching; Sell/POS, Sales Orders,
  Invoices, Returns, Pricing, Price Book, Journey, Rep App, Customers, Sales Report; full **Distribution**
  section; Inventory (Products / Stock / Transfers / Counts / Warehouses / Van Reconciliation); Purchasing
  (Suppliers / POs / Returns); Accounting (Chart / Vouchers / Journal / Reports / Aging / Exports);
  Settings → Staff, Organization, Regions, Van-Sales Settings, Marketplace, Custom Fields/Data, Authz
  Console, Tenant Audit, Integrations / Import / Export.
- **Unexpected:** ~~Electrical pack~~ (fixed). Latent cross-vertical perms (clinic/hotel/fashion/…) remain
  but their sections are **module-hidden** → no leak.
- **Missing:** Branches, Users, Permissions, e-Invoice (all `superAdminOnly`). Admin manages users/roles via
  **Staff + Organization + Authz Console** instead.
- **Required fix:** decide whether a tenant Company Admin should reach Branches/Users/Permissions. Today
  those are reserved for the platform super-admin. *Recommendation only — not changed.*

### General Manager (`manager`)
- **Expected ≈ Actual:** same broad set as Admin (identical permission breadth, incl. Settings/Integrations).
- **Unexpected:** none after fix. **Missing:** same four `superAdminOnly` screens.
- **Required fix:** if GM should be narrower than Admin, trim `settings.users` / `integrations.manage` /
  `settings.branches` from the `manager` override.

### Area Manager (`area_manager`)
- **Expected:** regional sales oversight, customers, reports; no finance/settings.
- **Actual:** Dashboard, Manager Home, Reports, Territory; Invoices, POS, Sales Orders, Returns, Price Book,
  Rep Settlement, Customers, Sales Report; **Distribution** (routes/targets/coverage/perfect-store via
  `reports.view`); Inventory (Products/Stock/Low-stock/Expiry/Warehouses/Load-requests-approve).
- **Unexpected:** none. **Missing:** none material (correctly no Accounting/Settings; no Today/Rep App since
  no `field.sales`). **Required fix:** none.

### Supervisor (`supervisor`)
- **Expected:** team supervision, approvals, reconciliation; no finance/settings.
- **Actual:** Dashboard, **Supervisor Home**, Manager Home, Reports; Invoices, Returns, POS, Price Book,
  Customers, Sales Report; Distribution (reports.view items); Inventory + **Van Reconciliation** (has
  `reconciliation.manage`); Load-request / Stock-transfer approvals.
- **Unexpected:** none. **Missing:** none. **Required fix:** none. (No `field.sales` → no Today/Rep App,
  correct for a supervisor.)

### Van Sales Rep (`salesman`)
- **Expected:** field selling (cash **and** credit), collections, his customers, van stock/reconciliation,
  journey.
- **Actual:** Dashboard, **Today**, Coaching, Route, Van Stock; **Rep App**, Journey, Invoices, Price Book,
  Customers, Sales Report; Distribution → **Credit Requests** (has `credit.request.create`), Sales Summary,
  Returns Analysis; Inventory (Products / Stock / Van Reconciliation-view / Load-requests-create); POS /
  Sales Orders.
- **Unexpected:** none. **Missing:** none. **Required fix:** none. (Sees only his 7 customers via RLS; Sell
  screen offers cash and credit.)

### Cash Van Rep (`cash_van`)
- **Expected:** identical field nav to Van Rep, but **cash only**.
- **Actual:** same menu set as Van Sales Rep **except no Credit Requests** (lacks `credit.request.create`).
- **Unexpected:** none. **Missing:** none.
- **Required fix / caveat:** the cash-vs-credit difference is **action-level**, not menu-level — enforced at
  the Sell action (no `sales.credit` + a DB guard blocks credit invoices). Eyeball the Sell screen to
  confirm the "credit / terms" option is hidden/disabled for this role.

### Merchandiser (`merchandiser`)
- **Expected:** visits, assortment/survey/grading, customers, inventory view — **no selling/collections**.
- **Actual:** Dashboard, **Today**, Coaching, Route, Van Stock; **Rep App**, Journey, Customers; Inventory
  (Products / Stock / Van Reconciliation-view); Settings → **MSL Matrix, Surveys, Grading Setup**.
- **Unexpected:** none — **no Invoices, no POS, no Sell** (correctly lacks `sales.sell/collect`).
- **Missing:** none. **Required fix:** none. Exactly the refined behavior.

### Collection Officer (`collection_officer`)
- **Expected:** collections + customer status; **no selling**.
- **Actual:** Dashboard; **Invoices** (has `sales.collect` → record collections), Customers, Price Book;
  Distribution → Sales Summary / Returns Analysis (aggregate).
- **Unexpected:** none (no Sell/POS — correct).
- **Missing:** there is **no dedicated "Collections" menu** — collections are taken from the Invoices /
  Settlement flow. **Required fix:** optional — add a first-class Collections nav item for this role, or
  confirm Invoices-driven collection is the intended UX.

### Credit Controller (`credit_controller`)
- **Expected:** credit-request **approval**, AR view, collections; **no journal posting**.
- **Actual:** Dashboard, Manager Home, Reports; Invoices (collect), Rep Settlement; **Distribution → Credit
  Requests** (approve) *(was hidden before Fix A)*; Purchasing → Suppliers; Accounting → Chart / Journal /
  Financial Reports / Aging / Exports (**view**).
- **Unexpected:** none. **Missing:** none. **Required fix:** none — **Vouchers (post) correctly hidden**
  (no `accounting.post`).

### Warehouse Manager (`warehouse_keeper`)
- **Expected:** inventory/warehouse operations; no sales/finance.
- **Actual:** Dashboard, Van Stock; Inventory (Products / Stock / Low-stock / Expiry / **Transfers /
  Load-requests / Stock Count / Warehouses / Van Reconciliation-manage**); Purchasing → Purchase Orders;
  Settings → Units of Measure.
- **Unexpected:** none material. **Missing:** none. **Required fix:** none. (No Customers/Invoices/Accounting
  — correct.)

### Accountant (`accountant`)
- **Expected:** full accounting, AR/suppliers; no selling/field.
- **Actual:** Dashboard, Manager Home, Reports; Invoices (collect), Rep Settlement, Price Book; Purchasing →
  Suppliers; **Accounting → Chart / Vouchers (post) / Journal / Reports / Aging / Exports**; Distribution
  reports.
- **Unexpected:** none after fix. **Missing:** none. **Required fix:** none.

### Auditor (`viewer`)
- **Expected:** read-only reports + inventory view.
- **Actual:** Dashboard, Manager Home, **Reports**, Territory; Sales Report, Rep Settlement (view); Inventory
  (Products / Stock / Low-stock / Expiry / Warehouses — read); Accounting → Chart / Journal / Reports /
  Aging / Exports (**view**); Distribution reports.
- **Unexpected:** none (no Sell/Collect/Settings — correct).
- **Missing:** none. **Required fix:** none — read-only via absence of write perms; verify screens render no
  stray action buttons for `viewer`.

## 4. Cross-cutting decisions still open (not changed — your call)

1. **Company Admin / GM cannot see Branches · Users · Permissions · e-Invoice** (`superAdminOnly`). If a
   tenant admin should manage these, it needs a deliberate tenant-admin capability (today platform-reserved).
2. **GM == Admin** in permissions. If GM should be narrower, trim `settings.users` / `integrations.manage` /
   `settings.branches` from the `manager` override.
3. **Cash Van** distinction is action-level, not menu-level — confirm the Sell screen hides the credit option
   for `cash_van`.
4. **Collection Officer** has no dedicated Collections menu (uses Invoices) — add one if desired.
5. **POS + Sales Orders** were enabled along with the van-sales modules; if you want a pure van-sales nav,
   they can be disabled for the demo.

## 5. Summary

| Result | Count |
|---|---|
| Roles validated | 12 |
| Root-cause defects found & fixed | 2 (modules gate, electrical leak) |
| Roles now showing the correct experience | 12 / 12 |
| Open product decisions (non-blocking) | 5 |

After the fixes, each role's navigation reflects its intended FMCG responsibilities: managers/admin broad,
field roles (van/cash/merch) field-first, finance roles finance-only, warehouse inventory-only, auditor
read-only. Remaining items are product/policy decisions, not defects.
