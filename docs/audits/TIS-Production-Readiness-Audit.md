# TIS — Production Readiness Audit

**Method:** Verified from code (file:line cited), not assumed. UI behaviour inferred
from the rendered components + gating logic.
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19
**Legend:** ✅ Passed · ❌ Failed · ⚠️ Risk

---

## 1. Menu visibility by role — ❌ / ⚠️

**Evidence.** Sidebar filters ANY-of: `Array.isArray(perm) ? perm.some(p => permissions.includes(p)) : …` (`navigation.ts:578`). TIS nav items: Studio + Journey Builder `perm: ['reports.view','customers.manage']`; New Optimization `perm: 'tis.run_optimization'`. The **`salesman` role holds `customers.manage`** (`permissions.ts:369`) — as do driver/technician/cashier.

- ✅ **New Optimization** is correctly hidden from field roles (only `tis.run_optimization`, which reps lack).
- ❌ **Studio + Journey Builder are visible to salesman/driver/cashier/technician** (they have `customers.manage`), contradicting the "Supervisor / Area Manager" intent.

**Risk (Med):** field reps see manager-grade territory planning tools.
**Recommendation:** gate Studio + Journey Builder on **`reports.view` only** (supervisors/area/regional/director/managers have it; reps do not). One-word change per nav item + page gate.

## 2. Permission enforcement — ✅ (policy too broad)

**Evidence.** Every TIS page redirects when unauthorized: `studio/page.tsx`, `journey-builder/page.tsx` (`reports.view || customers.manage`), `new-optimization/page.tsx` (`tis.run_optimization`); the upload **server action** `parseTisUpload` re-checks the same permission server-side (`import-actions.ts`). No unprotected TIS route or action.

