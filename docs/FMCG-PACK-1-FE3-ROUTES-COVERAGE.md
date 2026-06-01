# FE-3 — Routes & Coverage · Architecture & Scope

Status: **proposal (pre-implementation)**. Builds on FE-1/FE-2 (visits, geofence,
raw facts, dashboard, Customer 360) and the existing distribution primitives
(`erp_routes`, `erp_customers.route_id/salesman_id`). Additive, multi-tenant
(RLS), under the `field_ops` module. No rewrites.

---

## 1. Concept

A customer has a **visit frequency** (call pattern). For a given day, the set of
**planned customers** for a rep/route is those *due* per their frequency. A
**route plan** (the rep's journey for a day) materializes those as ordered
**stops**; completing a visit marks its stop **visited**; unvisited past-due
stops are **missed**. **Coverage = visited ÷ planned**, rolled up daily / weekly /
monthly, with **compliance** layering geofence + on-plan adherence on top.

Everything reuses the FE-2 visit + raw-fact + dashboard machinery; FE-3 adds the
*planning* layer and the *coverage* math.

### New entities (prefix `erp_fe_`)
| Table | Purpose |
|---|---|
| `erp_fe_customer_frequency` | per-customer call pattern: `(company, customer_id [unique], route_id, frequency, weekdays smallint[], week_of_month smallint[], calls_per_cycle, active)` — **#12 frequency rules** |
| `erp_fe_route_plans` | a rep's journey for a day: `(company, route_id, rep_id, plan_date, status draft\|published\|in_progress\|done, generated_at, published_at, created_by)` |
| `erp_fe_route_stops` | planned customers of a plan: `(company, plan_id, customer_id, seq, due bool, status planned\|visited\|missed\|skipped, visit_id)` — **#1 planned customers** |

`erp_fe_visits.plan_id` (already present) links a visit to its plan; a trigger/RPC
marks the matching stop **visited** on check-out, and flags **off-plan** visits
(a completed visit with no stop). Route ownership (#3) stays `erp_routes.rep_id`
(the same identity `route_owner` approvals already use); a plan defaults its
`rep_id` from the route.

### New functions / views
- `erp_fe_customer_due(customer, date) → bool` — evaluates the frequency rule.
- `erp_fe_generate_plan(route_id, date) → plan_id` — idempotent; creates the plan
  + stops for customers on the route due that date (auto-journey, supervisor can
  edit/reorder/skip).
- `erp_fe_coverage(from, to, group) → jsonb` — planned / visited / missed / pct /
  compliance per group (`route` | `rep` | `day`) — **#4–#11, #13**.
- `erp_fe_close_plan(plan_id)` — marks past-due stops missed, emits the daily
  coverage raw fact — **#6, #15**.
- Customer 360: extend `erp_customer_field_360` with `frequency`, `next_due_date`,
  `adherence_pct` — **#14**.

---

## 2. Item-by-item

| # | Item | Mechanism |
|---|---|---|
| 1 | **Planned customers** | `erp_fe_route_stops` (generated from frequency-due customers on the route) |
| 2 | **Route assignments** | customer→route = `erp_customers.route_id` (+ `customer_frequency.route_id`); rep→route = `erp_routes.rep_id`; plan→rep/route = `erp_fe_route_plans` |
| 3 | **Route ownership** | `erp_routes.rep_id` (same owner used by `route_owner` workflow approvals); plan inherits it |
| 4 | **Coverage calculation** | `visited ÷ planned` over published plans in range, via `erp_fe_coverage()` |
| 5 | **Visited vs planned** | stop.status `visited` vs all `due` stops; visit→stop link on check-out |
| 6 | **Missed customers** | due stops with no completed visit once `plan_date` is past (set by `erp_fe_close_plan`) |
| 7 | **Coverage KPIs** | coverage %, planned, visited, missed, off-plan, strike rate, productive % |
| 8 | **Daily coverage** | `erp_fe_coverage(d, d, …)` + `fe_coverage_daily` raw fact per (route, day) |
| 9 | **Weekly coverage** | sum of daily facts / `erp_fe_coverage(weekStart, weekEnd, …)` |
| 10 | **Monthly coverage** | sum of daily facts / `erp_fe_coverage(monthStart, monthEnd, …)` |
| 11 | **Route compliance** | of due stops: visited **on the planned day** **within geofence** ÷ planned |
| 12 | **Customer frequency rules** | `erp_fe_customer_frequency` (frequency + weekday mask + week-of-month + calls/cycle) → `erp_fe_customer_due()` |
| 13 | **Dashboard metrics** | `erp_fe_manager_summary` gains coverage block (today/week/month, per-route compliance); dedicated coverage cards |
| 14 | **Customer 360 integration** | `erp_customer_field_360` gains frequency / next_due / adherence; profile shows the schedule |
| 15 | **Raw fact emission** | publish → `fe_visit_planned` per stop; close → `fe_coverage_daily` (planned/visited/missed/pct) so weekly/monthly trend without recompute; visits keep emitting `fe_visit_completed` |

---

## 3. Coverage definitions (precise)
- **Planned(scope, period)** = count of `due` stops in `published`+ plans whose `plan_date ∈ period`.
- **Visited** = those stops with `status='visited'` (a completed visit linked).
- **Missed** = `due` stops not visited where `plan_date < today` (or plan closed).
- **Off-plan** = completed visits with no stop in that day's plan (visited but unplanned).
- **Coverage %** = Visited ÷ Planned.
- **Compliance %** = (Visited stops whose visit was `geofence='ok'` and on `plan_date`) ÷ Planned.
- **Strike/productive rate** (hook for FE-4 orders) = productive visits ÷ visits — surfaced later when orders exist.

## 4. Proposed sub-steps (each: build → test → checkpoint)
- **FE-3a Data model:** frequency rules + plans + stops + RLS + `erp_fe_customer_due` + visit→stop linkage (check-out marks stop visited / flags off-plan).
- **FE-3b Coverage engine:** `erp_fe_coverage()` + compliance + `erp_fe_close_plan()` + `fe_coverage_daily` emission. (#4–#11, #15)
- **FE-3c Planning + journey UI:** `erp_fe_generate_plan()` + supervisor build/publish flow (`fe_route_published` notification) + rep "My Route Today" (ordered stops, visited/missed, start-visit per stop). (#1, #2, #3)
- **FE-3d Coverage dashboards + 360:** coverage cards (daily/weekly/monthly + per-route compliance) on the manager dashboard; frequency/next-due/adherence on the customer field profile. (#13, #14)

## 5. Open decisions (need your call before FE-3a)
1. **Frequency model** — support **weekday-mask + week-of-month + calls/cycle**
   (covers weekly, bi-weekly, F2/F4 monthly) as the one model (recommended), or
   start with a simpler weekly weekday-mask only?
2. **Plan generation** — **auto-generate** the daily journey from frequency rules
   with supervisor override (recommended), vs manual stop selection only?
3. **Coverage basis** — planned = **frequency-due customers** (recommended) vs all
   route customers every day vs only explicitly-published stops?
4. **Missed timing** — a due stop becomes **missed at end of its plan_date**
   (recommended), computed by `erp_fe_close_plan` (manual/scheduled), since this
   environment has no cron — acceptable to expose a "close day" action + lazy
   compute in the coverage view?

## 6. Non-goals (FE-3)
Route optimization/sequencing (TSP), territory management, dynamic re-routing,
order/sales capture (FE-4), payment/settlement. The schema leaves room (`seq`,
`plan_id`) for these later.
