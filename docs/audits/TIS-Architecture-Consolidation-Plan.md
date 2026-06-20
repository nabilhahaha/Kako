# TIS — Architecture Consolidation Plan

**Status:** Design / planning only. **No implementation until approved.**
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19
**Goal:** one canonical planning layer; one journey generator; an official TIS →
Journey Plan handoff; remove the 5000 truncation; restrict Studio/Journey Builder to
management; keep everything read-only/export until Apply is separately approved.

---

## 1. Current architecture (verified)

Two planning lineages coexist:

```
LEGACY (operational)                         NEW (TIS, sandbox)
─────────────────────                        ──────────────────
route-optimization/                          lib/tis/ + lib/planning/
  frequency.ts        FrequencyRule,           dataset.ts        customerWorkload
                      visitsPerWeekFor,         optimize-routes.ts balanceRoutes (+ its
                      visitDaysFor                                 OWN day-spread),
  generator.ts        generateWeeklyPlan ◄──┐                      validateConstraints
  balancing.ts        analyzeBalance        │  scenario.ts        applyScenario,
  territory.ts        assignTerritories     │                     scenarioMetrics,
  optimize.ts ───► erp/journey-sort.ts      │                     compareScenarios
  visit-frequency.ts  VisitFrequency  ◄─────┼── (TIS uses this)
  frequency-resolver  resolveVisitFrequency ◄┼── (shared)
  customer-frequency  resolveFrequencyForCustomer
                                            │  plan-edit.ts, scope.ts, audit.ts,
                                            │  geo.ts, export.ts, upload.ts,
                                            │  planning/visit-duration.ts
CONSUMERS                                   │  planning/index.ts (barrel, TIS side)
  journey-plan ──writes erp_journey_plans──┘  CONSUMERS
  (generate + apply)                            studio, planning-board,
  entity360/registry → analyzeBalance           route-optimizer, journey-builder,
                                                 territory-audit, geo, new-optimization
                                                 (all read-only + export)
```

**Shared correctly (single owner):** `resolveVisitFrequency` (precedence),
`optimizeRoute`→`journey-sort` (sequencing), `customerWorkload`, `scenarioMetrics`.

**Duplicated / parallel:**
| Concern | Legacy | TIS | Note |
| :-- | :-- | :-- | :-- |
| visits/week + day scheduling | `frequency.ts` (`visitsPerWeekFor`, `visitDaysFor`) | `visit-frequency.ts` (`frequencyToVisitsPerWeek`) + `balanceRoutes` day-spread | **two frequency value-models; two day-assigners** |
| weekly journey | `generateWeeklyPlan` (writes DB) | Journey Builder via `balanceRoutes` (export) | **two generators** |
| balance | `analyzeBalance` | `scenarioMetrics`/`balancePct` | **two balancers** |
| territory polygons | `territory.ts` | scope/optimize | `territory.ts` has **no importers** (dead) |

**Blast radius (verified importers):** legacy `frequency.ts` + `generator.ts` → only
`journey-plan` (+ `lib/distribution/journey-plan/proposal.ts`); `analyzeBalance` → only
`entity360/registry.ts`; `territory.ts` → none.

**Semantic gap to resolve:** `generateWeeklyPlan` schedules a customer on **multiple
days/week** (`visitDaysFor` for high frequency); the TIS `ScenarioAssignment` carries a
**single `dayOfWeek`**. The canonical model must support **multi-visit/week**.

---

## 2. Target architecture

One canonical, pure **Planning Engine** behind `@/lib/planning`, consumed identically by
every surface; the UI differs, the logic does not.

```
                         @/lib/planning  (single source of truth)
  ┌───────────────────────────────────────────────────────────────────────┐
  │ frequency:    VisitFrequency · parseFrequency · frequencyToVisitsPerWeek │
  │               resolveVisitFrequency (precedence) · customer-frequency    │
  │ duration:     resolveVisitDuration (cust→channel→class→global) · minutes  │
  │ day-assign:   assignVisitDays(freq, workingDays, capacity)  ◄── ONE impl  │
  │ generate:     generateWeeklyPlan(...)  ◄── ONE canonical journey generator │
  │ balance/cluster: balanceRoutes · resolveRouteCount · validateConstraints  │
  │ sequence:     optimizeRoute → journey-sort (haversine NN)                  │
  │ scenario:     applyScenario · scenarioMetrics · compareScenarios · edits   │
  │ scope:        scope (Region→Salesman→Route) · workload primitive           │
  └───────────────────────────────────────────────────────────────────────┘
        ▲                 ▲                 ▲                 ▲
   journey-plan       TIS Studio        Journey Builder    Route Mgmt
   (APPLY: writes     (read-only)       (read-only)        (routes CRUD,
    erp_journey_plans)                                      dashboards)
        ▲                                       │
        └──────────  TIS → Journey Plan handoff ─┘   (Scenario → erp_journey_plans
                     via the SAME governed apply; gated, escalated, not now)

  data load:  loadScopeIndex() ──► loadTisDataset({region|salesman|route})
              (server-side scoped; no 5000 flat cap; "N of M" when partial)
  access:     Studio + Journey Builder → reports.view (management);
              New Optimization → tis.run_optimization (permission-based)
```

