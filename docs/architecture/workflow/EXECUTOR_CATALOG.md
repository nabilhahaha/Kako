# VANTORA — Executor Catalog

The 9 step executors of the single Workflow Runtime (Constitution Art. 32).
Source: `src/lib/workflow/executors/registry.ts` + `types.ts`. Each executor =
**validate · execute · audit · error-handling**. Pure over `ExecutorDeps`; the
supabase adapter (`runtime-deps.ts`) provides the real effects.

## Result contract (`StepResult`)
`status`: `completed` | `failed` | `paused` | `waiting` · `branch?`: `success|failure`
· `output?` (merged into run context) · `error?` · `retryable?` · `waitUntil?`.

## Catalog

| # | step_type | Config (jsonb) | Validate | Execute → result | Side-effect dep | Status |
|---|---|---|---|---|---|---|
| 1 | `approval` | (uses `approver_type`/`approver_ref`/`sla_hours`) | requires `approver_type` | decided→`completed`(branch); else ensure task → `paused` | `approvalDecision`, `ensureApprovalTask` (engine reuse) | done |
| 2 | `reject` | — | — | `completed` + branch `failure` (terminal reject) | — | done |
| 3 | `notification` | `channel`, `template`, `to?`, `vars?` | requires channel+template | send → `completed` | `notify` → `erp_events`/Notification OS | done (delivery = future) |
| 4 | `task` | `title`, `assignee_type?`, `assignee_ref?`, `due_in_hours?` | requires title | create task → `completed`(`output.task_id`) | `createTask` → `erp_workflow_tasks` | done |
| 5 | `update_record` | `table`, `id?`, `patch` | table must be **allow-listed**; patch object | update → `completed` | `updateRecord` (allow-list) | done (impersonation = follow-up) |
| 6 | `api_call` | `url`, `method?`, `headers?`, `body?` | requires url; valid method | 2xx→`completed`; 5xx→`failed` retryable; 4xx→`failed` | `httpCall` (fetch) | done (egress allow-list = follow-up) |
| 7 | `delay` (Wait) | `delay_ms` / `delay_minutes` / `delay_hours` | requires a positive delay | `waiting` (`waitUntil`) | none (tick resumes) | done |
| 8 | `escalation` | `escalate_to` (or step `escalate_to`) | requires target | escalate → `completed` | `escalate` → `erp_events` | done |
| 9 | `condition` | `condition` (DSL) or step `condition` | requires expression | branch `success`/`failure` | `evalCondition` (pure DSL) | done |

## Error handling & retry (runtime-enforced)
- Thrown errors → treated as **retryable** failures.
- Returned `failed` + `retryable` → capped backoff (`30s·2ⁿ`, max 1h), up to
  `MAX_RUN_ATTEMPTS=6`, then terminal `failed` (dead-letter).
- Validation errors → fail fast (non-retryable).
- Every step result is audited (`workflow.step.<status>` event) + appended to
  `context.__steps[]`.

## Security
- `update_record` is constrained to `UPDATE_RECORD_ALLOWLIST`
  (`erp_customers`, `erp_invoices`, `erp_sales_orders`, `erp_workflow_instances`).
- All effects are tenant-scoped (RLS); events carry company/branch.
- **Follow-ups before enabling `update_record`/`api_call` in production:** per-actor
  impersonation in the tick (so RLS applies, not service-role) + per-company egress
  allow-list for `api_call` URLs.

## Completed items
- All 9 executors implemented with validate/execute + audit + error handling.
- Unit tests: `executors/registry.test.ts` (11) + `runtime.test.ts` (8) +
  `condition-eval.test.ts` (5).

## Remaining items
- `notification`/`escalation` → real Notification OS delivery (currently event-bus intent).
- `api_call` egress allow-list; `update_record` under impersonation.
- `task` generic-task model (currently reuses `erp_workflow_tasks` with `step_no=0`).

## Risks
- `update_record` / `api_call` are the powerful executors — misuse or a permissive
  allow-list could mutate data / reach unintended endpoints. Gated today; harden before prod.
- Condition DSL divergence from the engine's SQL `erp_workflow_condition_met` (two
  evaluators) — convergence tracked.

## Technical debt
- Two condition evaluators (TS runtime + SQL engine) until consolidated.
- `task` executor's reuse of the approval-task table is a stopgap.

## Future Workflow Builder dependencies
- The Builder's step palette = this catalog (types + config schemas + validation rules).
- Per-type config forms should mirror each executor's `validate` so invalid steps
  can't be saved.
- Branching UI maps to `next_on_success` / `next_on_failure` (+ condition success/failure).

---
*Status, completed/remaining components, known risks, technical debt, Builder prerequisites, and the future roadmap are tracked centrally in `WORKFLOW_ENGINE_STATUS.md`.*
