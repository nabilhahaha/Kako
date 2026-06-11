# VANTORA — Platform Assessment & FMCG Readiness Report

**Prepared for:** VANTORA leadership · **Environment assessed:** `vantora-staging` → tenant **Nile FMCG (DEMO)**
(Supabase `rsjvgehvastmawzwnqcs`, Next.js 15 frontend on Vercel). **`kako-fmcg` not in scope.**
**Date:** 2026-06-11 · **Type:** Assessment & reporting only (no changes implemented in this task).

> Scope note: findings are derived from the live staging tenant, the application's navigation/permission
> gating code, the database schema/RLS, and the work completed during the current hardening cycle
> (authentication, grants, module gating, demo data, role hardening, and the role-isolation fix).

---

## 1. Current platform status

### 1.1 What is working ✅
- **Authentication & session** — Supabase Auth (GoTrue) login, SSR session, middleware refresh. Demo users
  (58) authenticate; profile/company/permission resolution on login is solid.
- **Multi-tenant data access** — Row-Level Security enforced on 288 tables; the standard role GRANTs are in
  place; tenant isolation by company; tenant-scoped document numbering (migration 0268) lets multiple
  tenants coexist.
- **Role-based navigation** — the sidebar is permission + module + flag gated; after enabling the FMCG
  module set, each role now sees a navigation aligned to its function.
- **Core FMCG van-sales loop** — Sell → Collect → Return + Credit Note → Van Reconciliation runs through
  real RPCs (`erp_van_sell`, `erp_settle_collection`, `erp_van_return`, `erp_compute_van_reconciliation`)
  with consistent balances, stock, and AR.
- **Refined FMCG role model** — Merchandiser, Cash Van, Collection Officer, Credit Controller, and a
  cash/credit-separated Van Sales Rep, enforced by company-scoped permissions and a DB guard.
- **Strict role isolation (just delivered)** — user-selectors and profile reads are now scoped by org role
  (self / team / region / company) at the **database (RLS)**, with API + UI hardening.
- **Demo dataset** — 154 customers, 25 products, 6 suppliers, ~90 days of sales/collections/returns/credit
  notes/reconciliations (~1.01M SAR AR) for realistic UI testing.

### 1.2 What is partially working 🟡
- **Admin/governance screens** — Company Admin & GM cannot reach `Branches`, `Users`, `Permissions`,
  `e-Invoice` (these are `superAdminOnly`, a platform-level gate). They manage via `Staff` / `Organization`
  / `Authz Console` instead — functional but not the expected "admin sees all org settings."
- **Role separation at the top** — `manager` (GM) currently equals `admin` in permission breadth.
- **API-layer hardening deployment** — the role-isolation **RLS is live**; the matching **frontend code**
  (scoped RPC + write guards) is committed but not yet on the deployed preview build.
- **Dashboards & reports** — data is present and queries resolve, but the dashboard widgets and report
  outputs have not been visually QA'd screen-by-screen.
- **Collections UX** — collections work via the Invoices/Settlement flow; there is no dedicated
  "Collections" menu for a Collection Officer.

### 1.3 What is not working / not yet validated ❌
- **Mobile / offline rep experience** — the Rep App and offline sync exist in code but have not been
  validated on a device for this tenant.
- **Approvals / workflow module** — disabled for the tenant (not in the enabled module set); approval
  center / change requests are hidden.
- **e-Invoicing (ZATCA Phase 2)** — present as a screen but not configured/validated for KSA compliance.
- **Public access** — the deployment sits behind Vercel SSO; no public pilot URL or custom domain yet.
- **Deep report validation** — financial reports, aging, distribution analytics not yet reconciled against
  the seeded data.

