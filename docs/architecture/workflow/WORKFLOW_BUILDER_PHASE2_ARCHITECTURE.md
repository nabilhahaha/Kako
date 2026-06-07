# VANTORA — Workflow Builder Phase 2 Architecture

## Visual Drag-&-Drop Business Process Canvas

**Status:** Proposal — *architecture only, no UI implementation yet.* Awaiting review.

**Goal:** A **Business Process Canvas for the entire platform** — not approvals
only. Any domain process (onboarding, order→invoice, returns, collections, stock
moves, visit follow-ups, integrations) is modeled visually as nodes + edges and
executed by the **existing** engine.

**Non-negotiable law:** *One Engine. One Runtime. One Builder. Zero duplicate logic.*
The canvas is a **visual layer only** over the SAME `erp_workflow_definitions` /
`erp_workflow_steps` the Phase-1 forms builder already edits and the runtime
already executes.

---

## 1. Hard constraints (from the approval)

| # | Requirement | How this design satisfies it |
|---|---|---|
| 1 | Canvas is a visual layer only | Canvas renders/edits existing definitions+steps. It produces **no** execution; it only reads/writes the same rows. |
| 2 | Reuse definitions, steps, runtime, executors, event bus | Nodes ⇄ `erp_workflow_steps`; trigger ⇄ definition (`trigger_event` + `erp_events`); validation/simulation/publish/version via the Phase-1 server actions; execution via `advanceRun` + executor registry. |
| 3 | No new engine | None added. `erp_workflow_*` tables + RPCs unchanged. |
| 4 | No new runtime | None added. `runtime.ts advanceRun` is the only executor. |
| 5 | No duplicate logic | Canvas calls the **same** `validateWorkflow` / `simulateWorkflow` / `publishDefinition` / `cloneDefinition` / `restoreVersion` / `archiveDefinition` actions. Zero re-implemented rules. |
| 6 | Node types: Approval, Condition, Notification, Task, Wait, Escalation, API Call (+ drag + connect) | 1:1 map to the existing 9 `step_type`s (incl. `reject`, `update_record`). |
| 7 | Templates, Versioning, Simulation, Publish, Archive | All reused unchanged from Phase 1 — the canvas is just another editor surface for them. |

---

## 2. The core idea — canvas is a *projection* of the step graph

The engine already has everything a node graph needs:

- **Nodes** = rows in `erp_workflow_steps` (`step_type`, `name`, `config`,
  `approver_*`, `sla_hours`, `escalate_to`, `condition`).
- **Edges** = the branch pointers already executed by the runtime:
  - `next_on_success` (UUID → step id) — the "success/true" edge,
  - `next_on_failure` (UUID → step id) — the "failure/false" edge,
  - **implicit sequential** edge when both are null (runtime falls through to the
    next `step_no`). The canvas will *materialize* these implicit edges as explicit
    `next_on_success` links on first save so the visual graph and the executed
    graph are identical (no hidden behavior).
- **Trigger node** = the definition itself (`trigger_event` from the event
  catalog + `trigger_config`); it is a virtual "start" node, not a step row.
- **Terminal** = a node with no outgoing edge (runtime completes the run).

> There is **no second representation**. The canvas serializes to exactly the
> rows the runtime reads. Phase-1 forms and Phase-2 canvas are two views of one model.

### 2.1 Node ⇄ step_type map (all 9 executors)

| Canvas node | `step_type` | Reused executor (registry) | Edges produced |
|---|---|---|---|
| **Approval** | `approval` | pauses, `ensureApprovalTask`/`approvalDecision` | success + failure |
| **Condition** | `condition` | `evalCondition` (no side effect) | success(true) + failure(false) |
| **Notification** | `notification` | `notify` | success |
| **Task** | `task` | `createTask` | success |
| **Wait / Delay** | `delay` | `wait` (waitUntil, tick-resumed) | success |
| **Escalation** | `escalation` | `escalate` | success |
| **API Call** | `api_call` | `httpCall` (egress allow-list) | success + failure |
| **Update Record** | `update_record` | `updateRecord` (table allow-list) | success |
| **Reject / End-Reject** | `reject` | terminal failure | (terminal) |

The palette groups them as **Approvals**, **Logic** (condition), **Actions**
(notification/task/update_record/api_call), **Flow** (wait/escalation/reject).

---

## 3. What is genuinely new in Phase 2 (and what is *not*)

**New (UI + additive layout metadata only):**
- A React-based node editor surface (drag, connect, select, delete).
- **Layout persistence** — node x/y positions + canvas viewport. This is pure
  presentation; the runtime ignores it.

**NOT new:** engine, runtime, executors, event bus, validation, simulation,
publish, versioning, templates, archive, RLS model, server actions (extended, not
duplicated).

### 3.1 Layout metadata — migration `0181` (additive, UI-only)

