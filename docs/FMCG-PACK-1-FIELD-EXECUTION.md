# FMCG Pack #1 — Field Execution Pack · Architecture & Scope

Status: **proposal (pre-implementation)** · Builds on the Dynamic Form & Workflow
Builder (B1–B6 + subject_ref + entity_ref / update_fields / submitter notices),
the generic Workflow Engine, the Raw-Data framework, Customer 360, the
Notification Engine and the Permission Matrix. Additive, multi-tenant (RLS),
module-gated. No rewrites.

---

## 1. Design principles

1. **Builder-first.** All in-field *data capture* (merchandising, competitor,
   surveys, quick-capture) is **Builder forms + whitelisted effects + raw facts**
   — configuration, not code. The pack adds only a thin **domain spine** that the
   Builder can't express: the visit/route lifecycle and geospatial validation.
2. **One new entitlement** `field_execution` (in `erp_company_modules`); every
   surface is module-gated and matrix-permissioned.
3. **Raw-facts as the analytics backbone.** Every meaningful field event is
   emitted via `erp_raw_emit('field_execution', <event>, <fact>)` (full
   dimension spine: company, branch→region/area, customer, rep, date, currency).
   Dashboards + Customer 360 read facts, never bespoke tables.
4. **Reuse the engine for approvals.** Geofence overrides, merchandising
   escalations and quick-capture (new customer/lead) ride the existing
   `form_submission`/owner-resolution engine. No new approval machinery.
5. **Additive + idempotent migrations**, RLS on every table, audit-captured.

### New domain entities (prefix `erp_fe_`)
| Table | Purpose |
|---|---|
| `erp_fe_settings` | company config: geofence radius (m), geofence mode (advisory/blocking), workday window, coverage target % |
| `erp_fe_route_plans` | a rep's journey for a day: `(company, route_id, rep_id, plan_date, status draft\|published\|in_progress\|done)` |
| `erp_fe_route_stops` | ordered stops of a plan: `(plan_id, customer_id, seq, planned_window, visit_id)` |
| `erp_fe_visits` | the spine: `(company, customer_id, rep_id, route_id, plan_id, planned_date, status planned\|in_progress\|completed\|missed\|cancelled, checkin_at, checkin_lat/lng/accuracy, checkout_at, checkout_lat/lng, duration_min, geofence_status ok\|violation\|unknown, distance_m, note)` |
| `erp_fe_visit_tasks` | links Builder forms to a visit: `(visit_id, form_id, kind survey\|merchandising\|competitor\|order\|custom, submission_id, required, status pending\|done\|skipped)` |

Geofence reuses existing `erp_customers.latitude/longitude` (added in 0116) +
`erp_fe_settings.geofence_radius_m`. Coverage is a **view**
(`erp_fe_coverage`) over plans vs. visits — no stored duplication.

### New Builder primitive (one small, generic effect)
- **`emit_fact` effect** — on submission/approval, emit a raw fact with mapped
  measures: `{type:"emit_fact", event:"fe_merchandising", measures:{shelf_share:"shelf_share", facings:"facings"}}`. Lets *any* capture form feed analytics by
  configuration. Whitelisted, audited, dimension spine auto-derived. (Extends the
  B6 effect set; reusable far beyond this pack.)

### Cross-cutting additions
- **Permissions** (`erp_permission_catalog`, resource `field_execution`):
  `execute` (rep: check-in/out, complete visits & forms), `plan` (supervisor:
  build/publish routes), `view`, `approve` (manager: overrides/escalations),
  `dashboard` (manager). Default grants: rep→execute,view · supervisor→plan,view ·
  manager→approve,dashboard,view,plan · admin→all.
- **Notification templates**: `fe_route_published`, `fe_visit_missed`,
  `fe_geofence_violation`, `fe_coverage_low`, `fe_competitor_alert` (+ existing
  `form_approved/rejected`).