### 1.4 Technical readiness
| Dimension | State |
|---|---|
| Schema & RLS | 🟢 Solid (270+ tables, RLS enforced, grants correct) |
| Auth & tenancy | 🟢 Solid |
| Core FMCG transactions | 🟢 Working end-to-end |
| Navigation/permission gating | 🟢 Working (post module-fix) |
| Role isolation | 🟢 DB live · 🟡 app code pending deploy |
| Dashboards/reports | 🟡 Data present, QA pending |
| Mobile/offline | 🔴 Unvalidated |
| Public deployment | 🔴 Behind SSO |
| **Overall technical readiness** | **~75%** |

### 1.5 FMCG pilot readiness
The **happy-path FMCG distribution flow is demonstrable today** on the demo tenant. Pilot readiness is
gated by: deploying the role-isolation app code, a screen-by-screen UI QA, dashboard/report validation, a
public access path, and the admin/governance decisions in §2. **Pilot readiness ≈ 65–70%.**

---

## 2. Full role & permission audit

Method: computed from the navigation gating rules (`visibleSections`) + each role's effective company-scoped
permissions + the org-hierarchy visibility model. "Screens" = sidebar items reachable; "Actions" = in-screen
capabilities gated by permission.

> Cross-cutting: **no tenant user is `is_super_admin`**, so `superAdminOnly` screens (Branches, Users,
> Permissions, e-Invoice, Design) are hidden for every role including Company Admin.

### Platform Owner (`platform_owner`)
- **Expected:** vendor/platform control only — tenants, plans, roles catalog, billing, platform staff,
  audit, platform analytics. No tenant-operational screens.
- **Actual:** exactly the Platform panel (Overview, Companies, Plans, Roles, Billing, Staff, Audit, Drugs
  reference). Tenant sections correctly hidden.
- **Missing / Over / Risk:** none material. **Fix:** none.

### Company Admin (`admin`)
- **Expected:** all tenant operations + full company administration.
- **Actual screens:** Dashboard, Today, Supervisor, Manager, Reports, Territory; full Sales, Distribution,
  Inventory, Purchasing, Accounting; Settings → Staff, Organization, Regions, Van-Sales, Marketplace, Custom
  Fields, Authz Console, Tenant Audit, Integrations/Import/Export.
- **Expected vs actual actions:** can sell/collect/return, approve customers, manage inventory, post
  accounting, manage staff/roles (via Authz). **Missing:** Branches, Users, Permissions, e-Invoice screens
  (`superAdminOnly`). **Over-permissions:** holds many cross-vertical permissions (clinic/hotel/fashion/…)
  that are module-hidden — latent breadth, low risk while hidden; an Electrical-pack leak was removed.
- **Security risk:** Medium — an over-broad admin permission set is a blast-radius risk if other vertical
  modules are ever enabled. **Required fix:** decide tenant-admin access to Branches/Users/Permissions;
  trim non-FMCG permissions from the FMCG admin override.

### General Manager (`manager`)
- **Expected:** company-wide oversight, slightly below Admin.
- **Actual:** effectively identical to Admin (same permission breadth incl. Settings/Integrations).
- **Over-permissions:** **GM == Admin.** **Security risk:** Medium (privilege not differentiated).
  **Required fix:** trim `settings.users` / `integrations.manage` / `settings.branches` from `manager` if GM
  should be narrower.

### Sales Manager (`regional_manager`)
- **Expected:** regional sales leadership — sees their region's reps/customers, distribution analytics,
  targets; no finance/admin.
- **Actual:** Dashboard, Manager Home, Reports, Territory; Invoices, POS, Returns, Price Book, Rep
  Settlement, Customers, Sales Report; **Distribution** dashboards; Inventory view. **User visibility now
  scoped to their region(s)** (verified: 51 users).
- **Missing:** none material. **Over:** none. **Risk:** Low. **Fix:** none.

### Area Manager (`area_manager`)
- **Expected:** users/customers in their area only; sales oversight; no finance/admin.
- **Actual:** Dashboard, Manager Home, Reports, Territory; Invoices, POS, Returns, Customers, Sales Report;
  Distribution dashboards; Inventory view. **User visibility scoped to their region** (verified: 8 users).
