# Phase 7A — Route Accounting & Van Operations (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_VAN_ACCOUNTING`, default OFF) ·
multi-tenant safe · audit-first · reuse-first. The operational foundation of van/route
distribution (first of Phase 7, order 7A→7B→7C→7D→7E).

## Pure engine (`src/lib/van-accounting/`, 6 unit tests)
| Module | Capability |
|---|---|
| `cash.ts` | **Cash reconciliation** — expected = opening + cash sales + collections − returns − expenses; variance → shortage/overage/balanced (driver accountability) |
| `inventory.ts` | **Van inventory reconciliation** — per-SKU expected = opening + loaded + transfers-in − transfers-out − sold + returns-in; valued variance (shortage/overage) |
| `profitability.ts` | **Route P&L** — revenue − COGS − expenses − return cost − inventory shortage → gross/net + margins |
| `statement.ts` | **Van statement** assembly → the five reports (Van Statement · Day Close · Cash Recon · Inventory Recon · Route Profitability); P&L auto-absorbs reconciliation shortage |

## Schema (additive, RLS, FK-covering, idempotent)
- **0229** `erp_van_opening_balances` · `erp_van_expense_categories` (+6 seeded defaults, company-configurable) · `erp_van_expenses` · `erp_van_cash_reconciliations` · `erp_van_day_settlements` (statement + route-P&L snapshot).

## Reuse (not rebuilt)
Van load manifest (0194) · van transfers (0133) · **van inventory reconciliation (0138)** · day-close
(0132, `erp_work_sessions`) · collections (0192) · returns (0219) · `erp_stock_movements` + van
warehouses (0128) · GL poster (Phase 1).

## Scope review (the 13 capabilities)
Reused: Van Load, Van Inventory, Van Transfers, Sales, Collections, Returns, Inventory Reconciliation,
Day Close. **Net-new this phase:** Van Opening Balance, Van Unload (via reconciliation), Expenses, Cash
Reconciliation, Route Profitability + the van statement.

## Identified FMCG gaps (catalogued; not all in 7A)
Driver/salesman **cash settlement + shortage/overage accountability** (built — cash recon + variance) ·
**returnable assets / empties** (crates/bottles) — backlog · pre-sales vs van-sales distinction — backlog ·
route-settlement **approval workflow** (reuse Workflow OS) — backlog · damaged/expired segregation on unload
(reasons exist).

## Validation
Typecheck 0 · build 0 · **1108 unit tests** (+6) · integration: van-accounting-schema (3) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Server actions + Supabase gateway; opening-balance/expense/cash-count capture (a **7B mobile** surface);
GL posting of expenses + variances (reuse poster, distinct reference types, under `KAKO_FINANCE`); the five
report pages.

## Next: Phase 7B — Mobile Field App (offline-first; depends on this route-execution foundation).
