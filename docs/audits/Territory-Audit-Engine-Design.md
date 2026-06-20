# Territory Audit Engine — Design & Implementation Plan

**Workstream:** TIS stage #1 (Territory Audit) — first read-model + surface on TIS-0
**Status:** Design + autonomous phased execution (gated only at architecture forks)
**Date:** 2026-06-19

---

## 1. Objective

Turn the TIS-0 dataset into an **at-a-glance territory health audit**: where coverage is
leaking, where territories/routes are unbalanced, how customers are distributed, and where the
white-space (un-worked outlets) is. Pure read-model over `TisDataset`, surfaced in **Simple
Mode**, degrading gracefully by available data (TIS-0-2 capabilities), and reusable by Geo,
Route Optimization, and Sales Force Sizing.

**Surfaces (required):** Coverage gaps · Territory imbalance · Route imbalance · Customer
distribution · White-space opportunities.

---

## 2. Current State (audit)

- **Inputs exist:** TIS-0 `TisDataset` already carries geo · ownership · grade · frequency
  (workload) · coverage · salesValue. The Coverage Engine (CV-1) gives coverage rollups; the
  scenario layer (TIS-0-3) already computes a workload **balance %** (`balancePct`).
- **Gap:** there is **no audit synthesis** — no single pass that turns those signals into
  ranked findings (gaps, imbalance, distribution, white-space) a manager can act on. Signals
  are present; the audit read-model is not.
- **White-space caveat:** true market white-space (prospects who are *not yet customers*)
  needs an external/market source the platform doesn't hold. The available-data audit surfaces
  **internal white-space** — outlets that exist but are **un-worked** (unassigned · never
  visited · no cadence). True prospect white-space is a Geo/data-source follow-on (noted).

---

## 3. Gap Analysis

| # | Gap | Severity |
| :--- | :--- | :--- |
| TA-G1 | No coverage-gap synthesis (under/never as ranked findings by territory/route) | High |
| TA-G2 | No territory imbalance metric (workload/value/count spread across region/area/salesman) | High |
| TA-G3 | No route imbalance metric | High |
| TA-G4 | No customer-distribution summary (by grade · coverage · assignment) | Medium |
| TA-G5 | No internal white-space detection (unassigned · never-visited · no-cadence) | Medium |
| TA-G6 | No Simple-Mode audit surface | High |

---

## 4. Reuse Analysis

| Need | Asset | Reuse |
| :--- | :--- | :--- |
| Customer dataset | TIS-0 `TisDataset` / `loadTisDataset` | 100% |
| Capability gating | TIS-0-2 `resolveCapabilities` | 100% |
| Coverage rollup | Coverage Engine (CV-1) `rollupCoverage` | 100% |
| Workload | `customerWorkload` (FR) | 100% |
| Balance metric | `balancePct` (TIS-0-3 — promote to shared util) | 100% |
| Group rollup pattern | `groupCoverageRollup` (CV-1) | pattern |

**Estimated reuse ≈ 85%.** Net-new: the audit read-model (findings synthesis) + one Simple-Mode
surface. One small refactor: promote `balancePct` to a shared `tis/balance.ts`.

---

## 5. Recommended Architecture

### 5.1 Pure audit engine — `tis/audit.ts`
`auditTerritory(dataset, opts) → TerritoryAudit`, capability-aware (skips sections whose data
is absent). Pure:

```
TerritoryAudit {
  mode, capabilities,
  coverageGaps:   { rollup, byGroup[] }          // under+never, grouped (salesman/route/region)
  territoryBalance: GroupBalance[]                // per region/area/salesman: count·workload·value + balance%
  routeBalance:     GroupBalance[]                // per route
  distribution:   { byGrade[], byCoverage[], assigned/unassigned }
  whiteSpace:     { unassigned[], neverVisited[], noCadence[] , counts }
  headline:       { coveragePct, gapCount, worstBalancePct, whiteSpaceCount }   // Simple-Mode summary
}
```
- **Balance** per dimension = `balancePct` over a chosen weight (workload by default; value/count
  optional) — 100 = even. Reuses the scenario balance math.
- **Coverage gaps** reuse `rollupCoverage` + grouping; degrade to "needs coverage data" in Mode A.
- **White-space** = pure predicates over the dataset (no external source).

### 5.2 Server + surface (Simple Mode)
- `loadTerritoryAudit(supabase, opts)` = `auditTerritory(loadTisDataset(...))` (live) — and the
  same engine runs on an uploaded dataset (Mode A) with no change.
- One page `/distribution/territory-audit`: a **headline strip** (Coverage % · gaps · least
  balanced group · white-space count) + cards per section, each drilling into the existing
  coverage list / customer list. No weights or thresholds on the default screen.

### 5.3 Forward compatibility
- **Geo Intelligence:** the audit's per-group + white-space outputs are map layers later.
- **Route Optimization:** imbalance findings seed "rebalance" scenarios (TIS-0-3 scenarios).
- **Sales Force Sizing:** territory workload totals feed headcount sizing directly.

---

## 6. Implementation Plan (phased, autonomous; review at boundaries)

| Phase | Scope | Effort |
| :--- | :--- | :--- |
| **TA-1** | Pure audit engine (`audit.ts`) + shared `balance.ts` refactor + tests | ~1d |
| **TA-2** | Server loader + Simple-Mode `/distribution/territory-audit` surface + i18n + nav | ~1–1.5d |
| **TA-3** | Drill-downs + capability empty-states polish; (optional) scenario-aware re-audit | ~0.5–1d |

One validated phase per commit; completion review at each boundary. Architecture forks (e.g.
introducing a prospects/white-space data source) pause for approval.

---

## 7. Simple Mode (mandatory)

- Opens on a **one-line headline + a few numbers** (Coverage % · gaps · least-balanced group ·
  white-space outlets); plain language, no weights/thresholds.
- Drill-downs reuse existing lists. Advanced (weight by value vs workload, thresholds) is opt-in
  behind an "Advanced" affordance.
- Runs identically on a Mode-A upload and a Mode-C tenant; absent data shows "needs X", never
  blocks.

---

## 8. Validation & Completion

`tsc` + `vitest` per phase; `next build` once a route exists (TA-2+). Completion review per
phase: what shipped, Simple-Mode behavior, role behavior, reuse, validation, next.
