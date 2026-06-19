# Route Optimization Studio — Design & Implementation Plan (RO)

**Workstream:** TIS stage #6 — Route Optimization Studio, on TIS-0 + Scenarios + Geo + Audit + FR
**Status:** Design + autonomous phased execution (escalate at write/architecture forks)
**Date:** 2026-06-19

---

## 1. Objective

Generate **balanced routes** from a customer set — balanced by **workload & value, not customer
count** — under user-set constraints, preview them on the map + scenario metrics, compare vs the
current plan, and **export** (single data model) / later apply. Simple Mode default + Advanced
weights. Usable standalone (export) and inside VANTORA. Mode A/B/C aware.

---

## 2. Current State (audit)

- **Exists:** `optimize.ts` (per-route stop sequencing + distance), `generator.ts` (per-route
  day-spread by frequency), `territory.ts` (split/merge), the FR workload model, TIS-0 scenarios
  (`applyScenario`/`scenarioMetrics`/`compareScenarios`), Geo layers, Territory Audit imbalance.
- **Gap:** there is **no route-ASSIGNMENT/balancing step** — nothing assigns a customer set into
  *K balanced routes* by workload/value/geography under constraints. The pieces downstream
  (sequence, day-spread, metrics, map) exist; the balancer that produces the assignment does not.

---

## 3. Gap Analysis

| # | Gap | Severity |
| :--- | :--- | :--- |
| RO-G1 | No multi-objective route balancer (customers → K routes by workload/value/geo) | High |
| RO-G2 | No constraint resolution (target/max customers per route · max visits/day·week · auto route count) | High |
| RO-G3 | No Studio surface (generate → preview → compare → export) | High |
| RO-G4 | No Excel export in the journey-plan single-model schema | Medium |
| RO-G5 | Apply-to-live (reassign `erp_route_customers`) — a write fork (escalate) | — |

---

## 4. Reuse Analysis

| Need | Asset | Reuse |
| :--- | :--- | :--- |
| Customer dataset + workload | TIS-0 `TisCustomer` + `customerWorkload` (FR) | 100% |
| Scenario apply + metrics + compare | TIS-0-3 | 100% |
| Distance / sequencing | `optimize.ts` | 100% |
| Map preview | Geo layers (GEO-1/2) | 100% |
| Imbalance seed | Territory Audit (TA-1) | 100% |
| Balance metric | `tis/balance.ts` | 100% |

**≈85% reuse.** Net-new: the **pure balancer** + constraint resolution + the Studio surface +
Excel export.

---

## 5. Recommended Architecture

```
RO-1  balancer (pure)   balanceRoutes(customers, constraints) → ScenarioAssignment[] (+ per-route summary)
                        geo-seed (farthest-point) → nearest-seed clusters → workload rebalance under caps
RO-2  Studio surface    scope + working days (+ Advanced: routeCount/maxPerRoute/weights) → Generate
                        → preview: scenarioMetrics + per-route table + Geo map (coloured by new route)
                        → compareScenarios vs Current Plan
RO-3  Export            Excel in the journey-plan import schema (single data model, §4a)
RO-4  Apply (fork)      reassign erp_route_customers + journey plans — ESCALATE (write architecture)
```

- **Output is a TIS-0 Scenario** (route assignments) → it flows straight into `scenarioMetrics`,
  `compareScenarios`, and the Geo map, and is **drag-and-drop ready** for Visual Territory
  Planning (each manual move appends a `ScenarioAssignment`).
- **No hardcoded counts:** route count is user-set or auto-derived from workload + capacity
  (`ceil(total weekly visits / (maxVisitsPerDay × workingDays))`), never a fixed number.
- **Mode A/B/C:** balances on whatever weight is present (workload always; value/geo when
  available); standalone upload (Mode A) works end-to-end to Export.

---

## 6. Phased Plan (autonomous; escalate at RO-4)

| Phase | Scope | Fork? |
| :--- | :--- | :--- |
| **RO-1** | Pure `balanceRoutes` + constraint resolution + tests | No |
| **RO-2** | Studio surface: generate → preview (metrics + per-route table + map) → compare | No |
| **RO-3** | Excel export (single-model schema) | No |
| **RO-4** | Apply to live routes/journey plans | **Escalate** (write architecture) |

Completion review at each boundary. RO-4 pauses for approval (reassigning live routes is a
material write decision).

---

## 7. Simple Mode (mandatory)

- Default: **pick scope + working days → Generate → see the plan + map + compare → Export.** No
  weights or caps required; sensible defaults (balance by workload, auto route count).
- Advanced (opt-in): route count, max per route, objective weights (count · workload · value ·
  distance · capacity). Hidden behind an "Advanced" affordance.
- Results read plainly ("8 routes · ~120 stops each · balanced by visits"); scores in Advanced.

## 8. Validation & Completion

`tsc` + `vitest` (RO-1 pure); `next build` at RO-2+. Completion review per phase: behavior,
Simple Mode, role behavior, reuse, validation, next.
