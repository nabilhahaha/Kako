# Geo Intelligence & Territory Mapping — Future Platform Capability (roadmap)

**Status:** Roadmap / future platform capability only — **not started; document only. Do not implement now.** Recorded 2026-06-19.

## Objective
Provide **map-based visibility and territory intelligence** across customers, routes, coverage, and field execution — turning the platform's already-stored geo data and engines into a visual operating layer for managers and field teams.

## Phased vision

### Phase 1 — Customer Map
- Plot customers on a map from stored coordinates (`erp_customers.latitude/longitude`).
- **Filters:** master status (Active / At Risk / Inactive) · **A/B/C** classification (outlet grade) · Salesman · Route · Region.
- Click a pin → open **Customer 360** directly (`/customers?id=…`).

### Phase 2 — Coverage Map
- Overlays: **visited today · not visited · missed visits · under-covered · overdue** outlets.
- Backed by the Coverage & Journey-Plan engine's planned-vs-actual + coverage status.

### Phase 3 — Field Execution Map
- **Planned route** vs **actual route**; **off-route** + **unplanned** visits; **Smart-Next nearby** customers.
- Reuses visit/GPS data (`erp_visits`, `erp_visit_compliance`) + Smart-Next ranking.

### Phase 4 — Territory Intelligence
- **Coverage heatmap · white-space opportunities · territory balancing · route-optimization visualization · area/region performance overlays.**
- Reuses the route-optimization `territory` (split/merge) + optimizer + coverage rollups.

## Requirements (captured)
- **Reuse existing `latitude`/`longitude`** on customers (and route/visit GPS) where available.
- **Integrate with** the Coverage & Journey-Plan engine, **Smart-Next**, **Customer Health**, and **Coverage Status**.
- **Mobile + desktop** responsive views.

## Reuse posture (why this is mostly surfacing)
- Geo data exists: `erp_customers.latitude/longitude`, `erp_visits` GPS, `erp_visit_compliance` (off-route), `erp_routes`/`erp_route_customers`.
- Engines exist: Smart-Next (`van-sales/next-customer`), route-optimization (`optimize`/`territory`/`maps`), coverage KPI engine, outlet-grade (A/B/C), customer-health.
- The map layer is a **new visualization surface** over these; the data/logic is largely already present.

## Methodology (when scheduled)
Audit → architecture (map provider/licensing, clustering, mobile perf) → before/after → reuse analysis → phased plan → approval → small validated commits. Constraints: reuse-first; no business-logic / RLS / workflow change unless separately approved; performance-conscious (clustering, lazy tiles, no heavy client bundles).

## Sequencing
Naturally **follows / complements the Coverage & Journey-Plan engine** (which produces the coverage/route/plan truth the maps visualize). Phase 1 (Customer Map) is the smallest standalone start.

## Disposition
**Parked** as a future platform capability. Begins with an audit + architecture pass (map provider, clustering, mobile performance); nothing implemented until that design is reviewed and approved.
