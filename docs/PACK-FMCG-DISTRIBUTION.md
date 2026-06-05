# VANTORA FMCG Distribution Enterprise Pack — Architecture & Design

**Status:** Design / implementation-review (no code yet).
**Positioning:** A **distribution-first** FMCG platform (Route-to-Market / Distributor
Management System), not a generic ERP — delivered as a **first-class industry pack** on VANTORA.
**Dual operating model:** supports both **Direct Store Delivery (DSD)** (Company → Customer) and
the **Distributor model** (Principal → Distributor → Customer), and hybrids — across **multiple
brands, principals, and distributors by region**, for all field-force types (distributor sales
force, company sales force, van sales, merchandisers, **Key Accounts**). See **Part II**.
**Target market:** Saudi Arabia distribution operations (Arabic-first, VAT 15%, ZATCA e-invoicing,
Commercial Registration, National Address).
**Best-practice alignment:** Nestlé, PepsiCo, Coca-Cola, Mondelez, Unilever, P&G — RTM models,
Permanent Journey Plans (PJP), Perfect Store / RED (Right Execution Daily) / Picture of Success,
Trade Promotion Management (TPM), Numeric & Weighted Distribution.

**Builds on (reuse):** the `distribution` + `field_ops` modules; FMCG sales-hierarchy roles;
`erp_customers` (hierarchy + master flags + approval); routes/visits/journey-compliance; MSL,
Perfect-Store, OOS, Outlet-Grading dashboards; van warehouses (`is_van`), stock requests/transfers,
day-close & settlements; Dynamic Field Governance (DFG) + customer change/approval slices.
**Conforms to VANTORA standards:** five-layer entitlement chain (Plan → Company module → Role
permission → UI visibility → Route/API guard), company-scoped RLS, audit on every sensitive
mutation, plan-gated capabilities, platform role hierarchy + scope.

> Diagrams in `docs/diagrams/fmcg/`; companion Word doc:
> `VANTORA_FMCG_Distribution_Pack_Design.docx`.

---

## 0. Scope, reuse, and what's new
Delivered as the plan-gated `distribution` module (+ `field_ops` for the mobile field app) over
shared `sales`, `inventory`, `accounting`, `pricing`, `crm`, `analytics`, `workflow`.

| Capability | In VANTORA today | This pack adds |
|---|---|---|
| Customer master, hierarchy, approval, DFG | yes | channel/sub-channel, classification, GPS, payment terms, visit frequency, **Customer Data Governance** change-requests |
| Routes, regions/areas, scoped roles | partial | route master + territory + PJP + beat + **route riding/accompaniment** |
| Visits, GPS, day-close, settlement | yes | GPS validation rules, structured outcomes, **Perfect Store** capture |
| Van sales | partial (van warehouse/stock) | load sheet, van inventory ledger, mobile sell/return/collect, reconciled day-close, near/old expiry |
| Merchandising / MSL / Perfect-Store / OOS | dashboards | execution capture: audits, OSA, SOS, planogram, competitor, photos |
| Trade marketing | — | **new**: trade spend, listing fees, displays, promotions, claims, ROI/ROTS, activity calendar |
| Distribution KPIs | partial | full set: ND, WD, coverage, productivity, strike rate, SKU/outlet, avg invoice, Perfect-Store score |
| Near/old expiry & returns | partial (returns/RMA) | **new** near-expiry + expired workflows, claims, warehouse processing |
| Mobile-first field apps | web responsive | **role-specific, field-optimized, offline-capable** salesman/supervisor/merchandiser apps |
| Saudi localization | bilingual + ETA (Egypt) | **KSA**: VAT 15%, ZATCA/Fatoora, CR, VAT no., National Address |

---

## Part II — Enterprise Route-to-Market (RTM): Distributor Model & DSD

A **dual-model RTM platform**: the same tenant can run **DSD**, the **Distributor (indirect)
model**, or a **Hybrid**, across **multiple brands, principals, and distributors**. It supports
every field-force type: distributor sales force, company sales force, van sales, merchandisers,
and **Key Account** teams. See `docs/diagrams/fmcg/fmcg_rtm.png`.

### II.1 Operating modes & per-region go-to-market
**Company mode** (its role in the value chain):
- **Manufacturer / Brand-Owner Mode** — owns brands (is a principal); goes to market directly (DSD)
  and/or via distributors.
