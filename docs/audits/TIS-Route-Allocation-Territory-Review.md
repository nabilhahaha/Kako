# TIS — Route Allocation & Territory Design Review

**Scenario reviewed:** 6,000 customers · entire Saudi Arabia · 40 requested routes.
**Method:** traced from code (`src/lib/tis/optimize-routes.ts`). **No implementation.**
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19

---

## 1. Current logic — step by step (what `balanceRoutes` actually does)

1. **Resolve K** — `resolveRouteCount`: explicit `routeCount=40` wins (capped at N).
2. **Partition into territories** — `clusterTerritories`: a **0.4° grid (~44 km cells)** +
   union-find on 8-neighbour adjacency. Contiguous cells = one territory; clusters that
   are not cell-adjacent (gap ≥ 1 empty cell, ~> 88 km) never merge. **Pure geography —
   business Region/City labels are NOT used.**
3. **Attach geo-less customers** to the largest territory (no location ⇒ can't break geo).
4. **Allocate K across territories ∝ workload**:
   `kp = max(1, min(round(K · territoryWorkload / totalWorkload), territorySize))` — i.e.
   each territory gets routes proportional to its workload, **minimum 1**.
5. **Within each territory** (`balanceWithin`):
   a. **Seed** — `pickSeeds`: farthest-point sampling of `kp` seeds among the territory's
      geo customers (spreads seeds apart).
   b. **Cluster** — each customer → **nearest seed** (respecting `maxPerRoute`), else the
      lightest open route (≈ a Voronoi partition).
   c. **Geo-less** → lightest route.
   d. **Workload rebalance** — greedy: repeatedly move the **lightest-workload** customer
      from the heaviest route to the lightest **if it reduces the spread** (now confined to
      the territory, so it can't cross cities).
   e. **Day assignment** — spread each route's customers across the working days,
      **balanced by workload** (heaviest-first → lightest day-bin).
6. **Sequencing** — **not part of allocation.** A nearest-neighbour tour (`optimizeRoute`
   → `journey-sort`) is computed only inside `scenarioMetrics` to report distance; the
   route's drive order is not stored on the plan.

---

## 2. Order of operations

**Current:** resolve K → **partition by territory (geo)** → **allocate K per territory ∝
workload** → **cluster within territory (geo seeds)** → **workload rebalance (within
territory)** → **day assignment**. Sequencing is a separate metric, not a plan step.

This **matches** your expected order (allocate per territory → cluster → balance →
sequence) **with two caveats**: (a) "city/territory" = a **geo grid cluster**, not the
business **Country→Region→City** hierarchy; (b) **sequencing is not integrated** into the
produced plan (only used to compute the distance metric).

---

## 3. Factors affecting allocation — exact weighting

| Stage | Factor used | Weighting |
| :--- | :--- | :--- |
| Territory partition | **Geography only** (grid cells) | Hard boundary, no weight |
| Routes per territory | **Workload** (the `balanceBy` dimension) | ∝ workload, min 1 |
| Within-territory clustering | **Distance** (nearest farthest-point seed) | Pure nearest |
| Rebalance | **Workload** (`balanceBy`) | Equalize spread |
| Caps | `maxPerRoute` (count), `maxVisitsPerDay`+`workingDays` (→ K when no explicit count) | Hard |

`balanceBy ∈ { workload (= visits/week from frequency), value (sales), count }` — **one
dimension at a time, never a weighted blend.**

**NOT currently used in allocation:** **visit duration** (resolver exists but is *not* in
the balancer), **distance as a balance metric** (computed for reporting only), **density**,
**territory size** (beyond cluster membership), **travel/drive time**, **road network**.

---

## 4. Remote / highway / outlier handling

- A customer far from any city sits in an **isolated grid cell → its own territory →
  forced ≥ 1 route**. So a lone highway outlet becomes a **1-customer route**.
- **High-value remote** customer: same — value does **not** pull it into a city; it forms
  (or joins) an isolated territory.
- `validatePlanGeography` **flags** outliers (> 2× the route's mean centroid distance and
  > 25 km) and route radius, but the **allocator does not absorb, merge, or corridor-handle
  them** — they either spawn a singleton route or inflate a route's radius.
- **Risk (High):** with many scattered remote customers, the **min-1-per-territory** rule
  can produce **far more routes than the 40 requested** (e.g., 40 asked → 55 produced).

---

## 5. Intra-city compactness (Jeddah → 12 routes)

- Within the Jeddah territory, 12 **farthest-point seeds** + **nearest-seed** assignment
  give a compact *initial* Voronoi partition (north/south/east tend to separate).
- **But the workload rebalance (5d) then moves boundary customers between routes purely to
  equalize workload — by workload, not adjacency.** It therefore **can** move a north-Jeddah
  customer onto a south-Jeddah route if that balances load. **Intra-city compactness is NOT
  guaranteed.**
- The hard geographic constraint is at **city level only**, not at **intra-city sub-zone /
  district** level. So **north / south / east Jeddah can still mix inside one route.**
- Also: **day assignment is workload-balanced, not geographic** — a route's Monday stops
  can be scattered across the whole city (a real FMCG anti-pattern; a day should be a
  compact sub-area).

---

## 6. Route Quality Framework (present vs proposed)

| Metric | Status | Source / definition |
| :--- | :--- | :--- |
| **Territory consistency** (cities/route) | ✅ Present | `validatePlanGeography.routes[].cities` (1 = clean) |
| **Route radius** (km) | ✅ Present | max distance from route centroid |
| **Outlier count** | ✅ Present | > 2× mean centroid dist & > 25 km |
| **Workload balance** | ✅ Present | `routeBalancePct` (CV of per-route workload) |
| **Compactness score** | ❌ Missing | proposed: `1 − (radius / cityRadius)` or avg-stop / radius (0–100) |
| **Average stop distance** | ❌ Missing | proposed: mean nearest-neighbour leg along the sequenced route |
| **Intra-city sub-zone consistency** | ❌ Missing | proposed: districts/sectors per route (1 = clean) |
| **Per-day compactness** | ❌ Missing | proposed: radius of each (route, day) bucket |

Recommendation: extend `validatePlanGeography` into a **`routeQuality()`** that adds
compactness, avg-stop distance, per-day radius, and an overall **0–100 quality score** per
route and per plan.

---

## 7. Gaps vs a real FMCG supervisor's expectation

| # | Gap | Why it matters |
| :-- | :--- | :--- |
| G1 | **Geo-grid territories, not business Region/City** | Supervisors think Country→Region→City→District; grid clusters don't map to named territories, and dense corridors can chain two cities into one. |
| G2 | **Intra-city compactness not guaranteed** (rebalance mixes districts) | A Jeddah route can span north+south → unrealistic driving. |
| G3 | **Min-1-per-territory over-fragments** | 40 requested can balloon; singleton remote routes are uneconomic. |
| G4 | **Remote/outlier customers not absorbed** | No "join nearest city within X km" or highway-corridor logic. |
| G5 | **Single-factor balancing (visits OR value OR count)** | Real load = frequency × duration + travel; duration & drive-time ignored. |
| G6 | **Day assignment ignores geography** | A salesman's day should be a compact sub-area, not scattered. |
| G7 | **Sequencing not in the plan** | No drive-ordered route, no 2-opt; distance is only a report. |
| G8 | **No density / road-network awareness** | Straight-line (haversine) only; ignores barriers, one-ways, real travel. |

---

## Limitations (summary)
Geography is enforced at **city level by grid**, not by business hierarchy or intra-city
sub-zones; balancing is **single-factor**; **remote points fragment** the plan; **days and
sequence are not geographic**; **visit duration / drive time** are not in the math.

## Risks
- **R-A (High):** route count **exceeds the requested 40** when remote customers fragment.
- **R-B (High):** **intra-city mixing** (north/south Jeddah in one route) → field rejection.
- **R-C (Med):** **corridor chaining** can merge two near cities (e.g., dense Jeddah–Makkah).
- **R-D (Med):** **uneconomic singleton routes** for high-value remote outlets.
- **R-E (Low):** distances are straight-line, not drive-time.

## Recommended improvements (priority order)
1. **P1 — Cap & absorb fragmentation:** merge small/singleton territories into the nearest
   territory within a threshold; never exceed requested K (or surface "K raised to N for
   geography" explicitly). Fixes R-A, R-D.
2. **P1 — Intra-city compactness:** make the within-territory rebalance **distance-aware**
   (only move a customer to an *adjacent* route, or penalise moves that increase route
   radius), or sub-cluster the city into K compact zones first and balance within zones.
   Fixes R-B.
3. **P2 — Business hierarchy option:** allow partition by **Region/City IDs** when present,
   with the geo grid as the safety net (prevents corridor chaining). Fixes G1, R-C.
4. **P2 — `routeQuality()` framework:** compactness score, avg-stop distance, per-day
   radius, 0–100 score (Q6) — surfaced in the validation report.
5. **P3 — Geographic day assignment:** bucket each route's days by sub-area, not just
   workload. Fixes G6.
6. **P3 — Multi-factor load:** fold **visit duration** (and later drive time) into the
   balance dimension. Fixes G5.
7. **P4 — Integrated sequencing / 2-opt** in the plan output. Fixes G7.

**Do not implement yet** — this is the review. On approval, P1 items (fragmentation cap +
intra-city compactness) are the highest-value, lowest-risk first steps and align with the
geography-hard-constraint work already shipped.