- **Missing:** none. **Over:** none. **Risk:** Low (was High before the isolation fix). **Fix:** none.

### Supervisor (`supervisor`)
- **Expected:** their team, approvals, reconciliation.
- **Actual:** Dashboard, **Supervisor Home**, Manager Home, Reports; Invoices, Returns, POS, Customers,
  Sales Report; Distribution; Inventory + **Van Reconciliation (manage)**; approve load-requests/transfers.
  **User visibility scoped to their team** (verified: 6).
- **Missing/Over/Risk:** none. **Fix:** none.

### Van Sales Rep (`salesman`)
- **Expected:** field selling (cash + credit), collections, **own** customers, van stock/reconciliation,
  journey.
- **Actual:** Today, Route, Van Stock, Rep App, Journey, Invoices, Price Book, **own** Customers, Sales
  Report; Credit Requests (create); Van Reconciliation (view). **Visibility = self only** (verified).
- **Missing:** none. **Over:** none (credit selling is intended). **Risk:** Low. **Fix:** none.

### Cash Van Rep (`cash_van`)
- **Expected:** identical field nav, **cash only**.
- **Actual:** same as Van Rep **minus Credit Requests**; no `sales.credit`; credit invoices blocked by a DB
  guard. **Visibility = self only.**
- **Risk / Required fix:** the cash-vs-credit difference is **action-level** — confirm the Sell screen hides
  the credit/terms option for this role (UI QA item, not a permission gap).

### Merchandiser (`merchandiser`)
- **Expected:** visits, assortment/survey/grading, customers, inventory view — **no selling/collections**.
- **Actual:** Today, Route, Van Stock, Rep App, Journey, Customers; Inventory (view); Settings → **MSL
  Matrix, Surveys, Grading**. No Sell/POS/Invoices. **Visibility = self only.**
- **Missing/Over/Risk:** none. **Fix:** none. *(Model-correct.)*

### Warehouse Manager (`warehouse_keeper`)
- **Expected:** inventory/warehouse ops; no sales/finance.
- **Actual:** Van Stock; Inventory (Products/Stock/Transfers/Load-requests/Stock Count/Warehouses/Van
  Reconciliation-manage); Purchasing → Purchase Orders; Settings → Units of Measure. **Visibility = self.**
- **Missing/Over/Risk:** none. **Fix:** none.

### Inventory Controller (`warehouse_keeper` role, distinct job title)
- **Expected:** stock accuracy, counts, transfers, adjustments — a narrower warehouse role.
- **Actual:** **same permission set as Warehouse Manager** (both map to `warehouse_keeper`).
- **Over-permissions:** holds `purchasing.manage` and approval perms that a pure stock controller may not
  need. **Security risk:** Low–Medium. **Required fix:** if Inventory Controller should be narrower than
  Warehouse Manager, split into a dedicated role (today they are indistinguishable by permission).

### Accountant (`accountant`)
- **Expected:** full accounting, AR/suppliers; no selling/field.
- **Actual:** Manager Home, Reports; Invoices (collect), Rep Settlement; Suppliers; **Accounting →
  Chart/Vouchers(post)/Journal/Reports/Aging/Exports**. **Visibility = self.**
- **Over-permissions:** carries some `fashion.*` permissions (module-hidden). **Risk:** Low. **Fix:**
  optional cleanup of cross-vertical perms.

### Collection Officer (`collection_officer`)
- **Expected:** collections + customer status; **no selling**.
- **Actual:** Dashboard; **Invoices** (record collections), Customers, Price Book; Distribution aggregates.
  No Sell/POS. **Visibility = self.**
- **Missing:** **no dedicated "Collections" screen** (uses Invoices/Settlement). **Risk:** Low. **Required
  fix:** add a first-class Collections workspace for this role (UX, not security).