- ✅ Enforcement exists at page + server-action level (defence in depth).
- ⚠️ The *breadth* is the issue (see #1), not a hole.

**Recommendation:** tighten the gate per #1; enforcement mechanism itself is sound.

## 3. Mobile responsiveness — ⚠️ Partial

**Evidence.** Responsive classes present (`flex-col lg:flex-row`, sub-nav `overflow-x-auto`, panel stacks). But the persistent map is `h-[60vh] min-h-[360px]` (`planning-map.tsx`), board columns are `w-56`/`w-44` (horizontal scroll), and the scope bar wraps into several rows. TIS is **not** in the mobile bottom-nav (`bottom-nav-tabs.ts`) — reachable only via the sidebar drawer.

**Risk (Med):** on a phone the manager scrolls past a tall map to reach controls; wide drag-columns are awkward on touch.
**Recommendation:** add a mobile **map ⇄ details toggle** (or map-below on `<lg`); not blocking.

## 4. Data volume (10k+ customers) — ❌ HIGH

**Evidence.** `loadTisDataset` caps at **`limit ?? 5000`** (`server.ts:28`); the Studio and Journey-Builder pages call it with **no limit**, so a 10k+ tenant **silently loads only 5000** customers. The whole array is serialized into the client component.

- ❌ A 10k+ tenant plans on a **truncated, incomplete** customer base, presented as complete.
- Mitigation present: at >12 routes the canvas auto-scopes to a region (`scope.ts initialScopeRegion`), which limits *render/compute*, **but not the 5000 load cap**.

**Risk (HIGH):** silent data loss + large client payload.
**Recommendation:** (a) server-side **scoped loading** (by region/salesman — the deferred VTP-S3) instead of a flat cap; (b) a **"showing N of M (capped)"** banner until then; (c) server-side aggregation/pagination for 10k+.

## 5. Route optimization performance — ✅ within cap / ⚠️ at full scope

**Evidence.** `balanceRoutes` ≈ O(n·k²) seeds + greedy O(n·k) — fine at 5000 (`optimize-routes.ts`). The cost driver is **`scenarioMetrics` distance**: it runs `optimizeRoute` (nearest-neighbour, O(m²)/route) per route and is **recomputed in `useMemo` on every scope/scenario change** (`scenario.ts:92-99`, `optimize.ts`). At full scope (~5000, ~10 routes → ~500 stops/route) ≈ 2.5M ops/recompute (tens of ms — acceptable); unscoped 10k grows ~4×.

**Risk (Med):** distance recompute on each interaction at full scope.
**Recommendation:** debounce/memoize distance, or cap/skip the distance metric above a threshold; default scope keeps it light.

## 6. Export validation — ✅

**Evidence.** `datasetToCsv` ⇄ `csvToRows` round-trip is **lossless and tested** (`export.test.ts`), over the fixed `TIS_CSV_COLUMNS`; re-import via `buildTisDatasetFromRows` is covered. Studio / Journey Builder / New Optimization all export this schema.

- ✅ Export is correct and round-trips.
- ⚠️ "Excel out" is **CSV** (opens in Excel), not native `.xlsx` (import supports `.xlsx`).

**Recommendation:** add a native `.xlsx` writer for parity (follow-up, non-blocking).

## 7. Navigation consistency — ✅ (naming overlap)

**Evidence.** Nav items in the Coverage group; labels present in `core.ts` (`studio`, `newOptimization`, `journeyBuilder`, ar+en); hrefs match page routes; icons imported.

- ✅ Consistent labels/links/icons.
- ⚠️ Naming **overlaps with legacy** items (`territory-intel` vs `territory-audit`/Studio; `routes`/`journey-plan` vs `planning-board`/`journey-builder`) — see #8.

## 8. Integration with existing Route Management screens — ❌ Parallel systems

**Evidence.** Pre-existing distribution screens: **`routes`, `journey-plan`, `journey-compliance`, `territory-intel`, `coverage*`** — separate from the new TIS family (`studio`, `new-optimization`, `journey-builder`, `planning-board`, `route-optimizer`, `territory-audit`, `geo`). TIS deep-links point only to TIS routes; there is **no cross-link** to `/routes` or `/journey-plan`.

**Critical detail (verified):** the **only** legacy screen that actively *plans* is
**`journey-plan`**, and it **writes `erp_journey_plans`** via `generateWeeklyPlan` —
i.e. it is the **operational** weekly-journey publisher. The new **`journey-builder`**
is a **parallel, read-only** weekly generator that does not feed it. The other legacy
screens (`routes` = master CRUD; `coverage*`, `territory-intel`, `journey-compliance`,
`retail-cockpit`, `suggested-load` = monitoring) don't plan.

**Risk (Med-High):** two weekly-journey generators (operational `journey-plan` vs
sandbox `journey-builder`) can diverge; the supervisor's TIS plan can't reach the
reps without re-doing it in `journey-plan`.
**Recommendation:** make `journey-builder` reuse `generateWeeklyPlan` (one generator),
and define the TIS → `journey-plan` handoff. Architecture decision → escalate.

## 9. No duplicate planning engines — ❌ Duplicates exist

**Evidence (from code).** A **pre-existing** `src/lib/route-optimization/` engine suite overlaps the new TIS engines:

| Concept | Legacy | New (TIS) | Status |
| :--- | :--- | :--- | :--- |
| Weekly journey generation | `generator.ts` `generateWeeklyPlan` (schedule N days + sequence) | `optimize-routes.ts` day-assignment + **Journey Builder** | **Duplicated** |
| Route/territory balancing | `balancing.ts` `analyzeBalance` | `scenarioMetrics` / `balancePct` | **Duplicated** |
| Territory assignment | `territory.ts` `assignTerritories`/split/merge | scope + `balanceRoutes` | **Overlapping** |
| Frequency → visits/week | `frequency.ts` (`visitsPerWeekFor`, `visitDaysFor`) **and** `visit-frequency.ts` (`frequencyToVisitsPerWeek`) | `visit-frequency.ts` (shared) | **Two frequency models** |
| Sequencing/TSP | `optimize.ts` → `journey-sort.ts` | reused via `scenarioMetrics` | ✅ Shared |
| Frequency resolver | `frequency-resolver.ts` | imported by TIS | ✅ Shared |

**Properly shared (credit where due, verified):** the **frequency precedence resolver**
(`resolveVisitFrequency`: customer → planning → classification → system), the
**sequencing** engine (`optimizeRoute` → `journey-sort`), the **workload primitive**
(`customerWorkload`), and the **scenario model/metrics** are each implemented once and
reused. The `@/lib/planning` barrel unified the **TIS side**.

**Still duplicated (verified):** (a) **day assignment** — legacy `visitDaysFor` /
`generateWeeklyPlan` vs the TIS `balanceRoutes` day-spread (`workingDayList`,
heaviest-first bins); (b) **journey generation** — `journey-plan` (`generateWeeklyPlan`,
writes DB) vs `journey-builder` (`balanceRoutes`, export-only); (c) **route/territory
balancing** — `analyzeBalance` vs `scenarioMetrics`/`balancePct`; (d) **two frequency
value-models** — `frequency.ts` (`FrequencyRule`, `visitsPerWeekFor`/`visitDaysFor`,
used by the generator) vs `visit-frequency.ts` (`VisitFrequency`, used by TIS).

**Risk (HIGH):** legacy `journey-plan` and new `journey-builder` can produce **different
weekly plans for the same data**; double maintenance of day-assignment + frequency math.
**Recommendation:** choose ONE canonical layer — have `journey-builder`/`balanceRoutes`
reuse `generateWeeklyPlan`/`visitDaysFor` (day assignment) through `@/lib/planning`,
fold `frequency.ts` into `visit-frequency.ts`, and route `analyzeBalance` callers through
`scenarioMetrics`. **Architecture fork → escalate before refactor.**

## 10. Gap vs actual FMCG supervisor workflow — ⚠️

Real supervisor loop: *review coverage → spot gaps → (re)assign customers to routes/reps → set frequency/day → balance load → **publish journey to the reps' app** → monitor compliance.*

TIS covers **review → audit → optimize → plan-by-day → export**, **read-only**.

- ❌ **TIS has no Apply-to-live** (paused) — but the **operational Apply already exists**
  in the legacy **`journey-plan`** screen (it writes `erp_journey_plans`). So the gap is
  specifically the **TIS → `journey-plan` handoff**: a supervisor optimizes in TIS, then
  must **re-do it in `journey-plan`** to actually publish to reps.
- ❌ **Monthly journeys** + multi-week cadence (biweekly/monthly) not expanded.
- ⚠️ **Compliance loop** (`journey-compliance`, reads `erp_work_sessions`) is separate,
  not linked from TIS.

**Result:** TIS is a strong planning/analysis **sandbox** sitting *beside* the operational
journey pipeline, not *in* it.
**Recommendation:** connect TIS output to the existing `journey-plan` apply (reuse its
governed write-back) rather than building a second Apply — that closes the supervisor
loop without RO-4/VTP-4 net-new write architecture. Escalate the handoff decision.

---

## Summary

| # | Area | Verdict |
| :-- | :--- | :--- |
| 1 | Menu visibility by role | ❌ reps see Studio/Journey Builder |
| 2 | Permission enforcement | ✅ (policy too broad) |
| 3 | Mobile responsiveness | ⚠️ Partial |
| 4 | Data volume 10k+ | ❌ 5000 cap → silent truncation |
| 5 | Optimization performance | ✅ in-cap / ⚠️ full-scope |
| 6 | Export validation | ✅ (CSV, not native xlsx) |
| 7 | Navigation consistency | ✅ (naming overlap) |
| 8 | Integration w/ Route Mgmt | ❌ parallel systems |
| 9 | No duplicate engines | ❌ duplicates exist |
| 10 | Supervisor-workflow gap | ⚠️ read-only sandbox (no Apply) |

**Top priorities before production:** (4) data-volume scoping + no silent truncation;
(9/8) consolidate the duplicate planning engines + define TIS-vs-legacy; (1) tighten
role visibility. Items 4, 8, 9, 10 involve architecture decisions (server-side
scoping, engine consolidation, Apply-to-live) — **escalate** before implementing.
