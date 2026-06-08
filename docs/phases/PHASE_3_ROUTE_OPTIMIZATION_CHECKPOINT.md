# Phase 3 — Route Optimization & Territory Planning + Ownership History (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_ROUTE_OPTIMIZATION`, default OFF) ·
multi-tenant safe · mobile/offline & audit-first · reuse-first · no vendor lock-in ·
no hardcoded frequencies. An enterprise FMCG **route-intelligence** engine, not a
customer scheduler.

## Territory Ownership History (shared foundation)
- **`erp_ownership_history`** (0214) — generic, effective-dated ownership ledger for
  customer/route/salesman/supervisor/area/region. **Never overwritten**: a change closes
  the prior interval (`effective_to`) and opens a new one; a unique partial index enforces
  a single OPEN interval per (entity, owner dimension).
- Pure engine `src/lib/ownership/` — `ownerAt()` (point-in-time → execution-time KPI
  attribution), `currentOwner()`, `historyFor()`, `planOwnershipChange()` (non-overwriting),
  `findOverlaps()`. **Reused by Route Optimization, Route Riding, KPIs, and the Customer Timeline.**

## Route Optimization engine (`src/lib/route-optimization/`, 20 unit tests w/ ownership)
| Module | Capability |
|---|---|
| `frequency.ts` | Config-driven visit frequency (A/B/C/D defaults seeded; company-overridable) — **no hardcoded frequencies** |
| `optimize.ts` | Sequence optimization **reusing `journey-sort`** (nearest-neighbour + haversine) + total-travel/backtracking metrics |
| `balancing.ts` | Overloaded/underutilized/imbalance by customer count, sales value, call count, revenue, collection volume, travel time |
| `territory.ts` | City / area / **GPS-polygon** (ray-casting) membership + split (balanced) + merge planning |
| `maps.ts` | Google / Apple / Waze deep links (navigate, open-route) — **no vendor lock-in** |
| `route-types.ts` | Specialized prioritizers: collection (overdue/balance/PTP), van (capacity/demand/revenue), merch (OOS/MSL/Perfect-Store), riding (low-performer/new-joiner/low-compliance) |
| `generator.ts` | Weekly journey plan generation (frequency → days → optimized sequence) |
| `recommendations.ts` | Rule-based, explainable: route change, reassignment, territory split/merge, frequency change |
| `analytics.ts` | Salesman / supervisor / management route dashboards (efficiency, compliance, utilization, coverage gaps, revenue-by-route, optimization opportunities) |

## Schema (additive, RLS, FK-covering, idempotent)
- **0214** `erp_ownership_history`. **0215** `erp_territories`, `erp_territory_customers`,
  `erp_visit_frequency_rules` (+ seeded A/B/C/D platform defaults).

## Reuse (not rebuilt)
`journey-sort` (`distanceMeters`/`sortJourney`/`LatLng`), existing customer GPS
(`erp_customers.latitude/longitude`), `erp_journey_plans`, `erp_routes`, `erp_visits`,
`erp_regions`/`erp_areas`. Ownership ledger is the shared foundation for territory ownership.

## Requirement coverage
Customer master inputs (GPS/channel/classification/frequency/potential/priority/territory/
assignment — present or via this module) · optimization (distance/time/priority/frequency/
capacity) · daily/weekly/monthly via frequency intervals · balancing (6 metrics) · frequency
engine (A/B/C/D + custom) · journey generator (optimal sequence, minimize backtracking/dead
mileage) · GPS/map integration (Google/Apple/Waze + future) · route compliance (reuses visits/
day-close) · territory management (create/assign/split/merge/rebalance; city/area/polygon) ·
collection/van/merch/supervisor-riding optimization · AI recommendations · dashboards · FMCG
integration · **Territory Ownership History** (effective-dated, non-overwriting, execution-time
attribution) — all ✓.

## Validation
Typecheck 0 · build 0 · **1031 unit tests** (+20) · integration: route-optimization-schema (4)
+ schema-health FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Server actions + a Supabase ownership/territory gateway; map/route UI; persisted optimization
runs; wiring `ownerAt()` into the KPI snapshot for execution-time attribution.
