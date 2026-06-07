# VANTORA — Trade Spend Foundation Architecture (Approved)

**Status:** ✅ **APPROVED & frozen** — architecture only; **no code, no migrations,
no implementation** yet. Implementation planning deferred.
**Goal:** a generic, **FMCG-first-class trade-spend / commercial-investment**
foundation — budgets, customer agreements, listing/visibility fees, promotion
planning → execution, claims, accruals, settlement/deductions and ROI — built as a
**layer over the approved Finance + Sales engines**, not a new ledger or pricing
engine.
**Discipline:** *reuse over rebuild; formalize what exists first; document gaps
separately; additive; flag-gated; multi-tenant + permission model preserved.*

> **Mostly greenfield, but reuse-first.** No promo/budget/claim/accrual/agreement
> tables exist yet (confirmed). **Reusable adjacents on `main`:** line-level
> `discount_amount`/`discount_pct` (promo **execution** at order/invoice),
> `erp_cost_centers` (budget dimension), the **approved Finance Foundation**
> (journal/posting-rules/accruals/budgeting, which already names trade-spend
> accrual+settlement), the **approved Sales Foundation** (promotions & customer
> agreements were flagged there as gaps — **Trade Spend owns them here**), the
> **Workflow Platform** (the Trade-Spend approval was modeled earlier), and
> **Search OS**. Trade Spend introduces its own domain tables but reuses every
> engine.

Trade Spend is the **commercial-investment domain** that ties Sales (what we give
at the point of sale) to Finance (budget → accrual → settlement) with controls.

---

## A. Capability-by-capability (mostly GAP; reuse where noted)

1. **Trade Spend Budget — GAP (on Finance).** `trade_budgets` by customer/channel/
   category/brand × **fiscal period** × **cost center**, with committed/accrued/
   actual tracking. Sits on the **Finance Budgeting** module (COA × cost center ×
   period) — budget availability checks gate planning (§5) and approvals (§11).
2. **Customer Agreements — GAP (Sales §13 owner).** `customer_agreements` (annual
   deal: rebate tiers, targets/volumes, payment terms, validity) → drive accruals
   and settlement; per account (CRM/Sales customer). Approval + versioned terms.
3. **Listing Fees — GAP.** `listing_fees` (pay-to-list a SKU at an account/channel:
   amount, period, SKUs) — a committed spend with an accrual schedule; settled via
   deduction/credit/payment.
4. **Visibility Contracts — GAP.** `visibility_contracts` (shelf/display/POSM/
   planogram payments to an outlet: deliverables, period, amount, proof) — execution
   verified via **field visits + surveys/photos** (Sales/CRM), then accrued/settled.
5. **Promotion Planning — GAP.** `promotions` (mechanic: off-invoice discount / BOGO
   / bundle / free-goods / scan rebate / temporary price reduction; conditions;
   period; **budget link**; target segment/channel). Planning checks budget (§1) and
   routes for approval (§11). Calendarized (promo calendar).
6. **Promotion Execution — PARTIAL → reuse.** Executes at the **point of sale**
   through the Sales price-resolution rule: off-invoice → line `discount_amount/pct`
   (exists); free goods → an **Inventory issue** (zero-price line); rebates →
   accrued (§8). One pricing path; promotions are inputs to it, not a parallel engine.
7. **Claims Management — GAP.** `trade_claims` (a deduction/claim against a
   promotion/agreement: source — customer rebate, or distributor-claims-to-principal
   — amount, evidence, status submitted→validated→approved→settled/rejected).
   Validation matches claim ↔ promo/agreement ↔ actual sales (three-way).
8. **Accruals — GAP (on Finance posting rules).** As spend is committed/earned,
   **accrue a liability**: `Dr trade-spend expense (or contra-revenue) / Cr accrued
   trade-spend`, by cost center/customer. Accrual schedules for agreements/listing/
   visibility; rebate accrual as qualifying sales occur. Reverses on settlement.
9. **Settlement & Deductions — GAP.** Settle a claim/accrual via **credit note (AR
   deduction)**, **off-invoice deduction**, or **payment**: `Dr accrued trade-spend /
   Cr AR or Bank`. Deduction management reconciles customer short-payments against
   open claims. All via Finance posting rules.
10. **ROI Measurement — GAP (analytics).** Per promotion/customer/category: spend vs
   **incremental** volume/revenue/margin (baseline vs promo period), uplift and ROI;
   computed over Sales events + spend records. Feeds the next planning cycle.

