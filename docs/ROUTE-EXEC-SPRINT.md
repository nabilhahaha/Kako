# VANTORA — Route Execution Excellence Sprint

> Mobile-first, salesman-first. **Additive** — reuses existing schema + existing
> journey engine/screen; no new tables, no production data change, no AI.
> Prepared `2026-06-04`.

## Route-sales systems inspected (patterns only)
Pepperi, Repsly, BeatRoute, FieldAssist, StayinFront — one-screen day execution:
sequenced route, completion %, GPS compliance, missed customers, next-customer
action, coverage/route-health, supervisor route view.

## Reused (no duplication)
- **`journey-sort.ts`** — sequence optimization (manual / nearest / optimized / hybrid). ✅ existing.
- **`loadTodayJourney()`** (`field/actions.ts`) — today's stops + visited (via `erp_today_journey`, `erp_visits`, `erp_work_sessions`). ✅ existing.
- **`/field/journey`** — the detailed GPS check-in / visit-reason flow. ✅ existing (linked, not rebuilt).
- **`coachingData()`** — GPS / out-of-route counts (defensive). ✅ existing.

## Shipped
- **`route-exec.ts`** (+tests): pure `routeCompletion`, `missedStops`, `nextStop`, `gpsComplianceRate`, `routeHealth`.
- **`/field/route` — "My Day" route execution screen**: completion % · GPS compliance · remaining · route health StatCards; **next customer** card with one-tap actions (check-in / invoice / 360 / statement); full stop list with visited/pending; one-tap **Open journey** (GPS check-in). One screen to run the day; the detailed check-in stays in `/field/journey`.
- Nav: **Route Execution** (`/field/route`, `field.sales`); bilingual i18n.

## Priority coverage
| # | Item | Status |
|---|---|---|
| 1 Today route | ✅ `/field/route` overview + `/field/journey` detail |
| 2 Sequence optimization | ✅ reuses `journey-sort` (4 modes) |
| 3 Route completion % | ✅ `routeCompletion` |
| 4 GPS compliance | ✅ `gpsComplianceRate` + check-in in `/field/journey` |
| 5 Missed customers | ✅ `missedStops` + remaining count |
| 6 Visit reason capture | ✅ existing `/field/journey` (check-in reason / override) |
| 7 Coverage dashboard | ✅ completion/coverage on `/field/route` + Supervisor/Territory |
| 8 Route health | ✅ `routeHealth` band/score |
| 9 Next customer action | ✅ next-customer card with one-tap actions |
| 10 Route supervisor view | ✅ reuses `/supervisor` + `/territory` (route-health rollup); `route-exec` lib shared |

## Data gaps (no schema invented)
`erp_journey_plans` / `erp_visit_compliance` / `erp_today_journey` are in the
**unapplied production drift**, so `/field/route` shows a clear empty state in
production until the drift is closed; it is fully functional in migrated
environments (and CI). No new tables/fields were added.

## Validation
`tsc` · `vitest` (route-exec suite + i18n parity + keys-usage + route integrity) · `next build` — see PR.

## Estimated business value
**High for route reps** — a single "My Day" screen (completion, next customer,
one-tap actions, route health) on top of the existing journey engine is the core
route-execution daily driver, fully additive.
