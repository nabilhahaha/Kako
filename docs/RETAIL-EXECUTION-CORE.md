# VANTORA — Retail Execution Core

> Closes the FMCG retail-execution gap: a **fully dynamic, company-configurable
> MSL Matrix Engine**, distribution KPIs, OOS/gap, an in-store **Survey Engine**,
> and **Perfect Store** scoring. Additive — reuses customers/products/invoices/
> visits/lookups/attachments + permissions/RLS/nav/i18n. No AI. Prepared `2026-06-04`.

## 0. Headline: nothing about MSL is hardcoded

Per the dynamic-MSL requirement, **no channel, sub-channel, customer class, brand
or MSL level is in code**. They are all company master data, so a company can add,
rename, remove or reorganize dimensions/values/levels/rules with **zero code
changes**. The pure engine matches *opaque lookup-id sets*, so it serves **FMCG,
Pharma, Beverage, Dairy, Bakery and future industry packs** identically.

| Requirement | How it's met |
| --- | --- |
| 1. Company-specific MSL policies | `erp_msl_policies` (per-company, named) |
| 2. Dynamic channels | `erp_customer_lookups` (kind now free-text) |
| 3. Dynamic sub-channels | same — add a new `kind`/values, no code change |
| 4. Dynamic customer classes | same |
| 5. Dynamic SKU assignment | `erp_msl_policy_items` (product + level/weight) |
| 6. Weighted scoring | `erp_msl_levels.weight` + per-item override → weighted compliance |
| 7. Effective / expiry dates | `erp_msl_policies.effective_from/to` |
| 8. Enable / disable | `erp_msl_policies.is_active` (+ per-item `is_active`) |
| 9. Audit trail | every mutation → `logAudit` → `erp_audit_logs`; version columns |
| 10. Company-admin self-management | `/settings/msl` manager, gated `assortment.manage` |

## 1. The dynamic MSL Matrix Engine (`src/lib/erp/msl-matrix.ts`, pure)

Targeting groups a policy's condition lookups by their **kind** (the dimension):
**AND across kinds, OR within a kind**. No conditions = company-wide. On a SKU in
multiple applicable policies, the higher-`priority` policy wins its weight/level.

```
resolveMslForOutlet(policies, outlet, lookups, levels, asOf)
  → Map<productId, { weight, levelId, policyId }>   // the outlet's effective MSL
policyActiveAt()     enable/disable + effective window
policyMatchesOutlet()  dynamic dimension match (opaque kinds)
```

Outlet attributes are assembled from the existing fixed FKs
(`segment_id`/`classification_id`/`channel_id`) **plus** `erp_customer_attributes`
(flexible, for sub-channel / brand / future dimensions) — so new dimensions need
no schema change either.

## 2. Compliance, distribution, OOS, surveys, Perfect Store (pure engines)

- **`assortment.ts`** — `outletCompliance` / `weightedOutletCompliance`
  (core SKUs weigh more) / `summarizeCompliance` / `complianceBand`.
  Same primitive yields **distribution gap** (vs sold set) and **OOS** (vs
  available set).
- **`distribution-kpi.ts`** — `productDistribution` (numeric = outlets selling /
  total; weighted = Σweight selling / Σweight all), `distributionForProducts`
  (weakest first), `distributionByDimension` (channel/segment rollups).
- **`survey.ts`** — `answerScore` (yesno/rating/number/select scored; text/photo
  completion-only), `scoreSurvey` (weighted 0..100 + completion), `validateSurvey`.
- **`perfect-store.ts`** — `perfectStoreScore` (MSL 0.5 / survey 0.3 / price 0.2,
  renormalised over present pillars) + gold/silver/bronze band.

All five are pure + fully unit-tested (**31 tests**).

## 3. Schema (migration `0144_retail_execution.sql`, additive)

`erp_customer_lookups.kind` → free-text (dynamic dimensions) ·
`erp_customer_attributes` (flexible outlet attributes) · `erp_msl_levels`
(dynamic levels + weight) · `erp_msl_policies` (enable/disable, window, priority) ·
`erp_msl_policy_conditions` (dynamic targeting) · `erp_msl_policy_items` (dynamic
SKUs) · `erp_surveys` / `erp_survey_responses`. Company-scoped RLS (admin-write for
master data, member-submit for responses); `erp_set_company_id` stamping. **No
existing table is modified except relaxing the lookup `kind` CHECK.**

> Drift-safe: like the rest of the FMCG depth, this ships behind defensive empty
> states and activates when `0144` is applied through the staged Drift Closure
> process. The engine + UI build and run today; data lights up post-apply.

## 4. Screens (mobile-first, ar + en)

- **`/settings/msl`** — MSL Matrix manager (admin self-management): levels;
  policies with enable/disable, priority, effective dates; **dynamic** targeting
  (pick any dimension → value); SKU assignment (product + level + weight override).
- **`/distribution/assortment`** — Assortment & Retail Execution dashboard: MSL
  compliance (weighted), distribution gaps, numeric/weighted distribution, Perfect
  Store score; weakest outlets + weakest SKUs.
- **`/settings/surveys`** — Survey builder (typed questions, weights, required,
  options).
- **`/field/survey/[customerId]`** — Survey execution (live score + completion,
  submit) — feeds the Perfect Store survey pillar.

Permissions: `assortment.manage`, `survey.manage` (admins/managers via `ALL`,
commercial leads explicitly); viewing via `reports.view`; submitting via
`field.sales`. Nav entries added (distribution + settings/data-fields groups).

## 5. Competitive grounding
Matches the dynamic assortment matrices, distribution analytics, in-store surveys
and Perfect Store/Perfect Call scoring of **Pepperi, Repsly, StayinFront, BeatRoute
and Salesforce Consumer Goods Cloud** — with VANTORA's edge being a single,
config-only matrix engine (no per-company code) and deterministic (no-AI) scoring.

## 6. Measurable FMCG value
MSL compliance % · numeric & weighted distribution % · distribution-gap lines ·
Perfect Store % (gold/silver/bronze) · survey/visibility compliance %.

## Validation
`tsc` clean · `vitest` **529 passed** (31 new engine tests + i18n parity +
keys-usage) · `next build` success (4 new routes).

*Additive · reuses existing schema/permissions/RLS/components/nav/i18n · no AI ·
drift-safe · fully dynamic (no hardcoded dimensions/levels/rules).*