**Single canonical journey generator (Objective 2):** `generateWeeklyPlan` (refactored
onto `VisitFrequency` + the shared resolver). TIS Journey Builder and `balanceRoutes`
day-assignment call **it / `assignVisitDays`** — no second day-assigner.

**Official handoff (Objective 3):** TIS emits a `Scenario`; a mapper converts it to the
`erp_journey_plans` rows the **existing `journey-plan` apply** already writes (conflict
detection + governance reused). This is the **only** write path; it stays **paused/gated**
behind the Apply decision (RO-4/VTP-4) — design now, ship later.

---

## 3. Reuse percentage

| Bucket | Reuse |
| :--- | :--- |
| Sequencing, frequency precedence, workload, scenario/metrics, scope, audit, geo, export, visit-duration | **~100% kept as-is** |
| Journey generator | Keep `generateWeeklyPlan`; **refactor** its frequency dependency (small) |
| Day assignment | Unify two impls into one (`assignVisitDays`) — **mostly delete, small new** |
| Balancing | Keep `balanceRoutes`/`scenarioMetrics`; retire `analyzeBalance` wrapper |
| Data load | **New**: scope-index + scoped loader (small) |
| Handoff | **New**: Scenario→journey-plan mapper (small; design-only now) |

**Net reuse ≈ 85–90%.** Consolidation is mostly **deletion + rewiring**, not new code;
new code is the scoped loader, the handoff mapper, and one unified day-assigner.

---

## 4. Components to keep

`erp/journey-sort.ts` · `route-optimization/optimize.ts` · `…/visit-frequency.ts` ·
`…/frequency-resolver.ts` · `…/customer-frequency.ts` · `…/generator.ts` (refactored as
the canonical generator) · `tis/scenario.ts` · `tis/plan-edit.ts` · `tis/optimize-routes.ts`
(clustering + constraints; day-step swapped to the canonical day-assigner) · `tis/scope.ts` ·
`tis/audit.ts` · `tis/geo.ts` · `tis/dataset.ts` · `tis/export.ts` · `tis/upload.ts` ·
`tis/capabilities.ts` · `planning/visit-duration.ts` · `planning/index.ts`.

## 5. Components to retire / merge

| Component | Action | Why |
| :--- | :--- | :--- |
| `route-optimization/frequency.ts` (`FrequencyRule`, `visitsPerWeekFor`, `visitDaysFor`) | **Merge** into `visit-frequency.ts` (+ `assignVisitDays`) → delete | Second frequency value-model; only `journey-plan` consumes it |
| `balancing.ts` `analyzeBalance` | **Wrap** over `scenarioMetrics` then **retire** | Duplicate balancer; only `entity360/registry.ts` consumes it |
| TIS `balanceRoutes` inline day-spread | **Replace** with canonical `assignVisitDays` | Second day-assigner |
| `route-optimization/territory.ts` | **Retire** (or park as `planning/territory` reserved) | **No importers** (dead) |

---

## 6. Impact analysis

