# Phase 3 — Route Riding Excellence Module (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_ROUTE_RIDING`, default OFF) ·
multi-tenant safe · mobile/offline & audit-first · role-governance compatible ·
reuse-first. A dedicated FMCG **coaching + field-execution** module (not a visit field):
planning → execution → evaluation → scoring → coaching → acknowledgement → follow-up.

## Pure engines (`src/lib/route-riding/`, DB-free, 11 unit tests)
| Module | Capability |
|---|---|
| `flags.ts` | `KAKO_ROUTE_RIDING` (default OFF) |
| `types.ts` | RideType (coaching/evaluation/new_joiner/corrective_action/audit/regional_manager), RideStatus, criteria/evaluation/score/coaching/summary types |
| `scoring.ts` | **No hardcoded scores/rules** — criteria→category→overall weighted scoring, **reusing `perfectStorePillars`** (same drop-null/renormalise/band as Perfect Store + rep scorecard). Company category-weight overrides. Route-compliance score. |
| `lifecycle.ts` | Ride state machine + acknowledgement workflow (Supervisor → Salesman Review → Acknowledgement → Follow-up) |
| `analytics.ts` | Weakness heatmap, score evolution, improvement trend, training recommendation, **+ salesman / supervisor / area-manager / regional dashboard read-models** |

## Schema (additive, RLS, FK-covering, idempotent)
- **0212 `erp_route_ride_criteria`** — company-configurable evaluation criteria; `company_id NULL` = platform default catalog (readable by all tenants), **seeded** with the 25 default criteria across 6 categories (Sales Fundamentals, Sales Execution, Order Taking, Collections, Merchandising, Near Expiry). Companies override/extend.
- **0213** — `erp_route_rides` (plan + execution + scores + coaching + acknowledgement/review), `erp_route_ride_customers` (per-customer, **linked to the reused `erp_visits`**), `erp_route_ride_evaluations` (per-criterion, criterion **snapshotted** for audit-safety), `erp_route_ride_actions` (coaching action plan).

## Reuse (not rebuilt)
`erp_visits` (check-in/GPS/route/session), `erp_routes`, `erp_customers`, `erp_journey_plans`,
`perfectStorePillars`/`perfectStoreBand` (scoring + banding), `erp_gps_distance_m` (joint GPS),
polymorphic `erp_attachments` (ride/competitor photos via reference_type `route_ride`/`route_ride_customer`),
the `erp_rep_day_kpis` snapshot pattern (analytics feed supervisor KPIs).

## Requirement coverage
Planning (plan, date, supervisor/salesman/route/journey, planned customers/duration, **6 ride types**) ✓ ·
Execution (supervisor+salesman check-in, joint GPS, start/end/duration, planned/visited/missed, route
compliance; offline/mobile/photos via reuse) ✓ · Customer-level evaluation (all 6 categories' criteria,
seeded + company-configurable) ✓ · Scoring engine (overall/execution/sales/collection/merchandising/
route-compliance/coaching via category keys; weighted; company rules) ✓ · Coaching (strengths/weaknesses/
action plan with due date + responsible + follow-up) ✓ · Acknowledgement (salesman ack + comments,
supervisor comment, area/regional review) ✓ · Dashboards (salesman/supervisor/area/regional read-models)
✓ · Analytics (trend, improvement, weakness heatmap, training recommendation, score evolution) ✓ · FMCG
integration (journey/visits/collections/returns/near-expiry/merchandising via criteria categories + visit
links) ✓.

## Design rules honoured
Multi-tenant RLS · mobile/offline & audit-first · role-governance + company-override compatible (criteria
are per-company data) · additive only · **no hardcoded scores, no hardcoded FMCG rules** (criteria + weights
are company data) · reuses existing visit infrastructure.

## Validation
Typecheck 0 · build 0 · **1011 unit tests** (+11) · integration: route-riding-schema (4) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin UI increment)
Server actions + Next.js pages for the rider mobile flow (check-in → per-customer evaluation → coaching →
acknowledgement) and the four dashboards — thin wrappers over these engines + read-models. A Supabase
gateway for persistence. Optional: route-riding permission seeding + `erp_rep_day_kpis` extension for ride KPIs.
