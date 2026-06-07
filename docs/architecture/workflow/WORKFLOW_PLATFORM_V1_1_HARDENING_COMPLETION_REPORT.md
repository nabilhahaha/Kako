# VANTORA — Workflow Platform V1.1 Hardening Completion Report

**Status:** ✅ Complete — implemented in the approved sequence **C2 → C3 → C1**,
every change **behind a default-OFF flag**, **additive migrations only**,
**branch-validated before commit**, full suite green.
**Law preserved:** One Engine. One Runtime. One Builder. Execution stays owned by
the Event Bus, Workflow Engine, Runtime, and Executors. **No redesign, no new
module, no platform expansion.**

When all flags are unset (default), the platform behaves **exactly as V1**.

---

## 1. Feature flags (all DEFAULT OFF — `src/lib/workflow/flags.ts`)

| Flag (env) | Finding | Effect when ON |
|---|---|---|
| `KAKO_WF_CLAIM` | C2 | tick claims due runs single-flight (lease) |
| `KAKO_WF_CLAIM_LEASE_SECONDS` | C2 | claim lease seconds (default 300) |
| `KAKO_WF_IDEMPOTENT` | C3 | runtime consults the effect ledger |
| `KAKO_WF_DISPATCH_SWEEP` | C1 | emit marks pending; tick drains undispatched events |

---

## 2. C2 — Single-flight due-run claiming

- **Migration `0182` (additive):** `claimed_at` / `claim_expires_at` / `claimed_by`
  on `erp_workflow_instances`; partial index `idx_erp_wf_inst_claimable`;
  `erp_workflow_claim_due_runs(p_limit, p_lease_seconds, p_worker)` —
  `FOR UPDATE SKIP LOCKED` + lease, `SECURITY DEFINER`, `REVOKE … FROM PUBLIC`.
- **Code:** `runtime-service.claimDueRuns` / `releaseRun`; the tick uses claiming
  when `KAKO_WF_CLAIM` is on (else the V1 `listDueRuns`) and releases each run in a
  `finally` (lease expiry is the crash-recovery fallback).
- **Branch validation (proven):** 2 due runs → `first_claim = 2`;
  immediate re-claim → `0` (no double-process); after lease expiry → `1` (reclaim).

## 3. C3 — Effect-idempotency ledger

- **Migration `0183` (additive):** `erp_workflow_step_effects`
  `(instance_id, step_id, attempt)` unique claim key + `status` + `result`;
  covering indexes for the `step_id`/`company_id` FKs (the unique index covers
  `instance_id`); RLS `(select auth.uid())`-style tenant policy.
- **Code:** an **optional** `EffectLedger` hook on `RuntimeDeps` (absent ⇒ exact V1
  behavior). The pure runtime consults it **only for side-effecting steps**
  (`notification`, `task`, `update_record`, `api_call`, `escalation`):
  claim → execute → settle; a repeat **reuses** the settled result; an in-flight
  row is **skipped** (no re-fire). Keyed by attempt, so legitimate retries re-run.
  `runtime-deps.makeEffectLedger` is wired only when `KAKO_WF_IDEMPOTENT` is on.
- **Branch validation (proven):** duplicate claim of the same
  `(instance, step, attempt)` → `0` rows (blocked); a different `attempt` is a new
  key (allowed).

## 4. C1 — At-least-once dispatch

- **Migration `0184` (additive):** `dispatch_status` (default **`'done'`** so
  flag-off = V1), `dispatch_attempts`, `dispatched_at`, `dispatch_error` on
  `erp_events`; CHECK `('pending','done','error')`; partial index
  `idx_erp_events_pending_dispatch` (`where dispatch_status <> 'done'`).
- **Code:** with `KAKO_WF_DISPATCH_SWEEP` on, `recordEvent` inserts the event as
  `'pending'` and marks it `'done'` only on inline-dispatch success — so a
  missed/failed dispatch stays `pending`. The tick adds a **sweep** that lists
  pending events, **impersonates the originating actor** (RLS preserved; actor-less
  events left for an operator), re-dispatches via the **existing** dispatcher, and
  marks done / bumps attempts (parks `'error'` after `MAX_DISPATCH_ATTEMPTS`).
  Start idempotency is guaranteed by the existing `uq_wf_instance_active`.
- **Branch validation (proven):** `pending = 2`, `done = 1`; partial index +
  CHECK constraint present.

---

## 5. Sequencing rationale (as approved)

C2 (single-flight) and C3 (idempotent effects) **precede** C1 so that enabling
at-least-once dispatch/retry can never double-fire effects. Rollout should enable
flags in the same order; each is independently reversible.

---

## 6. Migrations — additive & validated

`0182`, `0183`, `0184` are **all additive** (columns / one table / one function /
indexes / RLS). Validated on an **isolated Supabase branch** (created, applied,
exercised, then deleted):
- claim lease semantics (claim/no-double/reclaim) ✓
- effect-ledger unique-claim conflict ✓
- dispatch status filtering + CHECK + partial index ✓
- **schema-health FK-coverage invariant** on the new objects → empty (every new FK
  has a covering index) ✓

Every new FK has a covering index; no policy uses an unwrapped `auth.uid()`.
CI's "Apply migrations to STAGING" applies the full chain on push.

---

## 7. Gates

- `tsc --noEmit` — **clean**.
- Unit/integration suite — **900 passed / 29 skipped** (+6: 3 effect-ledger
  runtime tests, 3 flag tests).
- **Production build — clean** (`/api/internal/workflow-tick` builds).
- Flags default OFF ⇒ **zero behavior change** vs V1 (verified by tests).

---

## 8. Rollback

Each finding is flag-gated; setting a flag off reverts to exact V1 behavior. The
migrations are additive and inert when their flags are off; manual down-migrations
are documented in each SQL file. No data migration, no destructive change.

---

## 9. What this did NOT change

No engine, runtime, executor set, or builder was added or redesigned. No new
module, no platform expansion. The hardening is purely reliability plumbing
(claim/lease, effect ledger, dispatch tracking) behind flags.

*Stopping for review.*