- **Customer 360**: companion rollup `erp_customer_field_360` (last_visit_at,
  visits_30d, coverage_status, last_geofence_status, last_merch_score,
  last_competitor_price) surfaced on the Customer 360 page.
- **Raw fact event types** (module `field_execution`): `fe_visit_planned`,
  `fe_visit_checkin`, `fe_visit_checkout`, `fe_visit_completed`,
  `fe_visit_missed`, `fe_merchandising`, `fe_competitor`, `fe_survey`,
  `fe_coverage_daily`.

---

## 2. Capability specifications

### 1) Visits
- **Entities:** `erp_fe_visits` (+ `erp_fe_visit_tasks`).
- **Builder forms:** none for the visit itself; tasks attach forms (see 5–8).
- **Workflows:** none by default; *missed/late* can trigger a manager
  notification. Geofence override (capability 3) is the only optional approval.
- **Notifications:** `fe_visit_missed` → line manager when a planned visit lapses
  past its window.
- **Raw facts:** `fe_visit_planned`, `fe_visit_completed`, `fe_visit_missed`
  (rep, customer, route, date, duration).
- **Customer 360:** `last_visit_at`, `visits_30d`, `coverage_status`.
- **Permissions:** `field_execution:execute` (own visits), `:view`/`:dashboard`
  (supervisor/manager across team).

### 2) GPS Check-In / Check-Out
- **Entities:** check-in/out columns on `erp_fe_visits` (timestamp, lat/lng,
  accuracy, duration_min). Source = browser Geolocation (PWA).
