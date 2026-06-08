# Phase 4+ — Enterprise Returns, Credit Notes & Promotion Reconciliation (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_RETURNS`, default OFF) ·
multi-tenant safe · audit-first · Workflow-OS compatible · reuse-first. Returns
preserve the **commercial reality** of the original sale — promotions, free goods,
discounts, trade spend, incentives, commissions reversed **proportionally**.

## Pure engine (`src/lib/returns/`, 8 unit tests)
| Module | Capability |
|---|---|
| `policy.ts` | Company-configurable creation controls (from-invoice-only / manual-with-approval / manual-without-approval / block-unknown) → allowed + requiresApproval |
| `reconciliation.ts` | **Core**: reverses free goods / discount / **funding** / **incentives** / **commission** proportionally — **REUSES the promotion reversal engines** (`free-goods`/`funding`/`incentives`/`commission`) |
| `validation.ts` | Errors (qty > sold, exceeds invoice) + warnings (never purchased, exceeds history, promotion mismatch) |
| `credit-note.ts` | Builds credit-note draft (amount + promotion/incentive/commission adjustments) linked to invoice + return |
| `analytics.ts` | Return analytics (by customer/SKU/brand/salesman/route/region/reason) + near-expiry recovery analytics |

## Schema (additive, RLS, FK-covering, idempotent)
- **0219** — augments `erp_sales_returns` (return_type, creation_mode, reason_id, promotion_id, free_qty_returned, discount/funding/incentive/commission reversal, credit_note_number, net_return_value, approval_stage) and `erp_sales_return_lines` (original_invoice_line_id, sold/free quantities, discount, promotion, reversal/net value); adds `erp_return_policies` (company config) + `erp_credit_notes`.

## Reuse (not rebuilt)
**Promotion reversal engines** (`@/lib/promotion`: `freeGoodsReversal`, `reverseFunding`,
`reverseIncentives`, `commissionAdjustment`), `erp_sales_returns`/`_lines` (0005),
`erp_return_reasons` (0140), `erp_trade_promotions` (0195), `erp_invoice_lines`.

## Requirement coverage
Creation modes (from-invoice / manual / exception) + company policy controls ✓ · promotion reversal
(free goods proportional: 100→20 ⇒ 2 free; 200→50 ⇒ 5 free) ✓ · discount/trade-spend/incentive/
commission reversal proportionally ✓ · configurable reasons (reuses 0140) ✓ · approval workflow
(stage + Workflow OS) ✓ · validation + warnings ✓ · exception process (approval/reason/audit) ✓ ·
credit-note engine (with adjustments, linked) ✓ · return analytics + near-expiry analytics ✓ ·
raw-data fields (all on the augmented tables) ✓.

## Validation
Typecheck 0 · build 0 · **1056 unit tests** (+8) · integration: returns-reconciliation-schema (3) +
schema-health FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Server actions + Supabase gateway; credit-note numbering + GL posting (reuse poster); return
Workflow-OS wiring; return photos via `erp_attachments`; dashboards over the analytics read-models.
The Attribution/Traceability layer (next) explains these reversals end-to-end.
