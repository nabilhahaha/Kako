# Phase 7 — Commercial Excellence 6A: Pricing / Credit / Profitability (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_COMMERCIAL`, default OFF) ·
multi-tenant safe · audit-first · effective-dated · reuse-first. First of two
Commercial-Excellence increments transforming VANTORA into a Commercial Decision Platform.

## Pure engines (`src/lib/commercial/`, 9 unit tests)
| Module | Capability |
|---|---|
| `pricing/engine.ts` | 15 price **sources** · company-configurable **priority** (no hardcoded order) · rule kinds (fixed/discount/%/quantity-break/value-break/tiered/time/seasonal) · effective-dated validity · `resolvePrice` walks priority → first valid rule → fallback base |
| `credit/engine.ts` | **Aging buckets** (current/30/60/90/120/180+) · available/used/remaining credit · **customer risk score** · **order-blocking** (hard/soft/warning/approval) from configurable triggers (limit exceeded/overdue/high-risk/collection issue), most-restrictive-wins |
| `profitability/engine.ts` | Customer **P&L** (revenue − full cost stack: COGS/discounts/free goods/trade spend/visibility/listing/promotion/collection/return/near-expiry/incentives/commissions) → GP, net profit, margins, ROI, **cost-to-serve**, profit per invoice/route + top/worst ranking |

## Schema (additive, RLS, FK-covering, idempotent)
- **0221** `erp_pricing_rules` (source-typed, effective-dated) + `erp_pricing_priority` (company order) + `erp_price_change_requests` (approval + temporary/emergency override).
- **0222** `erp_customer_credit_profiles` (classification/risk/credit-days) + `erp_credit_block_rules` (company trigger→mode policy).
- **0223** `erp_customer_profitability` (per-customer/period snapshot with cost breakdown).

## Reuse (not rebuilt)
Existing pricing (0106), credit-limit + request workflow (0026/0141), `erp_customers`
(credit_limit/balance), `erp_products_catalog`; profitability consumes the attribution ledger + invoices.

## Requirement coverage (Modules 1–3)
Pricing: 15 sources · configurable priority · 8 rule kinds · validity + history · price approval/override ✓.
Credit: profile (limit/days/classification/risk) · available/used/remaining · 6 aging buckets · 4 block modes
× 4 triggers · approval workflow (reuses 0141) ✓.
Profitability: full revenue+cost stack · GP/NP/%/ROI/cost-to-serve · profit per customer/invoice/route ·
customer P&L + contribution + top/worst ✓.

## Validation
Typecheck 0 · build 0 · **1074 unit tests** (+9) · integration: commercial-6a-schema (2) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Next
Commercial Excellence 6B — Targets (multi-dimensional) · Forecasting (accuracy/bias/MAPE/WAPE) ·
Master Data Governance (generic entity change-requests + data-steward workflow).
