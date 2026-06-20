# Coverage Status / Coverage Engine — Design & Implementation Plan

**Workstream:** Priority #1 after Frequency Resolution (now closed)
**Status:** Design only — no implementation yet (gated; awaiting approval)
**Date:** 2026-06-19

---

## 1. Objective

Consolidate coverage into one coherent **Coverage Engine** — a single, reuse-first source of
truth for *"are we covering our customers as planned?"* — surfaced for managers and
supervisors in **Simple Mode**, fed by the now-authoritative FR cadence, and shaped as a
first-class **read-model for TIS**.

Scope: coverage **read-model + rollups + manager/supervisor surfaces + GPS-compliance
approvals + history**. Out of scope: route generation (FR/CJ done), optimization (TIS later).

---

## 2. Current State (audit — grounded in code)

Coverage already exists in **two complementary layers**, both pure + tested:

### A. Operational coverage (rep-day) — `src/lib/distribution/coverage/`
- `kpi.ts` — `coverageKpis` / `rollupCoverage`: planned · visited · plannedVisited · missed ·
  offRoute · productive · **coverage% · adherence% · strike-rate%** (pure).
- `scorecard.ts` — `repScorecard` (weighted rep scoring).
- `snapshot.ts` + gateways — persists rep-day KPIs to `erp_rep_day_kpis` (mig 0193); batch.
- **Surface:** `/distribution/coverage` (team rep-day dashboard) — **flag-gated**
  (`DISTRIBUTION_ENABLED`, inert by default) + `/distribution/journey-compliance`.

### B. Strategic coverage (customer cadence) — CJ-3, `journey-plan/coverage-status*`
- `coverage-status.ts` — On Track / Under / Over / Never, planned-vs-actual over 28 days
  (now **FR-6 cadence-aware** — annual/custom respected).
- `coverage-status-server.ts` — `loadCustomerCoverage` (single loader behind every surface).
- **Surfaces:** Customer 360 coverage badge + `/distribution/coverage-customers` (exception
  list with status/salesman/route filters).

### Data anchors
`erp_visits` (actuals) · `erp_journey_plans` (+ `frequency_token`, target) · `erp_work_sessions`
(coverage_pct/gps/out-of-route, rep-day persisted) · `erp_visit_compliance` (gps_violation,
out_of_route, wrong_day, out_of_sequence) · `erp_rep_day_kpis` (snapshots).

**Finding:** the engines are strong but **fragmented** — two layers with separate entry points,
the rep-day dashboard is flag-gated, there is **no manager rollup of customer coverage status**
(by salesman/route/region), **no coverage trend/history**, and **GPS-compliance approvals are
not wired to the approval queue**. The Coverage Engine workstream unifies and surfaces, it does
not rebuild.

---

## 3. Gap Analysis

| # | Gap | Severity |
| :--- | :--- | :--- |
| CG-1 | No **rollup** of customer coverage status by salesman / route / region (only the flat list) | High |
| CG-2 | No **manager/supervisor coverage dashboard** unifying operational + strategic in one Simple-Mode view | High |
| CG-3 | Two engines, **no single façade** — consumers must know which layer to call (blocks TIS reuse) | Medium |
| CG-4 | **GPS-compliance approvals** (`erp_visit_compliance`) not routed through the approval queue + G5 audit | Medium |
| CG-5 | No **coverage trend/history** (status is point-in-time; no week-over-week movement) | Medium |
| CG-6 | Operational dashboard **flag-gated** (`DISTRIBUTION_ENABLED`) — not consistently discoverable | Low |

---

## 4. Reuse Analysis

| Capability | Existing asset | Reuse |
| :--- | :--- | :--- |
| Customer coverage status | `coverage-status.ts` (CJ-3) | 100% |
| Single coverage loader | `coverage-status-server.ts` | 100% (extend for rollup) |
| Rep-day KPIs / rollup | `coverage/kpi.ts` | 100% |
| Rep scorecard | `coverage/scorecard.ts` | 100% |
| Snapshot persistence | `coverage/snapshot.ts` + `erp_rep_day_kpis` | reuse pattern for history |
| Cadence (annual/custom) | `cadence.ts` (FR-6) | 100% |
| Approval queue + G5 audit | `erp_workflow_start`, `auditEnvelope`, `/approvals` | 100% (CG-4) |
| Territory/ownership context | `salesman_id`, `reports_to`, route/region | 100% |

**Estimated reuse ≈ 85%.** Net-new: a rollup read-model, a manager dashboard surface, a thin
Coverage Engine façade, a compliance-approval handler, and an optional history snapshot.

---