- **Builder forms:** optional `set_gps` form to (re)capture customer location at
  check-in (effect `set_gps` → `erp_customers.lat/lng`, subject = visit's customer).
- **Workflows:** none.
- **Notifications:** none (geofence handles exceptions).
- **Raw facts:** `fe_visit_checkin` (lat/lng, geofence_status, distance_m),
  `fe_visit_checkout` (duration_min).
- **Customer 360:** time-in-store stats; refreshes `last_visit_at`.
- **Permissions:** `field_execution:execute`.

### 3) Geofence Validation
- **Entities:** `erp_fe_settings` (radius, mode advisory|blocking); per-customer
  override optional. Validation = haversine(check-in, customer.lat/lng) vs radius
  → sets `erp_fe_visits.geofence_status` + `distance_m`.
- **Builder forms:** an **override request** form (reason text + photo) bound to a
  workflow when `mode=blocking` and the rep is outside the fence.
- **Workflows:** geofence override → `account_owner`/`department_head` (manager)
  approval (entity `form_submission`, subject = visit's customer); on approve the
  visit is accepted.
- **Notifications:** `fe_geofence_violation` → manager.
- **Raw facts:** geofence_status + distance carried on `fe_visit_checkin`.
- **Customer 360:** `last_geofence_status`.
- **Permissions:** `:execute` (request), `:approve` (manager decides).

### 4) Customer Coverage
- **Entities:** `erp_fe_coverage` **view** (planned vs visited per rep/route/day &
  rolling period) over plans + visits; target from `erp_fe_settings`.
- **Builder forms:** none.
- **Workflows:** none; threshold breach → notification.
- **Notifications:** `fe_coverage_low` → manager when coverage < target.
- **Raw facts:** `fe_coverage_daily` (planned, visited, pct) per rep/route.
- **Customer 360:** `coverage_status` (covered / overdue / never-visited) per
  customer.
- **Permissions:** `:view` (own), `:dashboard` (team).

### 5) Merchandising
- **Entities:** none new — a **Builder form** + its submission, linked via
  `erp_fe_visit_tasks` (kind=merchandising). Global template `fe_merchandising_audit`.
- **Builder forms:** `fe_merchandising_audit` — fields: shelf_share (number),
  facings (number), planogram_compliant (dropdown yes/no), out_of_stock
  (multiselect), shelf_price (number), photo (image). Subject = visit customer
  (`subject_ref` field `customer_id` via entity_ref, or visit context).
- **Workflows:** optional escalation when `planogram_compliant=no` (conditional
  routing → manager task).
- **Notifications:** escalation → manager (reuses task assignment).
- **Raw facts:** `fe_merchandising` via the **`emit_fact`** effect (shelf_share,
  facings, price[currency], compliant).
- **Customer 360:** `last_merch_score` / compliance trend.
- **Permissions:** `:execute` (submit), `:approve` (escalation).

### 6) Competitor Photos
- **Entities:** none new — Builder form + submission (+ visit_task kind=competitor).
- **Builder forms:** `fe_competitor_capture` — competitor (dropdown), product
  (text), price (number), promo (text), photo (image), location (gps).
- **Workflows:** none (capture only); price-threshold alert via notification.
- **Notifications:** `fe_competitor_alert` → manager on capture (optionally
  conditioned on price delta).
- **Raw facts:** `fe_competitor` (price[currency], competitor, promo) via `emit_fact`.
- **Customer 360:** `last_competitor_price` near the customer.
- **Permissions:** `:execute`.

### 7) Surveys / Checklists
- **Entities:** none new — pure **Builder forms** (already supported), linked via
  visit_tasks (kind=survey). Seeded templates: `fe_store_checklist`, `fe_survey_generic`.
- **Builder forms:** any field types incl. multiselect/section/signature; scoring
  via numeric fields.
- **Workflows:** optional sign-off (`company_admin`/manager) for audited checklists.
- **Notifications:** submitter outcome (existing) when a workflow is bound.
- **Raw facts:** `fe_survey` (score) via `emit_fact`.
- **Customer 360:** latest survey score (optional).
- **Permissions:** `:execute`; `forms:*` governs authoring.

### 8) Quick Capture Forms
- **Entities:** none new — Builder forms; effects do the work.
- **Builder forms:** `fe_quick_new_customer` (effect `create_customer`),
  `fe_quick_complaint` (record_only + notify), `fe_quick_order_intent`
  (entity_ref product + qty; record_only/raw fact). Launchable in or out of a visit.
- **Workflows:** new-customer → `company_admin`/`account_owner` approval (reuses
  the validated FMCG New-Customer flow); complaint → assignment.
- **Notifications:** submitter outcome (existing); complaint → owner.
- **Raw facts:** `fe_quick_*` as applicable.
- **Customer 360:** new leads appear once approved (existing create_customer path).
- **Permissions:** `:execute` + `forms:submit`.

### 9) Route Execution
- **Entities:** `erp_fe_route_plans` + `erp_fe_route_stops` (journey for a
  rep/day; each stop materializes an `erp_fe_visits` row on start).
- **Builder forms:** none (operational), but stops can require task-forms.
- **Workflows:** optional supervisor approval to **publish** a plan
  (entity `form_submission` or a light status gate).
- **Notifications:** `fe_route_published` → rep when the day's plan is released.
- **Raw facts:** `fe_visit_planned` per stop; `fe_coverage_daily` rollup.
- **Customer 360:** next planned visit date.
- **Permissions:** `:plan` (build/publish), `:execute` (run), `:view`.

### 10) Manager Dashboards
- **Entities:** none — server-rendered analytics over `erp_raw_facts` +
  `erp_fe_coverage` + `erp_customer_field_360`.
- **Builder forms:** none.
- **Workflows:** none.
- **Notifications:** digest alerts reuse 3/4/6 templates.
- **Raw facts:** consumes all `fe_*` facts. KPIs: coverage %, visits/day, on-time
  %, avg time-in-store, geofence compliance %, missed visits, merchandising
  compliance %, competitor price index, productive-visit %.
- **Customer 360:** drill-through from a customer to its visit history.
- **Permissions:** `:dashboard`.

---

## 3. How the Builder is reused (capture → analytics, by configuration)

```
Visit (spine)  ──┐
                 ├─ erp_fe_visit_tasks ── Builder form ── submission
                 │                                   │
                 │                          effect: emit_fact ─► erp_raw_emit('field_execution', 'fe_*', {...})
                 │                                   └─ (create_customer / update_fields where relevant)
                 └─ check-in/out + geofence ───────────────────► raw facts ─► dashboards + Customer 360
```
Adding a new field process later = **new Builder form + `emit_fact` config + a
visit_task kind** — no schema, matching the “configuration-driven, scales to
future modules” goal.

---

## 4. Proposed implementation increments (each: build → test → checkpoint)

- **FE-1 Foundations:** `field_execution` module + permissions catalog/grants;
  `erp_fe_settings`; raw-fact event types; notification templates; `emit_fact`
  effect (Builder); Customer 360 companion view. *(data model + Builder primitive)*
- **FE-2 Visit lifecycle + GPS + Geofence:** `erp_fe_visits`, check-in/out, haversine
  geofence, rep “My visits today” UI, override workflow. *(capabilities 1–3)*
- **FE-3 Route Execution + Coverage:** plans/stops, publish flow, `erp_fe_coverage`
  view, rep journey UI, coverage notifications. *(capabilities 4, 9)*
- **FE-4 In-visit Builder capture:** `erp_fe_visit_tasks`; seed global templates
  (merchandising, competitor, checklist, quick-capture) wired to `emit_fact`;
  in-context fill UI. *(capabilities 5–8)*
- **FE-5 Manager Dashboards + alerts:** KPI dashboards over raw facts/coverage/360;
  escalation workflows; alert digests. *(capability 10)*

---

## 5. Resolved decisions

1. **Offline-first (hard requirement, FE-2).** Field capture works without signal:
   - **Local queue** for visits, check-in/out, photos and form submissions
     (IndexedDB), with a service-worker background sync.
   - **GPS captured at action time, not sync time** (timestamp + lat/lng stamped
     locally when the rep acts).
   - **Clear sync-status indicators** (queued / syncing / synced / failed).
   - **Duplicate protection** via a client-generated idempotency key per action
     (server upserts on it) so retries never double-post.
   - **Photo uploads auto-retry** on reconnect (queued blobs, resumable).
   - *MVP-light:* offline capture + sync are required; **advanced conflict
     resolution is deferred** — last-writer-wins with an audit trail for now.
2. **Geofence = advisory by default** (per-company switch to blocking):
   - always **record distance** from the expected location;
   - **require a reason** when outside the fence;
   - **require a photo** for significant-distance exceptions (threshold in settings);
   - **manager alert** (`fe_geofence_violation`) for flagged visits;
   - companies may switch to **blocking** mode in settings.
3. **Dedicated `field_execution` module** — its own entitlement, permissions,
   navigation, settings, dashboards, raw-fact types and Customer 360 integration,
   **independent of distribution licensing**. Designed as a **reusable platform
   capability** for FMCG, Merchandising, Medical, Service and future industry packs.
4. **Reps operate via the responsive web app / PWA** (no native app in this pack);
   the PWA + service worker also underpins offline capture.

### Offline-first architecture (FE-2) — outline
- **Client:** PWA shell + service worker; an `outbox` store (IndexedDB) holding
  pending actions `{idempotency_key, type, payload, gps, captured_at, status}`;
  photo blobs in a companion store. A sync worker drains the outbox on
  `online`/periodic sync, POSTing to server actions.
- **Server:** every offline-originated write carries the `idempotency_key`;
  tables (`erp_fe_visits`, `erp_fe_visit_tasks`, submissions) get a unique
  `client_ref` column so the server **upserts idempotently**. `captured_at` and
  GPS come from the client payload, never `now()`.
- **Status:** the UI reflects per-item sync state; a global indicator shows
  pending count. Failures stay queued and retry with backoff.
- **Deferred:** field-level merge / conflict UIs (last-writer-wins + audit now).

---

## 6. Non-goals (this pack)
Van-sales settlement / stock-on-van, payment collection, order fulfilment &
invoicing (distribution/sales packs), native mobile app, advanced route
optimization (TSP) — all out of scope here; the spine is designed so they slot in
later.
