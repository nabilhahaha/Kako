# Route Planner — Closeout Plan & Readiness Probe

Status: in progress. Goal: close the Route Planner A‑to‑Z so it is production / demo /
sales ready on the **vantora-staging** project (the approved canonical production target
for Route Planner + Field Verification).

This document is the canonical reference for the closeout. It records the approved
decisions, the fresh‑company readiness probe findings, the canonical execution path, and
the PR sequence. It is additive documentation only — it changes no behaviour.

## Approved decisions

- **D‑1 Deployment target:** `vantora-staging` is the canonical production / sales‑demo
  target for Route Planner + Field Verification. Do **not** migrate the schema into the
  `kako-fmcg` ERP project now.
- **D‑2 Canonical execution path:** **New RP Missions**.
  `erp_rp_missions → erp_rp_mission_stops → erp_rp_mission_events → rep mobile execution
  → check‑in / done → supervisor tracking → execution reports`.
  The legacy field route/journey stack (`erp_routes`, `erp_journey_plans`, `erp_visits`,
  `/field/route`, `/field/journey`) is **legacy/deprecated for Route Planner execution**.
  Legacy tables are **kept** (not deleted); they continue to serve the older distribution
  module and must not be revived as the Route Planner path.

## Canonical execution model (RP Missions)

| Stage | Table / surface | Notes |
|-------|-----------------|-------|
| Plan build | `erp_rp_datasets` / `erp_rp_dataset_customers` | Shared customer substrate (also used by Field Verification — do not fork). |
| Save plan + assign | `erp_rp_missions` (+ `erp_rp_mission_stops`) | A mission = a saved, rep‑assignable route. `assigned_to` = rep. |
| Rep execution | `erp_rp_mission_stops.status` (`pending → checked_in → done/skipped`) | Mobile‑first. Check‑in, navigate, notes/photos, mark done. |
| Activity log | `erp_rp_mission_events` | check_in / check_out / note / photo / issue / complete … |
| Supervisor tracking | `erp_rp_missions` + stops/events | Completed vs pending, rep progress, route map, KPIs. |
| Reports / export | read‑only RPCs over the above | Reuse the coverage/report patterns; CSV/Excel export. |

Status colors (UX): **green** = completed, **blue** = active / in‑progress,
**amber** = pending / upcoming, **red** = issue / missed.

## Fresh‑company readiness probe (PR‑1)

Read‑only probe of how a brand‑new tenant is provisioned for Route Planner.

**Module enablement** (`erp_business_type_modules`): only `business_type = 'fmcg'`
enables the `route_management` module that Route Planner needs (it also enables
`distribution`). `delivery` / `general` / `wholesale` get only `distribution`;
`field_verification_only` gets only `field_verification`. → A company intended to use
Route Planner must be created as **fmcg** (or have `route_management` enabled).

**Permission seeding** (`erp_role_permissions` global defaults, copied per company by
`erp_seed_company_roles`): **the real roles carry no `route_planner.*` permissions** —
only a throwaway `test` role does. Effect at runtime (permissions resolve entirely from
the DB; the code `admin: ALL` only seeds the DB):

| Role | Reaches Route Planner today? | How |
|------|------------------------------|-----|
| Admin / Manager | Yes | via `reports.view` (page gate accepts it) |
| Supervisor | Yes | via `reports.view` |
| Viewer / Reporter | Yes | via `reports.view` |
| **Salesman / Rep** | **No** | holds neither `reports.view` nor `route_planner.*` → **no path to mission execution** |

**Conclusion / gap:** the manager side is reachable today (through `reports.view`), but a
rep has **no** way into Route Planner mission execution. The closeout therefore must:
1. Seed explicit, additive `route_planner.*` permissions to the real roles (clean
   role‑based gating instead of leaning on `reports.view`), and a **rep execution**
   capability so a salesman can run an assigned mission (PR‑3).
2. Allow the **assigned** rep to execute their own mission regardless of
   `erp_route_planner_access` configuration (PR‑4 gate), with RLS (`assigned_to`) as the
   backstop.

**Safety:** all 22 `erp_rp_*` tables are RLS‑enabled and company‑scoped; no service‑role
usage; cross‑company isolation independently verified in the Field Verification E2E. The
probe is read‑only and creates nothing.

## PR sequence

| PR | Scope | Risk |
|----|-------|------|
| PR‑1 | Readiness probe + this closeout/canonical doc | docs only |
| PR‑2 | Tighten `erp_route_planner_access` semantics (assignee‑can‑execute) | additive logic + tests |
| PR‑3 | Seed `route_planner.*` + mission execution perms to real roles; mark legacy deprecated | additive migration |
| PR‑4 | Rep mobile mission execution screen + bottom‑nav entry | additive UI |
| PR‑5 | Save‑plan loop: persist built plan → `erp_rp_missions`/stops; assign to rep | additive writes + RLS |
| PR‑6 | Supervisor tracking: completed vs pending + progress | read paths |
| PR‑7 | RP execution reports + export | read‑only |
| PR‑8 | Performance pass for large datasets | additive indexes |
| PR‑9 | New‑company E2E + closeout report | staging test |

Guardrails for every PR: additive only; no destructive DB changes; no deletion of
customers / verifications / photos / reports; Field Verification behaviour (submit,
radius, photo validation, customer lists, maps, reports) unchanged; company isolation and
RLS strict; small focused commits; merge only on green CI; live migrations applied to
`vantora-staging` only when additive and safe, with before/after verification.
