# FMCG Pack #1 (Field Execution) — Pilot Deployment Plan + FE-5 Scope

Scope: a controlled field pilot of FE-1→FE-4 (visits, geofence, routes/coverage,
in-visit capture, scoring, dashboards), run **online-first, in parallel with FE-5**.
Grounded in the shipped `field_ops` capability (module, permissions, settings,
functions, dashboards).

---

## A. Pilot Deployment Plan

### 1. Recommended pilot team size
- **1 pilot owner / sales manager** (watches dashboards, signs off).
- **1 supervisor / planner** (builds + publishes routes, runs Close-day).
- **4–6 field reps** across **1–2 routes**, covering **~300–600 customers** total.
- **1 admin** (tenant config: module, permissions, settings).
Small enough to support hands-on, large enough to exercise routes, frequencies,
coverage and multi-rep dashboards.

### 2. Recommended pilot duration
**4 weeks** = ~1 week ramp/config + 3 weeks steady run. Rationale: weekly and
bi-weekly/monthly call patterns need ≥4 weeks to validate coverage, **frequency
adherence** and weekly/monthly rollups; 3 steady weeks give a trend.

### 3. Recommended pilot success criteria (exit gates)
| Area | Target |
|---|---|
| Sync integrity | **0** lost or **duplicate** visits (idempotency holds); pending→synced within reconnect |
| Coverage | ≥ **company target %** (default 80) of planned stops on covered days |
| Geofence | ≥ **90%** of check-ins resolve a status; violations reviewed by a manager |
| Capture adoption | ≥ **1 merchandising + targeted captures** per planned visit |
| Data completeness | Required fields present on ≥ **95%** of captures |
| Rep adoption | ≥ **80%** of planned reps active daily |
| Manager value | Manager confirms dashboards are **actionable** (coverage, missed, scores) |
| Stability | No RLS/tenant-isolation or data-integrity incident |

### 4. Required master data before pilot
- **Customers** with **GPS coordinates** (`erp_customers.latitude/longitude`) — geofence
  is advisory-blind without them; **route assignment** (`route_id`) and **owner**
  (`salesman_id`).
- **Routes** (`erp_routes`) with a **rep** (`rep_id`) each.
- **Customer frequencies** (`erp_fe_customer_frequency`) for every piloted customer.
- **FE settings** (`erp_fe_settings`) per company.
- *(Optional)* product reference list for OOS/competitor text fields.
> Note: customers missing coordinates can capture GPS on the **first visit**
> (a `set_gps` form / future map edit); flag these for day-1 cleanup.

### 5. Required user roles and permissions (Permission Matrix)
Access is **permission-driven**, not title-driven. Map personas → grants:
| Persona | field_ops grants | Per-type capture |
|---|---|---|
| Rep / Merchandiser | `view`, `execute` | the capture types they perform (e.g. `fe_merchandising:execute`, `fe_competitor:execute`) or the `execute` umbrella |
| Supervisor / Planner | `view`, `plan` | as needed |
| Sales / Area Manager | `view`, `dashboard`, `approve` | (review only) |
| Admin | (all) | (all) |
Grant via the matrix so the launcher + actions adapt automatically.

### 6. Required geofence setup (`erp_fe_settings`)
- `geofence_mode = advisory` (recommended for pilot — never blocks).
- `geofence_radius_m`: **100–120 m urban**, **250–400 m** rural/large compounds.
- `geofence_photo_threshold_m`: distance beyond which an exception photo is asked
  (e.g. 300–500 m).
- `coverage_target_pct`: 80 (tune per route).
Verify a handful of customers' coordinates by test check-in before go-live.

### 7. Required customer frequency setup (`erp_fe_customer_frequency`)
Per customer: `frequency` (daily/weekly/biweekly/monthly), `weekdays` mask,
`week_of_month` (bi-weekly/monthly), `priority` (A/B/C), optional
`est_duration_min`. Then **generate + publish** each route's daily plan
(supervisor) so reps get "My Route Today" and coverage/adherence compute.

