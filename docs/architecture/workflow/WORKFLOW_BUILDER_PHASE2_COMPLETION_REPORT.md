# VANTORA — Workflow Builder Phase 2 Completion Report

## Visual Drag-&-Drop Business Process Canvas

**Status:** ✅ Complete — ready for review.
**Built to:** `WORKFLOW_BUILDER_PHASE2_ARCHITECTURE.md` (approved, with all four §13
defaults accepted).
**Law upheld:** *One Engine. One Runtime. One Builder. Zero duplicate logic.* The
canvas is a **visual layer only**. Execution remains owned by the **Event Bus,
Workflow Engine, Runtime, and Executors** — the canvas adds none of it.

---

## 1. Approved decisions — as implemented

| Decision | Implemented |
|---|---|
| React Flow (`@xyflow/react` v12) + `dagre` | ✅ added; canvas is a `next/dynamic` `ssr:false` client island (lazy chunk; Phase-1 path unaffected — `/settings/workflows` first-load unchanged). |
| Migration `0181` UI-only layout metadata | ✅ `erp_workflow_steps.ui_position`, `erp_workflow_definitions.canvas_meta` (jsonb, nullable, no FK/index/RLS — runtime never reads them). |
| Materialize implicit sequential edges → explicit `next_on_success` | ✅ in `graph-model.graphToSteps` (what you see == what runs). |
| Keep Phase-1 forms as a co-equal surface | ✅ Canvas is a new **tab** beside Overview/Trigger/Steps/Versions/Simulate; forms and canvas edit the same rows interchangeably. |

**Added rule honored:** canvas metadata is visual-only — no execution, runtime, or
business logic lives in the canvas or in `0181`.

---

## 2. The single source of truth (no second model)

- **Nodes** ⇄ `erp_workflow_steps` rows · **Edges** ⇄ `next_on_success` /
  `next_on_failure` (+ materialized sequential) · **Trigger node** ⇄ the
  definition (`trigger_event`).
- The **only** new logic is `src/lib/workflow/builder/graph-model.ts` — a pure,
  dependency-free, unit-tested translator (`stepsToGraph` / `graphToSteps` /
  `unreachableStepIds`). It performs **no execution**.
- Persistence reuses the engine schema via `saveGraph`, which then calls the
  **existing** `validateWorkflow` — zero duplicated validation/business rules.

---

## 3. Node types (all 9 executors, drag + connect)

`approval`, `condition`, `notification`, `task`, `update_record`, `api_call`,
`delay` (Wait), `escalation`, `reject` — each maps 1:1 to its existing executor.
Branching nodes (`approval`, `condition`, `api_call`) expose **success (✓) and
failure (✗)** source handles; linear actions expose one; `reject` is terminal.
The trigger node carries the event from the catalog.

---

## 4. Canvas UX requirements — all delivered

| # | Requirement | How |
|---|---|---|
| 1 | Auto Layout | `dagre` top-down layout button (+ auto-layout on first open when positions are absent), then fit-view. |
| 2 | Zoom To Fit | explicit **Fit** button + React Flow Controls. |
| 3 | Mini Map | `<MiniMap pannable zoomable />`. |
| 4 | Undo / Redo | snapshot history of `{nodes,edges}` (50 deep) on add/connect/move/delete/layout; buttons disabled at stack ends. |
| 5 | Multi Select | shift/cmd/ctrl multi-selection + selection-on-drag box. |
| 6 | Keyboard Delete | `deleteKeyCode={['Backspace','Delete']}` (disabled when published; trigger node is non-deletable). |
| 7 | Read-only Published View | published ⇒ not draggable/connectable, delete/edit disabled, banner shown (edit forces clone, per Phase 1). |
| 8 | Unsaved Changes Warning | `dirty` flag + `beforeunload` guard + an "unsaved changes" indicator; cleared on successful save. |

---

## 5. Reuse of the seven capabilities (unchanged engine paths)

- **Templates / Versioning / Archive / Simulation** — unchanged Phase-1 actions;
  the canvas is just another editor. Clone/restore already copy `ui_position`
  (additive) and preserve branches (`copyStepsRemapped`).
- **Publish** — the canvas "Publish" runs `saveGraph` → `validateWorkflow`; only
  if zero errors does it call the existing `publishDefinition` (immutable snapshot
  + `latest_version` bump; running instances stay pinned via `workflow_version`).
- **Validation** — the canvas surfaces the existing `validateWorkflow` output
  (executor validators + event catalog + cycle detection) inline.
- **Trigger** — edited on the trigger node; saved via the existing
  `updateDefinition` (the trigger *is* the definition).

---

## 6. Persistence — `saveGraph` (batch, collision-safe, draft-only)

1. Reject if published (immutable).
2. Park existing rows at distinct temp `step_no` (avoids the unique
   `(definition_id, step_no)` collision).
3. Upsert incoming steps (branches included; `next_on_*` are plain uuids).
4. Delete rows no longer present (`current_step_id` is `ON DELETE SET NULL`).
5. Save `canvas_meta` (visual-only).
6. Return `validateWorkflow` errors.

`saveLayout` persists positions/viewport only (no validation) — pure presentation.

---

## 7. Platform-wide, not approvals only

The engine is entity-neutral, so the trigger node can start a process from any
catalog event (`customer.*`, `order.*`, `invoice.*`, `payment.*`, `return.*`,
`visit.*`, `stock_transfer.*`) and action nodes (`update_record`, `api_call`,
`task`, `notification`) make it a general **Business Process Canvas**. New domain
events added to `event-types.ts` appear in the trigger picker automatically.

---

## 8. Security / tenancy / SmartSync (unchanged)

- All writes go through gated server actions + existing RLS
  (company/private/global, `(select auth.uid())`). Gate: `workflow.manage`.
- `api_call` nodes stay bound to the **egress allow-list**; `update_record` to the
  **table allow-list** — no canvas bypass.
- Builder is **online-only**; the runtime is still driven by offline-reconciled
  events via the bus.

---

## 9. Files

- **New:** `src/lib/workflow/builder/graph-model.ts` (+ `.test.ts`, 12 tests),
  `src/app/(app)/settings/workflows/workflow-canvas.tsx`,
  `supabase/migrations/0181_workflow_canvas_layout.sql`,
  this report.
- **Changed:** `actions.ts` (+`saveGraph`/`saveLayout`), `workflow-builder.tsx`
  (Canvas tab + dynamic island + types), `messages/workflows.ts` (ar/en),
  `package.json` (`@xyflow/react`, `dagre`, `@types/dagre`).

---

## 10. Gates

- `tsc --noEmit` — **clean**.
- **Production build — clean** (`/settings/workflows` 12.1 kB; React Flow in a
  lazy chunk, not the initial bundle).
- Unit/integration suite — **894 passed / 29 skipped** (incl. 12 graph-model tests).
- i18n ar/en parity + key-usage — green.
- `0181` is additive jsonb only (no FK/index/RLS) — schema-health invariants N/A;
  CI "Apply migrations to STAGING" confirms.

---

## 11. Known limitations (intentional)

- Node config for automated types is edited as JSON in the inspector (validated
  server-side by the real executor validators) — per-field inspector forms can
  follow; not required for correctness.
- Simulation **path-highlight on the canvas** is a small follow-up; the Simulate
  tab already runs the real dry-run and shows the trace.
- Undo/redo history is per-session (not persisted) — standard for a builder.

---

## 12. What was NOT added (by design)

No new engine. No new runtime. No new executors. No new event types. No execution
logic in the UI or in `0181`. The canvas is a window onto the one engine.

> One Engine. One Runtime. One Builder.
