# VANTORA — Workflow Platform V1.1 Hardening Plan

**Scope:** the three **Critical** findings from
`WORKFLOW_PLATFORM_V1_ARCHITECTURE_REVIEW.md` only — **C1, C2, C3**.
**Mode:** **Planning only. No code. No fixes. No implementation.**
**Goal:** a reviewable plan to make Workflow Platform execution **at-least-once and
safe** (reliable start, single-flight resumption, idempotent effects) without a
redesign — all additive over the single engine/runtime.

**Law preserved:** One Engine. One Runtime. One Builder. Execution stays owned by
the Event Bus, Workflow Engine, Runtime, and Executors. Nothing in this plan adds a
second engine/runtime/builder.

**Dependency note:** the three are synergistic and should land in order
**C2 → C3 → C1** (single-flight + idempotency must exist *before* at-least-once
retry is enabled, otherwise retries could double-fire effects). Target migrations
`0182`–`0184` (numbers indicative).

---

## C1 — Workflow *start* is not at-least-once

### Root Cause
`recordEvent` (`src/lib/workflow/emit.ts`) persists the event to `erp_events`, then
**dispatches inline within the user request and swallows all errors**
(`dispatchEvent` → `erp_workflow_start`). If dispatch fails (transient DB error,
timeout, cold start) *after* the domain mutation has committed, the event row
exists but **no workflow instance is created**, and there is **no retry path**.
Result: a missed approval/automation with no signal. (Resumption of *already
started* runs is covered by the tick; *starting* is not.)

### Proposed Fix (design)
Decouple **persist** from **dispatch** and add a **swept retry**:
- Add dispatch-tracking columns to `erp_events` (e.g. `dispatch_status`
  `pending|done|error`, `dispatch_attempts`, `dispatched_at`, `dispatch_error`).
- `recordEvent` still **best-effort dispatches inline** for low latency, but on
  success marks `done`; on failure/skip leaves the event `pending` (never throws).
- Extend the existing **workflow-tick** with a bounded sweep:
  "select `pending` events (claimed — see C2), dispatch them, mark `done`/`error`
  with backoff." This makes **start at-least-once** using the **same**
  `dispatchEvent`/`erp_workflow_start` (no new dispatch logic).
- Idempotency of start is already protected by `uq_wf_instance_active` +
  `on conflict do nothing`, so re-dispatch is safe.

### Architectural Impact
Low–medium. No new component; the bus becomes the durable queue it already is, plus
a status flag. Dispatch path is reused, not duplicated. The "fire on write" UX is
preserved; the sweep is the safety net.

### Migration Impact
Additive `0182`: new nullable/defaulted columns on `erp_events` + a partial index
on `(company_id, dispatch_status)` where `dispatch_status <> 'done'` (covering-index
discipline; no FK). Backfill existing rows to `done` (already dispatched or moot).
No column drops, no type changes.

### Runtime Impact
Inline dispatch unchanged for the happy path. The tick gains a sweep stage
(bounded batch, same impersonation rules as C2/M3). Slightly more DB writes
(status updates). No change to `advanceRun` or executors.

### SmartSync Impact
**Positive.** Reconciliation bursts no longer depend on synchronous in-request
dispatch succeeding — events persist and the sweep drains them, smoothing load and
guaranteeing offline-originated workflows start. Ordering remains per-event
(document as independent).

### Risk Level
**Medium.** Main risk is double-start if idempotency regresses — mitigated by the
existing `uq_wf_instance_active` guard (and validated by tests). Sweep must respect
tenant context (impersonation) and not elevate.

### Rollback Strategy
Feature-flag the sweep (env/flag). If issues: disable the sweep (revert to inline
best-effort exactly as V1) — the added columns are inert. Migration down: drop the
added columns/index. No data loss (events are append-only).

### Test Strategy
- Unit: `recordEvent` marks `done` on success, leaves `pending` on simulated
  dispatch failure (never throws).
- Unit/integration: sweep dispatches `pending` events, is idempotent
  (re-run = no duplicate instance via `uq_wf_instance_active`), applies backoff,
  marks `error` after N attempts.
- Integration (DB): RLS — sweep only dispatches within tenant; covering-index
  invariant holds; schema-health green.
- SmartSync: simulate a reconcile burst of N events → all eventually `done` with no
  duplicate runs.

---

## C2 — Due-run processing has no concurrency guard

### Root Cause
`listDueRuns` (`src/lib/workflow/runtime-service.ts`, used by
`/api/internal/workflow-tick`) selects due runs **without row claiming**
(`FOR UPDATE SKIP LOCKED` or a lease column). Two overlapping tick executions
(cron retry, manual trigger + scheduled cron, or a future second worker) can select
and advance the **same run twice**. With non-idempotent effects (C3) this
**double-fires** notifications/api_call/update_record.

### Proposed Fix (design)
Introduce **single-flight claiming** of due runs:
- Option A (preferred): a SQL claim function using
  `SELECT … FOR UPDATE SKIP LOCKED LIMIT batch` that atomically marks claimed runs
  (e.g. `claimed_at`, `claimed_by`/tick-id, `claim_expires_at`) and returns them.
- Releases on completion; **lease expiry** reclaims runs abandoned by a crashed
  tick (no stuck runs).
- `listDueRuns` becomes `claimDueRuns`; the tick processes only what it claimed.

### Architectural Impact
Low. Adds a claim/lease concept to the existing instances table; the tick loop is
otherwise unchanged. Lays the groundwork for **parallel workers** later (Future F1)
without redesign.

