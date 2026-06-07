# VANTORA — Workflow Platform V1 Final Report

**Status:** ✅ V1 complete (Engine + Runtime + Event Bus + Builder Phase 1 + Canvas
Phase 2). On `claude/offline-sync-architecture` (PR #125).
**Governing law:** *One Engine. One Runtime. One Builder. Zero duplicate logic.*
Execution is owned solely by the **Event Bus, Workflow Engine, Runtime, and
Executors**; everything else (forms builder, visual canvas, simulation, versioning,
templates) is a surface over that one engine.

---

## 1. Architecture Summary

A single, entity-neutral workflow OS for the whole platform:

```
 Domain mutations (orders, invoices, customers, payments, visits, stock, …)
        │  emit()  (after-commit, offline-reconciliation-aware)
        ▼
   Event Bus  (erp_events)
        │  dispatcher matches trigger_event + trigger_config
        ▼
   Workflow Engine  (erp_workflow_definitions / _steps / _instances / _tasks)
        │  erp_workflow_start → instance pinned to a published version
        ▼
   Runtime  (advanceRun)  ── drives ──▶  Executor Registry (9 step types)
        │  approval pauses → erp_workflow_decide(_runtime); delay waits → tick
        ▼
   Side effects ONLY via executor deps (notify / task / update_record / api_call…)
                              │ api_call bound to egress allow-list
                              ▼
                    Audit (erp_log_audit) + version-pinned history
```

Two **builder surfaces** edit the same `erp_workflow_definitions` /
`erp_workflow_steps` rows:
- **Phase 1** — forms (`settings/workflows`).
- **Phase 2** — visual drag-&-drop **canvas** (a projection of the step graph).

Multi-tenancy and security are unchanged platform primitives: RLS via
`erp_user_company_id()`, `erp_is_company_admin()`, `erp_is_platform_owner()`,
`erp_has_branch_access()`, all policies using `(select auth.uid())`.

---

## 2. Engine Components

| Object | Role |
|---|---|
| `erp_workflow_definitions` | a workflow (key, entity, trigger_event, trigger_config, status draft/published/archived, visibility global/company/private, owner_id, version, latest_version, canvas_meta) |
| `erp_workflow_steps` | ordered steps: step_no, step_type (9), name, config, approver_*, mode, required_approvals, condition, sla_hours, escalate_to, next_on_success/next_on_failure, ui_position |
| `erp_workflow_instances` | a run: status, runtime_state, current_step_id, context, **workflow_version** (immutable pinning), branch_id |
| `erp_workflow_tasks` | approval tasks (assignee resolution, decisions) |
| `erp_workflow_definition_versions` | immutable publish snapshots `{definition, steps}` |
| `erp_workflow_egress_rules` | approved domains/connectors for `api_call` (deny-by-default) |
| `erp_events` | the event bus log (event_type, entity, record_id, payload, company_id, branch_id) |

**RPCs / SQL functions:** `erp_workflow_start`, `erp_workflow_decide`,
`erp_workflow_decide_runtime` (runtime-owned, guarded), `erp_workflow_tick`,
`erp_workflow_make_tasks`, `erp_workflow_resolve_users`,
`erp_workflow_user_can_act`, `erp_workflow_condition_met`.

**Migrations:** `0088` (engine baseline) → `0176` (event bus + foundation) →
`0177` (step generalization) → `0178` (runtime_state) → `0179` (Phase A:
decide_runtime, impersonation, egress) → `0180` (publishing/versioning/templates)
→ `0181` (canvas layout metadata, UI-only).

---

## 3. Runtime Components

| Module | Responsibility |
|---|---|
| `runtime.ts` (`advanceRun`) | pure state machine over `RuntimeDeps`/`ExecutorDeps`; follows success/failure branches + sequential fall-through; pauses on approval, waits on delay |
| `executors/registry.ts` | one executor per step_type; each: `validate` + `execute` (side effect via deps) + result (`completed`/`failed`/`paused`/`waiting`) |
| `condition-eval.ts` | pure boolean DSL (`all`/`any`/`not`, field/op/value) |
| `runtime-deps.ts` / `runtime-service.ts` | wire `ExecutorDeps` to real Supabase/notify/task/http; per-actor impersonation (`createImpersonatedClient`) |
| `egress.ts` | `api_call` allow-list enforcement (approved domains/connectors; deny → 403 non-retryable + `workflow.egress.denied` audit) |
| `repository.ts` | run/step/task persistence mapping (`mapRunPatch` onto engine columns) |

**9 step types (executors):** `approval`, `reject`, `condition`, `notification`,
`task`, `update_record` (table allow-list), `api_call` (egress allow-list),
`delay` (tick-resumed), `escalation`.

**Resume/durability:** approvals pause and resume via
`erp_workflow_decide_runtime`; delays resume via `erp_workflow_tick`; the tick
runs each run under its starter's impersonated client (no elevated execution).

---

## 4. Event Bus Integration

- **Producers** call `emit()` after their domain mutation commits; emission is
  **offline-reconciliation-aware** (a reconciled offline record still produces its
  event on sync, so workflows fire exactly once).
- **Catalog** (`event-types.ts`, single-sourced): `customer.created/updated/
  approved`, `order.created/approved`, `invoice.issued/voided`,
  `payment.received`, `return.approved`, `visit.completed`,
  `stock_transfer.completed`. `EVENT_ENTITY` maps each to a neutral entity key.
- **Dispatcher** (`dispatcher.ts` + `trigger-match.ts`) matches an event to all
  active published definitions whose `trigger_event` + `trigger_config` (where /
  branchScoped) apply, then calls `erp_workflow_start` (pinning the latest
  published version).
- New domain events are added to the catalog + a producer call; they appear in the
  builder trigger picker automatically — **no engine change**.

---

## 5. Builder Phase 1 Summary (forms)

`settings/workflows` (gate `workflow.manage`). Ten screens per
`WORKFLOW_BUILDER_SCREEN_TREE.md`: List (status filters + search), Details (tabs:
Overview / Trigger / Steps+Condition / Versions / Simulate), Templates
(Global/Company/Private with Use + Promote), Publish, Archive. Server actions:
`createDefinition`, `updateDefinition`, `upsertStep` (all 9 types), `deleteStep`,
`validateDefinition`, `publishDefinition`, `archiveDefinition`, `cloneDefinition`,
`promoteDefinition`, `restoreVersion`, `simulateDefinition`. **Three approved
requirements:** immutable versioning (snapshots + instance pinning), three template
tiers, simulation-before-publish — all delivered.

---

## 6. Canvas Phase 2 Summary (visual)

A **visual layer only** — `graph-model.ts` (pure) projects steps→graph and
serializes graph→steps (implicit sequential edges **materialized** to explicit
`next_on_success`). Canvas (`@xyflow/react` v12 + `dagre`, `next/dynamic`
`ssr:false`) is a co-equal Details tab. 9 node types = 9 executors; branching nodes
expose success/failure handles; the trigger node carries the catalog event. UX:
auto-layout, zoom-to-fit, mini-map, undo/redo, multi-select, keyboard-delete,
read-only published view, unsaved-changes warning. Persistence via `saveGraph`
(collision-safe, draft-only) → reuses the existing `validateWorkflow`. Layout is
stored in `0181` UI-only columns the runtime never reads.

---

## 7. Test Coverage

- **Engine/runtime/builder unit tests: 71** across 9 files —
  `runtime`, `runtime-deps`, `dispatcher`, `trigger-match`, `condition-eval`,
  `egress`, `executors/registry`, `builder/validation` (9), `builder/graph-model` (12).
- **Whole suite: 894 passing / 29 skipped** (133 files); `tsc --noEmit` clean;
  **production build clean** (canvas lazy-chunked).
- **DB integration (CI):** schema-health invariants (every FK covered; no unwrapped
  `auth.uid()`), RLS tenant isolation, migrations applied to STAGING green.
- **Covered behaviors:** branch routing, cycle detection, approval pause/resume,
  delay/tick, condition DSL, egress deny, trigger matching, graph round-trip
  (steps→graph→steps identity + sequential materialization), validation per
  executor, version snapshot/pinning.

---

## 8. Known Limitations

1. Automated-step `config` is edited as JSON (validated server-side by the real
   executor validators) — **per-field inspector forms are the next item**.
2. Canvas does not yet **highlight the simulated path** — **next item** (the
   Simulate tab already runs the real dry-run + trace).
3. Undo/redo history is per-session (not persisted) — standard for a builder.
4. `delay`/SLA progression depends on the **tick** cadence (scheduler), not
   real-time timers.
5. Parallel-approval quorum exists in the engine but has limited builder UI surface.

---

## 9. Technical Debt

- Tick scheduling cadence/observability (a metrics surface for runs/tasks/egress
  denials would help operations).
- `api_call` egress rules are managed at the data layer; a small admin UI is
  desirable.
- Step `config` JSON has no client-side schema hints yet (server validation is
  authoritative) — addressed partly by per-field forms.
- Canvas large-graph performance is good via React Flow but untested at 100+ nodes.
- No formal “workflow analytics” (cycle time, bottleneck steps) yet.

---

## 10. Future Enhancements

- Canvas simulation path-highlight; per-field inspector forms (next).
- Sub-workflows / call-activity nodes (still one engine — a node that starts
  another definition).
- Timer/cron triggers (scheduled starts) added as catalog “events”.
- SLA dashboards + escalation analytics.
- Versioned template marketplace (promote/import across companies).
- Inline test-data fixtures for simulation.

---

## 11. Reuse Opportunities Across VANTORA

The engine is **entity-neutral**, so any module that can (a) emit a domain event
and (b) express its approvals/automations as steps gets workflow “for free”:
- **CRM** — customer/lead lifecycle, visit follow-ups (events already exist).
- **Finance** — invoice/payment/credit approvals (events exist) + `update_record`
  for status transitions; `api_call` to external finance connectors via the
  egress allow-list.
- **Inventory** — stock-transfer, near-expiry, count-review processes.
- **Procurement** — purchase-request/PO approvals via new `purchase.*` events.
- **HR** — leave/expense/onboarding approvals via new `hr.*` events.
- **Governance** — policy sign-offs, audit routing, segregation-of-duties gates.
- **Service** — ticket routing, SLA escalation.

> All of the above need only: new catalog events + producer calls + workflow
> definitions authored in the existing builder/canvas. **No new engine, runtime,
> executors, or builder.** Detailed in `WORKFLOW_PLATFORM_V1_REUSE_STRATEGY.md`.

---

## 12. What V1 deliberately does NOT include

No second engine/runtime/executor set; no execution logic in any UI or in the
canvas layout metadata; no module-specific workflow forks. One engine powers all.