### Credit Controller (`credit_controller`)
- **Expected:** credit-request **approval**, AR view, collections; **no journal posting**.
- **Actual:** Manager Home, Reports; Invoices (collect), Rep Settlement; **Distribution → Credit Requests
  (approve)**; Suppliers; Accounting (**view only** — Vouchers/post correctly hidden). **Visibility = self.**
- **Missing/Over/Risk:** none. **Fix:** none.

### Auditor (`viewer`)
- **Expected:** read-only reports + inventory.
- **Actual:** Manager Home, Reports, Territory; Sales Report; Inventory (read); Accounting (view). No
  write actions. **Visibility = self.**
- **Risk:** Low. **Required fix (QA):** confirm screens render no stray edit/action buttons for `viewer`.

### Role-audit summary
| Theme | Finding |
|---|---|
| Critical security risks | None outstanding after the role-isolation fix (the user-visibility leak is closed at the DB). |
| Over-permissions | GM == Admin; Inventory Controller == Warehouse Manager; admin/manager carry latent cross-vertical perms (module-hidden). |
| Missing access | Tenant Admin cannot reach Branches/Users/Permissions/e-Invoice (`superAdminOnly`); Collection Officer has no dedicated Collections screen. |
| Model-correct roles | Merchandiser, Cash Van, Collection Officer, Credit Controller, Van Rep, Supervisor, Area/Regional Manager, Accountant, Auditor, Platform Owner. |

---

## 3. Frontend screen audit

| Screen / module | Who should access | Who can access now | Allowed actions (intended) | Needs fixing |
|---|---|---|---|---|
| **Dashboard** | All signed-in | All | View KPIs scoped to role/branch | QA widgets; admin is branch-scoped (~189 invoices) not company-wide |
| **Customers** | Sales/field/managers/CS | `customers.manage` roles; reps see **own** customers (scoped) | Create/edit, approve (admin), assign rep (scoped) | Working; verify approve-customer flow |
| **Sales (Invoices/POS/Orders/Price Book)** | Sales roles + finance (collect) | `sales.sell`/`sales.collect` roles | Sell (cash/credit per role), collect, price view | Confirm POS/Orders desired for van-sales; cash-van credit hidden |
| **Van Sales (Rep App / Today / Route / Van Stock)** | Field roles (`field.sales`) | Van Rep, Cash Van, Merch, admin/manager | Visit, sell, collect, load/return | Validate on mobile/offline |
| **Visit Plan (Journey)** | Field roles + planners | Field roles; **rep selector now scoped** (self/team/region/all) | Assign customers to **in-scope** reps only | Fixed (DB live); deploy app code |
| **Routes** | Managers/distribution | `reports.view`/`customers.manage` (Distribution module) | View/plan routes, ownership | Verify route-ownership editing |
| **Collections** | Collection Officer, reps, finance | via **Invoices/Settlement** (`sales.collect`) | Record/allocate collections | Add dedicated Collections menu for Collection Officer |
| **Returns / Credit Notes** | Sales/supervisors | `sales.return` roles (Returns module) | Create return, auto credit-note | Working; QA credit-note linkage in UI |
| **Inventory** | Warehouse/managers/field (view) | `inventory.view` roles | View/adjust/count/transfer (warehousing) | Working |
| **Warehouse** | Warehouse roles | `warehouse_keeper`, admin/manager (warehousing module) | Transfers, counts, warehouses, load requests | Split Inventory Controller vs Warehouse Manager (optional) |
| **Reports** | Managers/finance/auditor | `reports.view`/`report.aggregate.view` roles | View dashboards/exports | Validate report outputs vs data |
| **Settings** | Admin/manager (+ super-admin for org) | `settings.*` roles; **Branches/Users/Permissions hidden** (`superAdminOnly`) | Staff, org, regions, van-sales, fields, integrations | Decide tenant-admin org access |
| **User Management** | Company Admin | **`/settings/staff` only** (scoped RPC); `/settings/users` is super-admin only | Activate/deactivate, set password, assign role | Admin can't reach full Users screen — decide |
| **Accounting** | Accountant/finance/admin | `accounting.view`/`post` roles | Chart, vouchers (post), journal, reports, aging | Credit Controller correctly view-only |
| **Purchasing** | Procurement/warehouse/finance | `purchasing.manage`/`suppliers.manage` roles | POs, suppliers, supplier returns | Working |

