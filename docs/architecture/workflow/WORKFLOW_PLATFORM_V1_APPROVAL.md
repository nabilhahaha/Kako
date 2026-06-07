# VANTORA — Workflow Platform V1 Approval

**Status:** ✅ **APPROVED** (V1 + V1.1 hardening). Documentation only — no
implementation, no new modules, no new platform tracks.
**Branch / PR:** `claude/offline-sync-architecture` · PR #125.
**Governing law (upheld throughout):** One Engine. One Runtime. One Builder. Zero
duplicate logic. Execution is owned solely by the Event Bus, Workflow Engine,
Runtime, and Executors.

---

## 1. V1 Summary

A single, entity-neutral Workflow OS for the whole platform:
- **Engine:** `erp_workflow_definitions / _steps / _instances / _tasks`,
  `erp_workflow_definition_versions`, `erp_workflow_egress_rules`, `erp_events`;
  RPCs `erp_workflow_start / _decide / _decide_runtime / _tick`. Migrations
  `0088` + `0176–0181`.
- **Runtime:** pure `advanceRun` over a 9-type executor registry (approval, reject,
  condition, notification, task, update_record, api_call, delay, escalation);
  condition DSL; egress allow-list; per-actor impersonation; full audit.
- **Event Bus:** after-commit, reconciliation-aware `emit()`; dispatcher matches
  `trigger_event` + `trigger_config` and starts version-pinned runs.
- **Builder Phase 1 (forms):** List / Details (Overview·Trigger·Steps·Versions·
  Simulate) / Templates (Global·Company·Private) / Publish / Archive, with
  immutable versioning, template tiers, and simulation-before-publish.
- **Builder Phase 2 (canvas):** drag-&-drop **visual layer only** over the same
  step rows (`graph-model.ts` pure projection; `0181` UI-only layout metadata);
  9 node types = 9 executors; auto-layout, zoom-to-fit, mini-map, undo/redo,
  multi-select, keyboard-delete, read-only published view, unsaved-changes warning.

Reuse contract: any module gains workflow by adding catalog events + allow-list
entries + authored definitions — never a new engine.

---

## 2. V1.1 Hardening Summary

Closed the three Critical findings from the architecture review, in sequence
**C2 → C3 → C1**, each behind a **default-OFF** flag, additive migrations only,
branch-validated, suite green. Flags off ⇒ exact V1 behavior.
- **C2 — single-flight claiming** (`KAKO_WF_CLAIM`): `0182` claim/lease columns +
  `erp_workflow_claim_due_runs` (`FOR UPDATE SKIP LOCKED` + lease). No double-process.
- **C3 — effect idempotency** (`KAKO_WF_IDEMPOTENT`): `0183`
  `erp_workflow_step_effects` `(instance,step,attempt)` claim ledger; optional
  runtime hook guards side-effecting steps (claim→execute→settle; reuse/skip).
- **C1 — at-least-once dispatch** (`KAKO_WF_DISPATCH_SWEEP`): `0184` event
  dispatch-tracking; emit persists `pending`; tick sweep re-dispatches undispatched
  events under per-actor impersonation (start idempotent via `uq_wf_instance_active`).

Validated on an isolated Supabase branch (claim/lease, ledger conflict, dispatch
status, FK-coverage invariant) and green on CI's STAGING migration apply.

---

## 3. Final Architecture Verdict

**Sound and approved.** The "one engine" discipline is real in the code: forms and
canvas are two surfaces over the same `erp_workflow_steps`; the runtime is a single
pure state machine; the executor set is closed and central; versioning is immutable
with instance pinning; security (RLS, impersonation, egress + table allow-lists,
audit) is uniform. The V1.1 hardening strengthened execution guarantees without any
redesign — additive plumbing behind flags. No architectural debt blocks adoption.

---

## 4. Production Readiness Assessment

- **Pilot / gated production: READY now** (V1 behavior, flags off).
- **Production-grade at scale: READY once the V1.1 flags are enabled and validated**
  in staging→production, in order. The flags exist, are tested, and apply cleanly;
  what remains is a controlled rollout + the observability layer (review item R6).
- **Gates passing:** `tsc` clean · suite 900 passing · production build clean · CI
  STAGING migration apply green · schema-health invariants (FK coverage, wrapped
  `auth.uid()`) green.

