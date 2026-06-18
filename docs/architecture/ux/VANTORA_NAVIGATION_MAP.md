# VANTORA — Navigation Map & Screen Hierarchy (Final)

**Status:** Planning / review-first — **no code, no implementation.** The
navigation map + screen hierarchy + role journeys across all approved modules,
**reusing the existing UI kit + `navigation.ts`**. Pairs with the UI/UX Master
Screen Plan (patterns/states); this doc is the **map + hierarchy + journeys**.

> **Reuse (on `main`):** `layout/sidebar` + `layout/topbar` + `layout/bottom-nav`
> + `layout/command-palette` (⌘K Search); `page-header`/`list-toolbar`/`pagination`/
> `empty-state`/`page-skeleton`/`stat-card`/`form-section`; nav source of truth
> `lib/erp/navigation.ts` (groups: data · governance · integrations · organization ·
> personal · provider; every item permission/module/business-type gated). Existing
> routes already include `/dashboard`, `/customers`, `/accounting/*`, `/inventory/*`,
> `/distribution/*` (FMCG), `/field/*`, `/approvals`, `/approval-center`,
> `/attention`, `/coaching`.

---

## 1. Main navigation
- **Sidebar (desktop):** grouped sections rendered from `navigation.ts`
  (`visibleSections`), gated by permission + module + business type, active-route
  highlight, RTL-mirrored. Foundation modules map to:
  - **Sales / FMCG →** `/customers`, `/distribution/*`, `/field/*`
  - **Finance →** `/accounting/*` (chart, journal, vouchers, aging, reports)
  - **Inventory →** `/inventory/*` (count, expiry, low-stock, requests)
  - **Purchasing →** `/purchasing/*` *(new area: requests, RFQ, orders, GRN, returns)*
  - **CRM →** `/crm/*` *(leads, pipeline, cases)* + customer `/360`
  - **Trade Spend →** `/trade-spend/*` *(budgets, promotions, claims)* (FMCG under `/distribution`)
- **Top bar:** **⌘K Search** · language toggle · theme toggle · notifications bell ·
  user/company menu.
- **Mobile:** `bottom-nav` primary tabs + top search icon + "more" sheet; sidebar →
  drawer.

## 2. Desktop layout
`[ sidebar | ( topbar ) / page-header / content ]`. Content = list/detail/form per
the patterns doc. Wide screens use multi-column (master-detail) for inboxes
(approvals, attention). Persistent ⌘K. Breadcrumb (module → list → record) on deep
screens.

## 3. Mobile layout
`bottom-nav` (Home/Dashboard · Customers/Visits · Sell/Order · Inventory/Field ·
More). Full-screen **sheets** for create/search/filter; single-column stacked cards
replace tables; sticky action bars; numeric `inputmode`; field flows (journey, van
sale, collection) are primary mobile screens. Offline-friendly.

## 4. Dashboard hierarchy
- **Role dashboard** at `/dashboard` (composition by role): `stat-card` KPI band +
  widget cards (approvals due, attention items, near-expiry, AR aging, targets vs
  achievement) — each deep-links to its module. **`/attention`** = a cross-module
  "needs action" inbox; **`/coaching`** = supervisor/manager coaching view.
- States: empty → `getting-started`; loading → `page-skeleton`.

## 5. Module hierarchy (per approved module)
Consistent shape: **List → Detail (tabs) → Form** (+ hub/360 + settings).
- **Finance** `/accounting`: chart (COA tree) · journal (entries→lines, post) ·
  vouchers · aging · reports (TB/P&L/BS). Settings: periods, posting rules, tax, FX.
- **Inventory** `/inventory`: stock list · item detail (lots/serials/movements) ·
  count · expiry · low-stock/reorder · requests/transfers. Settings: warehouses/bins,
  costing method.
- **Purchasing** `/purchasing`: requests · RFQ/quotations · orders (PO) · goods
  receipts (GRN) · returns · supplier invoices. Detail: 3-way match. Settings:
  supplier price lists.
- **Sales / FMCG** `/customers` + `/distribution` + `/field`: customers (+`/360`) ·
  quotations · orders · delivery notes · invoices · returns · collections; FMCG:
  routes/journey/visit · van load + reconciliation · coverage/MSL/OOS/perfect-store ·
  targets. 
- **CRM** `/crm`: leads · pipeline (opportunities) · contacts · cases · campaigns;
  activity timeline + open opps/cases on customer `/360`.
- **Trade Spend** `/trade-spend`: budgets · promotions (calendar) · agreements ·
  listing/visibility · claims · settlement; ROI dashboard.

## 6. List / Detail / Form patterns
(Per the UI/UX Master Screen Plan.) **List** = `page-header` + `list-toolbar`
(search/filter chips/sort/bulk) + table + `pagination`. **Detail** = `page-header`
(title + status `badge` + actions) + **tabs** + `back-link`/breadcrumb; read-only
when lifecycle-locked (posted/approved). **Form** = `form-section` + `field-error` +
sticky Save/Cancel + unsaved-changes guard; one create/edit component.

