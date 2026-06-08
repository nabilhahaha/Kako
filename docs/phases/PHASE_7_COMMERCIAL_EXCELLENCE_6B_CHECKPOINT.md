# Phase 7 — Commercial Excellence 6B: Targets / Forecasting / Master Data Governance (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_COMMERCIAL`, default OFF) ·
multi-tenant safe · audit-first · reuse-first. Completes the Commercial Decision Platform.

## Pure engines (`src/lib/commercial/`, 16 unit tests w/ 6A)
| Module | Capability |
|---|---|
| `targets/engine.ts` | Multi-dimensional targets (value/volume/coverage/collections/distribution/brand/SKU/customer/route) × levels (salesman→regional/branch/region); achievement + gap + required run-rate + **run-rate forecast** + status |
| `forecasting/engine.ts` | Forecast from history × drivers (seasonality / promotion uplift / distribution growth); accuracy metrics **MAPE / WAPE / bias / variance / accuracy%** |
| `mdg/engine.ts` | Generic change-request workflow (draft→submitted→under_review→approved/rejected) over governed entities (customer/product/route/territory/price/vat/gps/supplier); configurable approval chain; immutable audit entry |

## Schema (additive, RLS, FK-covering, idempotent)
- **0224 `erp_forecasts`** — multi-type demand forecasts + drivers + actuals (accuracy).
- **0225 `erp_mdg_change_requests`** (workflow) + `erp_mdg_audit_log` (**immutable** — SELECT+INSERT only).

## Reuse (not rebuilt)
`erp_targets` (0139) for target storage/achievement RPC; customer-approval (0109) + field-governance
(0114) patterns generalized by MDG; attribution + invoices feed forecasting actuals.

## Requirement coverage (Modules 4–6)
Targets: 9 target types × 6 levels · achievement (actual/target/%/gap/forecast) ✓.
Forecasting: 5 forecast types · drivers (historical/seasonality/promo uplift/new listings/distribution
growth/market expansion) · metrics (accuracy/bias/variance/MAPE/WAPE) ✓.
MDG: 8 governed entities · create/review/approve/reject · configurable approval chain · audit
(old/new/by/approval-by/timestamp/reason) ✓.

## Validation
Typecheck 0 · build 0 · **1081 unit tests** (+7) · integration: commercial-6b-schema (3, incl. MDG audit
immutability) + schema-health green · migrations apply + idempotent.

## Commercial Excellence complete
6A (pricing/credit/profitability) + 6B (targets/forecasting/MDG) — VANTORA now spans pricing, credit,
profitability, targets, forecasting, and master-data governance as a Commercial Decision Platform.