Pre-production checklist (operational, not code): enable flags in sequence in
staging; add dispatch/claim/effect counters + dead-letter alerting; confirm the
`0119` retention job is scheduled and extend it to `erp_events`; set a per-tenant
system principal for actor-less runs (Medium finding M3).

---

## 5. Remaining Known Limitations (post-V1.1)

Critical findings are resolved (flagged). Remaining are Medium/Low (not blockers):
- **M1/M2 — append-only growth:** `erp_events` not yet in retention; `erp_audit_logs`
  intentionally retained without partitioning.
- **M3 — actor-less runs/events** are skipped (need a per-tenant system principal).
- **M4 — write-path dispatch latency** remains until the sweep is the primary path.
- **M6 — tick cadence/granularity** (~5 min, batch 100; single stream).
- **M7 — observability** (metrics/dead-letter) not yet added.
- **L1–L6** — N+1 batch saves; canvas untested >100 nodes; JSON config (per-field
  forms pending); egress admin UI; event ordering docs; quorum UI.

These are tracked in the architecture review; none require redesign.

---

## 6. Feature Flag Rollout Strategy

All hardening is gated; enable incrementally, observe, and roll back instantly by
unsetting a flag (additive migrations stay inert when off).

| Flag | Gate | Validate before next | Rollback |
|---|---|---|---|
| `KAKO_WF_CLAIM` (+`_LEASE_SECONDS`) | C2 | no double-process under overlapping ticks; lease reclaim on crash | unset → `listDueRuns` (V1) |
| `KAKO_WF_IDEMPOTENT` | C3 | effects fire once on replay/retry; no suppressed legitimate effects | unset → executors as V1 |
| `KAKO_WF_DISPATCH_SWEEP` | C1 | undispatched events drain; no duplicate starts; actor-less parked | unset → inline best-effort (V1) |

Principle: **enable in staging first**, soak, then production; **one flag at a
time**; never enable C1 before C2 + C3.

---

## 7. Recommended Rollout Sequence

1. **Observability first (operational):** add counters/alerts for tick errors,
   dispatch failures, claim contention, effect skips — so the rollout is visible.
2. **C2 `KAKO_WF_CLAIM`** — staging soak → production. (Safe-by-itself; prevents
   double-processing.)
3. **C3 `KAKO_WF_IDEMPOTENT`** — staging soak → production. (Makes effects safe
   under retry/replay; prerequisite for C1.)
4. **C1 `KAKO_WF_DISPATCH_SWEEP`** — staging soak → production. (Turns on
   at-least-once start; depends on C2+C3.)
5. **Retention/system-principal (Medium):** schedule + extend `0119` to
   `erp_events`; define per-tenant system principals (unblocks actor-less runs).
6. Re-confirm gates after each step; keep each flag independently reversible.

---

## 8. Lessons Learned

- **Reuse beats rebuild.** Extending the legacy engine (ADR-007) instead of forking
  a parallel one kept the platform coherent and the diff small; the canvas became a
  pure projection rather than a second model.
- **A pure core pays off.** `advanceRun`, `graph-model`, `validation`, and
  `condition-eval` being pure made them trivially testable and let hardening hooks
  (effect ledger) drop in without touching orchestration logic.
- **Additive + flagged = safe evolution.** Every migration `0176→0184` was additive
  with covering indexes and wrapped `auth.uid()`; hardening shipped default-OFF, so
  V1 behavior was never at risk and rollback is a flag flip.
- **Branch validation caught the real risks early** (the unwrapped-`auth.uid()`
  schema-health failure; the step_no unique-collision in batch save; the claim
  lease semantics) — cheap insurance before staging.
- **Design the delivery guarantees up front.** The biggest gaps (at-least-once
  start, single-flight, idempotent effects) were delivery semantics, not features —
  worth treating as first-class from the start of any event-driven platform.
- **Keep the executor set closed and central.** The platform's generality comes
  from a small, shared verb set + events; resisting module-local runners is what
  keeps "one engine" true as adoption grows.

---

*Approved. Documentation only — no implementation, no new module, no new platform
track. One Engine. One Runtime. One Builder.*