### 8. Pilot KPIs to monitor **daily**
Planned vs completed visits, **coverage %**, **missed** customers, **geofence
violations** (+ reasons), **off-plan** visits, **sync pending/failed** count,
captures volume by type, average time-in-store, reps active.

### 9. Pilot KPIs to monitor **weekly**
Coverage trend (daily→weekly→monthly), **route compliance %**, **frequency
adherence %**, **execution scores** (overall + merch/survey/OOS/opportunity) by
**route** and **rep**, competitor/OOS/opportunity counts & value, data
completeness, rep adoption trend.

### 10. Risks and mitigation
| Risk | Mitigation |
|---|---|
| GPS inaccuracy / indoor stores | Advisory mode + reason capture; accuracy shown; radius tuned per area |
| Connectivity gaps (captures are online this phase) | Visit start/end are offline-first; schedule captures where signal exists; **FE-5 offline capture queue** |
| Photos captured but not uploaded (marker only) | Treat photos as non-authoritative in pilot; **FE-5 photo pipeline**; don't gate compliance on photos yet |
| Missing customer coordinates | Day-1 cleanup + first-visit GPS capture; report of customers w/o coords |
| Permission misconfiguration | Pre-go-live matrix review; per-type test per persona |
| Rep adoption / device/battery | Training, PWA install, big-tap one-handed UI; daily active-rep KPI |
| Wrong frequency → bad coverage signal | Validate frequencies week 1; supervisor override stops/skips |

### 11. Issues that should BLOCK wider rollout
- Any **lost or duplicated** visit/capture (data integrity).
- Any **cross-tenant or RLS leakage** / permission bypass.
- **Geofence/coverage producing materially wrong numbers** managers act on.
- **Scoring incorrect** vs. source captures (breakdown doesn't reconcile).
- A compliance/legal need for **stored photo evidence** that the marker-only flow
  can't satisfy → requires FE-5 photo pipeline first.

### 12. Issues that can be TOLERATED during pilot
- **Online-only in-visit captures** (offline queue is FE-5).
- **Photo marker** instead of stored upload.
- **Manual "Close day"** + lazy missed-compute (no scheduler).
- **Unweighted (simple) scoring**.
- No route/rep **detail pages**, no advanced **segment filters**, minor UI polish.
- Advisory-only geofence (no hard blocking).

---

## B. Recommended FE-5 scope & implementation sequence

Sequenced to clear likely pilot gaps first, then deepen analytics. Each is an
additive increment with a checkpoint (same cadence as FE-1→FE-4).

1. **FE-5a — Photo & evidence pipeline.** Storage bucket + resumable uploader
   (auto-retry on reconnect), replace the marker with a real path; surface photos
   on captures/profile. *(Clears the top pilot deferral; gates compliance use.)*
2. **FE-5b — Offline capture queue.** Extend the outbox to in-visit captures
   (queue values + photo blob, idempotent sync). *(Only if pilot shows
   connectivity pain — prioritize by finding.)*
3. **FE-5c — Configurable weighted scoring.** Per-component weights (per company /
   industry pack) + a scoring-config surface; keep the component breakdown shape.
4. **FE-5d — Role-based manager dashboards + trends + drill pages.** Coverage &
   score **trends** (from `fe_coverage_daily` + scores), **route/rep detail**
   drill-through pages, segment/date **filters**, role-tailored views.
5. **FE-5e — Escalations, alert digests & scheduling.** Geofence/missed/
   coverage-low/competitor **escalation workflows** + daily/weekly **alert
   digests**; **scheduled** Close-day & coverage-fact jobs (replace manual).

**Parallel-run guidance:** start the pilot now on FE-1→FE-4; feed pilot findings
into FE-5 priority (e.g., if photos are required → FE-5a first; if signal is poor
→ pull FE-5b forward). FE-5 builds only on the documented seams — pilot data
stays valid across the upgrades.
