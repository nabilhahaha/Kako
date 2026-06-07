# VANTORA — Workflow Runtime Integration Architecture

How the pure runtime (`runtime.ts` + executors) is connected to the real database
and driven on a schedule. **One engine, one runtime, zero duplicate logic.** No UI;
no Workflow Builder yet.

## Components

| Layer | File | Role |
|---|---|---|
| Pure runtime | `runtime.ts`, `executors/*`, `condition-eval.ts` | step execution + orchestration (no I/O) |
| Adapter | `runtime-deps.ts` (`makeRuntimeDeps`, pure `mapRunPatch`) | binds runtime to DB + side effects |
| Service | `runtime-service.ts` (`loadRun`, `advanceInstance`, `resumeRun`, `listDueRuns`) | load run+steps, drive runtime |
| Tick driver | `api/internal/workflow-tick/route.ts` | cron: resume due runs + engine SLA tick |
| Schema | migration `0178` | run-state columns on `erp_workflow_instances` |

## Database interactions

Run state lives on the SINGLE engine's `erp_workflow_instances` (no new run table).
`0178` adds, additively: `current_step_id` (FK→steps, covered index), `attempts`,
`last_error`, `next_action_at`, `runtime_state`. Status mapping keeps the engine's
enum + the one-active-per-record guard intact:

| Runtime state | `status` (engine) | `runtime_state` | Active guard |
|---|---|---|---|
| running | `pending` | running | active (guarded) |
| waiting (delay/retry/approval) | `pending` | waiting | active (guarded) |
| completed | `approved` | completed | released |
| rejected | `rejected` | rejected | released |
| failed | `cancelled` | failed | released |

`mapRunPatch` (pure, unit-tested) performs this mapping; `current_step_id` also
syncs the legacy `current_step` (int). Executor effects: `notify`/`escalate`/`audit`
→ `erp_events` bus (tenant-isolated, `source='workflow'`); `ensureApprovalTask`/
`createTask` → `erp_workflow_tasks` (engine reuse); `update_record` → allow-listed
table update; `api_call` → `fetch`.

## Runtime lifecycle

```
 dispatch/start → instance (status pending, runtime_state running)
   → advanceInstance(db, id):
        loadRun → makeRuntimeDeps → advanceRun(pure)
        executes automated steps, persists each transition via mapRunPatch
   → pauses (awaiting_approval | waiting) or terminal (completed/rejected/failed)
```

## Tick lifecycle (`/api/internal/workflow-tick`, cron every 5m, CRON_SECRET)

```
 1. erp_workflow_tick()      ← existing engine: approval-task SLA + escalation (reuse)
 2. listDueRuns():           runtime_state='waiting' AND next_action_at <= now()
 3. for each due run: advanceInstance() → runtime resumes from current_step
```
No-op until a workflow with automated steps exists (no rows match). Each run is
independent; one failure never blocks the batch.

## Wait / resume lifecycle

- **delay step** → executor returns `waiting` with `waitUntil`; adapter sets
  `runtime_state='waiting'`, `next_action_at=waitUntil`. The tick re-invokes
  `advanceInstance` once `next_action_at <= now()`, the delay step then completes,
  and the run chains on.
- **approval step** → executor `ensureApprovalTask` + `paused`; `next_action_at`
  stays NULL (the tick does **not** poll approvals). On decision, `resumeRun(id)`
  is called (the integration hook); the approval executor sees the decided task
  (`approvalDecision`) and advances (`approved`→success branch, `rejected`→failure
  branch). This keeps the existing `erp_workflow_decide` unchanged.

## Retry lifecycle

- A retryable failure (thrown error or `api_call` 5xx) → `runtime_state='waiting'`,
  `attempts+1`, `next_action_at = now + 30s·2^attempt` (cap 1h). The tick resumes
  it when due; `attempts` resets on a successful step advance.
- Non-retryable (`api_call` 4xx, validation error, `MAX_RUN_ATTEMPTS`=6 exhausted)
  → terminal `failed` (`status='cancelled'`, `runtime_state='failed'`, `last_error`)
  — a visible dead-letter, never silently dropped.

## Audit model

- Per-step: appended to the instance `context.__steps[]` (id, step_no, type, status,
  at, error) AND emitted to `erp_events` as `workflow.step.<status>` (with run id,
  step, actor) — tenant-isolated, feeding Analytics/console/AI.
- Notifications/escalations also emit `workflow.notification.sent` / `workflow.escalated`.
- Engine-side approval history (`erp_workflow_tasks`, `erp_log_audit`) is unchanged.

## Security model

- **Tenant isolation:** all reads/writes are company-scoped (RLS via
  `erp_user_company_id()`); events carry `company_id`/`branch_id`.
- **Identity:** approval authorization stays in the engine. The tick currently runs
  automated steps under the **service role**; `update_record` is constrained to an
  allow-list and `api_call` to explicit URLs. **Hardening follow-up (before enabling
  update_record/api_call in production):** run each due run under the originating
  user via the impersonation primitive (`src/lib/sync/server/impersonate.ts`, with a
  workflow purpose) so RLS applies, plus a per-company egress allow-list for `api_call`.

## SmartSync interaction

- Workflow and SmartSync are **separate subsystems sharing the event bus**. SmartSync
  reconciliation emits domain events (offline order → `invoice.issued`, etc.); those
  feed the dispatcher (Phase 2) which can start workflows — so an offline-created,
  later-reconciled record drives the same workflows as an online one. The workflow
  tick (`*/5m`) is independent of the sync tick / reconcile cron (`*/15m`).
- The runtime tick is **not** gated by `KAKO_SYNC` (workflows are a core engine, not
  the offline-sync feature). It is inert until automated workflows exist.

## Migration impact

`0178` only (additive: 5 columns + 2 indexes on `erp_workflow_instances`; FK covered;
no enum/constraint/index of the existing engine modified). Branch-validated then torn
down. With `0176`/`0177`, the workflow schema foundation is complete.

## Status / next (await review)

Built + tested: adapter, service, tick driver, condition evaluator, `0178`.
Pure unit tests: runtime (8), executors (11), trigger-match (9), condition-eval (5),
mapRunPatch (5). **Next, after review — then the Workflow Builder UI:** wire
`resumeRun` to the approval-decision path; per-actor impersonation in the tick;
egress allow-list for `api_call`.
