# Phase 7D — Route & Territory Intelligence (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_ROUTE_INTEL`, default OFF) ·
multi-tenant safe · reuse-first. Health scores + multi-level dashboards over operational history.

## Pure engine (`src/lib/route-intel/`, 5 unit tests)
| Module | Capability |
|---|---|
| `health.ts` | Composite **health score** (route/salesman/territory) from coverage · strike rate · adherence · call compliance · visit productivity — **reuses `perfectStorePillars`** (drop-null/renormalise/band); configurable weights |
| `dashboards.ts` | **Territory · Route · Salesman · Supervisor** dashboards (weakest-first ranking, team/territory rollups, coverage gaps, missed customers) |

## Schema (additive, RLS, FK-covering, idempotent)
- **0232** `erp_intel_health_snapshots` — per-entity (route/salesman/territory/supervisor)/period health score + components, unique per company/entity/period (trend).

## Reuse (not rebuilt)
`coverage/kpi.ts` + `coverage/scorecard.ts` · **`erp_rep_day_kpis` (0193)** snapshots · `perfectStorePillars` ·
route-optimization analytics/balancing (0214/0215) · **ownership ledger (0214)** for owner-at-execution attribution.

## Requirement coverage
Route Health Score · Salesman Health Score · Territory Health Score ✓ · coverage analysis · strike rate ·
visit productivity · route adherence · missed customers · call compliance (health components) ✓ · outputs:
Territory · Route · Salesman · Supervisor dashboards (read-models) ✓.

## Validation
Typecheck 0 · build 0 · **1129 unit tests** (+5) · integration: route-intel-schema (1) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
A health-snapshot cron (period rollup from `erp_rep_day_kpis` + coverage), attributed to owner-at-execution
via ownership; the four dashboard pages.

## Next: Phase 7E — Suggested Load & Demand Engine (final Phase-7 item; depends on sales/inventory/route/field data).
