# TIS-0 Foundations — Completion Review

**Workstream:** Territory Intelligence Studio → TIS-0 (Shared Dataset + Scenario State)
**Branch / PR:** `claude/pilot-ux` · PR #319
**Status:** Complete · validated · pushed
**Date:** 2026-06-19

---

## 1. Objective (met)

Establish the **one canonical dataset** and **one scenario state** that every TIS stage
(Audit · Sizing · Optimization · Visual Planning · Geo) reads and writes — pure, framework-free,
assembled ~90% from existing engines — so later stages are thin functions over a shared
contract, and the Mode-A `Google Sheet → … → Write-back` loop shares the contract with a Mode-C
live tenant.

---

## 2. Phases Delivered

| Phase | Commit | Scope | Tests |
| :--- | :--- | :--- | :--- |
| **TIS-0-1** Dataset model | `9b75cb8` | `TisCustomer` / `TisDataset` + builders / validators / `customerWorkload` / presence predicates | 9 |
| **TIS-0-2** Capability matrix | `259e39c` | `resolveCapabilities` → available stages/overlays from present data + Mode A/B/C | 7 |
| **TIS-0-3** Scenario + metrics | `13fd601` | `applyScenario` / `scenarioMetrics` / `compareScenarios` (Current · A · B · C) | 7 |
| **TIS-0-4** Adapters | `e200568` | `buildTisDatasetFromRows` (upload) + `loadTisDataset` (live DB) → same shape | 6 |

---

## 3. The Canonical Model

```
TisCustomer { id · code · name · geo · ownership{salesman,supervisor,area,region,route}
              · grade · frequency(VisitFrequency) · salesValue? · coverage? · health? }
TisDataset  { customers · asOf · source }
```

- **Every field optional except identity** → a Mode-A upload (geo, maybe sales) and a Mode-C
  live tenant produce the **same shape**; missing fields downgrade capabilities, never break.
- **Workload** derives from `frequency` via the FR resolver (FR-1…FR-6). **Coverage** from the
  Coverage Engine (CV-1/CJ-3). **Grade** from outlet-grade. No new business logic.
- This is the Export ≡ Import ≡ Apply single data model (strategy §4a/§4b).

## 4. Graceful Degradation (in code)

`resolveCapabilities(dataset)` decides which features light up from **what data is present**
(≥ 50% of customers, configurable), and derives the mode:

| Capability | Requires | Mode |
| :--- | :--- | :--- |
| Visual Planning / Map | geo | A |
| Route Optimization | geo + frequency | A |
| Territory Audit | geo + (grade or frequency) | A |
| Sales Force Sizing | frequency (workload) | A |
| Coverage overlay | coverage | B |
| Health overlay | health | C |

Mode A = optimization-only · B = coverage present · C = coverage + health. The same flags drive
the Mode A/B/C UX and "needs X" empty states — no build flags, no mode picker.

## 5. Scenario State + Metrics

One scenario model threads Audit → Sizing → Optimization → Planning and compares on identical
metrics:

- `applyScenario(dataset, scenario)` — per-customer route/salesman/day overrides, immutable.
- `scenarioMetrics` — customers · **visits** (Σ workload via FR) · **salesValue** · **distance**
  (via the route optimizer) · **coveragePct** (Coverage rollup) · routeCount · **routeBalance%**.
- `compareScenarios(base, [A,B,C])` — Current Plan + each scenario on the same metrics (the
  Visual Planning compare view).

## 6. Adapters (both entry points, one shape)

- **Upload (pure):** `buildTisDatasetFromRows` maps parsed Sheet/Excel/connector rows →
  `TisCustomer` (lenient FR frequency coercion, geo parse, coverage validation, id synthesis).
- **Live (server):** `loadTisDataset` composes RLS-scoped `erp_customers` + Coverage Engine +
  FR customer-level frequency + rep→supervisor chain. Best-effort/read-only; sales/health/
  grade-history are later enrichments.

## 7. Reuse

| Need | Asset | Reuse |
| :--- | :--- | :--- |
| Frequency / workload | FR resolver (FR-1…6) | 100% |
| Coverage status / rollup | Coverage Engine (CV-1) | 100% |
| Distance / sequencing | `optimize.ts` | 100% |
| Grade · geo · ownership | existing tables/engines | 100% |

**≈90% reuse.** Net-new: the model types, capability matrix, scenario math, two adapters — all
pure except the live loader.

## 8. Simple Mode

Engine-derived fields (no assembly config); capabilities resolve automatically (no mode picker);
scenario metrics read in business terms (customers · visits · sales · distance · coverage ·
balance) — no weights exposed at this layer.

## 9. Validation

| Check | Result |
| :--- | :--- |
| `tsc --noEmit` | Clean (all four phases) |
| `vitest` (full) | **1713 passed** / 192 skipped · 0 regressions (+23 TIS) |
| Build | Not required — pure libs + one server loader, no route/UI surface yet |

## 10. Next

**Territory Audit Engine** (priority #4) builds its first read-model + Simple-Mode surface
directly on this TIS-0 dataset (coverage gaps · white-space · territory/route imbalance ·
distribution analysis), reusing `resolveCapabilities` to degrade gracefully. To be opened with
an audit-first design package (gated), Simple Mode enforced.