---

## 4. FMCG / van-sales competitor benchmark

Legend: ●●● strong · ●●○ adequate · ●○○ basic/gap.

| Capability | **VANTORA** | SalesBuzz | Odoo | Zoho Inv/CRM | SAP B1 | NetSuite | Dynamics 365 | Generic van-sales apps |
|---|---|---|---|---|---|---|---|---|
| Role permissions (granular, multi-tenant) | ●●● (fine-grained, company-scoped, RLS) | ●●○ | ●●● | ●●○ | ●●● | ●●● | ●●● | ●○○ |
| Van-sales workflow (load→sell→collect→settle) | ●●● (purpose-built RPCs) | ●●● (specialist) | ●●○ (add-ons) | ●○○ | ●●○ | ●●○ | ●●○ | ●●● |
| Route planning / journey | ●●○ (routes, journey, coverage) | ●●● | ●●○ | ●○○ | ●●○ | ●●○ | ●●○ | ●●● |
| Customer management / approvals | ●●● (approval workflow, GPS, segments) | ●●○ | ●●● | ●●● | ●●● | ●●● | ●●● | ●●○ |
| Inventory & van stock | ●●● (per-van stock, reconciliation) | ●●● | ●●● | ●●● | ●●● | ●●● | ●●● | ●●○ |
| Collections / AR | ●●○ (settle, allocate, aging) | ●●● | ●●● | ●●○ | ●●● | ●●● | ●●● | ●●○ |
| Returns & credit notes | ●●● (linked CN, reasons) | ●●○ | ●●● | ●●○ | ●●● | ●●● | ●●● | ●●○ |
| Dashboards & reports | ●●○ (rich data; QA pending) | ●●○ | ●●● | ●●● | ●●● | ●●● | ●●● | ●○○ |
| Mobile usability (field) | ●○○ (exists, unvalidated) | ●●● | ●●○ | ●●○ | ●●○ | ●●○ | ●●● | ●●● |
| Admin controls / governance | ●●○ (authz console; tenant-admin gaps) | ●●○ | ●●● | ●●○ | ●●● | ●●● | ●●● | ●○○ |
| Multi-tenant SaaS readiness | ●●● (true RLS multi-tenant) | ●●○ | ●●○ | ●●● | ●○○ | ●●● | ●●○ | ●○○ |
| KSA e-invoicing (ZATCA) | ●○○ (screen, unconfigured) | ●●○ | ●●○ | ●●○ | ●●○ | ●●○ | ●●○ | ●○○ |

**Read-out:** VANTORA's **permission model, multi-tenant RLS, and van-sales transaction integrity are
competitive with or ahead of generic apps and on par with the specialists** (SalesBuzz) on the core loop.
Its **clearest gaps vs the field are mobile/offline polish, validated dashboards/reports, route
optimization depth, and KSA e-invoicing** — areas where SalesBuzz (mobile/route) and the tier-1 ERPs
(reporting/compliance) are stronger. As an FMCG-specific SaaS it is **more focused and faster to deploy
than SAP/Oracle/Dynamics** for a van-sales distributor.

---

## 5. Gap analysis

### Critical (block a real pilot)
1. **Deploy the role-isolation app code** to the live deployment (RLS is live; the scoped selectors + write
   guards must ship in the build the distributor uses).
2. **Public, access-controlled deployment** (remove SSO wall / add a pilot domain + Auth Site URL).
3. **Tenant-admin governance decision** — Company Admin cannot reach Branches/Users/Permissions today.
4. **Screen-by-screen UI QA** of write actions per role (confirm no stray buttons; cash-van credit hidden).

