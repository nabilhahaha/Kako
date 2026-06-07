# ADR-007 — One Workflow Engine + One Event Bus (no parallel systems)

- **Status:** Accepted (founder decision, 2026-06-07)
- **Constitution:** Art. 04 (Zero Duplicate Logic), Art. 06 (Backbone Dependency Rule),
  Art. 32 (Workflow OS), Art. 43 (Event Constitution), Art. 49 (ADRs).
- **Supersedes/extends:** the Phase 1–3 workflow engine (migrations 0088–0090, 0122).
- **Migration:** `supabase/migrations/0176_event_workflow_foundation.sql`.

## Context

P0-01 asked for an Event Bus + Workflow Engine foundation, proposing new tables
`erp_workflows` / `erp_workflow_steps` / `erp_workflow_runs`. Repository inspection
found a **pre-existing, capable workflow engine** under different names:

- `erp_workflow_definitions` — entity-agnostic templates (`entity` + `record_id`),
  global or company-scoped; `trigger`, `is_active`, `approval_action` (0122).
- `erp_workflow_steps` — steps with `approver_type` (company_admin/user/role/manager/
  department_head), `mode` (sequential/parallel), `required_approvals`, `condition`
  (conditional routing), `sla_hours`, `escalate_to`.
- `erp_workflow_instances` / `erp_workflow_tasks` — runtime + tasks, with
  `escalated_at` and the `erp_workflow_tick()` SLA/escalation job.
- RPCs `erp_workflow_start` / `erp_workflow_decide` and helpers
  `erp_workflow_condition_met`, `erp_workflow_resolve_users`, `erp_workflow_make_tasks`,
  `erp_notify`.

So conditional routing, dynamic approver resolution, parallel/quorum, SLA timers,
escalation, amount routing and notifications **already exist**. Creating
`erp_workflows`/`erp_workflow_steps`/`erp_workflow_runs` would (a) collide on
`erp_workflow_steps` and (b) stand up a **second workflow engine** — a direct
violation of the Constitution's Zero-Duplicate-Logic law.

## Decision

**One workflow engine, one event bus.** Do **not** create a parallel engine.

1. **Keep** `erp_workflow_definitions` / `erp_workflow_steps` / `erp_workflow_instances`
   / `erp_workflow_tasks` as the single Workflow OS.
2. **Extend them additively** (migration 0176, all `ADD COLUMN IF NOT EXISTS`, no
   change to existing columns/RPCs/policies/logic):
   - **Generic event triggers:** `erp_workflow_definitions.trigger_event` +
     `trigger_config`; `erp_workflow_instances.trigger_event_id` (provenance).
   - **Workflow-Builder compatibility:** `definitions.description/version/builder_schema/
     created_by/updated_by`; `steps.step_type` (default `'approval'` → behavior
     preserved), `steps.name/config/next_on_success/next_on_failure`.
   - **Branch-awareness:** `branch_id` on definitions, instances, tasks.
   - (Generic entity types, SLA, escalation, dynamic approvals already existed.)
3. **Create only `erp_events`** — the new shared, append-only, multi-tenant,
   branch-aware, RLS-isolated Event Bus (Art. 43).
4. **Repository/service layer** (`src/lib/workflow/`): `emitEvent`/`readEventFeed`
   (events.ts), pure `matchesTrigger`/`selectTriggeredDefinitions` (trigger-match.ts),
   and read/plan + thin RPC wrappers (`startWorkflow`/`decideTask`) that **reuse** the
   existing engine RPCs. Nothing is wired into existing business actions yet, and no UI
   is built.

## Migration path (approval-centric → generalized workflow platform)

1. **Now (P0-01):** schema + services foundation only (this ADR). Inert; existing
   approval flows unchanged.
2. **Event emission:** add `emitEvent` calls at key domain transitions (e.g.
   `invoice.issued`, `customer.created`) — additive, behind the event bus.
3. **Event-driven start:** a dispatcher consumes `erp_events`, runs
   `planWorkflowsForEvent`, and calls the existing `erp_workflow_start` for matches —
   replacing today's hardcoded handler triggers (removes the Art. 03 "hardcoded
   workflow" debt).
4. **Generalized steps:** the runtime gains executors for non-approval `step_type`s
   (task/notification/api_call/update_record/delay/condition) using `steps.config`,
   while approval steps keep running through `erp_workflow_decide`.
5. **Workflow Builder UI:** reads/writes definitions + steps (incl. `builder_schema`)
   and previews trigger matches — no engine fork.

## Consequences

- **+** Single source of truth for workflows; honors Zero Duplicate Logic; no risk to
  existing approval behavior (additive, validated on an isolated branch then torn down).
- **+** Event bus unlocks Workflow/Analytics/AI/Integration consumers (Art. 43).
- **−** Some legacy column names (`name_ar/name_en`, `record_id` text) coexist with the
  new generic columns until a later normalization; acceptable and documented.
- **Follow-ups (tracked in IMPLEMENTATION_BACKLOG P0/P1):** event emission, dispatcher,
  step executors, Builder UI.
