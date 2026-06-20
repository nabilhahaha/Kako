# Final Platform Navigation & UX Review Package

### Consolidation checkpoint before the next phase

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Code @** `4e57585` · **Date:** 2026-06-18 · **Status:** Review only — *no implementation.*

Captures the state after the shipped work — Settings single-source (M1+M2), label cleanup (P1), CRM umbrella (P2), container rule (P3), Sales/Distribution grouping (P4) — and sets the order for the remaining items. Constraints throughout: no business-logic, permission, RLS, or workflow change; no new features.

---

## 1. Before / After (capture points)

Authenticated screenshots can't be captured from the build sandbox; below are the **exact before/after shots** to take on the live preview (`kako`, `4e57585`). Toggle EN/AR for RTL.

### CRM
| Before | After |
|---|---|
| No CRM section; Customers under **Sales**; Credit Requests / Visit Outcomes under **Distribution**; Customer Requests buried in Field | A dedicated **CRM** section (canonical entry): Customers · Customer Transfer · Customer Requests · Credit Requests · Visit Outcomes |
*Shot:* sidebar of an FMCG/distribution tenant — CRM section present above Sales.

### Sales
| Before | After |
|---|---|
| 28 flat items (incl. Customers/Transfer/Requests) | 25 items in **Selling · Field / Van Sales · Reports** sub-headers; CRM items removed |
*Shot:* sidebar → Sales section showing the three sub-headers.

### Distribution
| Before | After |
|---|---|
| 24 flat items (incl. Credit Requests, Visit Outcomes) | 22 items in **Execution · Coverage & Assortment · Perfect Store · Reports**; CRM items removed |
*Shot:* sidebar → Distribution showing the four sub-headers.

### Settings
| Before | After |
|---|---|
| Sidebar listed ~38 settings items (6 groups) **plus** an in-page nav — two taxonomies | Sidebar = single **"Settings"** link; in-page **Top Grouping** (7 canonical groups) is the only navigator |
*Shots:* `…/settings` (single link + grouped grid); `…/settings/approval-matrix` (Automation & Policies active).

---

## 2. Final platform navigation map

```
L0  PLATFORM BAR — identity · tenant/role · search · Ctrl-K · quick-create · 🔔

L1  MODULE RAIL
 ├ PLATFORM (provider)   Overview · Tenants · Catalog · Billing · Team & Access · Reference
 ├ MAIN                  Dashboard · Today · Supervisor · Manager · Attention · Reports ·
 │                       Territory · Coaching · Route · Van Stock · Approvals · Alerts · …
 ├ ★ CRM                 Customers · Customer Transfer · Customer Requests · Credit Requests · Visit Outcomes
 ├ SALES                 ▸Selling  ▸Field/Van Sales  ▸Reports
 ├ DISTRIBUTION          ▸Execution  ▸Coverage & Assortment  ▸Perfect Store  ▸Reports
 ├ INVENTORY             Products · Stock · Low Stock · Transfers · Counts · Warehouses · …
 ├ PURCHASING            Suppliers · Purchase Orders · Supplier Returns
 ├ ACCOUNTING            Chart · Vouchers · Journal · Reports · Aging · Exports
 ├ (VERTICAL PACKS)      Hotel | Clinic | Salon | Pharmacy | Fashion | Restaurant | Laundry | Market | Wholesale
 └ SETTINGS  (single link) → in-page Top Grouping:
        Organization · Finance & Compliance · People & Roles · Products & Data ·
        Automation & Policies · Integrations · Personal

L2  In-module Top Grouping (sub-headers / tabs)     L3  Content (+ record tabs)
```

Section sizes now: Settings →1 rail link · Sales 25 (3 groups) · Distribution 22 (4 groups) · CRM 5 · Main 14 · Pharmacy 13.

---

## 3. Remaining duplication across the platform

**Per-user duplication: effectively cleared.** No shared label key resolves to two routes anymore (P1), and the Settings two-catalog problem is gone (M1+M2).

What remains is **vocabulary-level concept scatter** (mostly contextually gated, so a single tenant rarely sees two at once) — to be addressed by naming convention + the deferred Settings M3, not by destructive merges:

