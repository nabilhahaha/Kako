# Coverage & Journey-Plan Engine — Audit-First Design Package

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** *Audit + design only — no implementation, no schema/business-logic change.*

The next recommended workstream (from the platform readiness assessment). Reuse-first: the journey-plan model, the coverage KPI engine, outlet grading, Smart-Next routing, and visit-compliance logging **already exist** — this engine mostly **surfaces, links, and persists** them.

---

## 1. Current-state assessment (grounded)

### Coverage model
- **Rep-day coverage IS persisted:** `erp_work_sessions.coverage_pct · gps_violation_count · out_of_route_count` (computed at day-close).
- **Pure KPI engine:** `src/lib/distribution/coverage/kpi.ts` — `coverageKpis(plannedIds, visits)` → `coveragePct` (planned-visited/planned) · `adherencePct` · `strikeRatePct` · off-route · missed; `rollupCoverage()` for team rollups. Gateway + `service.ts` load planned (`erp_today_journey`) + actual (`erp_visits`).
- **Surfaced:** `/distribution/coverage` scorecard; `/distribution/visit-outcomes` report.
- **NOT persisted:** **customer-level** coverage status (is *this outlet* on-track vs under-covered) — only rep-day % exists.

### Journey-plan model
- **`erp_journey_plans`** (rich): `route_id · customer_id · salesman_id · day_of_week (sat–fri) · frequency (weekly|biweekly|monthly) · sequence · planned_time · effective_from/to · status`. `UNIQUE(company, customer, day, route)`.
- **`erp_route_customers`** (route↔customer + sequence); **`erp_routes`** (name · rep · van warehouse · visit_day).
- **Functions:** `erp_today_journey(salesman, date)` · `erp_customer_in_today_plan()` · `erp_dow_code()`.
- **Surfaced:** `/sales/journey` (journey-manager) authoring; `/field/journey` today's stops + Smart-Next.

### Visit frequency rules
- Frequency is a **column** (`weekly|biweekly|monthly`) but appears **read-only / not enforced** — `erp_today_journey` likely matches day-of-week without applying the biweekly/monthly cadence against an anchor.
- **No frequency-by-grade rule** (e.g. A=weekly, B=biweekly, C=monthly).

