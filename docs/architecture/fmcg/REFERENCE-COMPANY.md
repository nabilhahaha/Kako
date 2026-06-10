# VANTORA — Enterprise Reference Company

**Nile FMCG Distribution Group** is the permanent VANTORA reference tenant for
demonstrations, testing, onboarding, training, pilot preparation, and regression
validation. It is provisioned from two idempotent, executable SQL artifacts that
run against the **real schema and the real RPCs** — nothing is mocked:

| Artifact | Purpose |
|---|---|
| `supabase/pilot/reference-company.sql` | Org structure, users, master data, opening stock, purchase + transfer activity. Idempotent on company name. |
| `supabase/pilot/reference-activity-and-validate.sql` | Sample transactional activity (sell/collect/return/reconcile) as the real users **plus** the full role-by-role permission validation. Re-runnable. |

> **Scope & guardrails:** demo/test data only, on a dedicated demo/staging
> project (`KAKO_VAN_SALES=1`). Additive and non-destructive — no schema change,
> no RLS/permission weakening. Provisioning runs as one transaction; a failure
> rolls the whole tenant back.

This document is the reference's six deliverables: **(1)** organization chart,
**(2)** role matrix, **(3)** permission matrix, **(4)** master-data summary,
**(5)** workflow-coverage matrix, **(6)** end-to-end validation report.

---

## 0. How the org model maps to the platform

The platform's authority is **role-based**, not department-based. A user's
enforced permissions come from their **`erp_user_branches.role`** (one of 21
system roles), resolved by `erp_user_has_permission()` against
`erp_role_permissions` (and per-company overrides) — this is the same authority
the RPCs enforce. **Departments, teams, and job titles** (`erp_departments`,
`erp_teams`, `erp_job_titles`) are real first-class entities and carry the
**organizational** structure (titles, reporting, who manages what), but they do
**not** grant permissions.

