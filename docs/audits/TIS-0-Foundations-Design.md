# TIS-0 — Shared Dataset Model + Scenario State (Foundations) — Design & Plan

**Workstream:** Territory Intelligence Studio → TIS-0 (foundation for all later stages)
**Status:** Design only — no implementation yet (gated; awaiting approval)
**Date:** 2026-06-19

---

## 1. Objective

Define the **one canonical dataset** and the **one scenario state** that every TIS stage
(Audit · Sizing · Optimization · Visual Planning · Geo) reads and writes — so each stage is a
thin function over a shared contract, not a silo. This is the substrate that makes the
unification (strategy §3) and graceful degradation (§4a) real, and the lowest-friction
**Google Sheet → Audit → Sizing → Optimization → Planning → Write-back** loop possible.

Pure, framework-free types + builders + validators + scenario math. **No DB, no UI** in TIS-0.
Adapters (live DB / uploaded rows / Sheets) sit *above* it and are later phases.

---

## 2. The Shared Dataset Model (canonical)

One row type per customer, assembled from existing engines — the **single data model** that
Export ≡ Import ≡ Apply (RO §4a) already implies:

```
TisCustomer {
  id, code, name
  geo:        { lat, lng } | null
  ownership:  { salesmanId, supervisorId, areaId, regionId, routeId } (any null)
  grade:      'a'|'b'|'c'|... | null            (outlet-grade.ts)
  frequency:  VisitFrequency | null             (FR resolver — workload source)
  salesValue: number | null                     (optional; from sales history)
  coverage:   CoverageStatus | null             (Coverage Engine, CV-1/CJ-3)
  health:     number | null                     (optional; Customer Health)
}

TisDataset {
  customers:  TisCustomer[]
  asOf:       ISO date
  mode:       'A' | 'B' | 'C'                   (graceful degradation §4a)
  capabilities: CapabilityFlags                 (derived — see §3)
  source:     'live' | 'upload' | 'sheets' | ...
}
```

- **Every field is optional except identity + presence in the set.** Missing fields don't break
  the model — they downgrade capabilities (§3). A Mode-A upload (geo + maybe sales) and a Mode-C
  live tenant produce the *same* shape.
- **Workload** derives from `frequency` via the FR resolver (`frequencyToVisitsPerWeek`) — the
  authority already built (FR-1…FR-6). No new frequency logic.
- Pure builders: `buildTisCustomer(partial)`, `buildTisDataset(rows, meta)`; validators flag
  rows missing identity/geo for the capabilities that need them.

## 3. Capability Matrix (graceful degradation, in code)

A pure function `resolveCapabilities(dataset) → CapabilityFlags` decides which stages/features
are available from **what data is present**, not from build flags:

| Capability | Requires |
| :--- | :--- |
| Territory Audit | geo + (grade or frequency) |
| Sales Force Sizing | frequency (workload) + rep capacity; sales value optional |
| Route Optimization | geo + frequency |
| Visual Planning / Map | geo |
| Coverage overlay | coverage (Mode B/C) |
| Health / GPS overlays | health / live execution (Mode C) |

This is the single source of truth behind "feature enables/disables by available data" — the
same flags drive Mode A/B/C UI and the "needs X" empty states.

## 4. Shared Scenario State

One scenario model threading Audit → Sizing → Optimization → Planning, compared on the same
metrics — pure, no I/O:

```
ScenarioAssignment { customerId, routeId?, dayOfWeek?, salesmanId? }   // overrides vs base
Scenario { id, name, base: 'current'|scenarioId, assignments: ScenarioAssignment[] }
ScenarioMetrics { customers, visits(workload), salesValue, distance, coveragePct, routeBalance }
```

Pure engine:
- `applyScenario(dataset, scenario) → effective TisDataset` (overrides layered on base).
- `scenarioMetrics(effective) → ScenarioMetrics` (reuses FR workload, Coverage rollup CV-1,
  distance from `optimize.ts`).
- `compareScenarios([current, A, B, C]) → table` for the Visual Planning compare view.

"Current Plan · Scenario A · B · C" are just instances; drag-and-drop edits (future) append
`ScenarioAssignment`s. Deterministic + testable.

---

## 5. Reuse Analysis

| Need | Existing asset | Reuse |
| :--- | :--- | :--- |
| Frequency / workload | FR resolver (FR-1…6) | 100% |
| Coverage status + rollup | Coverage Engine (CV-1) | 100% |
| Outlet grade / priority | `outlet-grade.ts` | 100% |
| Distance / sequencing | `optimize.ts` | 100% |
| Customer geo / ownership | `erp_customers` columns | 100% |
| Single import/export shape | `entities.ts` customer descriptor | 100% |

**Estimated reuse ≈ 90%.** Net-new in TIS-0: the `TisCustomer`/`TisDataset` types, the
capability matrix, and the scenario state + metrics math. All pure.

---

## 6. Implementation Plan (phased, gated, Simple-Mode mandatory)

| Phase | Scope | Effort | Risk |
| :--- | :--- | :--- | :--- |
| **TIS-0-1** | Canonical dataset model: `TisCustomer`/`TisDataset` types + pure builders/validators + tests | ~0.5–1d | Low (pure) |
| **TIS-0-2** | Capability matrix `resolveCapabilities` (Mode A/B/C derivation) + tests | ~0.5d | Low |
| **TIS-0-3** | Scenario state + metrics: `applyScenario`, `scenarioMetrics`, `compareScenarios` (pure) + tests | ~1d | Low–Med |
| **TIS-0-4** | Adapters: `buildTisDataset` from (a) live RLS DB and (b) uploaded rows — composes FR + Coverage + grade loaders | ~1d | Med (I/O) |

No UI in TIS-0; the first visible surface is Territory Audit (next workstream) built on this.

## 7. Simple Mode (mandatory)

- The dataset carries **plain, engine-derived fields** (frequency, coverage, grade) — no
  configuration to assemble it.
- Capabilities resolve automatically from present data; a non-expert never selects a "mode."
- Scenario metrics read in business terms (customers · visits · sales · distance · coverage ·
  balance) — no weights exposed at this layer.

## 8. Recommendation

Proceed **TIS-0-1 → TIS-0-2 → TIS-0-3** (the pure foundation: model + capabilities + scenarios)
first, then **TIS-0-4** (adapters). One validated phase per commit, review per phase. This locks
the shared contract before Territory Audit / Geo / Optimization build on it — preventing rework.

Awaiting approval of the model shape + plan before TIS-0-1.