### Planned vs actual execution
- **Planned:** `erp_today_journey` (today's journey-plan stops). **Actual:** `erp_visits` + `erp_visit_outcomes` (new_sale/collection/return/no_sale/…). The KPI engine already diffs them per rep-day.

### Coverage compliance
- **`erp_visit_compliance`**: `kind (gps_violation | out_of_route | wrong_day | out_of_sequence) · reason · status (logged → pending_approval → approved/rejected)`. **Logged but no approve/reject UI** (backend-only).

### Route optimization
- **Smart-Next** (`src/lib/van-sales/next-customer.ts`): route-first ranking (`routeRank·routeStepMeters + distanceM`) — pure, tested. `erp_route_customers.sequence` defines route order.
- **No re-sequencing/optimization tool** (suggest optimal stop order by distance).

### A/B/C customer frequencies
- **Outlet grading exists:** `erp_outlet_grade_history` (perfect-store / grade engine, `computed_at`). **NOT linked** to journey-plan frequency.

### Manager & supervisor visibility
- `/distribution/coverage` (scorecard) + `rollupCoverage` (team) + `/distribution/retail-cockpit` (exec KPIs). **No customer-level coverage list, no under-covered-outlet exceptions, no compliance approval queue.**

---

## 2. Gaps

| Gap | Evidence |
|-----|----------|
| **Customer-level coverage status not persisted/surfaced** | Only rep-day `coverage_pct`; no "outlet on-track/under/over-covered" |
| **Frequency not enforced** | `frequency` column unused by the "due today" calc; biweekly/monthly behave like weekly |
| **A/B/C grade not linked to frequency** | `erp_outlet_grade_history` exists but no grade→frequency rule/template |
| **No journey-plan authoring wizard** | Plans inherited from customer salesman+visit_day; no guided assignment by route/day/frequency |
| **Compliance has no approval UI** | `erp_visit_compliance.status` pending_approval, but no screen to approve/reject |
| **No route optimization tool** | Smart-Next ranks live, but no plan-time re-sequencing suggestions |
| **Thin manager exceptions** | Scorecard exists; no under-covered-outlet / missed-visit / compliance exception lists |

---

## 3. Reuse analysis

| Reuse **as-is** | Extend | New (thin) |
|-----------------|--------|-----------|
| `coverage/kpi.ts` (coverage/adherence/strike + rollup) · Smart-Next ranking · `erp_journey_plans` · `erp_route_customers` · `erp_routes` · `erp_today_journey` · `erp_visits`/`erp_visit_outcomes` · `erp_visit_compliance` · `erp_outlet_grade_history` · AdminWorkbench/SectionCard/StatCard primitives · approval workflow engine | `erp_today_journey` (apply frequency cadence) · coverage service (customer-level rollup) · journey-manager (wizard + grade templates) | customer-coverage read-model (derive on-track/under/over) · compliance-approval surface · route re-sequence suggester (over Smart-Next) |

**Estimated reuse ≈ 80%** — the engines, tables, and KPI math exist; the work is **enforcement, linkage, persistence, and surfacing.**

---

## 4. Recommended architecture

A **Coverage & Journey-Plan engine** that owns planning + coverage truth; the **Customer Workbench reads** visit frequency + coverage status (already flagged JP-owned in the governance review).

- **Journey-Plan authoring** (extend journey-manager): assign customers → route · day · **frequency**, with **grade-driven templates** (A=weekly · B=biweekly · C=monthly, configurable) sourced from `erp_outlet_grade_history`. Conflict/overlap detection on `UNIQUE(company, customer, day, route)`.
- **Frequency enforcement** (extend `erp_today_journey`): a customer is "due today" only if `day_of_week` matches **and** the `frequency` cadence is satisfied vs `effective_from` anchor (and/or last actual visit). Pure helper, unit-tested; the RPC consumes it.
- **Customer coverage read-model:** derive per-outlet **coverage status** (`on_track | under_covered | over_covered | never_visited`) from planned frequency vs actual visits over a window. Surfaced read-only in the **Customer Workbench** (G-review's deferred "coverage status") and in a coverage list.
- **Compliance approvals:** surface `erp_visit_compliance` (gps/out-of-route/wrong-day/out-of-sequence) in an **approve/reject** view — reuse the **existing approval workflow** (route through the queue) rather than a bespoke screen.
- **Manager/supervisor dashboards:** extend `/distribution/coverage` with **under-covered-outlet** + **missed-visit** + **compliance** exception lists, using `coverageKpis` + `rollupCoverage` (rep → team → area).
- **Route optimization:** a plan-time **re-sequence suggester** over Smart-Next's distance ranking → proposes an optimized `erp_route_customers.sequence`; advisory (manager applies).

---

## 5. Implementation roadmap (phased; each validated; no implementation yet)

| Phase | Scope | Reuse | Effort |
|-------|-------|-------|--------|
| **CJ-1** | Journey-plan authoring wizard + **grade→frequency templates** (A/B/C) | journey-manager · outlet grade · journey_plans | M |
| **CJ-2** | **Frequency enforcement** ("due today" respects weekly/biweekly/monthly + anchor) — pure helper + `erp_today_journey` | journey_plans · today-journey fn | M |
| **CJ-3** | **Customer coverage status** read-model + surface read-only in Customer Workbench + a coverage list | coverage engine · visits · workbench | M |
| **CJ-4** | **Compliance approvals** surface (`erp_visit_compliance` → approval queue) | visit_compliance · workflow engine | S–M |
| **CJ-5** | **Manager/supervisor coverage dashboards** (under-covered · missed · compliance exceptions; rep→team→area rollup) | coverageKpis · rollupCoverage · scorecard | M |
| **CJ-6** | **Route optimization** re-sequence suggester (advisory, over Smart-Next) | Smart-Next · route_customers | M |

**Sequencing:** CJ-1 → CJ-2 (planning truth) → CJ-3 (coverage truth + workbench) → CJ-4 (compliance) → CJ-5 (visibility) → CJ-6 (optimization). One validated commit per phase; tsc · tests · build · gap-check.

---

## 6. Priority & business impact

| Phase | Priority | Business impact |
|-------|----------|-----------------|
| CJ-1 grade→frequency templates | High | Right-frequency coverage by outlet value (A/B/C) — the core FMCG coverage lever |
| CJ-2 frequency enforcement | High | Plans become trustworthy; biweekly/monthly outlets stop appearing daily |
| CJ-3 customer coverage status | High | Surfaces "under-covered outlets" — direct revenue/availability impact; completes the Customer Workbench |
| CJ-4 compliance approvals | Med–High | Closes the audit loop on GPS/out-of-route exceptions (governance + integrity) |
| CJ-5 manager dashboards | Med–High | Supervisor steering: missed visits, coverage by team/area |
| CJ-6 route optimization | Med | Efficiency (less drive time, more selling time) |

**Overall:** High priority — it is the FMCG-core field loop, ~80% reuse of existing engines, and it makes first-class the coverage/frequency data the Customer Workbench already references.

---

**No implementation performed. On approval, I'll start with CJ-1 (journey-plan authoring + grade→frequency templates) using the gated methodology.**