### High priority
5. **Differentiate GM from Admin** (privilege separation).
6. **Validate dashboards & reports** against seeded data (numbers must tie out).
7. **Mobile/offline rep app validation** on a device.
8. **Collections workspace** for Collection Officer (dedicated screen).
9. **Admin company-wide visibility** (admin currently branch-scoped on invoices).

### Medium priority
10. Split **Inventory Controller** from Warehouse Manager (role granularity).
11. Trim **latent cross-vertical permissions** from FMCG admin/manager/accountant.
12. **Route planning depth** (sequencing, optimization, adherence).
13. **e-Invoicing (ZATCA)** configuration & validation.
14. Enable/validate **Approvals/Workflow** module if the pilot needs approvals.

### Nice-to-have
15. Targets/incentives dashboards, perfect-store scoring polish.
16. WhatsApp/notification integration, customer portal.
17. Advanced analytics (predictive load, OOS prediction).
18. Localization polish (Arabic RTL across all new screens).

---

## 6. Recommended phased roadmap

**Phase 1 — Fix critical permissions & navigation (1–2 weeks)**
Deploy the role-isolation code; finalize tenant-admin governance (Branches/Users/Permissions decision);
differentiate GM vs Admin; per-role UI QA of actions/buttons; confirm cash-van credit hidden. *Exit: every
role sees and can do exactly what it should, in the deployed build.*

**Phase 2 — Improve FMCG workflows (2–3 weeks)**
Collections workspace; route planning/adherence depth; returns/credit-note UI polish; admin company-wide
visibility; Inventory Controller split. *Exit: the end-to-end distributor workflow is smooth for all field
and back-office roles.*

**Phase 3 — Dashboards & reporting (1–2 weeks)**
Validate and polish dashboards, AR aging, sales/distribution analytics against real data; exports. *Exit:
numbers tie out and managers trust the reports.*

**Phase 4 — Mobile experience (2–3 weeks)**
Device-validate the Rep App, offline sync, GPS check-in, van load/settlement on phones. *Exit: a rep can
run a full day on a phone, offline-tolerant.*

**Phase 5 — Production / pilot readiness (1–2 weeks)**
Public domain + access control, SMTP, backups/PITR, e-invoicing config, monitoring, real-data import, real
user invitations, security/perf advisor pass. *Exit: a real distributor can be onboarded.*

---

## 7. Final recommendation

- **Ready for demo?** **Yes.** On the demo tenant, VANTORA convincingly demonstrates the FMCG van-sales loop,
  refined roles, scoped data, and a populated 90-day dataset — suitable for a guided walkthrough today
  (behind the current access wall, driven by the team).
- **Ready for pilot?** **Not yet — conditional.** The data model, security, and core workflow are pilot-grade,
  but a real distributor needs the Phase-1 critical items first: deployed role-isolation code, a public
  access path, the tenant-admin decision, and a per-role UI QA pass.
- **Must fix before showing a real distributor:** (1) deploy the role-isolation build; (2) public,
  access-controlled URL; (3) per-role action/button QA (no stray writes; cash-van credit hidden);
  (4) tenant-admin governance; (5) dashboards/reports that tie out.
- **Estimated readiness:** **Demo ~85% · FMCG pilot ~70%.** Phases 1–3 (≈4–6 weeks) bring pilot readiness to
  ~90%+; Phases 4–5 reach full production onboarding.

---

### Appendix — what changed in the current hardening cycle (context)
Auth completeness (GoTrue identities/instance_id), Supabase role GRANTs restored, FMCG module gating
enabled, refined FMCG roles + cash/credit guard, a rich 90-day demo dataset, and **strict role-scoped user
visibility (RLS + API + UI)**. These moved the platform from "logs in but empty/over-exposed" to "scoped,
populated, and role-correct" on the demo tenant.
