# TIS — Final Status

**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19
**Legend:** ✅ Implemented · 🟡 Partially Implemented · 🔴 Deferred

---

## Status by item

| # | Item | Status | Notes |
| :-- | :--- | :--- | :--- |
| 1 | **Studio** | ✅ Implemented | Map-centric workspace; shared scope across all stages; KPI drill-downs; import preview/reset; Export step; deep-links. |
| 2 | **New Optimization** | ✅ Implemented | `/distribution/new-optimization`; permission-gated (`tis.run_optimization`); Excel-in/out session; no live writes; opens on Import, Simple Mode. |
| 3 | **Journey Builder** | 🟡 Partial | Weekly single-salesman wizard done (select → week → working days → max/day → generate → review by Day → export). **Monthly horizon deferred** (needs cadence expansion). |
| 4 | **Geo Validation** | ✅ Implemented | Hard territory partition (grid + union-find); `validatePlanGeography` route-quality report (customers · cities · radius · outliers); multi-territory notice; Expert cross-city opt-out. |
| 5 | **Export Blocking** | ✅ Implemented | Export disabled + hard-returns when any route mixes cities / is oversized; banner + Export-panel block. |
| 6 | **Color By** | ✅ Implemented | Route · Salesman · Coverage · Territory · Grade · Day across Studio, New Optimization, Journey Builder, board; dynamic legend; unavailable modes disabled-with-reason. |
| 7 | **Day Mode** | ✅ Implemented | Color by Day in the canvas Map view (Journey Builder default); day palette + legend. |
| 8 | **Access Control** | ✅ Implemented | Studio + Journey Builder → `reports.view` (managers / back-office; field reps excluded); New Optimization → `tis.run_optimization` (permission-based). Golden test. |
| 9 | **Data Volume (10k+)** | 🔴 Deferred | Still a **5000-customer server cap** (`loadTisDataset`) → silent truncation for 10k+. Engine scales; **server-side scoped loading + “N of M” banner not yet built** (AC-5). |
| 10 | **Planning Engine Consolidation** | 🟡 Partial | AC-6 (access) done; the geography fix unifies clustering in the shared engine. **AC-1/2/3/4/5 not yet executed** — legacy `generator.ts` / `frequency.ts` / `analyzeBalance` still coexist; `@/lib/planning` is the canonical barrel. |

---

## Open risks

- **R1 (High) — 10k+ silent truncation:** managers can plan on half their base above
  5000 customers. Until AC-5, add the “N of M” banner as an interim guard.
- **R2 (High) — duplicate engines:** legacy `journey-plan` (`generateWeeklyPlan`) and
  Journey Builder (`balanceRoutes` day-assign) can diverge for the same data
  (AC-1/2/3 pending).
- **R3 (Med) — UI verified by code / CI spec, not live browser:** geo banner / report /
  Export-disabled proven via golden tests + exported JSON/CSV + a self-skipping
  Playwright spec (`e2e/tis-geo.spec.ts`); not yet executed in a real browser here.
- **R4 (Low) — full-scope optimizer cost:** `scenarioMetrics` nearest-neighbour distance
  recompute is heavy at unscoped 10k; default region scope mitigates.

---

## Remaining gaps

- Server-side scoped data loading (AC-5) + remove the 5000 cap.
- Engine consolidation AC-1 (frequency unify), AC-2 (canonical day-assignment,
  multi-visit/week), AC-3 (single generator), AC-4 (retire `analyzeBalance`).
- Monthly journey (cadence / week-of-month expansion).
- Native `.xlsx` export (CSV today, Excel-openable).
- Time-based balancing (travel + visit duration) — resolver exists, optimizer wiring
  pending.
- TIS → `journey-plan` handoff (AC-7, design-only / Apply paused).

---

## Recommended next phase

1. **AC-5 first (de-risks production):** server-side scoped loading + “showing N of M”
   banner → kills the 10k truncation.
2. **AC-1 → AC-4:** consolidate the duplicate engines so Journey Builder and
   `journey-plan` share one generator / frequency / balance (removes R2).
3. **Run `e2e/tis-geo.spec.ts` in CI** against a seeded tenant to sign off the
   geo-validation DOM (closes R3).
4. Then product features: monthly journey, native `.xlsx`, time-based balancing.
5. **Hold AC-7 (Apply) / RO-4 / VTP-4** for the separate governed write decision.

---

## Boundaries upheld throughout

Read-only + export only; **no live data modified**; `journey-plan` remains the only
operational write path; RO-4 / VTP-4 / Apply-to-live remain paused.
