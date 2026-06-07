# VANTORA — Workflow Builder Phase 1 Completion Report

**Status:** ✅ Complete — ready for review.
**Scope:** Lightweight, **forms-based** Workflow Builder over the SINGLE engine
(no canvas, no drag-&-drop, no execution logic in the UI). Built exactly to
`WORKFLOW_BUILDER_SCREEN_TREE.md`.
**Law upheld:** *One Engine. One Runtime. One Builder. Zero duplicate logic.*

Route: `settings/workflows` · Gate: `workflow.manage` · SmartSync: online-only
(runtime is still driven by offline-reconciled events via the bus; builder config
is never offline-edited).

---

## 1. What was delivered (screen tree → implementation)

| # | Screen (tree) | Delivered | Where |
|---|---|---|---|
| 1 | **Workflow List** | ✅ status filter chips (All/Draft/Published/Archived) + search + open/clone/archive | `workflow-builder.tsx` (list view) |
| 2 | **Workflow Details** | ✅ editor shell with tabs + header actions (validate/publish/archive/save-as-template/delete) | `workflow-builder.tsx` (details view) |
| 3 | **Workflow Versions** | ✅ immutable history table + **restore-as-new-draft** | `VersionsTab` + `restoreVersion` |
| 4 | **Workflow Templates** | ✅ Global · Company · Private tabs + Use template + Promote (private→company, company→global) | `TemplatesView` + `cloneDefinition`/`promoteDefinition` |
| 5 | **Trigger Editor** | ✅ Manual/Event mode + event from catalog + `trigger_config` JSON | `TriggerTab` + `updateDefinition` |
| 6 | **Condition Editor** | ✅ condition-DSL JSON on `condition` steps + branch targets | `StepsTab` (condition type) |
| 7 | **Step Editor** | ✅ all 9 executor types, per-type fields + config JSON, reorder, branches, SLA/escalation | `StepsTab` + `upsertStep` |
| 8 | **Simulation Screen** | ✅ dry-run vs real data, trace, **no run / no side effects** | `SimulateTab` + `simulateDefinition`/`simulate.ts` |
| 9 | **Publish Screen** | ✅ validate → immutable snapshot → bump `latest_version`, set `published` | header Publish + `publishDefinition` |
| 10 | **Archive Screen** | ✅ archive (stop matching) / unarchive (→draft) | header + list + `archiveDefinition` |

All ten screens from the tree are implemented as **forms** within the existing
`settings/workflows` route. No new runtime, no new engine.

---

## 2. The three approved architecture requirements — coverage

1. **Immutable versioning.** ✅ Publish writes a frozen snapshot
   (`{definition, steps}`) to `erp_workflow_definition_versions(version+1)` and
   bumps `latest_version`. Versions are never edited; the Versions tab can only
   **restore a past version into a new draft**. New runs use the latest published
   version; `erp_workflow_instances.workflow_version` pins running instances to
   the version they started on.
2. **Template tiers — Global / Company / Private.** ✅ `visibility` +
   `owner_id` on the definition; the Templates view exposes all three tiers with
   *Use template* (clone into a company draft) and *Promote* (private→company,
   company→global). RLS (`0180`) enforces the tiers: global is platform-owner
   only, company is company-admin, private is owner-only.
3. **Simulation before publish.** ✅ The Simulate tab dry-runs the draft against
   real data using the **exact runtime** (`advanceRun`) with read-only/mock deps —
   no `erp_workflow_instances`, no writes, no events, no outbound HTTP. Validation
   (`validateWorkflow`) gates publish; simulation lets the author preview the path
   first.

---

## 3. Reuse guarantees (zero duplicate logic)

- **Validation** (`builder/validation.ts`) calls each executor's own `validate`
  from the runtime registry + the event catalog + a step-graph cycle check.
  No re-implemented per-type rules.
- **Simulation** (`builder/simulate.ts`) calls the runtime `advanceRun` and the
  real `evalCondition`; only the side-effecting deps are mocked.
- **Publish/clone/restore** snapshot and copy the same `erp_workflow_definitions`
  / `erp_workflow_steps` rows the engine already executes.
- The builder writes **only** to engine tables (`erp_workflow_definitions`,
  `erp_workflow_steps`, `erp_workflow_definition_versions`). It contains **no**
  execution code.

---

## 4. Server actions (`settings/workflows/actions.ts`, gated `workflow.manage`)

`createDefinition`, `updateDefinition` (draft-only; published is immutable),
`upsertStep` (generalized 9 types), `deleteStep`, `deleteDefinition`,
`validateDefinition`, `publishDefinition`, `archiveDefinition`,
`cloneDefinition` (company/private/global), `promoteDefinition`,
`restoreVersion`, `simulateDefinition`. Clone/restore preserve success/failure
branch targets via id-remapping (`copyStepsRemapped`).

---

## 5. Database (migration `0180_workflow_publishing.sql`)

Additive only; depends on `0088` + `0176–0179`:
- `erp_workflow_definitions`: `status` (draft/published/archived),
  `published_at/by`, `visibility` (global/company/private), `owner_id`,
  `latest_version` + CHECK constraints; backfill preserves legacy behaviour.
- `erp_workflow_definition_versions` (immutable snapshots) + covering index + RLS.
- `erp_workflow_instances.workflow_version` (version pinning).
- Definition RLS extended for the three template tiers.
- RLS uses `(select auth.uid())` (single-eval) per the schema-health invariant.

---

## 6. Gates

- `tsc --noEmit` — **clean**.
- Unit/integration suite — **882 passed / 29 skipped**.
- Builder unit tests — `validation.test.ts` **9/9**; i18n parity + key-usage green.
- CI on the PR: **Integration tests (DB) ✅**, **Apply migrations to STAGING ✅**
  (0180 applied cleanly), Apply to PRODUCTION skipped (guarded).
- i18n: full ar/en parity for all new builder strings.

---

## 7. Known limitations (intentional for Phase 1)

- Step `config` for automated types is edited as JSON (validated server-side by
  the real executor validators); per-field forms can be added later — not required
  for correctness.
- Promotion to **global** requires the platform owner; non-owners are rejected by
  RLS (surfaced as an error).
- No visual graph — that is Phase 2.

---

## 8. Next priority — Phase 2 (after Phase 1 approval)

**Visual Drag-&-Drop Canvas**, strictly as a *visual layer* over the same
`erp_workflow_definitions` / `erp_workflow_steps`: no separate execution model,
no separate runtime, no duplicate logic. The canvas reads/writes the exact same
definitions this forms-based builder edits.

> One Engine. One Runtime. One Builder.