### Migration Impact
Additive `0183`: `claimed_at timestamptz`, `claim_expires_at timestamptz`,
`claimed_by text` on `erp_workflow_instances` (+ partial index for due+unclaimed).
Optionally a `SECURITY DEFINER` claim RPC. No drops/renames.

### Runtime Impact
Tick selects via the claim path; concurrent ticks no longer collide. A small added
cost per tick (claim/release writes). Lease-expiry adds resilience to crashes.
`advanceRun`/executors unchanged.

### SmartSync Impact
None directly (tick-side). Indirectly supports C1's sweep running safely under
overlap.

### Risk Level
**Low–medium.** Risk: a too-short lease reclaims a still-running run → concurrent
processing (mitigated by C3 idempotency + conservative lease + heartbeat); a
too-long lease delays recovery (mitigated by tuning). Claim RPC must be tenant-safe.

### Rollback Strategy
Flag the claim path; fall back to the current `listDueRuns` (V1 behavior) if needed.
Columns/index are inert when unused; migration down drops them. No data impact.

### Test Strategy
- Unit/integration: two concurrent claim calls return **disjoint** run sets
  (`SKIP LOCKED`), each run claimed once.
- Lease expiry: an unreleased claim is reclaimable after expiry; a fresh claim is
  not.
- Crash simulation: abandoned claim is recovered on the next tick.
- DB: schema-health (FK coverage), RLS tenant isolation on the claim RPC.

---

## C3 — Side-effecting steps are not idempotent

### Root Cause
Executors (`registry.ts`) perform effects (`notify`, `httpCall`/api_call,
`updateRecord`, `createTask`, `escalate`) **without an idempotency key per
(instance, step, attempt)**. Under at-least-once delivery (the correct target once
C1/C2 land) or any retry/re-advance, the same effect can execute **more than once**
(duplicate notifications, duplicate external POSTs, repeated record writes).

### Proposed Fix (design)
Add an **effect-idempotency ledger** the runtime consults before/around each
side-effecting step:
- A table `erp_workflow_step_effects` keyed by `(instance_id, step_id, attempt)`
  (or a deterministic `effect_key`), recording `status` and a result hash.
- The runtime, via `ExecutorDeps`, performs **claim-execute-commit**: if an effect
  key is already `done`, **skip and reuse** the recorded result; else execute then
  record `done`. For `api_call`, propagate the key as an **idempotency header** to
  the external endpoint where supported.
- `update_record` becomes effectively idempotent (same patch → same state);
  `notification`/`task` guarded by the ledger so they fire once.

### Architectural Impact
Medium. Introduces an effects ledger and a thin claim/record wrapper in
`ExecutorDeps` — **shared by all executors** (no per-executor duplication; still one
runtime). Strengthens the at-least-once contract end-to-end.

### Migration Impact
Additive `0184`: `erp_workflow_step_effects` (FK to instance/step **with covering
indexes**, unique on the effect key, status, result hash, timestamps) + RLS
(tenant-scoped, `(select auth.uid())`). No changes to existing tables' columns.

### Runtime Impact
Each side-effecting step gains a ledger read + write around execution. Pure/branch
steps (`condition`, `reject`) are unaffected. `advanceRun` stays pure; the ledger
lives behind `ExecutorDeps` so the state machine is unchanged.

### SmartSync Impact
**Positive/neutral.** Makes reconcile-driven retries and the C1 sweep safe — effects
fire exactly once even if a workflow is started/advanced more than once. No offline
builder change (builder is online-only).

### Risk Level
**Medium.** Risks: a wrongly-scoped effect key suppresses a legitimate effect
(mitigated by including `attempt`/deterministic keying + tests); external endpoints
that ignore idempotency headers (mitigated by ledger-side guard so *our* side is
once; document non-idempotent external APIs).

### Rollback Strategy
Flag the ledger enforcement. If disabled, executors behave as V1 (at-most-once-ish,
inline). The ledger table is additive and inert when unused; migration down drops
it. No business-data impact.

### Test Strategy
- Unit: each side-effecting executor skips on a `done` effect key and reuses the
  recorded result; executes + records when absent.
- Integration: re-advancing/replaying a run does not duplicate notify/api_call/
  update_record; concurrent advance (with C2) yields a single effect.
- `api_call`: idempotency header is set; egress allow-list still enforced.
- DB: FK covering indexes present; RLS tenant isolation; schema-health green.

---

## Cross-cutting plan

- **Sequencing:** C2 (single-flight) → C3 (idempotent effects) → C1 (at-least-once
  sweep). Enabling C1 before C2+C3 is explicitly **out of bounds** (would risk
  duplicate effects).
- **Feature flags:** each change behind a flag, default-off until validated, so
  rollout is incremental and reversible to exact V1 behavior.
- **Migrations 0182–0184:** all additive (columns/tables/indexes + RLS); every new
  FK gets a covering index; all policies use `(select auth.uid())`; validated on an
  isolated Supabase branch before commit; STAGING-apply gate in CI.
- **Observability (recommended alongside, not in scope here):** counters for
  pending-sweep drains, claim contention, and effect-skip rates — to confirm the
  hardening works in production (ties to review item R6/M7).
- **Definition of done for V1.1:** start is at-least-once, runs are single-flight,
  effects are idempotent; full suite + DB integration green; no behavior change when
  flags are off.

*Planning only — no code was written, no fix implemented, no module started.
Stopping for review.*