| Change | Files touched | Risk | Mitigation |
| :--- | :--- | :--- | :--- |
| Merge `frequency.ts` → `visit-frequency.ts`; refactor generator | `journey-plan/actions.ts`, `journey-plan/page.tsx`, `journey-plan/proposal.ts`, `generator.ts` | **Med** (operational write path) | Golden tests: old vs new produce identical `erp_journey_plans` on demo + a live sample; `generator.test.ts` |
| Unify day assignment (multi-visit/week) + extend `ScenarioAssignment` to `days[]` | `optimize-routes.ts`, `scenario.ts`, `plan-edit.ts`, `planning-canvas.tsx`, Journey Builder | **Med** | Keep single-day back-compat; new field additive; update `optimize-routes.test.ts` |
| Journey Builder reuses canonical generator | `journey-builder.tsx` | Low | Behind a flag; visual parity check |
| Retire `analyzeBalance` | `entity360/registry.ts` | Low | Swap to `scenarioMetrics`-backed shim |
| Scope-index + scoped loader; drop 5000 cap | `tis/server.ts`, `studio/page.tsx`, `journey-builder/page.tsx` | **Med** (data correctness) | "Showing N of M" banner; default region scope; tests on counts |
| Gate Studio + Journey Builder → `reports.view` | `navigation.ts`, both `page.tsx` | **Low** | reps lose access by design (verified they keep field tools) |
| TIS → journey-plan handoff mapper | new `lib/planning/handoff.ts` + journey-plan apply | **High** (write) | **Design only; gated; not in this track** |

**Dead code removed:** `territory.ts` (no importers). **No consumer outside `journey-plan`
and one `entity360` file** touches the retired engines — small, contained blast radius.

---

## 7. Migration plan (phased; each phase independently shippable + revertable)

| Phase | Scope | Ships behind |
| :--- | :--- | :--- |
| **AC-1** Frequency unify | Move `visitsPerWeekFor`/`visitDaysFor` onto `VisitFrequency` in `visit-frequency.ts` as `assignVisitDays`; migrate `journey-plan`; delete `frequency.ts`. Golden test old≡new. | commit (pure) |
| **AC-2** Canonical day-assign | Extend `ScenarioAssignment.days?: string[]`; `balanceRoutes` + Journey Builder + generator all call `assignVisitDays`. | additive field |
| **AC-3** One generator | Journey Builder reuses `generateWeeklyPlan`; remove the TIS-only day-spread. | flag `tis_unified_generator` |
| **AC-4** Balance unify | `analyzeBalance` → `scenarioMetrics` shim; retire. Retire dead `territory.ts`. | commit |
| **AC-5** Data volume | `loadScopeIndex` + scoped `loadTisDataset`; remove 5000 cap; "N of M" banner. | flag `tis_scoped_load` |
| **AC-6** Access | Studio + Journey Builder → `reports.view`. | commit |
| **AC-7** Handoff (design) | `Scenario → erp_journey_plans` mapper spec + reuse journey-plan apply. **No write enabled** (Apply stays paused). | flag (off) |

Each phase: `tsc` + `vitest` + `next build` + completion note. AC-1/4/6 are low-risk and
can land first; AC-2/3/5 are the substantive ones; AC-7 is design-only.

---

## 8. Risks & rollback

**Risks**
1. **Frequency divergence** (AC-1/3): legacy vs unified produce different schedules.
   → Golden/snapshot tests comparing outputs on the Jeddah demo **and** a sampled live
   tenant before deleting `frequency.ts`.
2. **Multi-visit model change** (AC-2): `days[]` touches the scenario engine + board.
   → Additive field, single-day path preserved; feature-flagged.
3. **Data-load correctness** (AC-5): scoped loading must never under-report silently.
   → Always show "N of M"; scope-index counts are authoritative; unit tests on totals.
4. **Operational write path** (AC-1 affects `journey-plan` generate/apply).
   → Behind golden tests; `journey-plan` apply untouched in behaviour until AC-7.

**Rollback strategy**
- **Pure engines + barrel:** consumers import from `@/lib/planning`; swapping an
  implementation behind the barrel is low blast-radius. Rollback = **revert the phase
  commit**; tests guard regressions.
- **Feature flags** on AC-3/AC-5/AC-7 → instant disable without revert.
- **No destructive data ops:** consolidation is code-only; `erp_journey_plans` write path
  is unchanged until AC-7 (which is design-only here). No migration of stored data.
- **Deletion last:** retire `frequency.ts`/`territory.ts`/`analyzeBalance` **only after**
  their replacements pass golden tests and the importers are migrated.

---

## 9. Recommendation

Approve **AC-1 → AC-6** as a pure consolidation (no new functionality, no live writes),
landing low-risk phases (AC-1/4/6) first. Treat **AC-7 (handoff/Apply)** as design-only
here and a separate, governed decision (it is the real RO-4/VTP-4 fork). Net result: one
canonical planning engine, one journey generator, management-only Studio/Journey Builder,
no silent truncation — with ~85–90% reuse and a contained blast radius. Awaiting approval
before any implementation.
