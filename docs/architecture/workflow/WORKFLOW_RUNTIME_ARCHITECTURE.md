# VANTORA — Workflow Runtime Architecture

The generalized step-execution runtime that completes the Workflow Engine
foundation (Constitution Art. 32) **before** the Workflow Builder UI.
**One engine. One runtime. One builder. Zero duplicate logic.**

- The runtime reuses the SINGLE existing engine (`erp_workflow_definitions/_steps/
  _instances/_tasks`, RPCs `erp_workflow_start`/`_decide`/`_tick`). Approval steps
  delegate to the engine; automated steps execute in the runtime. No second engine.
- Pure, unit-tested layers (`src/lib/workflow/runtime.ts`, `executors/`). Schema
  prerequisites in migrations `0176`/`0177`. No UI; no Builder.

## Step Type Registry (`executors/registry.ts`)

| step_type | Kind | Executor behavior |
|---|---|---|
| `approval` | engine | ensure approval task(s) exist (reuse engine) → **paused** until decided |
| `reject` | terminal | terminal **rejected** (failure branch) |
| `notification` | automated | send via Notification OS (`notify` dep) |
| `task` | automated | create a task (`createTask` dep) |
| `update_record` | automated | patch a business record — **table allow-list** enforced |
| `api_call` | automated | outbound HTTP; 2xx→ok, 5xx→retryable, 4xx→permanent |
| `delay` | automated | **waiting** until `now + delay`; resumed by the tick |
| `escalation` | automated | escalate (reuse engine escalation/notify) |
| `condition` | automated | evaluate → branch `success`/`failure` |

Each executor implements **validate** (config) + **execute** (side effect via an
injected `ExecutorDeps`) + audit (recorded by the runtime) + error handling (return
a failed `StepResult`; never crash the run).

## Step lifecycle

```
 step → validate(config) ──fail──▶ run FAILED (config error, no retry)
          │ok
        execute(ctx)  ─────────────────────────────────────────────┐
          ├─ completed   → merge output, audit, route to next step  │
          ├─ completed+branch(success|failure) → route accordingly  │
          ├─ paused      → approval pending (engine task) ──────────┤ run WAITING
          ├─ waiting     → delay/SLA, set next_action_at ───────────┤ run WAITING
          └─ failed      → retryable? backoff+retry : run FAILED ───┘
```

## Execution lifecycle (`advanceRun`)

```
 Workflow Run ──▶ current step ──▶ executor ──▶ result ──▶ next step ──▶ …
                                                   │
   auto-chains automated steps in one pass until it hits:
     • approval  → state awaiting_approval (resume on erp_workflow_decide)
     • delay     → state waiting           (resume on the tick at next_action_at)
     • failure   → state retry_scheduled | failed
     • no next   → state completed         • reject step → state rejected
```

- **Next-step routing:** explicit `next_on_success` / `next_on_failure` (builder
  branching) else sequential by `step_no`.
- **Resume points:** approval → the existing `erp_workflow_decide` (human) then the
  driver re-invokes `advanceRun`; delay/retry → the scheduled tick re-invokes
  `advanceRun` when `next_action_at <= now`.
- **Cycle guard:** `MAX_CHAIN` aborts a mis-wired infinite step graph as FAILED.

## Error handling & retry

- Expected step failures return a failed `StepResult`; thrown errors are caught and
  treated as **retryable**.
- Retryable failure → capped exponential backoff (`30s·2ⁿ`, max 1h) via
  `next_action_at`, up to `MAX_RUN_ATTEMPTS` (6), then terminal **FAILED**
  (dead-letter — visible, never silently dropped). `attempts` resets on each
  successful step advance.
- `update_record` is constrained to an **allow-list** of tables; non-listed tables
  fail validation (never executed).
- Config/validation errors fail fast (non-retryable).

## Audit model

- Every step result is appended to the run **context** `__steps[]`
  (`{step_id, step_no, type, status, at, error}`) — an in-run execution trail.
- Every step also emits a workflow audit entry via `ExecutorDeps.audit` (surfaced on
  the **`erp_events`** bus as a `workflow.step.*` event — tenant-isolated, with
  actor), feeding Analytics/console/AI.
- Engine-level history (tasks, decisions, `erp_log_audit`) is unchanged for approval
  steps.

## Security model

- **Tenant isolation:** runs/steps/events are company-scoped via RLS
  (`erp_user_company_id()`); the runtime never crosses tenants.
- **Branch-aware:** runs carry `branch_id` (0176); executors operate within the
  run's company/branch.
- **Authority:** approval authorization stays in the engine (`erp_workflow_decide`
  enforces assignee/permission). Automated steps act under the run's originating
  identity — the live driver runs them with that user's context (reusing the
  reconcile-worker impersonation, `src/lib/sync/server/impersonate.ts`) so RLS
  applies; never a blanket service-role bypass.
- **`update_record` / `api_call`** are the sensitive executors: table allow-list +
  (future) per-company egress allow-list for `api_call` URLs.

## Schema (migrations)

- **0176** — `erp_events` bus; `erp_workflow_steps.step_type/name/config/
  next_on_success/next_on_failure`; `erp_workflow_instances.trigger_event_id/
  branch_id`.
- **0177** — `step_type` allow-list adds `reject`; `approver_type` made NULLable so
  automated steps (no human approver) are storable. Additive; approval behavior
  unchanged. Branch-validated then torn down.

## What is built vs next

- **Built + unit-tested (this change):** step-type registry, executor framework
  (9 executors), `advanceRun` runtime, schema 0177. `trigger-match` + dispatcher
  (Phase 2) + event bus (Phase 1).
- **Next integration step (no UI):** the Supabase-backed `ExecutorDeps`/`RuntimeDeps`
  adapter (persist → `erp_workflow_instances`; `notify` → `erp_notify`; `ensureApprovalTask`
  → engine; `evalCondition` → `erp_workflow_condition_met`; `audit` → `emitEvent`) and a
  tick driver (`erp_workflow_tick` companion) that resumes `waiting`/retry/approved runs.
  Then — only then — the Workflow Builder UI.

---
*Status, completed/remaining components, known risks, technical debt, Builder prerequisites, and the future roadmap are tracked centrally in `WORKFLOW_ENGINE_STATUS.md`.*
