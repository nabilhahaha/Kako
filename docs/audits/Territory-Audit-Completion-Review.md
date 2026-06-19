# Territory Audit Engine — Completion Review

**Workstream:** TIS stage #1 — Territory Audit (on TIS-0)
**Branch / PR:** `claude/pilot-ux` · PR #319
**Status:** Complete (TA-1 engine + TA-2 surface) · validated · pushed
**Date:** 2026-06-19

---

## 1. Objective (met)

Turn the TIS-0 dataset into an at-a-glance territory health audit, in Simple Mode, degrading
gracefully by available data, reusable by Geo / Route Optimization / Sales Force Sizing.

**All five required surfaces delivered:** Coverage gaps · Territory imbalance · Route imbalance ·
Customer distribution · White-space opportunities.

---

## 2. Phases

| Phase | Commit | Scope | Tests |
| :--- | :--- | :--- | :--- |
| **TA-1** Engine | `15031ac` | Pure `auditTerritory` + shared `balance.ts` refactor | 8 |
| **TA-2** Surface | `9af3267` | `loadTerritoryAudit` + Simple-Mode `/distribution/territory-audit` + i18n + nav | — |

---

## 3. What Shipped

**Engine (`tis/audit.ts`, pure):** `auditTerritory(dataset) → TerritoryAudit`:
- **Coverage gaps** — under + never, via the Coverage Engine rollup (CV-1), per salesman.
- **Territory / route imbalance** — `BalanceSection` per region & route: customers · workload ·
  value · coverage %, plus a **workload balance %** (shared `balancePct`).
- **Customer distribution** — by grade · by coverage · assigned/unassigned.
- **Internal white-space** — unassigned · never-visited · no-cadence outlets (deduped).
- **Headline** — customers · coverage % · gap count · least-balanced group · white-space count.
- Capability-aware: sections omit when their signal is absent (Mode A vs B/C).

**Surface (`/distribution/territory-audit`, Simple Mode):** headline strip + cards per finding,
drill-downs into the coverage/customer lists, "needs X" empty states, ungated under
`reports.view`. The **same engine** runs on a Mode-A upload.

---

## 4. Simple Mode

Opens on four numbers (Coverage % · gaps · least-balanced group · white-space) in plain
language; no weights/thresholds on the default screen. Drill-downs reuse existing lists.

## 5. Role Behavior (RLS-scoped)

| Role | What they see |
| :--- | :--- |
| **Salesman** | audit over own customers — own gaps/white-space |
| **Supervisor** | team audit — which rep/route is weakest, worst-balanced first |
| **Manager** | branch/region audit — territory & route imbalance, distribution, white-space |

## 6. Reuse

TIS-0 dataset + capabilities · Coverage Engine rollup (CV-1) · FR workload · shared balance
metric · existing lists for drill-down. **≈85% reuse**; net-new is the audit synthesis + one
page. One refactor: `balancePct` promoted to `tis/balance.ts` (scenario + audit share it).

## 7. Forward Compatibility

- **Geo Intelligence:** per-group + white-space outputs become map layers.
- **Route Optimization:** imbalance findings seed rebalance scenarios (TIS-0-3).
- **Sales Force Sizing:** territory workload totals feed headcount sizing directly.

## 8. Validation

`tsc` clean · **1719 tests** (+8) · `next build` compiled (`/distribution/territory-audit` built).

## 9. Deferred (next workstreams, not gaps)

- **Scenario-aware re-audit** (audit a what-if assignment) — belongs to **Visual Territory
  Planning** (scenario UI), a later workstream / roadmap fork → paused here per direction.
- **True prospect white-space** (non-customers) needs an external/market data source →
  Geo Intelligence follow-on. The current audit surfaces *internal* un-worked outlets only.
- White-space drill-down filters (unassigned / no-cadence) on the customer list — minor polish.

## 10. Next

Per the priority order, **Geo Intelligence Base Map** (#5) is next — it consumes the TIS-0
dataset + this audit's per-group/white-space outputs as its first map layers. To be opened with
an audit-first design package (gated at the map-tech architecture choice).