## 5. Recommended Architecture

### 5.1 Coverage Engine façade (one entry point)
A single module re-exporting both lenses behind a documented API, so every consumer (manager
dashboard, Customer 360, TIS, Geo) calls **one** thing:

```
coverage-engine/
  customerCoverage(customerIds, asOf)      → CJ-3 strategic status (per customer)
  coverageRollup(scope, asOf)              → NEW: counts by status, grouped by
                                              salesman | route | region (read-model)
  repDayCoverage(repIds, date)             → operational KPIs (coverage/kpi)
  (history hooks — CG-5)
```
Pure read-models + thin server loaders; **no duplicated logic** — it composes the existing
engines. This façade is the TIS "coverage" dataset contract.

### 5.2 Rollup read-model (CG-1)
Pure: given per-customer `CustomerCoverage` + grouping keys (salesman/route/region), produce
`{ onTrack, underCovered, overCovered, neverVisited, total, onTrackPct }` per group. Reuses
`loadCustomerCoverage`; adds grouping only.

### 5.3 Manager/Supervisor dashboard (CG-2) — Simple Mode
One screen, plain language: **"82% of your customers are on track"** + the exception buckets
(Under / Never / Over) as drill-down chips into the existing `/distribution/coverage-customers`
list (pre-filtered). Supervisor sees their team (RLS + `reports_to`); manager sees branch/region.
**Zero configuration** — opens on the headline number; no weights, no settings.

### 5.4 GPS-compliance approvals (CG-4)
Route `erp_visit_compliance` items (gps_violation / out_of_route / wrong_day) through the
existing approval queue with a G5 `auditEnvelope` on decision — reusing the customer-change
pattern. No new approval UI.

### 5.5 Coverage history (CG-5, optional)
Snapshot customer coverage status per period (reuse the `snapshot.ts` pattern → a small
`erp_customer_coverage_history` table) to show week-over-week movement. Additive.

### 5.6 TIS alignment
The façade's `coverageRollup` + `customerCoverage` become the **coverage columns/layer** in the
shared TIS dataset and the Geo "coverage map" layer — no rework when TIS starts.

---

## 6. Implementation Roadmap (phased, gated)

| Phase | Scope | Effort | Risk |
| :--- | :--- | :--- | :--- |
| **CV-1** | Coverage Engine façade + **rollup read-model** (pure + tests); group by salesman/route/region | ~0.5–1d | Low (pure, reuse) |
| **CV-2** | **Manager/Supervisor Coverage Dashboard** (Simple Mode headline + exception drill-down to the existing list) | ~1–1.5d | Low–Med (UI) |
| **CV-3** | Make operational rep-day dashboard consistently discoverable; link both lenses from the dashboard | ~0.5d | Low |
| **CV-4** | **GPS-compliance approvals** via approval queue + G5 audit envelope | ~1–1.5d | Med (workflow) |
| **CV-5** | **Coverage history** snapshot + week-over-week movement (optional) | ~1d | Med (additive schema) |

**Recommended sequence:** CV-1 → CV-2 → CV-3 (the visible manager value), then CV-4
(governance), with CV-5 optional. One validated phase per commit, Word review per phase.

---

## 7. Simple Mode (mandatory)

- The dashboard opens on a **single sentence + number** ("82% on track this period"), with
  exception buckets as one-tap drill-downs — a non-expert needs no training.
- No weights, thresholds, or cadence internals exposed; the 28-day window and bands are sensible
  defaults (already shipped in CJ-3).
- Advanced (window length, per-status thresholds) is opt-in behind an "Advanced" affordance,
  never on the default screen.

---

## 8. Business Impact

- **Managers see coverage health at a glance** and act on exceptions (Under/Never) instead of
  reading raw lists — the highest-frequency field-management question.
- **Governed compliance**: GPS/out-of-route exceptions get an auditable approval path.
- **One coverage source of truth** feeding Customer Health, Journey Planning, and TIS — no
  divergent numbers across screens.
- **Cadence-correct**: low-frequency (annual/custom) outlets are judged fairly (FR-6).

---

## 9. Open Decisions (for approval)

1. **Scope of CV:** CV-1→CV-4 now, CV-5 (history) deferred? (Recommended.)
2. **Operational dashboard flag:** keep `DISTRIBUTION_ENABLED` gating, or surface the unified
   manager dashboard ungated under existing `reports.view`? (Recommend ungated for the new
   Simple-Mode dashboard; leave the legacy rep-day page as-is.)
3. **History (CV-5):** additive `erp_customer_coverage_history` now, or defer to TIS trends?

Awaiting approval of scope + sequence before CV-1.
