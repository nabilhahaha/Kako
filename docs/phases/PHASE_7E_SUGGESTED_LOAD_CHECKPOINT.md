# Phase 7E — Suggested Load & Demand Engine (Checkpoint) + Phase 7 Complete

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_SUGGESTED_LOAD`, default OFF) ·
multi-tenant safe · reuse-first. The **final Phase-7 item** — forecast-based van loading.

## Pure engine (`src/lib/suggested-load/`, 5 unit tests)
| Module | Capability |
|---|---|
| `demand.ts` | Per-SKU route demand projection — **reuses the Phase-6B forecasting engine** (history × seasonality × promotion uplift × growth) × active-customer ratio |
| `load.ts` | Suggested load (ceil(demand×(1+buffer) − on-van)) · replenishment recommendations (biggest gap first) · van utilization vs capacity (units/weight/volume) |

## Schema (additive, RLS, FK-covering, idempotent)
- **0233** `erp_suggested_loads` (header: route/van/day, total + utilization, status) · `erp_suggested_load_lines` (per-SKU projected demand / current stock / suggested load).

## Reuse (not rebuilt)
`commercial/forecasting` (`forecastFromHistory`, 6B) · van load manifest (0194) · journey plans (0129) · OOS history.

## Requirement coverage
Suggested Van Load · Suggested Replenishment · Forecast-Based Loading · Seasonality Adjustments ·
Customer Consumption (active-customer ratio) · Route Demand Prediction ✓ · inputs (historical sales,
active customers, seasonality, promotions/trade-spend uplift, OOS history) ✓ · outputs: Suggested Load
Sheet · Replenishment Recommendations · Van Utilization Report (read-models) ✓.

## Validation
Typecheck 0 · build 0 · **1134 unit tests** (+5) · integration: suggested-load-schema (2) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

---

# Phase 7 — COMPLETE ✅ (order 7A → 7B → 7C → 7D → 7E)
| Sub-phase | Module | Migrations | Flag |
|---|---|---|---|
| 7A | Route Accounting & Van Operations | 0229 | KAKO_VAN_ACCOUNTING |
| 7B | Mobile Field App — offline sync foundation | 0230 | KAKO_MOBILE |
| 7C | Configurable Perfect Store Engine | 0231 | KAKO_PERFECT_STORE |
| 7D | Route & Territory Intelligence | 0232 | KAKO_ROUTE_INTEL |
| 7E | Suggested Load & Demand Engine | 0233 | KAKO_SUGGESTED_LOAD |

All engine-first, additive, flag-gated OFF, RLS, FK-covering, integration-tested, reuse-first.

## Roadmap status after Phase 7
- **Phase 8** (8A–8J) — architecture proposal merged; **awaiting approval** before implementation
  (recommended order 8A→8E→8D→8F→8C→8B→8G→8J→8I→8H).
- **Platform-Wide Drag-and-Drop Framework** — backlog (prerequisite for 8B Dashboard Builder).
- **Pre-pilot hardening** (audit retention, temp-access sweep, alerting, structured logging,
  governance enforcement, formal security review) — on the pre-pilot roadmap.
- **Thin UI/wiring follow-ups** for the engine-first Phase 3–7 modules (server actions, pages,
  GL postings, crons, mobile PWA shell + intake).
