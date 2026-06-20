# Visual Territory Planning — Design & Implementation Plan (VTP)

**Workstream:** TIS stage #7 — Visual Territory Planning, on TIS-0 scenarios + Geo + RO + Audit
**Status:** Design (first package) — autonomous phased execution, escalate at the Apply write-fork
**Date:** 2026-06-19

---

## 1. Objective

Let a manager **interactively plan territories** — move customers between routes / days /
salesmen, watch the metrics update live, compare scenarios (Current · A · B · C), and
export / apply. Simple Mode default. Builds entirely on the TIS-0 scenario model, the Geo map,
and the RO balancer (which seeds a starting scenario). Usable standalone (export) and in
VANTORA (apply, fork). Validated on the Jeddah demo.

---

## 2. Current State (audit)

- **Exists:** TIS-0 scenario engine (`applyScenario` · `scenarioMetrics` · `compareScenarios`),
  the RO balancer (seeds an initial scenario), the Geo MapLibre surface + `GeoLayer`s, the
  single-model CSV export (RO-3), and the Jeddah demo.
- **Gap:** there is **no interactive editing** — nothing lets a user *mutate* a scenario
  (move a customer) and see live metrics, manage multiple named scenarios, or drag between
  routes/days/salesmen. The scenario math is all there; the editing surface + edit operations
  are not.

---

## 3. Reuse Analysis

| Need | Asset | Reuse |
| :--- | :--- | :--- |
| Scenario apply / metrics / compare | TIS-0-3 | 100% |
| Seed scenario | RO balancer (`balanceRoutes`) | 100% |
| Map + layers | Geo (GEO-1/2, MapLibre) | 100% |
| Single-model export | RO-3 (`datasetToCsv`) | 100% |
| Per-route balance | `tis/balance.ts` | 100% |
| Demo data | Jeddah demo tenant | 100% |

**≈85% reuse.** Net-new: pure **scenario edit operations** + a **drag-and-drop planning
surface** (board / calendar / map) with live metrics + scenario management.

---

## 4. Architecture

```
VTP-1  edit ops (pure)   setAssignment / moveCustomer / removeAssignment / cloneScenario
                         + liveMetrics(dataset, scenario) (reuses scenarioMetrics) + diff vs base
VTP-2  planning board    route columns (kanban) · drag a customer card route→route (+ day/salesman)
                         · live metric header · scenario tabs (Current·A·B·C) · seed from RO · Export
VTP-3  map + calendar     select-on-map → assign · colour by scenario route · per-day calendar view
VTP-4  Apply (fork)       publish scenario to live routes/journey plans — ESCALATE (= RO-4 write)
```

- **Each edit appends/updates a `ScenarioAssignment`** (TIS-0-3) → metrics recompute **instantly
  client-side** (the engine is pure), so the planning loop has zero server round-trips until
  Export/Apply.
- **Multiple scenarios** are just multiple `Scenario` instances; `compareScenarios` renders the
  Current·A·B·C table.
- **Drag-and-drop** is easiest on a **route board** (kanban columns) + **calendar** (day columns);
  the **map** uses select-then-assign (dragging points across map space is fiddly). All three
  edit the same scenario state — consistent with the roadmap (drag from route boards / calendar /
  map).
- **Mode A/B/C:** editing works on any dataset (Mode A upload included); coverage/health overlays
  light up when present.

---

## 5. Phased Plan (autonomous; escalate at VTP-4)

| Phase | Scope | Fork? |
| :--- | :--- | :--- |
| **VTP-1** | Pure scenario edit ops (move/set/remove/clone) + live-metrics/diff + tests | No |
| **VTP-2** | Planning board (route kanban + drag-and-drop) + live header + scenario tabs + seed from RO + Export | No |
| **VTP-3** | Map (select→assign, colour by route) + calendar (day) views over the same state | No |
| **VTP-4** | Apply scenario to live routes/journey plans | **Escalate** (write architecture; = RO-4) |

Completion review at each boundary. VTP-4 pauses for approval (it is the same live-route write
decision as RO-4 — a single escalation covers both).

---

## 6. Simple Mode (mandatory)

- Opens on a **seeded plan** (one click "Optimize" from RO) shown as route columns; drag a
  customer to another route → the header numbers (routes · visits · distance · balance · coverage)
  update instantly. No weights/jargon.
- Advanced (opt-in): objective weights, multiple scenarios, day/salesman moves.
- Export anytime (single model); Apply is the only platform-dependent step.

---

## 7. Escalation / Forks

- **VTP-4 Apply** = writing live `erp_route_customers` / `erp_journey_plans` (reassigning routes
  + republishing plans). This is a **material write-architecture decision** (same one as RO-4) —
  I will pause and escalate before building it. Everything up to and including **Export** is
  standalone-safe and proceeds autonomously.

---

## 8. Validation & Completion

`tsc` + `vitest` (VTP-1 pure, on the Jeddah demo); `next build` at VTP-2+. Completion review per
phase: behavior, Simple Mode, role behavior, reuse, validation, next.