## 7. Approval screens
Reuse the Workflow Platform + existing `/approvals` · `/approval-center`: an
**approvals inbox** (pending tasks, SLA/urgency badges, filter by type) + a
**decision view** (record context + approve/reject + comment). Per-record approval
actions also surface inline on detail headers (credit, discount, return, journal,
PR/PO, promotion/claim, van-reconciliation variance). Maker-checker is visible.

## 8. Search placement
- **Top bar ⌘K** — global, categorized records (Search OS) + page quick-jump
  (primary path to anything).
- **Per-module** — `list-toolbar` search filters the current list; "search this
  module" deep-links into the palette (`?type=`).
- **Mobile** — top search icon → full-screen search sheet. Identifier search
  (code/barcode/phone/VAT/serial) format-agnostic.

## 9. Global actions
Available everywhere via the top bar / command palette: **Search (⌘K)**, **New…**
(create the user's most-used document — context/role aware), **notifications**,
**approvals/attention**, language/theme, switch company/branch (platform owner /
multi-branch), account. The command palette doubles as a global action launcher.

## 10. Quick actions
Context + role quick actions (buttons/FAB on mobile):
- **Rep/visit:** check-in · take order · van sale · collect payment · log survey.
- **Inventory:** adjust · transfer · count.
- **Finance:** new journal · receipt voucher · post.
- **Purchasing:** new PR/PO · receive (GRN).
- **Sales:** new quote/order · invoice · return.
Surfaced on the relevant list/detail headers and the mobile action bar.

---

## 11. User journeys (5 personas)

### A. Sales (Rep / Salesman) — mobile-first field
`bottom-nav` → **Journey** (`/field/journey`) → **check-in** at outlet (GPS) →
survey/merchandising/compliance → **take order / van sale** → **collect payment** →
check-out → next stop. Van: load-out at depot → sell on route → **van
reconciliation** (`/field/van-reconciliation`) at day-close. Sees own customers,
targets, coverage; quick actions everywhere.

### B. Supervisor — team field execution
Desktop/tablet. `/dashboard` (team KPIs) → **coverage / journey compliance**
(`/distribution/journey-compliance`, `/distribution/routes`) → **MSL / OOS /
perfect-store** monitoring → **coaching** (`/coaching`) on reps → approve
field-level exceptions (returns, discounts, credit requests) via `/approvals`.
Scope: their reps/routes (branch/territory gated).

### C. Manager — commercial performance & approvals
`/dashboard` (targets vs achievement, AR aging, trade-spend) → **distribution
cockpit** (`/distribution/retail-cockpit`, `sales-summary`, `targets-achievement`,
`returns-analysis`) → **approvals** (credit limits, promotions/trade-spend, large
orders, PO) → reviews CRM pipeline. Scope: company-wide commercial.

### D. Company Admin — configuration & control
`/dashboard` → **Settings/organization** (users/roles, branches, warehouses/bins,
price lists, fiscal periods, posting rules, tax, workflow definitions via the
Builder/Canvas, search) → **governance** (audit, approvals config) → full module
access. Owns flags/policies for the tenant.

### E. Platform Owner — multi-tenant operations
The **provider** nav group + platform palette: companies, platform users, billing,
licensing/modules, platform activity/audit, cross-tenant support. Switches into a
company context; can search across tenants (separate platform palette). Governs
flag rollout / pilots.

---

## Component reuse map
Shell (sidebar/topbar/bottom-nav/command-palette) · framing (page-header/back-link/
breadcrumb) · lists (list-toolbar/pagination/empty-state/page-skeleton) · forms
(form-section/inputs/field-error) · dashboard (stat-card/getting-started) · dialogs
(confirm/prompt + mobile sheet) · status/actions (badge/button/tooltip) · approvals
(Workflow task UI + `/approvals`,`/attention`) · search (command-palette / Search OS).
**Standardize (reuse-extend): Tabs, DataTable, Breadcrumb, Sheet, error-state.**

> Every approved module's screens are assembled from this kit + these patterns — no
> bespoke shells, one consistent look across Sales/FMCG, Finance, Inventory,
> Purchasing, CRM, Trade Spend, and all verticals.

---

## Open questions for review
1. **New module roots** `/purchasing`, `/crm`, `/trade-spend` vs. nesting under
   existing groups (e.g. Trade Spend under `/distribution`)?
2. **Single `/approvals` hub** vs. per-module inboxes + the global bell/attention?
3. **Role dashboards** fixed per role vs. a light widget registry?
4. **Mobile bottom-nav tabs** final set (5 slots) per role?
5. Build the **Tabs/DataTable/Breadcrumb/Sheet** primitives as an upfront UI pass
   before module screens?

*Planning / review-first — no code or implementation. Reuse-first.*
