# Phase 4+ — Promotion/Return Attribution & Incentive Traceability (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_ATTRIBUTION`, default OFF) ·
multi-tenant safe · audit-first · raw-data-export compatible · reuse-first. The
platform doesn't only calculate results — it **explains** them.

## Pure engine (`src/lib/attribution/`, 9 unit tests)
| Module | Capability |
|---|---|
| `explain.ts` | `explainInvoice` (which promotion/funding/discount/incentive/commission) · `explainReturn` (what reverses) · `explainPromotion` (footprint) |
| `promotion-attribution.ts` | Per-promotion rollup (sales/cost/funding shares/incremental/ROI/payback) — **reuses `trade-spend/roi`** |
| `traceability.ts` | **Incentive traceability** (employee → program/target/achievement/gross/net + related invoices/customers/promotions/returns + click-through drilldown) · **commission traceability** (accrued − return reversals) |
| `dashboards.ts` | Promotion profitability · employee incentives · commission control · return impact + **raw-data export** rows |

## Schema (additive, RLS, FK-covering, idempotent)
- **0220 `erp_commercial_attribution`** — raw attribution ledger linking invoice/invoice_line/return/promotion → promotion, funding shares (supplier/company/distributor), discount, free goods, incentive program/amount, commission rule/amount, gross/net sales, return/ROI impact, and owner dimensions (customer/salesman/supervisor/route/channel/region/period). Every field exported.

## Reuse (not rebuilt)
`trade-spend/roi` (`computeRoi`), promotion/returns engines, `erp_trade_promotions`,
`erp_incentive_programs`, `erp_commission_rules`, `erp_customers`, `erp_routes`.

## Requirement coverage
Promotion attribution (every invoice/line → promotion/funding/supplier/brand/budget/owner + gross/net/
qty/free/discount/cost/shares/incremental/ROI) ✓ · return attribution (linked to original sale +
impacted promotion/funding/incentive/commission/ROI) ✓ · incentive traceability (drill-down to source
transactions) ✓ · commission traceability (+reversal/adjustment/return/discount/promotion impact) ✓ ·
commercial explanation layer (invoice/return/promotion) ✓ · raw-data export (all fields) ✓ ·
dashboards (promotion profitability / employee incentives / commission control / return impact) ✓.

## Validation
Typecheck 0 · build 0 · **1065 unit tests** (+9) · integration: attribution-schema (3) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Attribution writers from sales/promotion/return posting (populate the ledger); a Supabase gateway;
the four dashboard pages; CSV/Excel/Power BI export endpoints over `toRawDataRows`.
