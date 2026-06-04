# VANTORA — Enterprise FMCG Readiness

> Gap analysis vs. leading FMCG field-execution platforms, with an ROI-ranked,
> dependency-ordered roadmap. **Analysis only — no features built in this sprint.**
> Grounded in a full codebase inventory (143 migrations, libs, screens, nav,
> permissions, i18n). Prepared `2026-06-04`.

## 0. Method & the one finding that changes the roadmap

Every claim below is checked against the actual repo (tables in `supabase/migrations/`,
pure libs in `src/lib/erp/`, screens in `src/app/(app)/`, `navigation.ts`,
`permissions.ts`, i18n namespaces).

**Key finding — "built but dark."** VANTORA already *contains* most enterprise
**operations** depth (flexible targets + achievement `0139`, journey plans +
`erp_today_journey` `0129`, GPS visits `0128`, visit-compliance `0131`, regions/
areas `0101`, pricing engine `0106`, route↔customer membership `0129`). But per the
**Drift Closure Program**, migrations `0099–0143` (≈39) are **not yet applied to
production**. So the single highest-ROI readiness action is **not building new
features — it is activating what is already built** (Phase 0). Net-new features
(assortment, surveys, TPM) are layered on top.

## 1. Gap analysis (the 15 priority areas)

Legend: ✅ shipped · 🟡 partial/foundation · ⛔ missing · 🌒 built-in-repo but
dark in prod (drift).

