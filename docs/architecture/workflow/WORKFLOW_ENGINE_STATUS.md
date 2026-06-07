# VANTORA — Workflow Engine Status

Master status for the Workflow OS foundation (Constitution Art. 32/43, P0-01).
**One engine · one runtime · one builder (future) · zero duplicate logic.**
Companion docs: `EVENT_CATALOG.md`, `EVENT_DEPENDENCY_MAP.md`, `EXECUTOR_CATALOG.md`,
`WORKFLOW_RUNTIME_ARCHITECTURE.md`, `RUNTIME_INTEGRATION_ARCHITECTURE.md`, `ADR-007`.

## Build phases

| Phase | Scope | State |
|---|---|---|
| Pre-existing engine | `erp_workflow_definitions/_steps/_instances/_tasks`, `erp_workflow_start/_decide/_tick`, conditional routing, dynamic approvers, parallel/quorum, SLA, escalation, amount routing, notifications | **shipped (legacy)** |
| P0-01 Phase 1 | Event bus (`erp_events`) + engine generalization columns (`0176`); services (`events`, `trigger-match`, `repository`); ADR-007 | **done** |
| P0-01 Phase 2 | 10 event producers + event→workflow dispatcher (inline) | **done** |
| Runtime | step-type registry + 9 executors + `advanceRun` (`0177`) | **done** |
| Integration | adapter + service + tick driver (`0178`) | **done** |
| **Builder UI** | visual workflow builder | **NOT STARTED (awaiting review)** |

## Completed items
- **Schema** (additive, branch-validated, then torn down): `0176` (events + step_type/
  builder/trigger/branch columns), `0177` (`reject` type + nullable `approver_type`),
  `0178` (run-state columns on instances). FK-coverage invariant satisfied.
- **Event bus**: `erp_events` (RLS, tenant + branch, dedupe, monotonic `seq`).
- **Producers**: customer created/updated/approved, order created, invoice issued/voided,
  payment received, return approved, visit completed, stock-transfer completed (best-effort).
- **Dispatcher**: event → matching definitions → engine run, idempotent.
- **Runtime**: 9 executors (approval/reject/notification/task/update_record/api_call/
  delay/escalation/condition), `advanceRun` (auto-chain, pause, retry+dead-letter, branching).
- **Integration**: supabase adapter (`mapRunPatch`), `runtime-service`, tick driver
  (`/api/internal/workflow-tick`, `*/5m`) reusing `erp_workflow_tick`.
- **Tests**: 44 workflow unit tests (runtime 8, executors 11, trigger-match 9,
  condition-eval 5, mapRunPatch 5, dispatcher 6). Full suite 867 passing; CI green
  (staging migration applied; integration green on prior pushes).

## Remaining items (before Builder is fully usable)
1. Wire `resumeRun` into the approval-decision path (generalized-run approvals resume the runtime).
2. Per-actor impersonation in the tick + `api_call` egress allow-list (enable update_record/api_call safely in prod).
3. Background event-bus consumer (cursor) for system/integration/sync events.
4. Real Notification OS delivery for `notification`/`escalation`.
5. Reconcile-worker event emission (offline-created records emit on materialization).
6. Generic `task` model (decouple from approval-task table).
7. Converge the two condition evaluators (TS runtime + SQL engine).

## Risks
- **Dual advancement** for approval steps (engine `decide` vs runtime) until `resumeRun` is wired — today generalized runs pause at approval and only resume via `resumeRun`; legacy approval-only workflows still run purely on the engine. Risk: confusion if a definition mixes both before wiring. Mitigation: Builder should only emit generalized definitions once `resumeRun` is wired.
- **Powerful executors** (`update_record`, `api_call`) gated but service-role in the tick → must harden before prod use.
- **Producer coverage drift** — new mutations may forget to emit (see EVENT_DEPENDENCY_MAP risks).
- **Migrations 0176–0178 are unapplied in production** (guarded); inert until applied + a workflow is configured. Net behaviour change today: none.

## Technical debt
- Two condition evaluators (SQL `erp_workflow_condition_met` + TS `condition-eval`).
- `task` executor reuses `erp_workflow_tasks` (`step_no=0`) as a stopgap.
- Inline-dispatch now / background-consumer later — two emission paths to converge.
- Legacy `current_step` (int) coexists with new `current_step_id` (uuid).
- Impersonation primitive (`sync/server/impersonate.ts`) is reconcile-purposed; a
  workflow purpose is needed when the tick adopts impersonation.

## Future Workflow Builder dependencies (what the Builder will rely on)
- **Step palette** ← `EXECUTOR_CATALOG.md` (types + config schemas + validation).
- **Trigger picker** ← `EVENT_CATALOG.md` / `EVENT_DEPENDENCY_MAP.md` (event types +
  producer coverage + `trigger_config` filter editor).
- **Definitions/steps schema** ← `0176`/`0177` (`builder_schema`, `step_type`, `config`,
  `next_on_success/failure`, `trigger_event/config`, nullable `approver_type`).
- **Runtime contract** ← `WORKFLOW_RUNTIME_ARCHITECTURE.md` (step/result semantics) so
  the Builder cannot author steps the runtime can't execute.
- **Prerequisite:** remaining item #1 (`resumeRun` wiring) before publishing builder-made
  workflows that contain approval steps mixed with automated steps.

## Decision
Foundation complete and stopped for **architecture review**. No Builder UI until approved.
