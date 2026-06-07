# VANTORA — Phase 3.x (FMCG Roadmap) Readiness Note

**Date:** 2026-06-07 · **Status:** Phase 3.x additive enhancements complete &
staging-ready (flags OFF / inert). Discipline upheld throughout: data integrity first ·
additive-only migrations · `KAKO_DISTRIBUTION` default-OFF · multi-company RLS +
auditability intact · reuse-over-rebuild · all gates green, integration run before each
merge.

## Priority-by-priority status
| # | Priority | Status | Delivered / basis |
|---|----------|--------|-------------------|
| 1 | Dashboard UI for KPI read models | ✅ | `/distribution/coverage` page (#168), inert via `DISTRIBUTION_ENABLED()`+module guard. |
| 2 | Coverage Compliance dashboards | ✅ | Coverage KPI engine (#162) → read-model service (#164) → dashboard (#168). |
| 3 | Supervisor Monitoring dashboards | ✅ | Team roll-up (`getTeamDayCoverage`) + scorecard (#169) surfaced on the dashboard. |
| 4 | KPI Scorecards | ✅ | Rep scorecard (#169) reusing the Perfect Store weighted scorer. |
| 5 | Snapshot Scheduler | ✅ | `snapshotReps` batch + `/api/internal/kpi-snapshot` cron + `vercel.json` (#169). |
| 6 | Event Wiring | ✅ | Census showed most already wired; added `goods.received` + `customer.approved` (#170). |
| 7 | Van Load Manifest | ✅ | `erp_van_load_manifests`/`_lines` (#171, migration `0194`). |
| 8 | Offline Sync foundation | ◑ Design captured | `OFFLINE_SYNC_FOUNDATION.md` — additive landing model + conflict policy; **full engine needs an architectural sign-off** (checkpoint). |

## Migrations (additive, validated)
`0193` rep-day KPI snapshots · `0194` van load manifest. Both idempotent, FK-covered,
RLS branch-scoped, schema-health invariants pass; CI staging-apply green. Rollback =
flags-OFF + inert schema; no data mutation.

## Cross-cutting (unchanged, re-verified)
Multi-company / multi-branch / multi-salesman, supervisor hierarchy, route ownership,
approval workflows — all intact (RLS via `erp_user_branch_ids()` / company scoping;
service-role cron sets company/branch explicitly). New UI is inert by default (no UX
regression; Playwright green every PR).

## Tests
Distribution module: allocation/settlement, coverage engine/read-model/snapshot/scheduler,
scorecard — **full suite 858+ unit green**; **38 integration** (incl. collections e2e +
multi-company). Build clean.

## Remaining (owner greenlight)
- **Offline-first sync engine** (priority 8 build) — needs the client-storage + sync-
  protocol + conflict-policy decision in `OFFLINE_SYNC_FOUNDATION.md`.
- **Van manifest service/UI** (model `0194` is in place; load→sell→reconcile wiring + a
  page are the next additive step).
- **Snapshot scheduler enablement** (cron is wired; flip `KAKO_DISTRIBUTION` + set
  `CRON_SECRET` on the pilot tenant).
- Perfect Store / MSL / OOS dashboards already exist; **customer-health scorecard** can
  reuse the rep-scorecard pattern.

## Stop-conditions
None encountered. The one architectural decision (offline sync protocol) is surfaced as
a checkpoint with a recommended default, not silently resolved.

**Conclusion:** Phase 3.x priorities 1–7 are **delivered, tested, and staging-ready
behind default-OFF flags / inert routes**; priority 8 (offline sync) is **designed and
ready to build pending an architectural sign-off**. No existing behaviour changed.
