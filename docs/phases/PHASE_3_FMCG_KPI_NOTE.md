# VANTORA — Phase 3 FMCG KPI & Collections Closure Note

**Date:** 2026-06-07 · **Status:** additive Phase-3 enhancements complete & staging-ready
(flags OFF). Companion to `PHASE_3_READINESS_REPORT.md`.

This note records the additive enhancements layered onto the already-extensive FMCG
domain, in the prioritized areas, plus how dashboards consume them.

## Delivered (this Phase-3 cycle)

### Collections & Settlement (priority 5) — gap closed
- **Allocation engine** (pure, #159) — multi-invoice settlement, oldest-first / specified, on-account remainder; never over-applies.
- **Model** (`0192`, #160) — `erp_collections` + `erp_collection_allocations` (parallel to legacy `erp_payments`; duplicate-safe; branch RLS).
- **Settlement service** (#161) — allocate → persist receipt + allocations → apply to invoices.
- **e2e + multi-company** (#163) — full settle flow + tenant isolation + constraints.

### Coverage / Supervisor KPIs (priorities 2, 3, 8)
- **KPI engine** (pure, #162) — coverage% / adherence% / strike-rate% / missed / off-route / productive + team roll-up.
- **Read-model service** (#164) — feeds the engine from `erp_today_journey` (plan) + `erp_visits` (actuals); per-rep and team.
- **Snapshot model** (`0193`, #165) — `erp_rep_day_kpis` (one snapshot per rep-day, upsert-idempotent).
- **Snapshot service** (#166) — compute via read-model → upsert snapshot.

## How a dashboard consumes this (no further model change)
```
live view  : getRepDayCoverage / getTeamDayCoverage  → on-the-fly KPIs (today)
historical : nightly snapshotRepDay → erp_rep_day_kpis → trend/leaderboard queries
```
Both paths are branch-RLS scoped (multi-company/branch/salesman safe) and read the
existing journey/visit data — no change to how visits/orders are recorded.

## Prioritized areas — where they stand
| Area | State |
|------|-------|
| Journey Plans & Route Mgmt | Pre-existing (reused). |
| Coverage Compliance | Pre-existing + **KPI engine/read-model/snapshot (new)**. |
| Supervisor Monitoring | Approvals pre-existing + **team KPI roll-up + snapshots (new)**. |
| Van Sales | Pre-existing (stock requests, reconciliation). |
| Collections & Settlement | **Multi-invoice settlement (new)** atop legacy payments. |
| Returns Workflow | Pre-existing (reasons catalog, analytics, atomic completion). |
| Route Reconciliation | Pre-existing (`erp_van_reconciliations`, variance, approval). |
| KPI Read Models & Dashboards | **New** read-models + persisted snapshot table. |

## Discipline upheld
Additive-only migrations (`0192`, `0193`; idempotent; FK-covered; schema-health pass) ·
flags OFF (`KAKO_DISTRIBUTION`) · multi-company RLS + auditability intact · no UX
regression (no UI changed) · reuse-over-rebuild (engine→read-model→snapshot pattern,
reusing `erp_today_journey`/`erp_visits`/`erp_invoices`). Test coverage maintained
(**849 unit + 38 integration green**).

## Remaining Phase 3.x (owner greenlight — not started)
1. **Offline-first sync & conflict resolution** for field execution.
2. **Van load manifest** (load list linking request→sales→reconciliation).
3. **Domain-event wiring** for remaining sales events (`payment.received`, `visit.completed`, `order.approved`).
4. **Dashboard UI** surfacing the KPI read-models/snapshots.
5. **Scorecards**: Perfect Store / MSL / OOS / merchandising / near-expiry / customer-health (all additive per the extensibility matrix).
6. **Nightly snapshot scheduler** (the snapshot service exists; needs a scheduled trigger).

No stop-conditions encountered. All new behaviour inert behind default-OFF flags.