- **Distributor Mode** — represents principals' brands; sells to outlets (its own DSD to retail).
- **Hybrid Mode** — both (owns some brands and distributes others).

**Per-region / per-country go-to-market** is set independently, so **the same company can run direct
sales in one region and distributor sales in another** (the defining enterprise requirement):

| GTM (per region) | Chain | Sell-in (primary) | Sell-out (secondary) | Example |
|---|---|---|---|---|
| **Direct (DSD)** | Company → Outlet | — (direct) | Company → Outlet (the sale) | Riyadh: own van/sales force; Key Accounts |
| **Distributor** | Principal → Distributor → Outlet | Principal → Distributor | Distributor → Outlet | Eastern Province: appointed distributor |
| **Hybrid** | both | both | both | Modern Trade direct + Traditional Trade via distributor |

`erp_fmcg_operating_modes` (company mode) + a GTM mode on each
`erp_fmcg_distributor_territories` / region row → the operating model resolves per region/country.

### II.2 Principals, Brands & Products (multi-brand / multi-principal)
- **Principal** (`erp_fmcg_principals`): a brand owner. The tenant may **own** brands (acts as a
  principal) and/or **represent** principals (acts as a distributor carrying others' brands) →
  **multi-principal**.
- **Brand** (`erp_fmcg_brands`): belongs to a principal; products map brand → principal.
  **Multi-brand**: one company sells many brands.
- Products gain `brand_id` / `principal_id` → all sales, targets, trade spend, and KPIs slice by
  **brand & principal**.

### II.3 Distributors & Territories (multiple distributors by region)
- **Distributor** (`erp_fmcg_distributors`): a partner the principal sells through — contract,
  credit terms, assigned **territories/regions/channels**, price list, and (optionally) a linked
  VANTORA tenant. **Multiple distributors by region**: each territory maps to a primary (± secondary)
  distributor per brand/channel; exclusivity rules supported.
- `erp_fmcg_distributor_territories` (distributor, region/area/territory, channel, brand, exclusive?).

### II.4 Distributor Management
Onboarding, contracts (period, terms, exclusivity), price lists, credit limits, performance
scorecards (sell-in, sell-out, coverage, ND/WD, target achievement, claim/rebate status), and
status (active/suspended). Audited.

### II.5 Sell-in vs Sell-out & Secondary Sales (core measurement model)
- **Sell-in (primary):** Principal → Distributor (orders/invoices) — depletion into the channel;
  basis for distributor targets, rebates, and trade-spend funding.
- **Sell-out / secondary:** Distributor → Outlet — the **true market demand**; basis for ND/WD,
  coverage, availability, SOS, Perfect-Store.
- **Stock-in-trade / channel inventory** = Σ sell-in − Σ sell-out per distributor/SKU → prevents
  channel loading; feeds demand forecasting.
- **Secondary-sales capture** — three options: (a) the distributor runs the **same FMCG pack** (its
  own field/van force) — its secondary sales are its own transactions; (b) **secondary-sales
  ingestion** — the distributor uploads/integrates daily sell-out + stock + outlet data, imported by
  the principal under a governed data-share; (c) the principal's own **merchandisers** capture
  availability/SOS/competitor at outlets without owning the transaction.
- Tables: `erp_fmcg_secondary_sales`, `erp_fmcg_channel_stock`.

### II.6 Distributor Targets
Primary (sell-in) and secondary (sell-out) targets per **distributor × brand × SKU/category ×
period**, cascaded from principal national/regional plans; achievement tracked and rolled up.
`erp_fmcg_distributor_targets`.

### II.7 Distributor Rebate Programs
Scheme types: **volume, value, growth, mix/range, slab, display/listing-linked**. Defined per
distributor or distributor-group/brand; accrued on qualifying **sell-in** (or sell-out) with
thresholds/periods; **approval** + settlement via **credit note** (accounting); fully audited.
`erp_fmcg_rebate_schemes`, `erp_fmcg_rebate_accruals`, `erp_fmcg_rebate_settlements`.

### II.8 Trade Spend Allocation by Distributor
Trade budgets and spend (promotions, displays, listing fees, rebates) are **allocated and tracked
per distributor** (and per brand/channel/principal), commitments vs actuals, with **ROI/ROTS by
distributor**. Adds a distributor dimension to `erp_fmcg_trade_budgets`/`_trade_spend`.

### II.9 Coverage / ND / WD / Availability / SOS across distributors
All KPIs (§7) are computed at the **outlet (secondary) level** and rolled up by
**distributor → territory → channel → brand → principal → national**, so a multi-brand principal
sees total market coverage and per-distributor performance side by side, with sell-in vs sell-out
reconciliation.

### II.10 Key Account Management (KAM)
Modern-Trade / national chains are managed **directly** (DSD-style) even when Traditional Trade runs
through distributors: account hierarchy (banner → chain → store), Joint Business Plans (JBP),
listing fees, planograms, central vs store-level ordering, and dedicated Key Account teams.

### II.11 Multi-tenant linkage (principal ↔ distributor) & isolation
Two governance-clean patterns:
- **Single-tenant:** one company runs DSD and/or models its distributors as partner entities +
  ingested secondary data — all rows are that tenant's, scoped by `company_id` (standard RLS).
- **Connected tenants (enterprise):** principal and distributor are **separate VANTORA tenants**
  linked by a **consented, scoped data-share** over the integrations/sync layer — the distributor
  **exports** agreed datasets (secondary sales, stock, coverage) that the principal **imports**.
  **No cross-tenant RLS is opened**; data flows through an audited, agreement-bound pipe, preserving
  full tenant isolation (mirrors how principal/DMS portals integrate at Nestlé/Unilever/P&G scale).

### II.12 Distributor Inventory, Coverage, Targets, Scorecards & Profitability
- **Distributor inventory:** stock-on-hand per distributor/warehouse/SKU (from secondary capture or
  ingestion) → days-of-cover, out-of-stock at distributor, stock-in-trade (`erp_fmcg_distributor_inventory`).
- **Distributor coverage:** outlets covered ÷ universe in the distributor's territory; productive coverage.
- **Distributor targets:** sell-in & sell-out targets vs achievement (II.6).
- **Distributor scorecard** (`erp_fmcg_distributor_scorecards`): a periodic composite — sell-in vs
  sell-out, coverage, ND/WD, target %, fill-rate/OTIF, claim & rebate status, Perfect-Store, receivables
  ageing → a ranked league table across distributors.
- **Distributor profitability:** gross-to-net per distributor — revenue (sell-in) − COGS − trade spend
  (promos/displays/listing) − rebates − logistics → margin & ROI by distributor/brand/region.

### II.13 Strategic Planning — JBP, Agreements, Budgets, Growth & Market Share
- **Annual Joint Business Plans (JBP):** per distributor / key account — volume & value targets,
  growth ambitions, trade-spend envelope, activity calendar, and agreed KPIs; reviewed quarterly
  (`erp_fmcg_jbp`, `erp_fmcg_jbp_lines`).
- **Distributor agreements:** contract terms, exclusivity, margins, payment terms, SLAs, period
  (`erp_fmcg_distributor_agreements`).
- **Trade-spend budgets:** annual budget by brand/channel/distributor/region, phased to the activity
  calendar; commitments vs actuals; ROI/ROTS (extends §5 / II.8).
- **Growth targets:** YoY growth by brand/region/distributor (`erp_fmcg_growth_targets`).
- **Market-share tracking:** our sales vs category/market (panel/Nielsen import or estimated from ND/WD
  & SOS) → share % and share trend by brand/region (`erp_fmcg_market_share`).
- **Regional performance:** consolidated region/country P&L, coverage, growth, share, and target
  attainment — the basis for the executive dashboards (II.14).

### II.14 Executive Dashboards (C-level)
Role-scoped, read-only strategic dashboards over the rollups (no live heavy scans):

| Persona | Focus KPIs |
|---|---|
| **CEO** | Revenue & growth (vs target/LY), market share & trend, gross-to-net margin, region/country performance, top risks |
| **Commercial Director** | Sell-in vs sell-out, distributor scorecards & profitability, JBP attainment, channel & brand mix, receivables |
| **Sales Director** | Coverage, ND/WD, strike rate, productivity, target attainment by region/area/rep, Perfect-Store |
| **Trade Marketing Director** | Trade-spend vs budget, ROI/ROTS, promotion & display effectiveness, listing, claims, activity calendar |
| **Supply Chain Director** | Fill-rate / OTIF, distributor inventory & days-of-cover, stock-in-trade, near/old expiry & write-offs, forecast vs actual |

Gated by `exec.dashboard.view` (+ persona scope); served from `erp_fmcg_daily_rollup` and
period rollups; drill-down respects role scope.

### II.15 Multi-Region / Multi-Country topology
Designed for enterprise FMCG operating across regions and countries: region → country → area →
territory → route hierarchy; per‑region operating mode & GTM; per‑country localization (currency,
tax/VAT, e-invoicing, language); consolidation with currency normalization for group dashboards;
data residency honored per tenant. Scales via the platform's partitioning + rollup strategy.

---

## 1. Sales Hierarchy (7 roles)
Reuses VANTORA roles + per-branch reporting lines (`erp_user_branches.reports_to`, department/
team) and region/area scope. Targets cascade **down**; achievement & approvals roll **up**.

```
National Sales Manager (NSM)        — national scope
  └ Regional Sales Manager          — region scope
      └ Area Manager                — area scope
          └ Supervisor              — route/team scope; route riding & accompaniment
              ├ Salesman (pre-sell) — own outlets/route; orders + collections
              ├ Van Salesman        — own route; van stock: sell/return/collect on the spot
              └ Merchandiser        — audit-only: MSL/OSA/planogram/SOS/competitor/photos (no selling)
```
Scope drives data visibility (own outlets → route → area → region → national) and approval
authority (tiered thresholds, §10).

---

## 2. Customer Structure
Extends `erp_customers` via `erp_fmcg_customer_profile` (1–1).

| Attribute | Notes |
|---|---|
| **Channel / Sub-channel** | Traditional Trade (grocery, kiosk, wholesaler), Modern Trade (hyper, super, mini), HoReCa, Pharmacy, B2B; sub-channel refines each |
| **Territory / Route** | geo-sales hierarchy: region → area → territory → route (beat) |
| **Classification** | outlet grade A/B/C/D (Outlet Grading), size band, Perfect-Store tier |
| **GPS location** | validated lat-long + geofence radius for visit fencing |
| **Credit limit** | reuse `erp_customers.credit_limit` + balance; credit hold |
| **Payment terms** | cash / on-account; terms (days); credit governance |
| **Visit frequency** | F1/F2/F4 (weekly/bi-weekly/monthly) + preferred day(s) → PJP |
| **KSA compliance** | CR number, VAT no. (15-digit), National Address (building/street/district/city/postal/additional) |

---

## 3. Route Execution
- **Permanent Journey Plan (PJP):** scheduled outlet/date list per rep from route + frequency.
- **Beat plan:** the day's ordered outlets with time windows.
- **Route compliance:** on-route vs off-route visits; off-route requires approval.
- **Coverage:** visited ÷ planned outlets (route/territory/period).
- **Strike rate (productivity):** productive (≥1 line sold) ÷ total visits.
- **Call productivity:** drop size, lines/SKUs per call.
- **Route riding & supervisor accompaniment:** a supervisor accompanies a rep on the beat and
  records a structured **accompaniment evaluation** (selling skills, execution, coaching notes,
  outcomes) — a recognized field-coaching practice (Unilever/PepsiCo).

**Tables:** `erp_fmcg_journey_plans`, `erp_fmcg_journey_stops`, `erp_fmcg_beats`,
`erp_fmcg_accompaniments`.

---

## 4. Perfect Store (RED / Picture of Success)
Structured in-outlet execution capture — the Perfect-Store engine inputs.
- **MSL compliance:** audit vs each outlet's Must-Stock List (by channel/grade).
- **OSA (On-Shelf Availability):** per-SKU availability → OOS list.
- **Shelf Share (SOS):** our facings ÷ category facings.
- **Display compliance:** contracted displays present & correct (photo-backed).
- **Planogram compliance:** shelf layout vs planogram.
- **Competitor visibility:** competitor SKU presence, price, promo, share-of-shelf.
- **Photo evidence:** before/after shelf photos (object storage; metadata+path in DB).
- **Perfect-Store score:** weighted availability + facings + planogram + display + price.

**Tables:** `erp_fmcg_store_audits`, `erp_fmcg_audit_lines`, `erp_fmcg_competitor_obs`,
`erp_fmcg_visit_photos`, `erp_fmcg_planograms`. Reuses MSL/assortment + perfect-store/OOS engines.

---

## 5. Trade Marketing (TPM — new subsystem)
- **Trade spend & budget:** budget allocation by customer/channel/promo; commitments + actuals.
- **Listing fees:** per-SKU per-outlet/chain listing payments (Modern Trade).
- **Displays:** display types/contracts per outlet (gondola end, cooler, FSU) with period + compliance.
- **Promotions:** mechanics (price-off, BOGO, bundle, slab) + eligibility (channel/outlet/SKU) +
  period + budget → consumed by the pricing engine at sale time.
- **Activity calendar:** time-phased plan of promos/displays/listings per channel/customer.
- **Claims management:** retailer/distributor claims → submit (evidence) → validate → tiered
  approve → settle (credit note/payment) → audited.
- **ROI / ROTS (Return on Trade Spend):** incremental volume/value vs spend per promo/display/listing.

**Tables:** `erp_fmcg_promotions`, `erp_fmcg_promo_lines`, `erp_fmcg_listing_fees`,
`erp_fmcg_displays`, `erp_fmcg_display_contracts`, `erp_fmcg_trade_budgets`,
`erp_fmcg_trade_spend`, `erp_fmcg_activity_calendar`, `erp_fmcg_claims`, `erp_fmcg_claim_lines`.

---

## 6. Van Sales
- **Van inventory:** the van warehouse (`is_van`) stock ledger (sell-decrement, return-increment).
- **Load sheet:** stock issued from a warehouse to the van for a beat day (draft→loaded→reconciled).
- **Sales:** mobile cash/credit invoices against van stock (invoice + stock-out + AR + journal RPCs),
  priced incl. promotions, ZATCA-compliant.
- **Collections:** on-account collections vs customer balance + cash session.
- **Returns:** good (restock) vs damaged vs **near/old expiry** (segregate → claims).
- **Near expiry:** flag at capture; pull-back or sell-through.
- **Day close:** reconcile van (opening load ± sales/returns/transfers = closing) + cash
  (collections + cash sales = expected); variance → supervisor approval for exceptions.

**Tables:** `erp_fmcg_load_sheets`, `erp_fmcg_load_sheet_lines`, `erp_fmcg_van_reconciliations`.
Reuses van warehouses, stock movements, invoices, cash sessions, day-close/settlement.

---

## 7. Distribution KPIs (pre-aggregated rollups)
Never live cross-tenant scans — refreshed by a scheduled job into rollup tables (Scalability Review).
KPIs are computed at the **outlet/secondary** level and sliced/rolled up by **brand → principal**
and **distributor → territory → channel → national**; **sell-in vs sell-out** is reconciled per
distributor/SKU (Part II).

| KPI | Definition |
|---|---|
| Numeric Distribution (ND) | outlets stocking SKU ÷ total outlets |
| Weighted Distribution (WD) | ND weighted by outlet sales importance |
| Coverage | visited ÷ planned outlets |
| Productivity / Strike rate | productive visits ÷ total visits |
| SKU per outlet | avg distinct SKUs sold per productive call |
| Average invoice (drop size) | avg invoice value per productive call |
| MSL compliance | outlets meeting MSL ÷ total |
| OSA / OOS | on-shelf availability / out-of-stock incidence |
| Perfect-Store score | weighted RED score (availability+facings+planogram+display+price) |

**Table:** `erp_fmcg_daily_rollup` (company, date, route/rep/territory, all metrics).

---

## 8. Near-Expiry & Returns (two workflows)
- **Near-Expiry workflow:** batch/expiry tracking → near-expiry threshold (≤ X days) → flag
  (warehouse/van/outlet) → action (sell-through promo, pull-back) before expiry.
- **Old/Expired workflow:** expired stock → segregate (block from sale) → expiry claim →
  approval → warehouse processing (receive → destroy/return-to-supplier) → credit note + write-off.
- **Approvals:** tiered by value/threshold (supervisor → area → region); audited.
- **Claims & warehouse processing:** structured receipt, disposition, and accounting impact.

**Tables:** `erp_fmcg_expiry_batches`, `erp_fmcg_return_claims`, `erp_fmcg_return_claim_lines`.
Reuses returns/RMA + stock movements + accounting.

---

## 9. Customer Data Governance (KSA compliance)
Master-data changes that affect tax/legal/financial integrity are **change-requests with
approval** — built on VANTORA's customer-approval + Dynamic Field Governance (DFG) + audit.

| Change request | Why governed | Flow |
|---|---|---|
| **GPS Change Request** | re-pin outlet location (fencing integrity) | field captures new GPS + photo → supervisor/area approve → apply |
| **CR Update Request** | Commercial Registration (السجل التجاري) | requestor → compliance review → approve → apply |
| **VAT Update Request** | VAT no. (15-digit) — affects e-invoicing | requestor → finance/compliance approve → apply |
| **National Address Update** | العنوان الوطني (Saudi unified address) | requestor → review → approve → apply |

All requests: requestor, old→new values, evidence, reviewer, decision, timestamp → written to
`erp_audit_logs`. **Table:** `erp_fmcg_customer_change_requests` (customer, field, old, new,
evidence_path, status, reviewer, decided_at). Reuses DFG governance + approval engine.

---

## 10. Security & Permissions
**Permissions** (extend `field_ops`/`distribution` groups; module-gated):

| Group | Keys |
|---|---|
| Customers / CDG | customers.manage, customers.approve, customer.classify, credit.request.create/approve, cdg.request.create, cdg.gps.approve, cdg.cr.approve, cdg.vat.approve, cdg.address.approve |
| Route / Journey | route.create/import, journey.create/import, beat.plan, accompaniment.record |
| Van sales | vansales.load, sales.sell, sales.return, sales.collect, day.close, day.approve_close_exception |
| Perfect Store | field.sales, visit.override_gps, visit.approve_out_of_route, audit.capture, survey.manage, assortment.manage, grade.manage, planogram.manage |
| Trade marketing | trade.promo.manage, trade.display.manage, trade.listing.manage, trade.budget.manage, trade.claim.create, trade.claim.approve |
| Near/old expiry | expiry.manage, returns.claim.create, returns.claim.approve, inventory.adjustment.approve |
| Targets / analytics | target.view/manage, reports.view, report.aggregate.view, reconciliation.view/manage/approve |
| Distributor / RTM | principal.manage, brand.manage, distributor.manage, distributor.target.manage, secondary.ingest, rebate.scheme.manage, rebate.accrual.approve, keyaccount.manage |
| Strategy / Executive | exec.dashboard.view, jbp.manage, agreement.manage, growth.target.manage, market.share.manage, distributor.scorecard.view |

**Role × authority matrix (key approvals):**

| Capability | Merchandiser | Salesman/Van | Supervisor | Area Mgr | Regional | NSM |
|---|---|---|---|---|---|---|
| Audit capture (MSL/OSA/SOS/photo) | ✔ | ✔ | ✔ | view | view | view |
| Sell / return / collect / day-close submit | — | ✔ | ✔ | view | view | view |
| Out-of-route / GPS override / day-close exception approve | — | — | ✔ | ✔ | ✔ | ✔ |
| Accompaniment (route riding) | — | — | ✔ | ✔ | ✔ | — |
| GPS change-request approve | — | — | ✔ | ✔ | ✔ | ✔ |
| CR / VAT / National Address approve | — | — | — | ✔ (compliance) | ✔ | ✔ |
| Promotions / displays / listing manage | — | — | — | ✔ | ✔ | ✔ |
| Trade claim approve (tiered) | — | — | ≤L1 | ≤L2 | ≤L3 | all |
| Expiry/write-off approve (tiered) | — | — | ≤L1 | ≤L2 | ✔ | ✔ |
| Targets manage / credit-limit approve | — | — | — | ✔ | ✔ | ✔ |

**Audit:** every approve/reject on customers (credit/status/CDG), promotions, listing fees, trade
spend, claims, expiry/write-offs, targets, route reassignment, accompaniment, and day-close
exceptions → `erp_log_audit`.

---

## 11. Database Design
All new tables `company_id`-scoped; RLS `company_id = erp_user_company_id() OR
erp_is_platform_owner()`; `created_by`/`updated_by`/`created_at`; audited mutations.

| Table | Purpose |
|---|---|
| erp_fmcg_channels | channel / sub-channel master |
| erp_fmcg_customer_profile | FMCG + KSA attributes (1–1 customer) |
| erp_fmcg_customer_change_requests | GPS/CR/VAT/address governance |
| erp_fmcg_journey_plans / _stops | PJP + planned visits |
| erp_fmcg_beats | day beat |
| erp_fmcg_accompaniments | route-riding evaluations |
| erp_fmcg_load_sheets / _lines | van load |
| erp_fmcg_van_reconciliations | day-close variance |
| erp_fmcg_store_audits / _lines | MSL/OSA/SOS/planogram capture |
| erp_fmcg_planograms | planogram master |
| erp_fmcg_competitor_obs | competitor SKU/price/share |
| erp_fmcg_visit_photos | photo metadata + path |
| erp_fmcg_promotions / _lines | promo mechanics + eligibility |
| erp_fmcg_listing_fees | listing payments |
| erp_fmcg_displays / _display_contracts | displays |
| erp_fmcg_trade_budgets / _trade_spend | budget + actuals |
| erp_fmcg_activity_calendar | time-phased trade plan |
| erp_fmcg_claims / _claim_lines | trade claims lifecycle |
| erp_fmcg_expiry_batches | batch/expiry stock |
| erp_fmcg_return_claims / _lines | expiry/damage returns |
| erp_fmcg_targets | targets by rep/route/SKU/period |
| erp_fmcg_daily_rollup | pre-aggregated KPIs (by brand/principal/distributor/territory) |
| **erp_fmcg_principals** | brand owners (own + represented) — multi-principal |
| **erp_fmcg_brands** | brands → principal; products map brand/principal |
| **erp_fmcg_distributors** | distributor partners (contract, credit, status, linked tenant) |
| **erp_fmcg_distributor_territories** | distributor ↔ region/area/territory/channel/brand (exclusivity) |
| **erp_fmcg_distributor_targets** | sell-in & sell-out targets per distributor/brand/SKU/period |
| **erp_fmcg_secondary_sales** | distributor → outlet (sell-out) transactions |
| **erp_fmcg_channel_stock** | stock-in-trade per distributor/SKU (sell-in − sell-out) |
| **erp_fmcg_rebate_schemes / _accruals / _settlements** | distributor rebate programs lifecycle |
| **erp_fmcg_key_accounts** | banner → chain → store + JBP (Key Account Management) |
| **erp_fmcg_operating_modes** | company mode (manufacturer/distributor/hybrid) + per-region GTM |
| **erp_fmcg_distributor_inventory** | distributor stock-on-hand / days-of-cover / stock-in-trade |
| **erp_fmcg_distributor_scorecards** | periodic composite distributor scorecard (league table) |
| **erp_fmcg_distributor_agreements** | contracts: terms, exclusivity, margins, SLAs, period |
| **erp_fmcg_jbp / _jbp_lines** | Annual Joint Business Plans (distributor / key account) |
| **erp_fmcg_growth_targets** | YoY growth by brand/region/distributor |
| **erp_fmcg_market_share** | share % & trend by brand/region (panel import or estimated) |

**Relationships:** customer 1–1 profile; customer 1–* change-requests; route 1–* journey stops;
beat 1–* load lines & visits; visit 1–1 store audit; promotion 1–* claims; product 1–* expiry
batches. (See ERD.)

**Index strategy:** every FK indexed (platform enforces 100% coverage); composite
`(company_id, created_at DESC)` and `(route_id/salesman, date)` on high-volume tables
(`erp_visits`, `erp_fmcg_store_audits`, `erp_invoices`, `erp_fmcg_trade_spend`, `erp_fmcg_daily_rollup`);
partial indexes for hot predicates (open beats, due journey stops, pending claims/CDG); RLS auth
functions wrapped in `(SELECT …)`.

**Scalability:** range-partition the high-volume tables by `created_at` (monthly); analytics via
rollups; photos to object storage (per `SCALABILITY-REVIEW.md`).

---

## 12. Mobile-First Field App (role-specific, offline-capable)
Field reps work in low-connectivity outlets — the field app is mobile-first, fast, offline-first
(queue + sync), Arabic/RTL, GPS-aware.

| App | Primary user | Core screens |
|---|---|---|
| **Salesman app** | Salesman / Van Salesman | My Day / beat; check-in (GPS); order or van-sell; collect; store audit; photos; day-close |
| **Supervisor app** | Supervisor | Route riding / accompaniment; approvals (out-of-route, GPS override, day-close exception, CDG GPS); live coverage/strike |
| **Merchandiser app** | Merchandiser | Store audit (MSL/OSA/SOS/planogram); competitor; photos — no selling |

Design principles: minimal taps per call, offline queue with conflict-safe sync, GPS geofence
prompts, photo capture, large touch targets, Arabic-first.

---

## 13. Saudi Arabia Localization
- **VAT 15%** standard rate; tax-inclusive/exclusive handling on invoices.
- **ZATCA e-invoicing (Fatoora) Phase 2:** compliant simplified/standard e-invoices, QR, and
  clearance/reporting integration (leverages VANTORA’s integrations module; mirrors the existing
  ETA pattern used for Egypt).
- **Commercial Registration (CR / السجل التجاري)** + **VAT number (15-digit)** on customer master,
  governed via CDG change-requests.
- **National Address (العنوان الوطني):** building no., street, district, city, postal code,
  additional no.
- **Arabic-first, RTL**, Hijri date display optional. Currency SAR.

---

## 14. Enterprise Best-Practice Alignment
| Practice | Source | In this pack |
|---|---|---|
| Route-to-Market / DMS | all | distribution module, van/pre-sell, routes |
| Permanent Journey Plan (PJP) + beat | Nestlé/Unilever | journey plans, beats, coverage |
| Perfect Store / RED / Picture of Success | Coca-Cola/PepsiCo | store audits, MSL/OSA/SOS/planogram, Perfect-Store score |
| Numeric & Weighted Distribution | Nielsen/all | ND/WD KPIs |
| Trade Promotion Management + ROTS | P&G/Mondelez | trade spend, promos, listing fees, claims, ROI |
| MSL / OSA / SOS | all | merchandising capture |
| Route riding / field coaching | Unilever/PepsiCo | accompaniments |
| Master-data governance | all | CDG change-requests + approvals + audit |

---

## 15. Governance compliance checklist
- ✔ Plan-gated `distribution` + `field_ops`; business-type `distribution`/`general` templates.
- ✔ Company-scoped RLS on all new tables; sensitive tables tightly scoped; reads/writes verified.
- ✔ Audit on all approvals + sensitive mutations (`erp_log_audit`).
- ✔ Role hierarchy + region/area/route scope reuse platform mechanisms.
- ✔ Permissions registered (labels + groups + danger flags); manageable via Global Roles & Plans editors.
- ✔ FK index coverage + per-query RLS + rollups/partitioning plan.
- ✔ Files in object storage; metadata-only in DB.

---

## 16. Implementation Roadmap

| Phase | Scope |
|---|---|
| **F0 — RTM model** | Operating models (DSD/Distributor/Hybrid); principals/brands; distributors + territories; sell-in/sell-out & secondary; distributor targets/rebates; trade-spend-by-distributor; Key Accounts; principal↔distributor data-share |
| **F1 — Foundation** | Customer profile/classification/channel/KSA fields; route master; PJP & beats; **Customer Data Governance** (GPS/CR/VAT/address); permission catalog + RLS + audit |
| **F2 — Mobile field & Perfect Store** | Salesman/Supervisor/Merchandiser apps; visits + GPS validation; store audits (MSL/OSA/SOS/planogram); competitor; photos; coverage |
| **F3 — Van sales** | Load sheet; van inventory; mobile sell/return/collect; near-expiry; day-close reconciliation |
| **F4 — Trade marketing (TPM)** | Promotions (pricing); displays; listing fees; budgets/spend; activity calendar; claims + approvals; ROI/ROTS |
| **F5 — Near/old expiry & returns** | Batch/expiry; near + expired workflows; claims; warehouse processing + accounting |
| **F6 — Distribution analytics** | Daily rollups; ND/WD/coverage/strike/SKU-per-outlet/avg-invoice/Perfect-Store; partitioning |
| **F7 — KSA compliance & hardening** | ZATCA/Fatoora e-invoicing; VAT; approval-threshold matrix; targets cascade; offline-sync hardening; load test; retention |
| **F8 — Strategy & Executive** | JBP + distributor agreements; growth & market-share; distributor scorecards & profitability; **C-level executive dashboards**; multi-region/country consolidation |

Each phase: drift-safe additive migrations; seeded permissions/roles; unit + RLS-integration +
architecture-guard tests; docs — per VANTORA standards.

## 17. Open decisions / risks
- Pre-sell vs van-sell (or hybrid) default per channel — model supports both.
- ZATCA Phase-2 clearance integration scope & certified solution provider.
- Trade-spend ↔ accounting posting (accrual vs claim-time) — finance sign-off.
- Offline-first sync/conflict strategy for the mobile apps (detailed mobile design doc).
- Promotion-engine depth (slab/bundle) — extend the existing pricing engine vs new TPM engine.
