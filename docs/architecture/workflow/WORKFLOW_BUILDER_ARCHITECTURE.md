# VANTORA — Workflow Builder Architecture (proposal for review)

**Architecture only. No UI implementation. No code.** Defines how a future visual
Workflow Builder authors workflows for the **single existing engine + runtime**
(Constitution Art. 32). The Builder is an **authoring surface over
`erp_workflow_definitions` + `erp_workflow_steps`** — it introduces **no new engine,
no new runtime, no duplicate execution logic** (ADR-007).

> Status: **APPROVED & finalized** (2026-06-07) with 3 requirements incorporated (§14).
> Nothing is built yet. Engine prerequisites in `WORKFLOW_ENGINE_STATUS.md` (Phase A —
> `resumeRun` wiring, tick impersonation + `api_call` egress allow-list) must land before
> publishing builder-made workflows that mix approval + automated steps.

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

**Proposed additive migration (Builder phase — NOT now), `0180_workflow_publishing.sql`:**
- `erp_workflow_definitions`: `status text default 'draft' CHECK (draft|published|archived)`,
  `published_at timestamptz`, `published_by uuid`; **`visibility text default 'company'
  CHECK (global|company|private)`** + **`owner_id uuid`** (template tier, §2c);
  `latest_version int` (the current published version pointer). (`is_active` retained for
  back-compat; `status` becomes the lifecycle source of truth.)
- **`erp_workflow_definition_versions`** (immutable publish snapshots): `id, company_id,
  definition_id, version, snapshot(jsonb = definition + ordered steps), published_by,
  published_at`. Append-only; rows are **never updated or deleted** (immutability, §2b).
- **`erp_workflow_instances.workflow_version int`** — the version an instance is **pinned**
  to at start (§2b). (Column exists conceptually on the legacy runs model; added here to
  instances if absent. FK-covered.)
- RLS + FK covering indexes per platform conventions (schema-health invariant).
No new engine/run tables. No change to engine RPCs.

### 2b. Versioning & immutability (Requirement 1 — explicit)
- **Immutable versions.** Publishing snapshots the full definition + ordered steps into
  `erp_workflow_definition_versions(version)` and bumps `latest_version`. Snapshot rows are
  append-only — editing a workflow never mutates a published version; it creates a new draft
  that publishes as `version+1`.
- **Instances pin their version.** At start the dispatcher/runtime resolves the **latest
  published** version and writes `erp_workflow_instances.workflow_version`. The runtime
  loader (`runtime-service.loadRun`) reads the **step graph from that version's snapshot**,
  not from the live editable `erp_workflow_steps` — so a run **continues on the version it
  started with** even while the definition is edited/republished.
- **New instances use the latest published version only.** `listDefinitionsForEvent` /
  `planWorkflowsForEvent` match only `status='published'` definitions and resolve
  `latest_version`; drafts never dispatch. Archived definitions stop matching but in-flight
  runs on their pinned version still complete.
- **Engine reuse:** `erp_workflow_start` continues to create the instance; the only change is
  setting `workflow_version` + loading steps from the snapshot. No second engine.

### 2c. Template model (Requirement 2 — explicit)
Three tiers, expressed via `erp_workflow_definitions.visibility` + `company_id` + `owner_id`
(no separate template tables — templates ARE definitions):

| Tier | `visibility` | `company_id` | `owner_id` | Who sees it | Who can edit/publish |
|---|---|---|---|---|---|
| **Global template** | `global` | `NULL` | `NULL` | every company (fallback) | platform owner only |
| **Company template** | `company` | the tenant | `NULL` | everyone in the company | company workflow-admins (`workflow.manage`) |
| **Private template** | `private` | the tenant | creating user | only `owner_id` (+ platform owner) | the owner |

- **Resolution / precedence (matching an event or key):** company-specific **published**
  definition wins over a global template of the same `key` (extends the existing
  `selectTriggeredDefinitions` company-over-global rule); private templates resolve only for
  their owner. This reuses the existing definitions resolution — no new lookup engine.
- **Promotion path:** private → company (publish to the company) → (platform owner) global.
  Promotion clones the definition with a new `visibility`; immutable versions are preserved.
- **RLS:** read = `global OR company_id=erp_user_company_id() OR (private AND owner_id=auth.uid())`;
  write = platform owner (global) / company workflow-admin (company) / owner (private).
