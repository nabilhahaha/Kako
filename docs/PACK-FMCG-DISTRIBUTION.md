# VANTORA FMCG Distribution Enterprise Pack — Architecture & Design

**Status:** Design / implementation-review (no code yet).
**Positioning:** A **distribution-first** FMCG platform (Route-to-Market / Distributor
Management System), not a generic ERP — delivered as a **first-class industry pack** on VANTORA.
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
| erp_fmcg_daily_rollup | pre-aggregated KPIs |

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
| **F1 — Foundation** | Customer profile/classification/channel/KSA fields; route master; PJP & beats; **Customer Data Governance** (GPS/CR/VAT/address); permission catalog + RLS + audit |
| **F2 — Mobile field & Perfect Store** | Salesman/Supervisor/Merchandiser apps; visits + GPS validation; store audits (MSL/OSA/SOS/planogram); competitor; photos; coverage |
| **F3 — Van sales** | Load sheet; van inventory; mobile sell/return/collect; near-expiry; day-close reconciliation |
| **F4 — Trade marketing (TPM)** | Promotions (pricing); displays; listing fees; budgets/spend; activity calendar; claims + approvals; ROI/ROTS |
| **F5 — Near/old expiry & returns** | Batch/expiry; near + expired workflows; claims; warehouse processing + accounting |
| **F6 — Distribution analytics** | Daily rollups; ND/WD/coverage/strike/SKU-per-outlet/avg-invoice/Perfect-Store; partitioning |
| **F7 — KSA compliance & hardening** | ZATCA/Fatoora e-invoicing; VAT; approval-threshold matrix; targets cascade; offline-sync hardening; load test; retention |

Each phase: drift-safe additive migrations; seeded permissions/roles; unit + RLS-integration +
architecture-guard tests; docs — per VANTORA standards.

## 17. Open decisions / risks
- Pre-sell vs van-sell (or hybrid) default per channel — model supports both.
- ZATCA Phase-2 clearance integration scope & certified solution provider.
- Trade-spend ↔ accounting posting (accrual vs claim-time) — finance sign-off.
- Offline-first sync/conflict strategy for the mobile apps (detailed mobile design doc).
- Promotion-engine depth (slab/bundle) — extend the existing pricing engine vs new TPM engine.
