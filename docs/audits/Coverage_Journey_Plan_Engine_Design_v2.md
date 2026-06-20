# Coverage & Journey-Plan Engine — Design Package v2 (Detailed)

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** *Audit + design only — no implementation, no schema/business-logic change.* Supersedes the v1 design with the requested detail.

**Headline:** an entire **`src/lib/route-optimization/`** module (route generation · frequency-by-class · territory split/merge) and an **`outlet-grade`** A/B/C engine **already exist** — pure, unit-tested, but **flag-OFF and surfaced in no page**. This workstream is overwhelmingly **"enable + link + surface,"** not greenfield. **Reuse ≈ 88%.**

---

## 1. Coverage model

**Current state**
- **Rep-day coverage persisted:** `erp_work_sessions.coverage_pct · gps_violation_count · out_of_route_count` (set at day-close).
- **Pure KPI engine:** `distribution/coverage/kpi.ts` → `coveragePct` (planned-visited/planned) · `adherencePct` · `strikeRatePct` · missed · off-route; `rollupCoverage()` rep→team. Loads planned (`erp_today_journey`) vs actual (`erp_visits`/`erp_visit_outcomes`).
- **Surfaced:** `/distribution/coverage` scorecard, `/distribution/visit-outcomes`.

**Gaps**
- **Coverage status lifecycle** — no per-outlet state (`on_track | under_covered | over_covered | never_visited`); only a rep-day %.
- **Planned vs Actual** — computed per rep-day, but not retained per customer over a window.
- **Coverage compliance** — frequency target vs actual not measured per outlet.
- **Missed customers** — "planned today, not visited" exists transiently in KPIs but isn't surfaced as an actionable list.
- **Coverage gaps** — no "outlets below their target frequency" exception view.

---

## 2. Journey Plan

**Current state**
- **`erp_journey_plans`** (rich): `route · customer · salesman · day_of_week · frequency(weekly|biweekly|monthly) · sequence · planned_time · effective_from/to · status`.
- **Generation engine EXISTS (flag-OFF):** `route-optimization/generator.ts` → `generateWeeklyPlan()` produces day-by-day plans; `territory.ts` → `planTerritorySplit/Merge` (balancing); `maps.ts` (distance).
- **Authoring UI:** `/sales/journey` (journey-manager) — manual assignment today.

**Gaps**
- **Route generation** — `generateWeeklyPlan` not wired to a UI (flag off).
- **Visit frequency rules** — `frequency.ts` (`FrequencyRule`, `DEFAULT_FREQUENCY_RULES`, `visitsPerWeekFor`, `intervalFor`, `visitDaysFor`) exists but unused; the customer column is read-only.
- **Frequency enforcement** — `erp_today_journey` matches day-of-week but does not apply biweekly/monthly cadence vs an anchor → biweekly/monthly behave weekly.
- **Conflict/overlap detection** — only the DB `UNIQUE(company, customer, day, route)`; no UI surfacing double-bookings / multi-rep overlaps.
- **Route balancing** — `territory.ts` split/merge exists but not surfaced (no "balance these routes" tool).

---

## 3. FMCG operations

**Current state**
- **A/B/C classification EXISTS:** `erp/outlet-grade.ts` (`scoreOutlet`, `assignGrade` by configurable bands A+/A/B/C/D, `gradeMovement`) + `erp_outlet_grades` + `erp_outlet_grade_history` (score · factors · movement). Driven by msl/distribution/perfect_store/collection factors.
- **Visit frequency by class EXISTS (unused):** `route-optimization/frequency.ts` `visitsPerWeekFor(rules, classification)` maps a class → visits/week.
- **Smart-Next:** `van-sales/next-customer.ts` route-first ranking (pure, tested); live in `/field/journey`.
- **Off-route / unplanned:** `erp_visit_compliance.kind = out_of_route | wrong_day | out_of_sequence`; a visit to a non-planned customer is logged but not classed as a first-class "unplanned visit" workflow.

**Gaps**
- **A/B/C ↔ frequency not linked** — grade engine and frequency engine exist but no rule "Grade A → weekly, B → biweekly, C → monthly."
- **Visit frequency by class not applied** to journey-plan generation/enforcement.
- **Off-route / unplanned visits** — logged, but no rep reason-capture UX nor supervisor disposition beyond the compliance row.
- **Smart-Next integration** — live for execution, but **not** used at plan time (sequence optimization).

---

## 4. GPS compliance

**Current state**
- **`erp_visit_compliance`**: `kind (gps_violation | out_of_route | wrong_day | out_of_sequence) · reason · status (logged → pending_approval → approved/rejected)`.
- Violations are detected/logged at visit/day-close; counts roll into `work_sessions`.

**Gaps**
- **Approval/rejection workflow** — `status` supports it but there is **no approve/reject UI**; not routed through the approval queue.
- **Supervisor review process** — no queue/inbox of pending compliance exceptions.
- **Exception handling** — no reason taxonomy surfaced, no bulk disposition, no audit envelope on decision.

---

## 5. Manager & supervisor visibility

**Current state**
- `/distribution/coverage` scorecard + `rollupCoverage` (team); `/distribution/retail-cockpit` exec KPIs; `/distribution/visit-outcomes` report.

