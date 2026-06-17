# VANTORA — Phase 1 QA Testing Worksheet (Role + Mobile)

**Build:** `staging-frontend` preview → `https://kako-git-staging-frontend-123456789-s-projects.vercel.app`
**Tenant:** Nile FMCG (DEMO). **Password (all demo users):** `Vantora#Demo1`.
**Prereq:** reach the preview (Vercel owner login, or disable Deployment Protection). Test each role in a
fresh/incognito session. Toggle EN/AR to spot-check Arabic RTL.

**How to use:** for each row mark **P** (pass) / **F** (fail) and add a note. "Forbidden actions" must be
**blocked server-side** (try via the UI; if hidden, also try a direct URL where noted). Mobile checks: use a
real phone or browser device-emulation (narrow width); field roles must work offline-then-sync.

**Legend:** ☐ = check · *(URL)* = also try navigating directly to the path.

---

## 1. Company Admin — `admin@nile-group.test`

**1. Expected menus:** Dashboard · Sales · Distribution · Inventory · Purchasing · Accounting · Settings (Staff, **Branches**, Organization, Regions, Van-Sales, Marketplace, Custom Fields, Authz Console, Tenant Audit, Integrations/Import-Export) · Warehouses.
**2. Expected screens:** `/dashboard`, `/customers`, `/sales/invoices`, `/distribution/*`, `/inventory`, `/purchases/orders`, `/accounting/*`, `/settings/branches`, `/settings/staff`, `/settings/authz`, `/warehouses`.
**3. Expected actions:** create/edit **branch** (own company); invite/manage staff; edit company role permissions (Authz); approve customers; manage inventory/purchasing; post accounting.
**4. Forbidden actions:** create a **company** (super-admin only); see/edit the **global** `/settings/permissions` or `/settings/users`; touch another tenant's data.
**5. Mobile checks:** responsive layout; Branches/Staff forms usable on narrow width.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | All expected menus visible; no Clinic/Hotel/Fashion/Electrical sections | ☐ | |
| 2 | `/settings/branches` opens; can **add** a branch (own company) | ☐ | |
| 3 | Edit an existing branch name → saves | ☐ | |
| 4 | `/settings/staff` — invite/activate user + assign role/branch | ☐ | |
| 5 | `/settings/authz` — change a role's permission, saves | ☐ | |
| 6 | Approve a pending customer | ☐ | |
| 7 | **Forbidden:** company-create form not shown *(only on empty setup)* | ☐ | |
| 8 | **Forbidden:** `/settings/users` *(global)* blocked/super-admin msg | ☐ | |
| 9 | **Forbidden:** `/settings/permissions` *(global)* blocked | ☐ | |
| 10 | Mobile: branches/staff forms usable | ☐ | |

---

## 2. General Manager — `gm@nile-group.test`

**1. Expected menus:** Dashboard · Sales · Distribution · Inventory · Purchasing · Accounting · Reports. **No** Settings-admin (Staff/Branches/Custom-Fields/Integrations).
**2. Expected screens:** all operational + `/reports`, `/manager`; **not** `/settings/branches`, `/settings/staff`.
**3. Expected actions:** full operations — sell, collect, approve customers, manage inventory/purchasing, post accounting, view reports.
**4. Forbidden actions:** open Branches; manage staff/roles; edit a branch; integrations/import-export.
**5. Mobile checks:** dashboards/reports readable on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Operational menus present; **Settings → Staff/Branches/Integrations NOT shown** | ☐ | |
| 2 | Can approve a customer / sell / collect | ☐ | |
| 3 | Accounting post (vouchers) available | ☐ | |
| 4 | **Forbidden:** `/settings/branches` blocked | ☐ | |
| 5 | **Forbidden:** `/settings/staff` blocked | ☐ | |
| 6 | **Forbidden:** editing a branch rejected *(try URL)* | ☐ | |
| 7 | Mobile: reports/dashboards readable | ☐ | |

---

## 3. Area Manager — `area.southern@nile-group.test`

