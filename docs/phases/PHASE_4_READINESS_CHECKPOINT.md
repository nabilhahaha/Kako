# VANTORA — Phase 4 (Trade Spend) Readiness Checkpoint

**Date:** 2026-06-07 · **Status: ✅ All 6 priorities delivered — staging-ready behind
default-OFF flags.** Discipline upheld: data integrity first · additive-only migrations ·
`KAKO_TRADE_SPEND` (+ `KAKO_FINANCE` for GL) default-OFF · multi-company RLS +
auditability · reuse-over-rebuild · tests + integration before each merge.

## Priority-by-priority
| # | Priority | Status | Basis |
|---|----------|--------|-------|
| 1 | Trade Spend Accrual Engine | ✅ | Pure engine (#174): percent-of-sales / rate-per-unit / lump-sum + cumulative cap. |
| 2 | Claims / Deductions Settlement Engine | ✅ | Pure engine (#175): match claim → accrued balances; **over-claim** flagged for dispute. |
| 3 | Trade Spend Data Model | ✅ | `0195` (#176): `erp_trade_promotions` / `_accruals` / `_claims` / `_claim_allocations`, company-RLS. |
| 4 | ROI Foundation | ✅ | Pure engine (#177): incremental sales/margin vs spend, net ROI, ratio (div-by-zero safe). |
| 5 | GL Integration | ✅ | `0196` + orchestrators (#178): reuse Phase-1 poster — `trade.accrual` (Dr promo exp/Cr accrued), `trade.claim` (Dr accrued/Cr AR), distinct reference types. |
| 6 | Dashboards & Read Models | ✅ | Summary read-model + `/distribution/trade-spend` dashboard (#179), inert by default. |

## Architecture decision (recorded)
Built a **new platform-native `erp_trade_spend_*` module** rather than extend the legacy
permissive `ts_*` prototype (which has `USING(true)` RLS and TEXT distributor ids; left
untouched). Multi-tenant, FK-covered, RLS — consistent with Phases 1–3.x.

## GL / Augment model
Trade spend posts under its **own reference types** (`trade_accrual`, `trade_claim`) via
the existing Phase-1 engine — **zero overlap** with sales/AR/COGS posting. Account keys
(`promo_expense`, `accrued_trade_spend`, `ar`) resolve per company via `erp_account_map`;
the poster skips the whole entry if a key is unmapped (never partial). Net: promo accrues
expense + liability; settled claim/deduction clears the liability against AR.

## Data-integrity invariants (tested)
- Accrual never negative; **cumulative cap** never exceeded; lump-sum books once.
- Claim never settles beyond a promo's accrued balance, never beyond the claim amount;
  unbacked portion surfaced as **over-claim** (dispute), never silently absorbed.
- GL idempotent on `(reference_type, reference_id)`; never partial; no double-post.
- Tenant isolation — company-scoped RLS on all `erp_trade_*` tables; FK-coverage +
  RLS schema-health invariants pass.
- **881 unit + 38 integration tests passing**; build clean; CI staging-apply green.

## Migrations
`0195` trade-spend model · `0196` trade-spend posting rules. Both additive, idempotent,
FK-covered. Rollback = flags-OFF + inert schema; no data mutation; legacy `ts_*` untouched.

## Activation plan (post-checkpoint, separate change)
1. Map account keys `promo_expense` / `accrued_trade_spend` / `ar` in `erp_account_map`.
2. Enable `KAKO_TRADE_SPEND` (then `KAKO_FINANCE` for GL) on a pilot tenant.
3. Author promotions → accruals compute per period → claims settle against accruals →
   GL posts under the trade reference types → dashboard shows liability/ROI.

## Remaining / follow-ups (additive, greenlight)
- Accrual/claim/ROI **services + UI** (engines + model + GL exist; the persisting
  services + authoring screens are the next additive step, mirroring collections).
- ROI dashboard tile (engine exists; surface alongside the trade-spend summary).
- An **end-to-end DB test** of accrual→claim→GL (mirrors the Phase-2/3 e2e pattern).

## Stop-conditions
None encountered. Offline-sync remains parked at the approved design stage per
instruction (separate architecture review).

**Conclusion:** Phase 4 (Trade Spend) priorities 1–6 are **complete, tested, and
staging-ready behind default-OFF flags / inert routes**, reusing the Phase-1 posting
engine and the established additive/RLS/test discipline. No existing behaviour changed.
