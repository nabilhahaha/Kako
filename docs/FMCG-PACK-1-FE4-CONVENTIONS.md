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
| **`overall`** | **configurable weighted** blend of participating components (FE-5c) | — |

Also returned: `oos_count`, `opportunity_count`, `opportunity_value`, `captures`,
and `breakdown` (per-component `Score × Weight = Contribution` + `state`).
**Scopes:** `customer` / `route` / `rep` / `visit` / `company`. **Filtering:** `from`/`to`
timestamps (period KPIs).

### FE-5c — configurable weighted scoring + component states (implemented)

Weights and states are configurable **without code**, stored in
`erp_fe_score_weights` and resolved **most-specific-first**:
`rep override → route override → company default → industry-pack/global default →
fallback (weight 1, state optional)`. Helpers: `erp_fe_resolve_weights(route,rep)`,
`erp_fe_resolve_states(route,rep)`; pure `erp_fe_weighted_overall(components,
weights, states)` and `erp_fe_score_breakdown(...)`; no-code config via
`erp_fe_save_weights(rows)` (company-admin) surfaced at `/field/weights`.

- **Overall** = `Σ(score·weight) / Σ(weight)` over the **participating** components.
- **Component state** governs missing data (only for components *present* on a
  surface, so capture-only scores never get penalised for coverage/compliance):
  - `required` — missing data counts as **0** (the pillar is mandatory).
  - `optional` — missing data is **excluded** (no unfair penalty).
  - `disabled` — **never participates**, even when data exists.
- **Breakdown** keeps its shape and always shows `Component Score × Weight =
  Contribution` (+ `state`), drillable at every level — the future hook for
  achievement %, incentives and commission.
- **FMCG pack defaults:** Coverage 25 (required), Compliance 20 (required),
  Merchandising 20, OOS 15, Survey 10, Opportunities 10 (optional). Another
  company simply saves different weights/states — no code change.
- **Scope is preserved:** weighting/breakdown is computed at the already-scoped
  base layer (after `erp_fe_team()` / `erp_fe_sees_all()`), so it never widens
  what a manager may see (`Effective = Scope AND Filters` still holds).

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

## 4b. Core rule — Scope-then-Filter (security architecture)

> **Effective Result = User Allowed Scope AND Selected Filters.**
> A filter can only *narrow*, never *widen*, what a user may see.

Enforced structurally, server-side:
- **Scope is always-on.** Every field-ops read function applies the caller's
  hierarchy scope first — `erp_fe_sees_all()` (admin/owner ⇒ all) or
  `erp_fe_team()` (the caller's `reports_to` subtree). Non-admins are filtered to
  their team's rep dimension regardless of parameters.
- **Filters are ANDed after scope** at a single choke point. The perf engine's
  `erp_fe_perf_caps/_stops` apply `scope AND <filters> AND <drill level>`; the
  dashboard/trend/score functions do the same. So a supervisor filtering
  `Channel=Discounter` sees only *their* Discounter customers, never the
  company's. Filter *option lists* are scope-aware too (`erp_fe_scope_channels`).
- **Extending dimensions:** add new filters (category / sub-category / SKU /
  brand / customer classification / channel / customer / route / rep / date) — and
  the Commercial pack's Actual Sales / Targets / Achievement % / Growth /
  Commission — at the SAME scoped base layer (after the scope predicate), so they
  inherit the rule automatically. Never filter before scoping; never let a filter
  reach rows outside `erp_fe_team()`.
- **Proven by tests:** team isolation (own scope only; another team's
  rep/customer id ⇒ empty; admin ⇒ all) and Scope∧Filter (channel filter stays
  within the supervisor's scope; admin spans the company).

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

### FE-5e — Escalations, alerts, digests (implemented)

Management-actionable alert framework. Alerts are a worklist, not a feed.

- **Spine** `erp_fe_alerts` — every alert has owner / status
  (open→acknowledged→in_progress→resolved/dismissed) / created / due /
  resolution-note **history** (`notes`) / severity (info|warning|critical) /
  scope dimensions (region/area/branch/route/rep/customer/sku) / aging
  (`first_seen_at`/`last_seen_at`/`seen_count`) / `owner_level` +
  `escalation_level` for multi-tier escalation. `category`/`rule_key` are open
  text → Commercial pack rules plug in with no schema change.
- **Idempotent** `erp_fe_alert_raise` — one non-terminal alert per
  `(rule_key, dedupe_key)` (partial unique index); persisting conditions refresh
  (cooldown) not duplicate; resolve → recurrence opens a fresh alert.
- **Detection** `erp_fe_run_alert_rules` (admin/owner, lazy) → five families:
  coverage (route/rep/area), compliance (geofence excess / repeat), OOS (high
  customer / repeat SKU / route trend), opportunity (new / high-value /
  unfollowed), customer risk (missed / declining score / declining coverage).
  Owner = rep's supervisor (`erp_fe_responsible_manager`, via `reports_to`).
- **Configurable thresholds** `erp_fe_alert_thresholds` /
  `erp_fe_threshold(key, company)` — company → global → fallback, no code.
- **Digests** `erp_fe_digest(kind)` / `erp_fe_digest_run` — scope-aware
  (built for the calling manager), action-first (open by severity, new since
  last, overdue, top-risk routes/reps, per-pillar summaries, each with a
  drill-through href); regional/executive add Top-10 performers.
- **Reads are scope-aware** (RLS + `erp_fe_alerts_list`/`_summary`/`_get`):
  managers see only their `erp_fe_team` subtree; lifecycle RPCs are
  scope-checked. UI: mobile-first inbox `/field/alerts` (status / severity /
  owner / category filters, quick actions, due+overdue+aging, note history) and
  digest `/field/alerts/digest`.

> Future: a **Draft/Sandbox/Publish** governance layer should wrap these configs
> (weights, thresholds, forms, roles, dashboards, workflows) — see
> `CONFIG-GOVERNANCE-ROADMAP.md`. The scoped resolvers here are the template.
