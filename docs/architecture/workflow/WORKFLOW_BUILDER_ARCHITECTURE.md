# VANTORA — Workflow Builder Architecture (proposal for review)

**Architecture only. No UI implementation. No code.** Defines how a future visual
Workflow Builder authors workflows for the **single existing engine + runtime**
(Constitution Art. 32). The Builder is an **authoring surface over
`erp_workflow_definitions` + `erp_workflow_steps`** — it introduces **no new engine,
no new runtime, no duplicate execution logic** (ADR-007).

> Status: proposed for architecture review. Nothing here is built. Prerequisites in
> `WORKFLOW_ENGINE_STATUS.md` (Phase A) must land before publishing builder-made
> workflows that mix approval + automated steps.

## 1. Principles
- **One engine, one runtime, one builder.** The Builder writes definitions/steps;
  the dispatcher + runtime (already built) execute them. The Builder never executes.
- **Reuse, don't duplicate.** Validation reuses `executors/registry.validate`,
  `condition-eval`, and `trigger-match`. Triggers reuse the event catalog. Approvals/
  SLA/escalation reuse the engine (`erp_workflow_decide` / `erp_workflow_tick`).
- **Config, not code.** A workflow is data (definition + ordered steps + JSON config).
- **Draft → validate → publish → version.** Edits happen on drafts; runs always bind
  to a published, versioned definition.

## 2. Builder database model
Reuses existing tables (0088 + 0176/0177/0178). The Builder reads/writes:

- **`erp_workflow_definitions`** — `id, company_id, branch_id, key, entity, name_*,
  description, trigger, trigger_event, trigger_config(jsonb), is_active, version,
  builder_schema(jsonb), created_by/updated_by`. `builder_schema` stores the **canvas
  layout** (node positions, edges) — presentation only; never the source of execution
  truth (steps are).
- **`erp_workflow_steps`** — `id, definition_id, step_no, step_type, name, config(jsonb),
  approver_type/ref, mode, required_approvals, condition(jsonb), sla_hours, escalate_to,
  next_on_success, next_on_failure`. This is the executable graph.

**Proposed additive migration (Builder phase — NOT now), `0179_workflow_publishing.sql`:**
- `erp_workflow_definitions`: `status text default 'draft' CHECK (draft|published|archived)`,
  `published_at timestamptz`, `published_by uuid`. (`is_active` retained for back-compat;
  `status` becomes the lifecycle source of truth.)
- `erp_workflow_definition_versions` (immutable publish snapshots): `id, company_id,
  definition_id, version, snapshot(jsonb = definition + steps), published_by, published_at`.
  Lets in-flight runs keep executing the version they started on while a new draft is edited.
- RLS + FK covering indexes per platform conventions (schema-health invariant).
No new engine/run tables. No change to instances/tasks beyond what 0176–0178 added.

## 3. Builder services (server, reuse-first)
- **DefinitionService** — list/get/create/clone/update/archive drafts; `version` bump on publish.
- **StepService** — CRUD steps within a draft (reorder `step_no`, set `config`,
  `next_on_success/failure`).
- **ValidationService** — pure, reuses runtime: per-step `executor.validate(step)`;
  trigger validity (`trigger_event` ∈ catalog, `trigger_config` parses);
  `condition` parses (`condition-eval`); graph checks (≥1 step, branch targets exist,
  no cycle via `MAX_CHAIN` reachability, terminal reachable, approval steps have approver).
- **PublishService** — validate → snapshot to `..._versions` → set `status='published'`,
  bump `version`. Drafts never dispatch; only published definitions match in
  `listDefinitionsForEvent`.
- **SimulationService (dry-run)** — runs the **pure** runtime (`advanceRun`) against a
  sample event/context with a **mock `ExecutorDeps`** (no real side effects) to preview
  the path/branches/pauses. Reuses the exact runtime — zero parallel simulator logic.
- **CatalogService** — exposes the event catalog (`EVENT_*`, producer coverage) and the
  executor catalog (step types + config schema + validation) to drive the palette/pickers.

## 4. Builder APIs (contracts; methods TBD as routes or server actions)
- `GET /workflows` · `GET /workflows/:id` · `POST /workflows` · `PATCH /workflows/:id` ·
  `POST /workflows/:id/archive`
- `PUT /workflows/:id/steps` (bulk upsert ordered steps) · `DELETE …/steps/:stepId`
- `POST /workflows/:id/validate` → `{ errors[] }`
- `POST /workflows/:id/publish` → `{ version }`
- `POST /workflows/:id/simulate` `{ event, context }` → `{ trace, finalState }`
- `GET /workflow-catalog` → `{ events, producerCoverage, stepTypes }`
All tenant-scoped, permission-gated (§10), versioned, audited (§11).

