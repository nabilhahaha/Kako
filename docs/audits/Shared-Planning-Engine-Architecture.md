# Shared Planning Engines — Architecture Principle

**Direction:** Planning concepts are **platform capabilities, not TIS-only**. Visit
duration, max visits/day, working days, capacity rules, journey-planning rules, and
day-assignment logic are shared engines reused across modules. The UI may differ; the
underlying planning logic is shared and never duplicated.
**Date:** 2026-06-19 · **Status:** Adopted.

---

## 1. Single source of truth: `@/lib/planning`

A canonical barrel `src/lib/planning/index.ts` exposes the framework-agnostic, pure
planning primitives. **Every planning surface imports from here** — it does not
re-implement planning rules:

| Concern | Shared primitive(s) |
| :--- | :--- |
| Frequency / workload | `parseFrequency`, `frequencyToVisitsPerWeek`, `resolveVisitFrequency`, `customerWorkload` |
| Working days · day assignment | `BUSINESS_DOW`, `workingDayList` (+ day-spread inside `balanceRoutes`) |
| Route balancing · capacity / constraints · feasibility | `balanceRoutes`, `resolveRouteCount`, `validateConstraints` (`RouteConstraints`, `FeasibilityResult`) |
| Scope (Region → Salesman → Route) | `scopeCustomers`, `scopeOptions`, `initialScope`, … |
| Scenario model · metrics · compare | `applyScenario`, `scenarioMetrics`, `compareScenarios` |
| Scenario edits (board / journey) | `setAssignment`, `moveCustomer`, `reassignSalesman`, `reassignDay`, `cloneScenario`, `currentPlanScenario` |

All are **pure (no I/O)** and already consumed by the TIS Studio and the standalone
board today.

## 2. Consumers (current + planned)

`@/lib/planning` is the shared engine layer for:

1. **New Optimization** (Excel-in/out session)
2. **Territory Intelligence Studio**
3. **Journey Planning**
4. **Route Management**
5. Future planning workflows

Each module builds its **own UI** (Simple/Advanced/Expert tiers per the Simplicity
Model) but calls the **same** engines.

## 3. Rules

- **Do not duplicate planning rules.** New planning logic lands in the shared layer,
  not inside a module/page.
- **Import from `@/lib/planning`** (not deep paths) in new planning surfaces; a smoke
  test (`planning/index.test.ts`) guards the surface.
- **Future shared additions** (per the capability assessment) land here too: a
  **visit-duration resolver** (customer → class → channel → global default), a
  **travel-time** model, **time-based capacity** (minutes/day), and **monthly cadence
  expansion** for journey planning — all as shared engines, exposed through this barrel.

## 4. Note on file locations

Some primitives physically live under `src/lib/tis/` and
`src/lib/route-optimization/` for now; the barrel makes `@/lib/planning` their
**canonical import surface** without a risky mass-move. Physical relocation into
`src/lib/planning/*` can follow later as a pure refactor if desired — consumers that
already import from `@/lib/planning` would be unaffected.