So each requested user is mapped to the **closest enforced role**, and its exact
**title + department** is captured organizationally. Where two titles share a
role (Finance Manager / Accountant; Warehouse Manager / Keeper / Inventory
Controller), they are distinguished by **department + job title + being the
department's `manager_id`**, not by a different permission set. Genuine role gaps
are recorded in [§7 Findings](#7-findings--gaps).

---

## 1. Organization chart

```
                          ┌─────────────────────────────┐
                          │  Platform Owner (vendor)     │   is_platform_owner = true
                          │  owner@nile-group.test       │   cross-tenant · all permissions
                          └──────────────┬──────────────┘
                                         │  (platform identity, not a company role)
        ┌────────────────────────────────────────────────────────────────────┐
        │              Nile FMCG Distribution Group  (EGP · EG)                │
        │            Branches: Cairo HQ · Alexandria · Giza                    │
        └────────────────────────────────────────────────────────────────────┘
                                         │
                       ┌─────────────────┴─────────────────┐
                       │  CEO  (admin)  — Company Management │
                       └─────────────────┬─────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │     General Manager (manager) — Operations     │
                 └───────────────────────┬───────────────────────┘
        ┌───────────────┬────────────────┼────────────────┬────────────────┬────────────────┐
        │               │                │                │                │                │
  Finance &        Procurement         Sales          Warehousing     Inventory      Customer Service
  Accounting                                                          Control
   ─────────        ───────────       ───────         ───────────     ─────────      ────────────────
  Finance Mgr      Procurement Mgr   Sales Manager    Warehouse Mgr   Inventory      CS Agent
   (accountant)     (branch_manager)  (regional_mgr)   (warehouse_     Controller     (cashier)
  Accountant       Buyer              Supervisor        keeper)        (warehouse_
   (accountant)     (warehouse_        (supervisor)    Warehouse        keeper)
                     keeper)           Salesman¹        Keeper
                                       (salesman)       (warehouse_     Merchandising   Reporting &
                                      Van Sales Rep      keeper)        ─────────────   Analytics
                                       (salesman)                       Merchandiser    ───────────
                                                       Van Sales²       (salesman)      Read-Only Exec
                                                                                        (viewer)
```
¹ Salesman operates the **Alexandria** branch + van `VAN-ALX-01`.
² **Van Sales** department is led by the Supervisor; the Van Sales Rep operates **Cairo** van `VAN-CAI-01`.

**12 departments** (each with an Arabic name + a manager): Platform Owner ·
Company Management · Finance & Accounting · Procurement · Sales · Van Sales ·
Warehousing · Inventory Control · Customer Service · Operations · Merchandising ·
Reporting & Analytics.

---

## 2. Role matrix

17 identities (1 platform owner + 16 company users). "Branch(es)" lists every
`erp_user_branches` membership; the **default** branch is shown first.

| # | User (email) | Department | Job title | Enforced role | Branch(es) |
|---|---|---|---|---|---|
| — | owner@nile-group.test | Platform Owner | Platform Owner | *(platform owner flag — no branch role)* | cross-tenant |
| 1 | ceo@nile-group.test | Company Management | Chief Executive Officer | `admin` | CAI*, ALX, GIZ |
| 2 | gm@nile-group.test | Operations | General Manager | `manager` | CAI |
| 3 | finance.manager@nile-group.test | Finance & Accounting | Finance Manager | `accountant` | CAI |
| 4 | accountant@nile-group.test | Finance & Accounting | Accountant | `accountant` | CAI |
| 5 | procurement.manager@nile-group.test | Procurement | Procurement Manager | `branch_manager` | CAI |
| 6 | buyer@nile-group.test | Procurement | Buyer | `warehouse_keeper` | CAI |
| 7 | sales.manager@nile-group.test | Sales | Sales Manager | `regional_manager` | CAI*, ALX |
| 8 | supervisor@nile-group.test | Van Sales | Field Supervisor | `supervisor` | CAI*, ALX |
| 9 | salesman@nile-group.test | Sales | Salesman | `salesman` | ALX |
| 10 | van.rep@nile-group.test | Van Sales | Van Sales Rep | `salesman` | CAI |
| 11 | warehouse.manager@nile-group.test | Warehousing | Warehouse Manager | `warehouse_keeper` | CAI |
| 12 | warehouse.keeper@nile-group.test | Warehousing | Warehouse Keeper | `warehouse_keeper` | CAI |
| 13 | inventory.controller@nile-group.test | Inventory Control | Inventory Controller | `warehouse_keeper` | CAI |
| 14 | merchandiser@nile-group.test | Merchandising | Merchandiser | `salesman` | CAI |
| 15 | cs.agent@nile-group.test | Customer Service | Customer Service Agent | `cashier` | CAI |
| 16 | readonly.exec@nile-group.test | Reporting & Analytics | Read-Only Executive | `viewer` | CAI |

`*` = default branch. Van reps each have an **assigned van** (`assigned_to`):
Van Sales Rep → `VAN-CAI-01`, Salesman → `VAN-ALX-01`.

---

## 3. Permission matrix

Enforced grants per role, read directly from `erp_role_permissions` (the DB
authority `erp_user_has_permission()` uses). `✓` = allowed, blank = blocked.
Every cell below was **asserted live** in §6 (109 assertions, allowed + blocked).
The Platform Owner short-circuits to **all permissions** for any company.

| Permission | admin | manager | accountant | branch_mgr | warehouse_keeper | regional_mgr | supervisor | salesman | cashier | viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| sales.sell | ✓ | ✓ |  | ✓ |  | ✓ | ✓ | ✓ | ✓ |  |
| sales.collect | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ |  |
| sales.return | ✓ | ✓ |  | ✓ |  | ✓ | ✓ |  |  |  |
| field.sales | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |
| day.close | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |
| reconciliation.view | ✓ | ✓ |  | ✓ | ✓ |  | ✓ | ✓ |  |  |
| reconciliation.manage | ✓ | ✓ |  | ✓ | ✓ |  | ✓ |  |  |  |
| purchasing.manage | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| suppliers.manage | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| accounting.post | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| accounting.view | ✓ | ✓ | ✓ |  |  |  |  |  |  | ✓ |
| reports.view | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  | ✓ |
| inventory.view | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| inventory.adjust | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| customers.manage | ✓ | ✓ |  | ✓ |  | ✓ | ✓ | ✓ | ✓ |  |
| customers.approve | ✓ | ✓ |  |  |  |  |  |  |  |  |
| settings.users | ✓ | ✓ |  |  |  |  |  |  |  |  |

**Reading the FMCG loop from this matrix:**
- **Selling/collecting/returning in the field** = the van rep (`salesman`) via
  `field.sales` + an assigned van. (Note `salesman` lacks the *generic*
  `sales.return` permission, but `erp_van_return` is gated on the van/field
  context, not that key — verified in §6.)
- **Reconciliation is managed** by supervisor / warehouse-keeper / branch-manager,
  **never** the rep (rep is view-only) — the platform's intended separation.
- **Approving customers** and **managing users** are admin/manager only.
- **Posting to the ledger** is accountant/manager/admin only.

---

## 4. Master-data summary

| Entity | Count | Detail |
|---|--:|---|
| Branches | 3 | Cairo HQ (HQ) · Alexandria · Giza |
| Warehouses | 5 | 3 main (`WH-CAI/ALX/GIZ`) + 2 vans (`VAN-CAI-01`, `VAN-ALX-01`) |
| Departments | 12 | each with Arabic name + manager |
| Job titles | 17 | one per identity |
| Categories | 5 | Beverages · Snacks · Dairy · Personal Care · Home Care |
| Brands | 10 | NileCola, Oasis, Sunrise, CrispMax, GoldBar, NuttyMix, DairyPure, FreshUp, SmileBright, SparkleClean/HomeShield *(product attribute — see §7)* |
| Products (SKUs) | 18 | priced (cost + sell), taxed (14% VAT / 0% exempt for water & dairy), packs, barcodes, expiry |
| Suppliers | 5 | with payment terms (15–60 days) |
| Price lists | 2 | Standard Retail (default) + Wholesale (−8%) · **36** price-list items |
| Price rules | 2 | customer-scoped 10% promo (CUST-001 / Nile Cola) + global 5% volume deal (NuttyMix) |
| Routes | 3 | Cairo Route A/B + Alex Route A (rep + van + working days) |
| Customers | 24 | credit limits (3k–13k), payment terms (0/15/30), GPS, route, salesman; **2 left pending approval** |
| Return reasons | 5 | damaged · expired · wrong item · customer rejection · overstock |
| Taxes | — | modeled as product `tax_rate` (no dedicated table — see §7) |

**Opening stock:** every main warehouse loaded **1,000 / SKU**; each van **200 /
SKU**, ready to sell.

---

## 5. Workflow-coverage matrix

Every requested workflow is exercised by the reference tenant against the real
RPCs. "Evidence" is the artifact/RPC that produces it.

| Workflow | Covered | RPC / mechanism | Evidence in tenant |
|---|:--:|---|---|
| Purchase order | ✓ | `erp_purchase_orders` (+lines) | 2 POs (1 received, 1 open) |
| Goods receipt → stock in | ✓ | `erp_receive_purchase_order` | main stock +, supplier balance 6,840 |
| Inventory movement (transfer) | ✓ | `erp_complete_transfer` | 1 main→van transfer; 13 stock movements |
| Opening balances | ✓ | direct stock load | 1,000/SKU main · 200/SKU van |
| Sales invoice (van) | ✓ | `erp_van_sell` (server-priced) | 3 invoices across 2 branches |
| Server-side pricing / promo | ✓ | `erp_resolve_price` + price rules | CUST-001 10% promo applied on invoice |
| Collection (AR) | ✓ | `erp_settle_collection` | 1 collection, oldest-first allocation |
| Return | ✓ | `erp_van_return` | 1 return (stock back to van) |
| Credit note | ✓ | `erp_van_return` (create CN) | `CN-RET-CAI-000001` linked to return + invoice |
| Day-end reconciliation | ✓ | `erp_compute_van_reconciliation` | variance 0 (run by warehouse keeper) |
| Visit / GPS check-in | ✓ | `erp_check_in_visit` | visits logged per session |
| Day close (coverage) | ✓ | `erp_close_day` | Cairo day closed, 100% coverage |
| Reporting data | ✓ | the above transactions | invoices, collections, returns, AR, stock |
| Numbering | ✓ | `erp_next_number` | INV/COL/RET/PO/TR sequences per branch |

---

## 6. End-to-end validation report

Executed on a freshly bootstrapped database (full migration chain) by running
the two artifacts in order. **All checks passed.**

### 6.1 Transactional activity (run as the real users)
| Step | Actor (role) | Result |
|---|---|---|
| Open day + check-in | Van Sales Rep (`salesman`) | session open; visit logged |
| Sell (BEV-001 ×10 + SNK-001 ×6) | Van Sales Rep | `INV-CAI-000001`, **net 1,456.92** (10% promo applied) |
| Collect 60% | Van Sales Rep | `COL-CAI-000001`, applied **874.15**, unapplied 0.00 |
| Return (SNK-001 ×2) + credit note | Van Sales Rep | `RET-CAI-000001`, total **156.00**, `CN-RET-CAI-000001` |
| 2nd sale (BEV-002 ×8) | Van Sales Rep | `INV-CAI-000002` (CUST-002) |
| Alex sale (DAI-001 ×5) | Salesman (`salesman`) | `INV-ALX-000001` (CUST-017) |
| Reconcile | Warehouse Keeper (`warehouse_keeper`) | **variance 0.00** |
| Close day | Van Sales Rep | **closed**, coverage 100% |

**Invariants verified:** numbering regex per branch ✓ · collection allocation →
invoice ✓ · credit-note linkage (return + invoice + `CN-…`) ✓ · **CUST-001
balance 426.77** (= 1,456.92 − 874.15 − 156.00) ✓ · **van SNK-001 = 246**
(= 250 − 6 + 2) ✓ · reconciliation variance 0 ✓.

### 6.2 Role validation — accessible / hidden screens, allowed / blocked actions

Permissions drive **both** the RPC enforcement (DB) **and** the app's nav/page
visibility (`hasPermission`). Validating the permission set therefore validates
accessible vs hidden screens *and* allowed vs blocked actions together. **109
assertions** (allowed **and** blocked, per identity) passed. Representative:

| Role | Allowed (sample) — screens & actions | Blocked (sample) — hidden & denied |
|---|---|---|
| Platform Owner | everything, every tenant | — |
| CEO (`admin`) | sell, purchasing, accounting post, approve customers, manage users, reconcile | — |
| GM (`manager`) | sell, purchasing, accounting, approve customers, manage users, field | — |
| Finance Mgr / Accountant | **accounting post/view**, suppliers, collect, reports | **sell**, **purchasing**, **approve customers**, field |
| Procurement Mgr (`branch_manager`) | **purchasing**, suppliers, inventory adjust, reconcile, reports | accounting post, approve customers |
| Buyer (`warehouse_keeper`) | **purchasing**, inventory adjust, reconcile | suppliers master, sell, reports, accounting |
| Sales Mgr (`regional_manager`) | sell, collect, returns, reports | reconcile-manage, purchasing, accounting, field |
| Supervisor | sell, **reconcile-manage**, reports | purchasing, accounting, field, approve customers |
| Salesman / Van Rep | **field sell/collect**, day close, reconcile-**view** | reconcile-**manage**, purchasing, reports, accounting |
| Warehouse Mgr/Keeper/Inv Ctl | inventory view/adjust, **reconcile-manage**, purchasing | sell, accounting, reports |
| Merchandiser (`salesman`) | field, sell, manage customers | reconcile-manage, purchasing, accounting |
| Customer Service (`cashier`) | sell, collect, manage customers | reports, reconcile, approve customers, accounting |
| Read-Only Exec (`viewer`) | **reports, accounting view, inventory view** | sell, collect, purchasing, approve, reconcile |

### 6.3 Platform health at validation time
Typecheck clean · **1,280 unit + 176 integration** tests green · build green
(unchanged by this tenant — it is data + docs only).

---

## 7. Findings & gaps

Discovered during provisioning + validation. **Low-risk items were fixed inline;
higher-risk items (platform changes) are documented, not made.**

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | **No `erp_brands` table** — brand is a free-text product attribute. | Low | **Documented.** Brands modeled on `products.brand`; sufficient for reporting/filtering. A brand master is a future enhancement. |
| 2 | **No `erp_taxes` table** — tax is a product `tax_rate` %. | Low | **Documented.** 14% VAT / 0% exempt modeled per SKU; matches how invoices compute tax today. |
| 3 | **No `erp_payment_terms` table** — terms are `payment_terms_days` on customers/suppliers. | Low | **Documented.** Net 0/15/30 modeled via the day columns; drives invoice `due_date`. |
| 4 | **No dedicated Merchandiser role** — merchandising perms (`assortment.manage`, `survey.manage`) sit on `sales_director`/`national_sales_manager`, not a field role. | Medium | **Documented.** Mapped Merchandiser → `salesman` (field access). A purpose-built merchandiser role is a permission-model change (higher-risk) — recommend as a follow-up. |
| 5 | **No dedicated Customer-Service role** — `cashier` is the closest (sell + collect + manage customers). A pure CS agent arguably shouldn't sell. | Medium | **Documented.** Acceptable approximation for the reference; a CS role is a follow-up permission-model change. |
| 6 | **Procurement** has no standalone role; **branch_manager** carries purchasing + supplier authority and **warehouse_keeper** carries purchasing (no supplier master). | Low | **Resolved by mapping** — Procurement Mgr → `branch_manager`, Buyer → `warehouse_keeper`. Realistic separation (buyer raises POs, manager owns suppliers). |
| 7 | Two titles per role for Finance and Warehousing. | Low | **Resolved organizationally** — distinguished by department + job title + `manager_id`, not permissions. |

No security, RLS, or breaking changes were required or made. All gaps are
additive enhancements; none blocks using this tenant as the reference.

---

## 8. Using the reference company

```bash
# On a dedicated demo/staging project (KAKO_VAN_SALES=1):
psql "$DATABASE_URL" -f supabase/pilot/reference-company.sql
psql "$DATABASE_URL" -f supabase/pilot/reference-activity-and-validate.sql
```

- **Idempotent**: `reference-company.sql` no-ops if the company exists;
  `reference-activity-and-validate.sql` skips activity it already generated and
  always re-runs the role validation — making it a **regression check** you can
  run any time.
- **Login**: users are seeded in `auth.users` (emails above). For a production
  pilot, invite users via Settings → Users instead and drop the `auth.users`
  block.
- **Teardown** (demo/staging only): delete the company — cascades remove its
  branches, warehouses, products, customers, and activity. **Never** on production.