| # | Area | Status | What exists (evidence) | What's missing (the gap) |
|---|------|--------|------------------------|--------------------------|
| 1 | **Trade Spend** | 🟡 isolated | `ts_*` platform (`0004`): `ts_campaigns`, `ts_spend_types` — a **separate, disconnected** distributor system | No ERP-integrated budgets/accruals/claims/deductions; no ROI vs actual invoices |
| 2 | **Promotion Planning** | 🟡 foundation | `public.promotions` (`0002`, basic); pricing engine has a promo **hook** (`0106`, slot #1, unfilled) | No mechanics (BOGO/%, threshold), no per-customer/channel rules, no calendar UI, no price execution |
| 3 | **Customer Segmentation** | ✅🌒 | `erp_customer_lookups` (`0103`: segment/classification/channel) + seeded defaults; FKs on `erp_customers` | Segment *logic* thin — used only by pricing; no segment-driven assortment/visibility |
| 4 | **Route Productivity** | 🟡🌒 | `erp_visits` (check-in/out, GPS), strike_rate metric in `erp_targets` (`0139`); `scorecard.ts` | No **drop size**, **lines/call**, **time-in-store**, **productive-call %** calcs |
| 5 | **Visit Compliance** | ✅🌒 | `erp_journey_plans`, `erp_visits`, `erp_visit_compliance` (`0131`: gps/out-of-route/wrong-day/sequence), `erp_check_in_visit()`, approval flow; `/distribution/journey-compliance`, `/field/journey` | Mature. Missing only formal **missed-visit** & **duration** KPIs |
| 6 | **Outlet Classification** | 🟡🌒 | `classification_id`/`channel_id`/`segment_id` lookups (Class A/B/C, channel) | No **outlet grade → service model** (visit freq, MSL tier) linkage |
| 7 | **Assortment Tracking** | ⛔ | — | **No must-stock list (MSL), no distribution-gap, no OOS.** Biggest FMCG gap |
| 8 | **Shelf Share / Visibility** | ⛔ | `erp_attachments` (`0111`) only | No survey engine, planogram, share-of-shelf, merchandising photo workflow |
| 9 | **Distribution KPIs** | 🟡🌒 | coverage, visits, strike_rate (`erp_targets`); `territory.ts` | No **numeric / weighted distribution** index; no channel/segment rollups |
| 10 | **Collection Management** | ✅🌒 | `erp_payments` (`0005`), `/accounting/aging`, credit-request flow (`0015`), `collections` target metric (`0139`) | No **collection target tracking UI**, **aging buckets/DSO**, **overdue dunning**, **credit hold** |
| 11 | **Sales Target Management** | ✅🌒 | `erp_targets` (`0139`: 9 levels × 4 periods × 7 metrics) + `erp_target_achievement()`; `/distribution/targets-achievement` | Mature. Gap = activation (drift) + product/category mix targets UI |
| 12 | **Forecasting Foundation** | 🟡🌒 | naive run-rate + linear extrapolation in `erp_target_achievement`; `insights/engine.ts` (flag-OFF) | No **trend / seasonality / moving-average**; no forecast-accuracy tracking |
| 13 | **Territory Planning** | ✅🌒 | `erp_regions`/`erp_areas` (`0101`), `erp_routes`, `erp_route_customers` (`0129`); `territory.ts`, `/territory` | No **coverage balancing / auto-assignment** optimization |
| 14 | **Master Data Governance** | ✅ | `erp_custom_fields` (`0087`), `erp_field_governance`+sections+templates+versions (`0114–0117`), `erp_audit_logs`; entity registry + Import Engine validation | No **dedupe rules / duplicate detection**, no **data-quality score** |
| 15 | **ERP Integration Readiness** | ✅ | Import Engine (`0080`/`0082`), connectors (Odoo/SAP-S4/Dynamics-BC/NetSuite/REST/CSV-SFTP), API keys (`0091`), webhooks (`0092`), sync engine (`0094`), onboarding | Mature (strongest area). Net-new in the stacked PRs #113/#114 deepens it |

**Headline:** Operations (5, 11, 13), governance (14) and integration (15) are
**enterprise-grade** (once drift is applied). The true *capability* gaps are
**Assortment (7)** and **Shelf-share/Surveys (8)**, with **Distribution KPIs (9)**,
**TPM (1+2)**, **Collections depth (10)** and **Forecasting (12)** as partials.

## 2. Competitor comparison

Field-execution leaders vs. VANTORA (●=strong, ◐=partial, ○=none). "VANTORA*" =
after Phase 0 drift activation.

| Capability | Pepperi | Repsly | StayinFront | BeatRoute | SFDC CG Cloud | SAP B1 + TPM | D365 | ERPNext | Odoo | **VANTORA*** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Journey/visit plan + GPS | ● | ● | ● | ● | ● | ◐ | ◐ | ○ | ◐ | **●** |
| Visit compliance/exceptions | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | **●** |
| Van sales / order-taking | ● | ◐ | ● | ● | ● | ◐ | ◐ | ◐ | ◐ | **●** |
| Sales targets + achievement | ● | ◐ | ● | ● | ● | ● | ● | ◐ | ◐ | **●** |
| **Assortment / MSL** | ● | ● | ● | ● | ● | ◐ | ◐ | ○ | ○ | **○** |
| **Distribution gap / OOS** | ● | ● | ● | ● | ● | ◐ | ◐ | ○ | ○ | **○** |
| **In-store surveys / photos** | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | **○** |
| **Share-of-shelf / planogram** | ◐ | ● | ● | ◐ | ● | ○ | ○ | ○ | ○ | **○** |
| **Perfect-store score** | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | **○** |
| **Numeric/weighted distribution** | ● | ● | ● | ● | ● | ◐ | ◐ | ○ | ○ | **◐** |
| Trade promotion mgmt (TPM) | ● | ◐ | ◐ | ◐ | ● | ● | ● | ◐ | ◐ | **◐** |
| Promotion price execution | ● | ○ | ◐ | ◐ | ● | ● | ● | ● | ● | **◐** |
| Collections / AR aging / DSO | ◐ | ○ | ○ | ◐ | ◐ | ● | ● | ● | ● | **◐** |
| Forecasting (trend/season) | ◐ | ◐ | ● | ● | ● | ● | ● | ◐ | ◐ | **◐** |
| Territory optimization | ◐ | ◐ | ● | ● | ● | ◐ | ◐ | ○ | ○ | **◐** |
| Master-data governance | ◐ | ◐ | ◐ | ◐ | ● | ● | ● | ◐ | ◐ | **●** |
| ERP/import/connectors/API | ◐ | ◐ | ◐ | ◐ | ● | ● | ● | ● | ● | **●** |
| Image recognition (AI) | ◐ | ◐ | ● | ◐ | ● | ○ | ○ | ○ | ○ | **○** (out of scope: no-AI) |

**Read:** VANTORA already matches or beats the pure-SFA players (Repsly/BeatRoute)
on **integration + governance + targets + compliance**, and beats the ERPs
(ERPNext/Odoo) on **field execution**. It trails the retail-execution leaders on
exactly three things: **assortment, surveys/shelf, and the perfect-store score**
that ties them together. Closing those three moves VANTORA into the leaders' tier
for traditional-trade FMCG distribution.

## 3. ROI ranking

Score = Business value (1–5) × Leverage on existing foundations (1–5) ÷ Build
effort (1–5). Higher = do sooner. Every item carries a **measurable KPI** (the
"not-random" test).

| Rank | Initiative | Measurable KPI it moves | Value | Leverage | Effort | Score |
|---|---|---|:--:|:--:|:--:|:--:|
| **0** | **Drift activation** (apply `0099–0143` via staging) | Unlocks targets/journey/visits/pricing in prod (feature availability %) | 5 | 5 | 2 | **12.5** |
| **1** | **Assortment / MSL + Distribution Gap + OOS** | Numeric distribution %, lines/call, drop size | 5 | 4 | 3 | **6.7** |
| **2** | **Numeric & Weighted Distribution KPIs** | Weighted distribution %, must-stock compliance % | 5 | 5 | 2 | **12.5** (needs #1) |
| **3** | **Route Productivity metrics** | Drop size, productive-call %, time-in-store, strike rate | 4 | 5 | 2 | **10** |
| **4** | **Collections depth** (targets, aging buckets, DSO, dunning, credit hold) | DSO ↓, overdue % ↓, collection achievement % | 5 | 4 | 2 | **10** |
| **5** | **In-store Surveys + Perfect-Store score** (reuse `erp_attachments`) | Visibility compliance %, perfect-store % | 5 | 3 | 3 | **5** |
| **6** | **Forecasting foundation** (trend + seasonality, deterministic) | Forecast accuracy (MAPE), stockout rate | 4 | 4 | 3 | **5.3** |
| **7** | **Trade Promotion Management** (unify `ts_*`+`promotions`→budgets/accruals/claims/ROI) | Promo ROI, spend efficiency, deduction leakage | 5 | 2 | 4 | **2.5** |
| **8** | **Promotion price execution** (fill pricing slot #1 + calendar) | Promo uplift %, price compliance % | 4 | 3 | 3 | **4** |
| **9** | **Outlet grade → service model** (freq/MSL tier from class) | Coverage efficiency, A-outlet strike rate | 3 | 5 | 1 | **15** (tiny; do with #1) |
| **10** | **MDM dedupe + validation rules** | Duplicate rate ↓, data-quality score | 3 | 4 | 2 | **6** |
| **11** | **Territory optimization** (coverage balancing) | Calls/day balance, travel time ↓ | 3 | 3 | 4 | **2.25** |

## 4. Recommended implementation order (dependency-aware)

```
Phase 0  Activate (drift)            ──┐ unlocks targets/journey/visits/pricing
Phase 1  Retail Execution Core        │ Outlet grade(9) → MSL/Assortment(1)
         9 → 1 → 2 → 3                 │   → Distribution KPIs(2) ; Route productivity(3) ∥
Phase 2  Perfect Store                │ Surveys(5) → Share-of-shelf → Perfect-store score
Phase 3  Commercial Discipline        │ Collections depth(4) ∥ Promotion execution(8)
Phase 4  Trade Marketing              │ TPM(7) closed-loop (needs invoices+promotions+segments)
Phase 5  Intelligence & MDM           │ Forecasting(6) ∥ Dedupe/validation(10) ∥ Territory opt(11)
```

Rationale: **9→1** because must-stock tiers derive from outlet grade; **1→2**
because distribution % needs the MSL denominator; **3,4** run in parallel (pure
calcs over existing visits/payments); **5** unlocks the perfect-store score that
makes 1/8 a single field scorecard; **7** last because it needs 1+2+8 + actual
invoice linkage to compute true ROI.

## 5. Screens to build (per initiative — mobile-first, ar+en, reuse components)

- **Assortment/MSL (1):** `/distribution/assortment` (MSL by segment/channel/outlet,
  distribution-gap report) · in-visit **MSL checklist** card in `/field/journey` &
  Customer 360 · `/reports/distribution-gaps`.
- **Distribution KPIs (2):** `/distribution/distribution-index` (numeric/weighted %,
  by channel/segment/region) · StatCards on `/manager`, `/supervisor`.
- **Route Productivity (3):** productivity panel on `/manager` & `/field/route`
  (drop size, lines/call, productive-call %, time-in-store, strike rate).
- **Collections depth (4):** `/collections` cockpit (aging buckets, DSO, overdue,
  collection-vs-target) · credit-hold badge on Customer 360 / order entry.
- **Surveys / Perfect Store (5):** `/field/survey/[customerId]` (dynamic form +
  photo capture) · `/settings/surveys` (survey builder) · perfect-store score on
  Customer 360 + `/territory`.
- **Forecasting (6):** forecast section on `/distribution/targets-achievement` +
  `/insights` (trend/seasonality, accuracy).
- **TPM (7):** `/trade/promotions` (calendar + mechanics), `/trade/budgets`,
  `/trade/claims` (accruals/claims/deductions + ROI vs actuals).
- **Promotion execution (8):** promo rules in `/sales/price-book`; applied in POS/
  order entry automatically (pricing slot #1).
- **Outlet grade→service (9):** extend `/settings/customer-data` + customer form.
- **MDM dedupe (10):** `/settings/data-quality` (duplicate review, validation rules).
- **Territory opt (11):** `/distribution/territory-planner` (balance/assign).

## 6. Data requirements

**Reuse (already in repo; activate via drift):** `erp_customers`
(segment/classification/channel/region/area/route_id/credit_limit),
`erp_products_catalog`, `erp_invoices`+lines, `erp_payments`, `erp_visits`,
`erp_journey_plans`, `erp_route_customers`, `erp_targets`+`erp_target_achievement()`,
`erp_regions`/`erp_areas`/`erp_routes`, `erp_attachments`, `erp_price_rules`,
`erp_audit_logs`, Import Engine + connectors.

**New tables required (additive; need migration + drift-safe rollout):**

| Initiative | New tables / fields | Notes |
|---|---|---|
| 1 Assortment | `erp_must_stock_list` (scope: segment/channel/outlet → product_id, tier, effective_from/to); distribution-gap = MSL **minus** invoiced SKUs (derive, no table) | OOS = MSL product with 0 stock at visit |
| 2 Dist. KPIs | none (pure derivation over MSL + `erp_invoices` + `erp_customers`) | weighting from product `sell_price`/volume |
| 3 Route prod. | none (derive over `erp_visits` check_in/out + invoice lines) | new pure lib `route-productivity.ts` |
| 4 Collections | `erp_collection_targets` (or reuse `erp_targets` metric=collections); aging = derive from `erp_invoices.due_date`+`erp_payments`; `erp_credit_holds` (optional) | DSO/aging pure lib |
| 5 Surveys | `erp_surveys` (template: questions jsonb), `erp_survey_responses` (visit_id, answers jsonb, photos→`erp_attachments`) | perfect-store = MSL + survey + price compliance score |
| 6 Forecasting | none (deterministic over `erp_invoices` history); optional `erp_forecast_snapshots` for accuracy | pure lib, no AI |
| 7 TPM | `erp_trade_budgets`, `erp_promotion_accruals`, `erp_promotion_claims`/`deductions`; **unify** `public.promotions`→`erp_promotions` (mechanics) | ROI = accrual vs invoice uplift |
| 8 Promo exec | extend `erp_price_rules` (promotion rule type), `erp_promotions.mechanics` | fills pricing slot #1 |
| 9 Outlet grade | `erp_customer_lookups` + new `service_model` map (visit_freq, MSL tier per grade) | mostly config |
| 10 MDM | `erp_dedupe_rules`, `erp_validation_rules` | extend governance |
| 11 Territory | none new (optimize over existing route/customer/geo) | algorithmic lib |

**Constraint reminder:** new schema is **additive only**, applied through the
staging-validated Drift Closure process — never blind-replayed (version-scheme
mismatch makes `db push` a NO-GO). Features needing missing fields ship with
**defensive empty states** until their migration lands.

## 7. Final roadmap

| Phase | Theme | Initiatives | Primary KPIs | Build size | Gate |
|---|---|---|---|---|---|
| **0** | **Activate** | Drift closure (`0099–0143`) via staging→prod | Feature availability; targets/journey/visits live | ~0 build (validate) | PITR + staging dry-run green |
| **1** | **Retail Execution Core** | Outlet grade(9) → MSL/Assortment(1) → Distribution KPIs(2) → Route productivity(3) | Numeric/weighted distribution %, MSL compliance %, drop size, productive-call % | M | tsc/test/build; empty-state safe |
| **2** | **Perfect Store** | Surveys(5) + share-of-shelf + perfect-store score | Visibility compliance %, perfect-store % | M–L | photo workflow on `erp_attachments` |
| **3** | **Commercial Discipline** | Collections depth(4) ∥ Promotion execution(8) | DSO, overdue %, collection achievement, price compliance | M | reuse payments/pricing |
| **4** | **Trade Marketing** | TPM(7): budgets/accruals/claims/ROI (unify `ts_*`+promotions) | Promo ROI, spend efficiency, deduction leakage | L | closed-loop to invoices |
| **5** | **Intelligence & MDM** | Forecasting(6, deterministic) ∥ Dedupe/validation(10) ∥ Territory opt(11) | Forecast MAPE, duplicate rate, calls/day balance | M–L | no-AI; pure libs + tests |

**Sequencing principles honored throughout:** additive · reuse VANTORA
architecture/entities/permissions/RLS/components/nav · mobile-first, Arabic +
English · **no AI** (forecasting stays deterministic; image recognition explicitly
out of scope) · no unsafe schema (document + empty-state when a field is missing) ·
every initiative tied to a measurable FMCG KPI.

**The 3 moves that most close the enterprise gap:** (0) apply the drift to light up
what's already built, then (1) **Assortment/MSL + Distribution KPIs** and (5)
**Surveys + Perfect-Store score** — together these are the difference between an SFA
and a true *retail-execution* platform.

---

*Analysis only — no features built. Inventory grounded in the live codebase;
competitor capabilities assessed at the feature level. Roadmap is additive and
drift-aware.*
