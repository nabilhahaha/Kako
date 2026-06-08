# Phase 4+ — Enterprise Promotion / Trade Spend / Incentive / Commission Platform (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_PROMOTIONS`, default OFF) ·
multi-tenant safe · Workflow-OS + role-governance compatible · reuse-first. Promotions
as a full lifecycle (planning → budgeting → approval → execution → funding → incentives →
claims → ROI → settlement), **not discounts**. Extends the Phase-4 trade-spend foundation.

## Pure engines (`src/lib/promotion/`, 10 unit tests)
| Module | Capability |
|---|---|
| `free-goods.ts` | Buy-X-get-Y / 10+1 / tiered free goods + **proportional free-goods reversal** (for returns) |
| `funding.ts` | Funding split (supplier/company/distributor; 100, 50/50, custom %) + validation + **proportional reversal** |
| `incentives.ts` | **Unlimited incentive layers** (per-role; fixed or achievement-scaled) + reversal |
| `commission.ts` | Fixed / percentage / tiered / achievement commission + **adjustment/reversal** on return/discount |
| `budget.ts` | Annual/quarterly/monthly budgets; planned/committed/actual/remaining; **overspend prevention** |
| `calendar.ts` | **Overlapping-promotion detection** (per scope) + promotion calendar |
| `closure.ts` | Automatic **closure report** (before/during/after sales·volume·GP, incremental, ROI, payback, cost ratios, claims, incentives, commissions) — **reuses `trade-spend/roi`** |

## Schema (additive, RLS, FK-covering, idempotent)
- **0217** — augments `erp_trade_promotions` (code/description/promo_type/funding_model + full status lifecycle: draft→pending_approval→approved→active→expired→cancelled→closed); adds `erp_promotion_targets` (polymorphic: customers/employees/products/documents/time), `erp_promotion_funding` (multi-source split), `erp_promotion_budgets` (annual/quarterly/monthly).
- **0218** — `erp_incentive_programs` + `erp_incentive_layers` (unlimited per-role layers), `erp_commission_rules` (scoped, configurable), `erp_promotion_requests` (salesman-raised, routed via Workflow OS).

## Reuse (not rebuilt)
`erp_trade_promotions` + `trade-spend` engines (`accrual`/`claims`/`roi`/`summary`/`gl`),
Workflow OS (request approval), `erp_suppliers` (funding source), GL poster (claims/accruals).

## Requirement coverage
Promotion master (code/name/dates/status lifecycle + overlap detection + calendar) ✓ · targeting
(customers/groups/classification/channel/region/city/route/employees/products/brand/category/
documents/time/seasonal) ✓ · promotion types (price/free-goods/volume/distribution/execution/
collection — engines for free-goods + volume tiers) ✓ · funding (supplier/company/distributor/
shared + splits) ✓ · **unlimited incentive layers** ✓ · commission engine (6 rule kinds, scoped) ✓ ·
request workflow (Workflow OS) ✓ · ROI engine (reused) ✓ · budget control (prevent overspend) ✓ ·
automatic closure report (PDF/Excel/dashboard payload) ✓.

## Validation
Typecheck 0 · build 0 · **1048 unit tests** (+10) · integration: promotion-platform-schema (3) +
schema-health FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Server actions + Supabase gateways; promotion-request Workflow-OS wiring; effectiveness ranking
read-model; closure-report PDF/Excel renderers; claims attachment via `erp_attachments`.
The Returns reconciliation engine (next) consumes `free-goods`/`funding`/`incentives`/`commission` reversals.