```sql
-- 0181_workflow_canvas_layout.sql  (additive; no logic, no engine change)
ALTER TABLE erp_workflow_steps       ADD COLUMN IF NOT EXISTS ui_position jsonb;   -- { "x": int, "y": int }
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS canvas_meta jsonb;   -- { viewport:{x,y,zoom}, trigger:{x,y}, notes? }
```

- Nullable; absent ⇒ the canvas auto-lays-out (dagre/elk top-down) on open, so
  workflows authored in the Phase-1 forms render immediately.
- No covering-index needed (not FKs). No RLS change (inherits the row's policy).
- `select('*')` on the page keeps prod resilient until `0181` is applied.

> This is the *only* schema touch in Phase 2, and it stores nothing the engine reads.

---

## 4. Architecture layers

```
┌─────────────────────────────────────────────────────────────┐
│  Canvas UI (client)  — settings/workflows (canvas view)      │
│  • React Flow nodes/edges • palette • inspector panel        │
│  • drag / connect / select / delete                          │
└───────────────┬─────────────────────────────────────────────┘
                │ pure mapping (no logic)
┌───────────────▼─────────────────────────────────────────────┐
│  graph-model.ts  (NEW, pure)                                  │
│  stepsToGraph(steps, def) → {nodes,edges}                    │
│  graphToSteps(nodes,edges) → step upserts + branch links     │
│  (the ONLY new code; deterministic, unit-tested, no I/O)     │
└───────────────┬─────────────────────────────────────────────┘
                │ existing server actions (Phase 1)
┌───────────────▼─────────────────────────────────────────────┐
│  actions.ts  — upsertStep, deleteStep, updateDefinition,     │
│  validateDefinition, simulateDefinition, publishDefinition,  │
│  archiveDefinition, cloneDefinition, restoreVersion,         │
│  promoteDefinition  (+ new: saveLayout, saveGraph batch)     │
└───────────────┬─────────────────────────────────────────────┘
                │ unchanged
┌───────────────▼─────────────────────────────────────────────┐
│  ENGINE / RUNTIME (unchanged)                                │
│  erp_workflow_definitions / _steps / _instances / _tasks     │
│  advanceRun + executor registry + erp_events bus + tick      │
└─────────────────────────────────────────────────────────────┘
```

**`graph-model.ts` is the heart of Phase 2 and the only new logic** — and it is
pure translation, not execution:
- `stepsToGraph`: each step → a node (position from `ui_position` or auto-layout);
  edges from `next_on_success`/`next_on_failure` and materialized sequential
  fall-through; a virtual trigger node from the definition.
- `graphToSteps`: nodes → `upsertStep` payloads; edges → `next_on_success` /
  `next_on_failure` on the source step; deleted nodes → `deleteStep`. Connecting
  the trigger node sets the definition's first step (entry).

### 4.1 New server action (batch, thin)
`saveGraph(definitionId, { steps[], edges[], layout })` — a transactional batch
that fans out to the **existing** `upsertStep`/`deleteStep` + a `saveLayout`
write. It contains **no** validation or execution of its own; it persists then
calls the existing `validateDefinition` and returns its errors. Draft-only
(published defs are immutable — editing forces clone, exactly as Phase 1).

---

## 5. Reuse of the seven Phase-1 capabilities (unchanged)

| Capability | Canvas behavior |
|---|---|
| **Templates** | Same Global/Company/Private model. "Use template" opens the cloned draft **on the canvas**; layout copied via `ui_position`/`canvas_meta` in clone/restore. |
| **Versioning** | Publish snapshots include `ui_position`/`canvas_meta` so a restored version reproduces its diagram. Running instances stay pinned (`workflow_version`). |
| **Simulation** | Same `simulateWorkflow`/`advanceRun`; the canvas **highlights the executed path** (node/edge states) from the returned trace — visualization only. |
| **Publish** | Same `publishDefinition` (validate → snapshot → bump `latest_version`). Publish disabled until `validateWorkflow` returns zero errors. |
| **Archive** | Same `archiveDefinition`. |
| **Validation** | Same `validateWorkflow` (executor validators + event catalog + **cycle detection**). The canvas surfaces errors as node/edge badges. |
| **Trigger** | Same `trigger_event` catalog + `trigger_config`, edited on the trigger node. |

---

## 6. "Platform-wide business process", not approvals only

The engine is already entity-neutral (`erp_workflow_definitions.entity` +
`erp_events` catalog: `customer.*`, `order.*`, `invoice.*`, `payment.*`,
`return.*`, `visit.*`, `stock_transfer.*`). Phase 2 surfaces this generality:
- The trigger node picks **any** catalog event (or manual), so a canvas process
  can start from an order, invoice, payment, visit, stock transfer, etc.
- Action nodes (`update_record`, `api_call`, `task`, `notification`) make it a
  general orchestration tool, not just sign-offs.
- **No new event types are required for Phase 2**; new domain events are added to
  the catalog (`event-types.ts` + producers) independently, and instantly appear
  in the trigger picker. (Roadmap, not blocking.)

---

## 7. Library decision (needs sign-off)

No graph/DnD library is currently installed. Proposed: **React Flow
(`@xyflow/react`, v12)** — the de-facto node-editor for React, React 19 +
Next 15 compatible, MIT, controlled nodes/edges (fits our "DB is the source of
truth" model), built-in pan/zoom/minimap/connection-validation.

- **SSR:** the canvas is a client island, loaded via `next/dynamic`
  (`ssr: false`); the page stays a server component (auth/RLS unchanged).
- **Bundle:** lazy-loaded only on the canvas view; the Phase-1 forms path is
  unaffected.
- **Auto-layout:** `dagre` (small) for first-open layout when `ui_position` is
  absent; positions then persist.
- **Alternatives considered:** hand-rolled SVG (more code, less robust),
  `react-flow` legacy (superseded by `@xyflow/react`). *Decision requested:
  approve `@xyflow/react` + `dagre`, or specify an alternative.*

---

## 8. Security, multi-tenancy, SmartSync

- **RLS unchanged** — canvas writes go through the same gated server actions and
  the same `erp_workflow_definitions/_steps` policies (company/private/global,
  `(select auth.uid())`). Gate: `workflow.manage`.
- **api_call** nodes remain bound to the **egress allow-list** (approved
  domains/connectors, deny-by-default) — no canvas bypass.
- **update_record** nodes remain bound to the table allow-list.
- **SmartSync:** builder config is **online-only** (unchanged). The *runtime* is
  still driven by offline-reconciled events via the bus.

---

## 9. Validation & integrity specific to a freeform canvas

Reusing `validateWorkflow`, plus canvas-surfaced guards (all already enforced by
the existing validators — the canvas only *renders* them):
- cycle detection (engine would not terminate) → already in `validation.ts`.
- dangling edges / missing branch targets → already flagged.
- exactly-one entry from the trigger; unreachable nodes warned.
- per-node config validity via each executor's `validate`.
Publish stays gated on zero errors + a recorded successful simulation.

---

## 10. Proposed screens (Phase 2)

1. **Canvas Editor** (new view at `settings/workflows` → "Canvas" toggle next to
   Workflows/Templates): palette · canvas · inspector (selected node's form,
   reusing the Phase-1 field components) · toolbar (validate/simulate/publish/
   archive/save-as-template/version).
2. **Inspector panel** — the Phase-1 Step/Condition/Trigger editors embedded per
   selected node (no duplicate forms; shared components).
3. **Simulation overlay** — path highlight from the trace.
4. **Version diff (read-only, stretch)** — render a past snapshot's diagram.

The Phase-1 forms remain available (accessibility/bulk edit/fallback). Forms and
canvas edit the same rows interchangeably.

---

## 11. Implementation plan (phased, after this doc is approved)

1. **P2.0** `graph-model.ts` (pure `stepsToGraph`/`graphToSteps`) + unit tests
   (round-trip: steps → graph → steps is identity; sequential materialization;
   branch mapping; cycle/dangling cases). *No UI, no deps.*
2. **P2.1** `0181` layout columns + `saveGraph`/`saveLayout` actions (thin, reuse
   upsert/delete) + tests. Page `select('*')` for prod-safety.
3. **P2.2** Add `@xyflow/react` + `dagre`; client-island Canvas Editor (drag,
   connect, delete, auto-layout, persistence) behind the new "Canvas" view.
4. **P2.3** Inspector reuse of Phase-1 editors per node type (all 9).
5. **P2.4** Wire validate/simulate(path highlight)/publish/archive/templates/
   versioning to the existing actions.
6. **P2.5** `WORKFLOW_BUILDER_PHASE2_COMPLETION_REPORT.md`, then stop for review.

Each step: `tsc` clean + full suite green; `0181` validated on an isolated
Supabase branch before commit; covering-index/auth.uid invariants respected.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| New dependency (`@xyflow/react`) bundle/SSR | Lazy client island; Phase-1 path untouched; approval gated in §7. |
| Visual graph drifting from executed graph | Single source of truth = step rows; sequential edges materialized on save; `graphToSteps`∘`stepsToGraph` round-trip unit-tested. |
| Freeform graphs that don't terminate | Existing cycle detection blocks publish. |
| Layout columns absent in prod | Nullable + auto-layout fallback + `select('*')`. |
| Scope creep into a "new engine" | Hard rule: Phase 2 adds **only** `graph-model.ts` (pure) + layout metadata + UI. Any execution logic is rejected in review. |

---

## 13. Decisions requested before implementation

1. Approve **`@xyflow/react` v12 + `dagre`** (or name an alternative).
2. Approve **`0181`** additive layout columns (`erp_workflow_steps.ui_position`,
   `erp_workflow_definitions.canvas_meta`).
3. Confirm the canvas should **materialize implicit sequential edges** as explicit
   `next_on_success` on first save (recommended — keeps visual == executed).
4. Confirm Phase-1 forms remain as a co-equal editing surface (recommended).

> One Engine. One Runtime. One Builder. The canvas is a window onto it — nothing more.