| Concept | Surfaces | Nature | Planned by |
|---|---|---|---|
| **Reports** | `/reports` · `/sales/report` · `/distribution/report` · `/accounting/reports` · `/pharmacy/reports` · `/clinic/reports` · `/fashion/reports` + several `*summary` | Per-module reports, no common naming | Naming convention "<Module> Reports" (P-future) |
| **Returns** | `/sales/returns` · `/field/van-sales/my-returns` · `/purchases/returns` · `/pharmacy/returns` · `/distribution/returns-analysis` · settings `returns` (policy) | Operational vs config; per-module | VP1 naming; config already "Return Policy" |
| **Customers** | `/customers` (CRM) · `/wholesale/customers` · `/fashion/customers` · clinic `patients` | Vertical-specific customer views | Vertical-exclusive; leave |
| **Approvals** | `/approvals/queue` (unified) · `/field/van-sales/approvals` · `/field/van-sales/day-close-approvals` · settings `approval-matrix` (config) | Operational queue + config | Settings M3 (Workflows tabs) |
| **Dashboards** | generic `/dashboard` + vertical `*Dashboard` | Vertical-exclusive | Leave |
| **Settings page-level stutter** | Workflows/Approvals/Templates · Integration Hub/Connections/Sync · Reporting Lines/Org Structure | Sibling pages that are facets | **Settings M3** (merge to tabs) |
| **Audit Log** | `/platform/audit` listed for platform staff **and** tenant super-admins | Same route, two audiences | Intentional; keep |

---

## 4. Top 10 UX inconsistencies still present

| # | Inconsistency | Where | Fix track |
|---|---|---|---|
| 1 | **Platform entity pages are bespoke** (not AdminWorkbench) | `/platform/plans`, `/roles`, `/staff`, `/billing` | Admin Center alignment |
| 2 | **Two list patterns** — client `EntityListPanel` (≤200) vs server pagination | Settings vs Platform | Admin Center alignment |
| 3 | **`/customers` is bespoke**, not the workbench pattern | CRM | P5 |
| 4 | **Customer 360 timeline is financial-only** (no requests/surveys/visits) | `/customers/[id]/360` | CRM evolution |
| 5 | **Settings page-level stutter** (Workflows/Approvals/Templates, etc. as separate pages) | Settings | Settings M3 |
| 6 | **`EntityActionBar` only in 3 surfaces**; platform + customers use ad-hoc buttons | Platform, CRM | Admin Center alignment / P5 |
| 7 | **`ActivityFeed` (audit) only in Settings workbenches**; absent on platform + customers | Platform, CRM | Admin Center alignment |
| 8 | **Container rule not yet uniformly applied** (Features=ModulePage vs others=Workbench — now documented, P3) | Settings/Platform | Admin Center alignment |
| 9 | **No consistent "Reports" naming/grouping** across modules | Sales/Dist/Pharmacy/Clinic/… | Naming convention (later) |
| 10 | **`/customers` layout gates on `sales`, not `crm`** (latent: CRM-only tenant) | CRM | Reconcile when permission changes are in scope |

*(Runner-up: Personal items — My Account / Design System — still inside Settings; relocation is the deferred M4.)*

---

## 5. Recommended implementation order (remaining work)

Ordered to honour **consistency before features**, finish-what's-started, then largest-gap-first:

| Order | Workstream | Why here | Risk | Constraints |
|------|-----------|----------|------|-------------|
| **1** | **Settings M3** (merge facet-pages → tabs: Workflows, Integrations, Roles & Permissions, Custom Fields, Import/Export, Onboarding) | Finishes the Settings story; removes the last page-level stutter; reuse-only with old-route redirects | Med (routes via redirect) | No logic/permission/RLS/workflow change |
| **2** | **Admin Center alignment** (apply P3 rule: Plans/Roles/Staff → AdminWorkbench; add EntityActionBar + ActivityFeed; unify list pagination via EntityListPanel server-search) | Largest remaining consistency gap; raises the whole platform layer to the standard | Med | UX-standardization; reuse existing managers/actions |
| **3** | **P5** (`/customers` → AdminWorkbench + Customer360 facets; reconcile gating note) | Ties CRM into the same pattern; depends on #2's primitives | Med | Reuse actions; no logic change |
| **4** | **CRM evolution** (design-first): unified activity timeline consolidating existing requests/visits/surveys → then Leads/Opportunities/Pipeline/Accounts | **New features** — explicitly last, per "architecture before features"; design + approval before any build | — | Separate design-first workstream |

**Rationale:** 1–3 are reuse-only consistency work (no new features) and should land before 4. CRM evolution (4) is the only net-new feature set and stays design-first.

---

## 6. Status snapshot

- **Shipped & green** (tsc · 1592 tests · build): Settings M1+M2, P1, P2, P3, P4.
- **Deferred:** Settings M3, P5, P6/CRM evolution, M4 (Personal relocation), Admin Center alignment — all sequenced above.
- **Open for your sign-off:** the live preview of the CRM umbrella + grouped Sales/Distribution.

No implementation until you pick the next workstream.