## B. Controls & integrations

11. **Trade Spend Approval Workflow — reuse Workflow Platform.** Budget allocation,
   promotion plan, agreement, listing/visibility contract, and **claim/settlement**
   approvals — each a **workflow definition** (Builder/Canvas), by amount/tier, with
   **budget-availability gate**, maker-checker, SLA/escalation. (This is the
   trade-spend workflow modeled earlier.) External claim portals via the **egress
   allow-list**.
12. **Finance Integration.** The core reuse: **budget** (Finance budgeting on COA ×
   cost center × period), **accrual** and **settlement/deduction** posting via the
   Finance posting-rule engine + tax handling; trade spend as **expense or
   contra-revenue** per policy. `reference_type/id` links promo/claim ↔ journal.
13. **Sales Integration.** Promotions **execute** through the Sales price-resolution
   rule (discounts/free-goods/rebates); agreements/listing/visibility attach to the
   customer; rebate accrual driven by `invoice.issued` events; deductions reconcile
   against AR. Promo calendar visible in order capture / van sales.
14. **Purchasing Integration.** Distributor-model **claims back to the principal/
   supplier** (co-op funds): claim → supplier credit/AP deduction (Purchasing/AP);
   supplier-funded promotions tracked against received support. Symmetric to customer
   trade spend.
15. **Search OS Integration.** Providers for promotions, agreements, listing/
   visibility contracts, and claims (find by code/customer/period); deep-link to the
   record.
16. **Multi-company support.** RLS-first scoping (budget/promo/agreement/claim →
   company) via platform primitives. Per-company budgets, promo mechanics, approval
   thresholds, claim policies, and number sequences; branch/channel/territory
   targeting.

---

## C. Gap register (documented separately)

| Capability | State | Gap to add |
|---|---|---|
| Trade Spend Budget | **Missing** | `trade_budgets` (customer/channel/category × period × cost center) on Finance budgeting |
| Customer Agreements | **Missing** | `customer_agreements` (rebate tiers, targets, terms) — Sales §13 owner |
| Listing Fees | **Missing** | `listing_fees` (SKU listing payments + accrual schedule) |
| Visibility Contracts | **Missing** | `visibility_contracts` (shelf/display, deliverables, proof) |
| Promotion Planning | **Missing** | `promotions` (mechanics, period, budget link, target) + calendar |
| Promotion Execution | **Partial** | reuse Sales price-resolution + line discounts + free-goods issue (no new pricing engine) |
| Claims Management | **Missing** | `trade_claims` + three-way validation (claim↔promo/agreement↔sales) |
| Accruals | **Missing** | accrual schedules + Finance posting rules (Dr expense/Cr accrued) |
| Settlement & Deductions | **Missing** | credit-note/deduction/payment settlement + deduction reconciliation |
| ROI Measurement | **Missing** | spend-vs-incremental analytics (baseline vs promo) |

**Reused (not rebuilt):** Finance (journal/posting-rules/accruals/budgeting/tax),
Sales (price-resolution, discounts, free-goods, agreements hook, AR), Purchasing/AP
(supplier claims), Workflow (approvals + tick), Search OS, cost centers, line
discounts.

---

## Design principles

Trade Spend is a **layer, not an engine**: budget/accrual/settlement = Finance;
execution = Sales pricing; approvals = Workflow; discovery = Search. Spend lifecycle
(plan → commit/accrue → execute → claim → validate → settle/deduct → measure ROI)
links promo/agreement records to journals via `reference_type/id`. Additive +
flag-gated; RLS-first multi-tenancy; FMCG mechanics first-class. No parallel ledger;
no parallel pricing engine.

---

## Open questions for review

1. **Expense vs contra-revenue** treatment for off-invoice/on-invoice spend (policy
   per spend type) — confirm default.
2. **Customer agreements ownership:** define here (trade-spend) vs. shared with Sales
   §13 — recommend defining the table here, referenced by Sales.
3. **Promotion mechanics in V1:** off-invoice discount + free goods first, then
   rebates/scan/bundles?
4. **Claims model:** customer rebates + supplier co-op claims both in V1, or customer
   first?
5. **Deduction management depth:** auto-match short-payments to claims now or later?
6. **First consumer flow:** plan promo (budget check) → execute discount at sale →
   accrue → claim → settle via credit note → ROI — end-to-end across Sales + Finance.

*Architecture **APPROVED & frozen** — no code, migrations, implementation, or
branches. Implementation planning deferred until requested.*