**1. Expected menus:** Dashboard · Manager Home · Reports · Territory · Sales (Invoices/POS/Returns/Price Book/Customers/Sales Report) · Distribution · Inventory (view).
**2. Expected screens:** `/manager`, `/reports`, `/territory`, `/customers`, `/distribution/*`.
**3. Expected actions:** view region's reps/customers; assign customers to **in-region** reps; view distribution analytics.
**4. Forbidden actions:** Accounting posting; Settings admin; see/assign reps **outside their area/region**; field-only screens (no `field.sales`).
**5. Mobile checks:** territory/reports usable on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Sales/Distribution/Reports visible; **no Accounting/Settings** | ☐ | |
| 2 | Customers list scoped to region; rep selector shows **only area reps** | ☐ | |
| 3 | Assign a customer to an area rep → saves | ☐ | |
| 4 | **Forbidden:** assign customer to a rep outside the area → blocked/not listed | ☐ | |
| 5 | **Forbidden:** Accounting vouchers / Settings blocked | ☐ | |
| 6 | Mobile: territory + reports readable | ☐ | |

---

## 4. Supervisor — `supervisor.field01@nile-group.test`

**1. Expected menus:** Dashboard · **Supervisor Home** · Manager Home · Reports · Sales (Invoices/Returns/POS/Customers) · Distribution · Inventory + **Van Reconciliation**.
**2. Expected screens:** `/supervisor`, `/field/van-reconciliation`, `/customers`, `/reports`.
**3. Expected actions:** approve out-of-route visits / day-close exceptions; **manage** van reconciliation; approve load/transfer requests; view team.
**4. Forbidden actions:** Accounting posting; Settings; finance; data outside their team.
**5. Mobile checks:** approvals + reconciliation usable on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Supervisor Home visible; team data only | ☐ | |
| 2 | Van Reconciliation opens and is **editable** (manage) | ☐ | |
| 3 | Approve a load/transfer request | ☐ | |
| 4 | Rep/team scope = own team only | ☐ | |
| 5 | **Forbidden:** Accounting/Settings blocked | ☐ | |
| 6 | Mobile: approvals + reconciliation usable | ☐ | |

---

## 5. Van Sales Rep — `van.rep01@nile-group.test`

**1. Expected menus:** Dashboard · **Today** · Coaching · Route · Van Stock · Sales (Rep App, Journey, Invoices, Price Book, **own** Customers, Sales Report) · Distribution (Credit Requests, Sales Summary) · Inventory (Products/Stock/Van Reconciliation-view).
**2. Expected screens:** `/today`, `/rep`, `/sales/journey`, `/field/route`, `/field/stock`, `/customers` (own).
**3. Expected actions:** GPS check-in; **sell cash AND credit**; collect; return; request credit; day-close.
**4. Forbidden actions:** see other reps' customers; Accounting; Settings; assign customers to another rep; Van Reconciliation **manage** (view only).
**5. Mobile checks:** full field day on phone + offline.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Field menus present; **no Accounting/Settings** | ☐ | |
| 2 | Customers list = **own** customers only (≈7) | ☐ | |
| 3 | Visit Plan rep selector shows **only himself** | ☐ | |
| 4 | Sell screen offers **cash and credit** | ☐ | |
| 5 | Record a collection / a return | ☐ | |
| 6 | **Forbidden:** assign a customer to another rep → blocked | ☐ | |
| 7 | **Forbidden:** view another rep's settlement via `?rep=` → falls back to self | ☐ | |
| 8 | **Mobile:** check-in → sell (cash+credit) → collect → day-close completes | ☐ | |
| 9 | **Mobile offline:** queue actions offline → reconnect → sync, no duplicates | ☐ | |

---

## 6. Cash Van Rep — `cash.van01@nile-group.test`

**1. Expected menus:** same field set as Van Rep **minus Credit Requests**.
**2. Expected screens:** `/today`, `/rep`, `/sales/journey`, `/field/route`, `/field/stock`, Invoices.
**3. Expected actions:** check-in; **sell cash only**; collect; return; day-close.
**4. Forbidden actions:** **credit sale** (no credit/terms option; future-due invoice blocked by DB guard); credit requests; other reps' data.
**5. Mobile checks:** cash day on phone; confirm no credit option.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Field menus present; **Credit Requests NOT shown** | ☐ | |
| 2 | Sell screen offers **cash only** (no credit/terms option) | ☐ | |
| 3 | **Forbidden:** attempt a credit/future-due sale → blocked (guard) | ☐ | |
| 4 | Collect + return work | ☐ | |
| 5 | Customers = own only | ☐ | |
| 6 | **Mobile:** cash sell + collect; credit option absent | ☐ | |

