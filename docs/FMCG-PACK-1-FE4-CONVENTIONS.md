# FE-4 — Capture, Raw-Fact & Scoring Conventions + Pilot Readiness

Reference for FE-4 (in-visit capture) consumed by FE-5 dashboards and analytics.
All field captures flow: **Builder form → `emit_fact` → `erp_raw_emit('field_ops', …)`**
and a link row in **`erp_fe_captures`**. Scores are computed from captures.

---

## 1. Raw-fact conventions (module `field_ops`)

Facts land in `erp_raw_facts` via `erp_raw_emit(module, event_type, fact_jsonb)`.
Known fact keys map to columns (`customer_id`, `route_id`, `user_id`, `gps_lat/lng`,
`geofence_result`, `amount`, `quantity`, `currency`, `event_at`, …); unknown keys
fall into `details`. The dimension spine (company, branch→region/area, currency)
is derived automatically.

| event_type | Emitted by | Key measures / details |
|---|---|---|
| `fe_visit_planned` | publish plan | route_id, user_id (rep), customer_id |
| `fe_visit_checkin` | visit start | gps_lat/lng, geofence_result, details.distance_m |
| `fe_visit_completed` | visit end | details.duration_min |
| `fe_coverage_daily` | close plan | quantity=visited, details.planned/missed/coverage_pct |
| `fe_merchandising` | merchandising capture | amount=shelf_price, quantity=display_count, details.share_of_shelf, details.planogram, details.display_type |
| `fe_competitor` | competitor capture | amount=price, details.competitor/product/promo |
| `fe_survey` | checklist capture | quantity=score |
| `fe_out_of_stock` | OOS capture | amount=est_lost_sales, details.product/severity |
| `fe_opportunity` | opportunity capture | amount=est_value, details.opp_type |
| `fe_complaint` | complaint capture | (marker) |

**Adding a capture:** new Builder form + an `emit_fact` effect (`module:"field_ops"`,
`event:"fe_<x>"`, `map` of measures) — no code. Subject (`subject_ref={source:record}`)
attributes the fact to the visit's customer.

## 2. Scoring conventions (simple now; weighting → FE-5)

Computed from `erp_fe_captures` (+ the linked submission `values`) by
`erp_fe_execution_scores(scope, id, from, to)` and `erp_fe_execution_scores_by(group, …)`.
Every score returns the **full component breakdown** (drillable at all levels).

| Component | Formula (0–100) | Source |
|---|---|---|
| `merch_compliance` | % merchandising captures with `planogram_compliance='yes'` | merchandising |
| `survey_score` | average of `score` | survey |
| `oos_score` | `100 − min(100, Σ severity weight)` (high 30 / med 15 / low 5) | out_of_stock |
| `opportunity_score` | `min(100, 50 + 25·count)` (presence-led placeholder) | opportunity |
| **`overall`** | simple **average of the available** (non-null) components | — |

Also returned: `oos_count`, `opportunity_count`, `opportunity_value`, `captures`.
**Scopes:** `customer` / `route` / `rep` / `visit` / `company`. **Filtering:** `from`/`to`
timestamps (period KPIs). Null components mean "no data for that pillar" and are
excluded from `overall` (no unfair penalty).

> FE-5 will replace the simple average with **configurable weights** per component
> and per industry pack; the function shape (components + overall) stays stable.

## 3. Dashboard KPI & filtering readiness

- **KPIs ready:** visits/completed/in-progress/coverage(daily/weekly/monthly)/
  compliance/missed/off-plan (coverage engine) + execution overall + 4 components
  at company/route/rep/customer/visit.
- **Filtering ready:** every scoring/coverage function accepts a date range;
  route/rep are first-class group keys; per-type capture permissions scope what a
  user can see/do. (Free-text/segment filters are an FE-5 UI concern.)
- **Drill-through ready:** dashboard → customer profile (missed/due-soon/alerts);
  → route plan (route execution rows); per-rep breakdown inline. Customer/visit
  scores drill on the profile + timeline.

## 4. FE-5 dashboard readiness — the seams

`erp_fe_manager_summary` (today KPIs/alerts/routes), `erp_fe_coverage` /
`erp_fe_coverage_lists` (coverage + missed/due-soon), `erp_fe_execution_scores` /
`erp_fe_execution_scores_by` (scores + breakdown), `erp_customer_field_360`
(per-customer rollup), and the `field_ops` raw-fact stream. FE-5 composes these
into role-based dashboards + configurable weighting + trends — **no new capture or
visit code required**.

## 5. Pilot deployment readiness assessment

**Ready for a controlled field pilot (online-first):**
- Visit lifecycle (offline-first), GPS + advisory geofence, manager alerts ✓
- Routes & coverage (frequency plans, publish, coverage/compliance, Close-day) ✓
- In-visit capture (6 FMCG templates, per-type permissions), raw-fact emission ✓
- Execution scoring + Customer 360 + manager dashboard ✓
- Multi-tenant RLS, audit, i18n (ar/en) on every surface ✓
- 380 automated tests green; 129 migrations apply clean; production build OK ✓

**Pilot prerequisites / operational notes:**
1. **Enable `field_ops`** for the pilot company and grant capture permissions
   (per-type or the `field_ops:execute` umbrella) via the Permission Matrix.
2. **Seed geofence settings** (`erp_fe_settings`: radius/mode/photo threshold,
   coverage target) and **customer coordinates** (`erp_customers.lat/lng`) — geofence
   is advisory without them.
3. **Define customer frequencies** + routes/rep assignments so plans generate.
4. **PWA install** on rep devices (responsive web; service-worker-assisted sync).

**Known deferrals (not blockers for an online pilot):**
- **Photo upload pipeline** — photos are captured + queued with a marker ref;
  storage upload is deferred (needs a storage bucket + uploader wiring).
- **Offline capture queue** — visit start/end are offline-first; in-visit *captures*
  submit online this phase.
- **Scheduled jobs** — "Close day" is manual + lazy compute (no cron here).
- **Weighted scoring, route/rep detail pages, segment filters** — FE-5.

**Recommendation:** proceed to a **small online pilot** (1–2 routes, a handful of
reps) to validate UX/data, in parallel with FE-5; address the photo-upload and
offline-capture deferrals before a wide rollout.
