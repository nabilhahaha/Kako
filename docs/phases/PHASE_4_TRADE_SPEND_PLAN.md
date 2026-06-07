# VANTORA — Phase 4 (Trade Spend) Kickoff Plan

**Date:** 2026-06-07 · **Status:** in progress · **Discipline:** data integrity first ·
additive-only migrations · flag OFF by default (`KAKO_TRADE_SPEND`) · multi-company RLS +
auditability · reuse-over-rebuild · tests + integration before each merge.

## Decision: build `erp_trade_spend_*` (not extend legacy `ts_*`)
A legacy standalone prototype exists (`ts_distributors`/`ts_campaigns`/`ts_spend_types`…)
with **permissive `USING(true)` RLS** and TEXT distributor ids — its own comment says
*"Phase 4 will add proper RLS."* It is **not** the multi-tenant `erp_` platform model.
Phase 4 therefore builds a **new `erp_trade_spend_*` module** on platform conventions
(company/branch-scoped RLS via `erp_user_branch_ids()`/company, FK-covered, additive),
reusing the legacy only for domain concepts. Legacy `ts_*` is left untouched (additive).

## Increment plan (dependency order)
1. **Accrual engine (pure)** ← *this increment.* percent-of-sales / rate-per-unit /
   lump-sum, cumulative cap. `KAKO_TRADE_SPEND` (OFF).
2. **Claims / deductions settlement engine (pure)** — match a customer claim/deduction
   against accrued promo balance (full/partial/over-claim hold), mirroring the
   3-way-match + collection-allocation engines.
3. **Trade-spend data model** — `erp_trade_promotions` (terms, period, cap, status),
   `erp_trade_accruals` (period accrual ledger), `erp_trade_claims` + allocations
   (claim→promo settlement). Additive, RLS, FK-covered, inert.
4. **ROI foundation** — pure ROI engine (incremental sales/margin vs spend) + read-model.
5. **GL integration** — reuse the Phase-1 posting engine under distinct reference types:
   accrual → Dr promo expense / Cr accrued trade-spend; claim settlement → Dr accrued /
   Cr AR (deduction) or cash. Seeded posting rules; flag-gated; zero double-post.
6. **Dashboards & read models** — promo spend vs budget, accrual liability, claims
   aging, ROI — reusing the StatCard/dashboard + snapshot patterns from Phase 3.x.

## Safety / boundary
- Finance core untouched; GL via the existing engine with new reference types.
- Additive migrations only; no change to existing sales/AR/legacy ts_* behaviour.
- Compatible with Role-Governance, Data-Portability, Country-Compliance foundations
  (tenant-scoped, additive). Offline-sync stays at design stage (separate review).