---

## 7. Merchandiser — `merch01@nile-group.test`

**1. Expected menus:** Dashboard · Today · Coaching · Route · Van Stock · Sales (Rep App, Journey, Customers) · Inventory (Products/Stock/Van Reconciliation-view) · Settings (**MSL Matrix, Surveys, Grading**).
**2. Expected screens:** `/rep`, `/sales/journey`, `/customers`, `/settings/msl`, `/settings/surveys`, `/settings/outlet-grades`.
**3. Expected actions:** visits; assortment/survey/grading capture; view inventory.
**4. Forbidden actions:** **Sell / POS / Invoices / Collections** (no `sales.sell`/`sales.collect`); Accounting; finance.
**5. Mobile checks:** visit + survey/grading capture on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | **No Sell / Invoices / POS / Collections** anywhere | ☐ | |
| 2 | MSL Matrix / Surveys / Grading screens open | ☐ | |
| 3 | Capture a survey / grade an outlet | ☐ | |
| 4 | Customers viewable (visits) | ☐ | |
| 5 | **Forbidden:** `/sales/pos` or `/collections` blocked *(try URL)* | ☐ | |
| 6 | **Mobile:** visit + survey/grading capture works | ☐ | |

---

## 8. Warehouse Manager — `warehouse.manager@nile-group.test`

**1. Expected menus:** Dashboard · Van Stock · Inventory (Products/Stock/Low-stock/Expiry/**Transfers/Load-requests/Stock Count/Warehouses/Van Reconciliation-manage**) · Purchasing (**Purchase Orders**) · Settings (Units of Measure).
**2. Expected screens:** `/inventory`, `/inventory/transfers`, `/inventory/count`, `/warehouses`, `/purchases/orders`, `/settings/uom`.
**3. Expected actions:** transfers, counts, **approve** adjustments/transfers, purchase orders, UOM.
**4. Forbidden actions:** Sell/Collect; Customers; Accounting; Settings admin (staff/branches).
**5. Mobile checks:** stock count/transfer usable on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Inventory + Purchase Orders + UOM visible; **no Sell/Accounting/Customers** | ☐ | |
| 2 | Create a stock transfer / count | ☐ | |
| 3 | Open Purchase Orders | ☐ | |
| 4 | Van Reconciliation editable (manage) | ☐ | |
| 5 | **Forbidden:** `/sales/pos` / `/accounting` blocked | ☐ | |
| 6 | Mobile: count/transfer usable | ☐ | |

---

## 9. Inventory Controller — `inventory.controller@nile-group.test`

**1. Expected menus:** Dashboard · Van Stock · Inventory (Products/Stock/Low-stock/Expiry/**Stock Count/Transfers**/Warehouses-view) · Van Reconciliation (**view**).
**2. Expected screens:** `/inventory`, `/inventory/count`, `/inventory/transfers`, `/products`.
**3. Expected actions:** count, adjust, transfer (create), view reconciliation.
**4. Forbidden actions:** **Purchase Orders / Suppliers**; **approve** adjustments/transfers; reconciliation **manage**; UOM; Sell/Accounting.
**5. Mobile checks:** stock count on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Inventory screens visible; **NO Purchase Orders, NO Suppliers** | ☐ | |
| 2 | Create a stock count / adjustment | ☐ | |
| 3 | Create a transfer (but cannot **approve**) | ☐ | |
| 4 | Van Reconciliation = **view only** (not editable) | ☐ | |
| 5 | **Forbidden:** `/purchases/orders` blocked *(try URL)* | ☐ | |
| 6 | **Forbidden:** approve an adjustment → blocked | ☐ | |
| 7 | Mobile: stock count usable | ☐ | |

---

## 10. Collection Officer — `collection.officer@nile-group.test`

