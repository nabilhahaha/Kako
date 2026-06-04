# VANTORA — FMCG Outlet Grading

> A **fully dynamic, company-configurable** outlet grade engine: bands (A+/A/B/C/D
> or any custom set), the 7 scoring factors and their weights are all company
> master data — **nothing hardcoded**. History tracks every recompute for the
> migration trend and upgrade/downgrade alerts. Grade is a **dynamic dimension**
> inside every retail-execution dashboard. Additive · reuses existing schema ·
> mobile-first · multi-tenant. Prepared `2026-06-04`.

## 0. Research
Pepperi / Repsly / StayinFront / BeatRoute / Salesforce CG Cloud all grade or
segment outlets on a weighted blend of value, frequency, compliance and
distribution, then use the grade to drive coverage, assortment and targets.
VANTORA matches this with a config-only engine (no per-company code) and
deterministic (no-AI) scoring.

## 1. Dynamic grade engine (`src/lib/erp/outlet-grade.ts`, pure + 8 tests)
- **No hardcoded grades.** `assignGrade(score, bands)` reads whatever bands the
  company defines (code + `minScore` + `rank`). Defaults (A+…D) are *seed data*,
  editable/removable.
- **7 factors → weighted score.** `gradeCohort` normalises the raw factors (sales
  value, sales quantity, visit frequency — min-max across the cohort) and blends
  them with the already-% factors (MSL compliance, distribution %, Perfect Store %,
  collection) using **company weights** (renormalised over present factors).
- **Movement.** `gradeMovement` compares the new band rank to the outlet's previous
  grade → `upgrade | downgrade | same | new` (drives alerts).

## 2. Schema (`0145_outlet_grading.sql`, additive, drift-safe)
- `erp_outlet_grades` — dynamic bands (code, min_score, rank, color).
- `erp_outlet_grade_factors` — dynamic factor weights (company-configurable).
- `erp_outlet_grade_history` — per-recompute grade + score + movement + factor
  snapshot (jsonb) → historical tracking + migration trend.
Company-scoped RLS (admin-write, member-read); `erp_set_company_id` stamping.
Reuses `erp_customers` / `erp_profiles`; **no existing table modified**.

## 3. Screens (mobile-first, ar + en)
- **`/settings/outlet-grades`** — company self-management: CRUD grade bands, edit
  the 7 factor weights, **Seed defaults**, and **Recompute grades** (one click →
  scores every outlet, writes history with movement). Gated `grade.manage`; audited.
- **`/distribution/grading`** — Outlet Grading Dashboard: **count by grade**,
  **sales by grade**, **distribution by grade**, and **grade-migration** trend
  (upgrade / downgrade / new from the latest run).

## 4. Grade as a dynamic dimension (requirement #7)
`recomputeGrades` writes each outlet's latest grade to `erp_outlet_grade_history`;
the shared retail builder (`retail-exec-data.ts`) reads the latest grade per outlet
and adds `dims.grade` to every `OutletMetric`. As a result, **grade is instantly a
drill dimension** in:
- **MSL Matrix** compliance (`/distribution/msl-compliance` → drill by Outlet grade)
- **Distribution KPIs** (`/distribution/distribution-dashboard`)
- **Perfect Store** (`/distribution/perfect-store` via the same metrics)
- **Route Planning** — grade is queryable per customer (history) to prioritise A/A+
  outlets; surfaced as a dimension today, deeper route-planner integration tracked
  in the readiness roadmap (Phase 5 territory optimization).

Because grade flows through the same dynamic-dimension machinery, adding a new
grade or renaming bands needs **zero code change** in any dashboard.

## 5. Upgrade / downgrade alerts (requirement #5)
Each history row carries `movement`. The grading dashboard surfaces the counts
(upgrade / downgrade / new) for the latest run; the data backs notification/
attention surfacing (the movement is persisted per outlet for follow-up).

## 6. Business value
Grading focuses scarce field time on the outlets that move the number: protect and
grow A/A+ accounts, fix or rationalise D outlets, and tune coverage frequency by
grade. Typical FMCG impact: **+3–6 %** revenue from better A-outlet service +
**lower cost-to-serve** on low-grade tails, plus a clean lever for grade-based MSL
and targets.

## Validation
`tsc` clean · `vitest` **544 passed** (8 grade-engine tests + i18n parity +
keys-usage) · `next build` success (2 new routes). Drift-safe (empty-state until
`0145` applied). No AI; deterministic scoring.