**Gaps**
- **Coverage dashboards** — no drill from team % into **under-covered outlets** / **missed visits**.
- **Compliance dashboards** — no pending-exception or violation-trend view.
- **Missed visit tracking** — not surfaced as a list/assignment.
- **Route adherence** — `adherencePct` computed but not trended per rep/route/area.

---

## 6. Reuse analysis

| Layer | Reuse as-is | Extend | New (thin) |
|-------|-------------|--------|-----------|
| **Tables** | `erp_journey_plans` · `erp_route_customers` · `erp_routes` · `erp_visits` · `erp_visit_outcomes` · `erp_visit_compliance` · `erp_outlet_grades` · `erp_outlet_grade_history` · `erp_work_sessions(coverage cols)` | `erp_today_journey` (frequency cadence) | customer-coverage read-model (or rollup) |
| **Engines** | `route-optimization/*` (generator · frequency · territory · maps) · `outlet-grade.ts` · `coverage/kpi.ts` (+rollup) · Smart-Next | coverage service (per-customer rollup) | grade→frequency mapping (compose two engines) |
| **UI** | AdminWorkbench · SectionCard · StatCard · scorecard · journey-manager · approval queue | journey-manager (wizard) · coverage scorecard (exceptions) | compliance-approval surface · coverage list · plan-balance tool |
| **Workflow** | approval engine + `workflow-handlers` + G5 audit envelope | — | route compliance approval handler entry |

**Reuse ≈ 88%** — route generation, frequency-by-class, territory balancing, A/B/C grading, coverage KPIs, Smart-Next, and the approval engine **all exist**; the work is enabling the flag-gated engines, **linking grade→frequency**, enforcing cadence, persisting/surfacing customer coverage, and adding the compliance-approval + manager exception views.

---

## Recommended architecture

A **Coverage & Journey-Plan engine** that owns planning + coverage truth; the **Customer Workbench reads** frequency + coverage status (deferred JP-owned items from the governance review).

- **Plan authoring + generation** — surface `route-optimization/generateWeeklyPlan` + `territory.planTerritorySplit/Merge` in the journey-manager; **grade→frequency templates** compose `outlet-grade` + `frequency.visitsPerWeekFor` (A/B/C configurable).
- **Frequency enforcement** — pure "due today?" helper (day-of-week ∧ cadence vs `effective_from`/last-visit), consumed by `erp_today_journey`.
- **Customer coverage read-model** — derive `on_track | under_covered | over_covered | never_visited` from target frequency vs actual visits; surface in the Customer Workbench + a coverage list.
- **Compliance approvals** — route `erp_visit_compliance` through the **existing approval queue** + G5 audit envelope (no bespoke screen).
- **Manager dashboards** — extend the scorecard with under-covered / missed / compliance exceptions; `rollupCoverage` rep→team→area.
- **Route optimization** — advisory re-sequence/balance suggestions over Smart-Next + territory engines.

---

## Implementation roadmap (phased; each validated; no implementation yet)

| Phase | Scope | Reuse | Effort |
|-------|-------|-------|--------|
| **CJ-1** | Grade→frequency templates (A/B/C) + plan authoring/**generation** wizard | outlet-grade · frequency · generator · journey-manager | M |
| **CJ-2** | Frequency enforcement ("due today" cadence) — pure helper + `erp_today_journey` | journey_plans · frequency | M |
| **CJ-3** | Customer coverage status read-model + Customer Workbench + coverage list (missed / gaps) | coverage engine · visits · workbench | M |
| **CJ-4** | GPS-compliance approval/rejection via the approval queue (+ audit envelope) | visit_compliance · workflow · G5 | S–M |
| **CJ-5** | Manager/supervisor dashboards (coverage · compliance · missed · adherence; rep→team→area) | coverageKpis · rollup · scorecard | M |
| **CJ-6** | Route balancing + optimization (territory split/merge + re-sequence, advisory) | territory · Smart-Next · route_customers | M |

**Conflict/overlap detection** folds into CJ-1 (authoring), **route balancing** into CJ-6.

---

## Business impact & estimated effort

| Phase | Business impact | Priority | Effort |
|-------|-----------------|----------|--------|
| CJ-1 grade→frequency + generation | Right-frequency coverage by outlet value — the core FMCG lever; turns 2 dormant engines on | High | M |
| CJ-2 frequency enforcement | Trustworthy plans; biweekly/monthly stop firing daily | High | M |
| CJ-3 coverage status | Surfaces under-covered outlets (availability/revenue); completes Customer Workbench | High | M |
| CJ-4 compliance approvals | Integrity/governance loop on GPS/out-of-route | Med–High | S–M |
| CJ-5 dashboards | Supervisor steering: missed visits, adherence by team/area | Med–High | M |
| CJ-6 balancing/optimization | Less drive time, more selling time; balanced rep workloads | Med | M |

**Overall:** High priority · **~88% reuse** · ~6 validated phases. The single biggest lever is **enabling and linking engines that already exist but ship inert (flag-OFF, unsurfaced)** — consistent with the platform-wide "exists but not surfaced" theme.

---

**No implementation performed. On approval I start with CJ-1 (grade→frequency templates + plan generation), gated methodology, one validated commit per phase.**