- The seed `customer_onboarding` (today `company_id IS NULL`) is a **global template** under
  this model — back-compatible.

## 3. Builder services (server, reuse-first)
- **DefinitionService** — list/get/create/clone/update/archive drafts; `version` bump on publish.
- **StepService** — CRUD steps within a draft (reorder `step_no`, set `config`,
  `next_on_success/failure`).
- **ValidationService** — pure, reuses runtime: per-step `executor.validate(step)`;
  trigger validity (`trigger_event` ∈ catalog, `trigger_config` parses);
  `condition` parses (`condition-eval`); graph checks (≥1 step, branch targets exist,
  no cycle via `MAX_CHAIN` reachability, terminal reachable, approval steps have approver).
- **PublishService** — **gate: must pass validation AND at least one simulation** (§4a) →
  snapshot to `..._versions` → set `status='published'`, bump `latest_version`. Drafts never
  dispatch; only published definitions match in `listDefinitionsForEvent`.
- **SimulationService (dry-run, §4a)** — runs the **pure** runtime (`advanceRun`) over the
  draft's steps with a **read-only `ExecutorDeps`**: reads **real data** (real records for
  condition/context evaluation, real definition/steps) but **all side effects are mocked** —
  no `erp_workflow_instances`/`_tasks` row, no `update_record`/`api_call`/`notify`/`audit`
  write, no event emitted. Reuses the exact runtime — zero parallel simulator logic.
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

## 4a. Simulation mode (Requirement 3 — explicit, must exist before Publish)
- **Purpose:** dry-run a draft against **real data** to preview the exact execution path
  (steps taken, branches, pauses, terminal state, per-step results) **without creating any
  workflow run or side effect**.
- **Real data, read-only:** the simulation builds the run context from a chosen **real**
  subject record (e.g., a real customer/invoice) + a sample/real event; condition steps read
  real values. The injected `ExecutorDeps` is a **read-only/mock** variant:
  - `evalCondition` → real (pure) · reads (loadRun, record lookups) → real, read-only.
  - `notify/createTask/updateRecord/httpCall/escalate/ensureApprovalTask/audit` → **no-ops
    that record "would do X"** into the returned trace. `approvalDecision` → simulated input.
  - `persist` → **in-memory only** (never touches `erp_workflow_instances`).
- **No runs, no writes, no events:** nothing is inserted/updated; the bus receives nothing.
  Idempotent + side-effect-free, so it can be run repeatedly against production data safely.
- **Output:** `{ trace: stepResult[], finalState, contextDelta }` — the same shape the live
  runtime produces, because it **is** the live runtime (`advanceRun`) with mock deps.
- **Publish gate:** `PublishService` requires a recorded successful validation + simulation
  for the draft version before flipping `status='published'`.
- **Security:** simulation requires the authoring permission; reads obey RLS (the simulator
  cannot read another tenant's data); `api_call`/`update_record` never fire during simulation.

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

## 14. Review outcome — APPROVED (with 3 requirements, now incorporated)
Architecture **approved**. The three review requirements are addressed explicitly:

| # | Requirement | Where addressed |
|---|---|---|
| 1 | Immutable versioning; running instances stay on their start version; new instances use latest published | **§2b** (+ `0180`: `definition_versions` append-only, `instances.workflow_version` pin, `latest_version`) |
| 2 | Templates: Global / Company / Private | **§2c** (+ `0180`: `visibility`, `owner_id`; RLS + precedence) |
| 3 | Simulation before Publish; dry-run on real data, no runs created | **§4a** (+ §3 read-only deps; PublishService gate) |

Also approved by design: reuse-only model (no new engine/runtime/simulator), authoring
permission (`workflow.manage`) + global-template gating, Builder is online-only config.

**Finalized.** UI implementation may proceed against THIS document; any deviation requires a
doc update + re-approval (Constitution Art. 49 / ADR).

## 15. Explicitly out of scope (this doc)
Any UI/component design, drag-and-drop library choice, screen layouts — deferred until
this architecture is approved. **No UI component will be written before approval.**

---
*Engine status, risks, technical debt, and Builder prerequisites: `WORKFLOW_ENGINE_STATUS.md`.*