## 5. Trigger model
- **Modes:** `manual` (started by an action/UI) or **event-triggered** (`trigger_event`
  = an `EVENT.*` from the catalog) — reuses the dispatcher (Phase 2) unchanged.
- **Filter:** `trigger_config` = the `trigger-match` DSL (`entity?`, `where{}`,
  `branchScoped?`). The Builder's trigger editor writes exactly what `selectTriggeredDefinitions`
  reads. Producer-coverage from the dependency map warns on triggers for non-emitted events.

## 6. Condition model
- Per-step `condition` (for `condition` steps) + reused for branch routing. DSL =
  `condition-eval` (`eq/ne/gt/gte/lt/lte/in/nin/exists/truthy`, `all/any/not`, dot-path
  over run context). The Builder's condition editor produces this JSON; the runtime
  evaluates it. (Convergence with the engine's SQL `erp_workflow_condition_met` tracked.)

## 7. Action model
- Steps = the **Executor Catalog** (9 types). The palette + per-type config forms mirror
  each executor's `validate` so an invalid step cannot be saved. Branching via
  `next_on_success` / `next_on_failure` (+ condition success/failure). Execution is the
  existing runtime — the Builder only authors `step_type` + `config` + edges.

## 8. Approval model
- Reuses the engine: `approver_type` (`company_admin|user|role|manager|department_head`),
  `approver_ref`, `mode` (`sequential|parallel`), `required_approvals` (quorum). Human
  decisions go through `erp_workflow_decide`; the runtime's approval executor resumes via
  `approvalDecision` (Phase A wiring). The Builder exposes these fields; no new approval logic.

## 9. SLA model
- Per-step `sla_hours` (existing). On entering an approval/task step the due time is set;
  `erp_workflow_tick` (engine) + the runtime tick enforce SLA. The Builder edits `sla_hours`;
  no new timer system.

## 10. Escalation model
- `escalate_to` per step + the dedicated `escalation` step type. `erp_workflow_tick`
  escalates overdue approval tasks; the `escalation` executor emits `workflow.escalated`
  (→ Notification OS, future). Builder edits `escalate_to`/escalation steps.

## 11. Security model
- **Authoring permission:** editing/publishing requires a workflow-admin capability
  (`workflow.manage` / `settings.workflows`); gated via the existing `guards`/permission
  system. Read may be broader (viewers).
- **Tenant + branch isolation:** definitions/steps are company-scoped (RLS,
  `erp_user_company_id()`); branch-scoped definitions via `branch_id`. Global templates
  (`company_id IS NULL`) are platform-owner-only to publish.
- **Runtime authority unchanged:** approval authorization stays in `erp_workflow_decide`;
  automated executors run under the originating user (Phase A impersonation) — the Builder
  cannot escalate privilege. `update_record` allow-list + `api_call` egress allow-list
  remain runtime-enforced regardless of what the Builder authors.
- **Publish gate:** only validated drafts can be published; published definitions are
  immutable (new edits create a new draft/version).

## 12. Audit model
- Every Builder mutation (create/update/publish/archive) → `erp_audit_logs`
  (who/when/old/new/reason) **and** a `workflow.definition.<action>` event on `erp_events`
  (tenant-isolated) for Analytics/console.
- Publish writes an immutable `erp_workflow_definition_versions` snapshot.
- Runtime execution audit (step events, `__steps[]`) already exists — the Builder's
  simulate view reads the same trace shape.

## 13. SmartSync impact
- **Builder is online-only configuration.** Authoring/publishing workflows requires
  connectivity (definitions are platform config, not field transactions) — **not** part
  of the offline-queue set; no offline editing.
- **Runtime ↔ SmartSync:** workflows are triggered by domain events, which are emitted by
  both online actions and (future) the reconcile worker — so an **offline-created,
  later-reconciled** record drives the same published workflows as an online one, via the
  shared event bus. No special-casing in the Builder.
- **Definitions sync:** if multi-device config caching is ever wanted, definitions are
  LWW config and could ride the existing mirror — but the recommendation is **online-only
  config** to avoid stale/conflicting workflow logic in the field.

## 14. What review must approve
1. Reuse-only model (no new engine/runtime/simulator) ✔ by design.
2. Proposed `0179` publishing/versioning migration (status + version snapshots).
3. Draft→publish→version lifecycle (runs bind to published version).
4. Authoring permission (`workflow.manage`) + global-template gating.
5. Simulation via the real runtime + mock deps.
6. Builder is online-only config (SmartSync stance).

## 15. Explicitly out of scope (this doc)
Any UI/component design, drag-and-drop library choice, screen layouts — deferred until
this architecture is approved. **No UI component will be written before approval.**

---
*Engine status, risks, technical debt, and Builder prerequisites: `WORKFLOW_ENGINE_STATUS.md`.*