**1. Expected menus:** Dashboard · Sales (**Collections** [new], Invoices, Customers, Price Book) · Distribution (Sales Summary / Returns Analysis).
**2. Expected screens:** `/collections`, `/sales/invoices`, `/customers`.
**3. Expected actions:** view open invoices + balances; **record a collection** (partial & full); update customer status.
**4. Forbidden actions:** **Sell / POS**; Accounting posting; Settings; other reps' customers (scoped).
**5. Mobile checks:** record a collection on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | **Collections** menu present; **no Sell / POS** | ☐ | |
| 2 | `/collections` shows customers with balance + open invoices | ☐ | |
| 3 | Record a **partial** collection → balance updates | ☐ | |
| 4 | Record a **full** collection → balance clears | ☐ | |
| 5 | **Forbidden:** `/sales/pos` blocked *(try URL)* | ☐ | |
| 6 | **Forbidden:** Accounting posting not available | ☐ | |
| 7 | Mobile: record a collection works | ☐ | |

---

## 11. Accountant — `accountant@nile-group.test`

**1. Expected menus:** Dashboard · Manager Home · Reports · Sales (Invoices-collect, Price Book) · Purchasing (Suppliers) · **Accounting (Chart, Vouchers/post, Journal, Reports, Aging, Exports)**.
**2. Expected screens:** `/accounting/*`, `/suppliers`, `/sales/invoices`.
**3. Expected actions:** post vouchers/journals; view financial reports + aging; manage suppliers; record collections.
**4. Forbidden actions:** **Sell / field** (no `sales.sell`/`field.sales`); Settings admin; inventory adjust.
**5. Mobile checks:** financial reports readable on phone.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Accounting (with **Vouchers/post**) + Suppliers visible; **no Sell/field** | ☐ | |
| 2 | Post a voucher / journal entry | ☐ | |
| 3 | Open Aging + Financial Reports | ☐ | |
| 4 | **Forbidden:** `/sales/pos` / `/rep` blocked | ☐ | |
| 5 | **Forbidden:** Settings admin blocked | ☐ | |
| 6 | Mobile: reports readable | ☐ | |

---

## 12. Auditor — `auditor@nile-group.test`

**1. Expected menus:** Dashboard · Manager Home · Reports · Territory · Sales Report · Inventory (read) · Accounting (**view**).
**2. Expected screens:** `/reports`, `/sales/report`, `/inventory`, `/accounting/reports`, `/accounting/journal`.
**3. Expected actions:** **read-only** — view reports, inventory, accounting.
**4. Forbidden actions:** **any write** — no Sell/Collect/Post/Adjust/Settings; **no action buttons** should render.
**5. Mobile checks:** reports readable; no edit affordances.

| # | Check | P/F | Notes |
|---|---|---|---|
| 1 | Reports/Inventory/Accounting-view visible; **no Settings/Sell/Collect** | ☐ | |
| 2 | Reports + Accounting view open (read) | ☐ | |
| 3 | **No write/edit/post buttons** anywhere | ☐ | |
| 4 | **Forbidden:** `/sales/pos`, `/accounting/vouchers` blocked *(try URL)* | ☐ | |
| 5 | Mobile: reports readable, no edit affordances | ☐ | |

---

## Mobile validation summary (field roles)

| Role | Offline-then-sync | GPS check-in | Cash sale | Credit sale | RTL Arabic | P/F |
|---|---|---|---|---|---|---|
| Van Sales Rep | ☐ | ☐ | ☐ | ☐ (allowed) | ☐ | |
| Cash Van Rep | ☐ | ☐ | ☐ | ☐ (must be hidden) | ☐ | |
| Merchandiser | ☐ | ☐ | n/a | n/a (no sell) | ☐ | |
| Supervisor | ☐ | n/a | n/a | n/a | ☐ | |

---

## Defect log (return to dev)

| # | Role | Screen/Action | Expected | Actual | Severity |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

**Severity:** 🔴 blocker (security/forbidden-write succeeds) · 🟠 functional · 🟡 cosmetic/i18n.
Prioritize any 🔴 (a forbidden action that succeeds) — report immediately.
