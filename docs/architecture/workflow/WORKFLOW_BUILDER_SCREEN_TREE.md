# VANTORA — Workflow Builder Screen Tree (Phase 1, lightweight / forms)

Phase 1 = **forms-based** builder over the SINGLE engine (no drag-&-drop, no canvas,
no execution logic in the UI). Every screen reuses the existing engine/runtime/
executors via server actions; the UI only reads/writes `erp_workflow_definitions`,
`erp_workflow_steps`, and (0180) versions. Route root: **`settings/workflows`**
(the existing "Workflow Builder Lite", extended). Gate: **`workflow.manage`**
(read may be broader; publish/archive/edit require it).

Legend — SmartSync: **online-only** (builder config is never offline-edited;
the *runtime* is still triggered by offline-reconciled events via the bus).

---

## 1. Workflow List
- **Purpose:** browse all workflow definitions the user can see (own company +
  global templates; private only to owner), with status/version at a glance.
- **Tabs:** All · Draft · Published · Archived (filter chips).
- **Actions:** New workflow · Open · Clone · Archive/Unarchive · (search by name/key/entity).
- **Permissions:** view = signed-in with workflow read; mutate = `workflow.manage`.
- **Validation:** new requires unique `key` + `entity`; duplicate key → error.
- **SmartSync:** online-only.

## 2. Workflow Details
- **Purpose:** the editor shell for one definition (header: name, key, entity,
  status badge, version, visibility) hosting the editor tabs.
- **Tabs:** Overview · Trigger · Steps (Step + Condition editors) · Versions ·
  Simulate · (Publish/Archive in the header actions).
- **Actions:** edit name/description/entity · Save draft · Publish · Archive · Clone.
- **Permissions:** `workflow.manage` to edit; published definitions are read-only
  (edits create a new draft/version).
- **Validation:** name required; entity required; can't edit a published version in
  place (must create a draft).
- **SmartSync:** online-only.

## 3. Workflow Versions
- **Purpose:** immutable publish history; see what each running instance is pinned to.
- **Tabs:** none (a versions table).
- **Actions:** view a version snapshot (read-only) · Restore-as-new-draft (clones a
  past version into a new editable draft).
- **Permissions:** view = workflow read; restore = `workflow.manage`.
- **Validation:** versions are immutable — never editable; restore creates `version+1`
  on publish.
- **SmartSync:** online-only.

## 4. Workflow Templates
- **Purpose:** the template library — Global (platform), Company (shared), Private
  (owner) — to start a workflow from a template.
- **Tabs:** Global · Company · Private.
- **Actions:** Use template (clone into a company/private draft) · Promote
  (private→company; platform owner: company→global) · Save-as-template.
- **Permissions:** use/clone = `workflow.manage`; promote-to-global = platform owner;
  promote-to-company = company admin.
- **Validation:** clone copies definition + steps as a new `draft`; visibility set per
  target tier; key uniqueness enforced.
- **SmartSync:** online-only.

## 5. Trigger Editor
- **Purpose:** choose how the workflow starts — Manual or an event (`trigger_event`)
  with an optional filter (`trigger_config`).
- **Tabs:** none (a form inside Details → Trigger).
- **Actions:** select mode (manual/event) · pick `trigger_event` from the catalog ·
  edit `trigger_config` (entity / where / branchScoped) · Save.
- **Permissions:** `workflow.manage`.
- **Validation (reuses `validation.ts`/`trigger-match`):** `trigger_event` must be a
  known catalog event; `trigger_config.where` must be valid JSON; warn if the event
  has no producer coverage.
- **SmartSync:** online-only. (Note: the chosen event may itself originate from an
  offline-reconciled record — surfaced as info.)

## 6. Condition Editor
- **Purpose:** edit a `condition` step's expression (or a step's branch condition)
  in the `condition-eval` DSL.
- **Tabs:** none (form within the Step editor when `step_type=condition`).
- **Actions:** add/remove clauses (field/op/value, all/any/not) · choose
  success/failure branch targets · Save.
- **Permissions:** `workflow.manage`.
- **Validation (reuses `condition-eval` + `validation.ts`):** expression must parse;
  branch targets must reference existing steps.
- **SmartSync:** online-only.

## 7. Step Editor
- **Purpose:** add/edit/reorder steps; pick a `step_type` from the Executor Catalog
  and fill its config; set approver/SLA/escalation/branches.
- **Tabs:** none (a list of step cards + an add/edit form inside Details → Steps).
- **Actions:** add step · edit step (type + config) · reorder (`step_no`) · set
  `next_on_success`/`next_on_failure` · delete · (approval: approver_type/ref, mode,
  required_approvals, sla_hours, escalate_to).
- **Permissions:** `workflow.manage`.
- **Validation (reuses each executor's `validate`):** per-type config required fields
  (e.g. notification channel+template; api_call url+method; update_record allow-listed
  table; delay positive; approval approver); unique `step_no`; valid branch targets.
- **SmartSync:** online-only.

## 8. Simulation Screen
- **Purpose:** dry-run the draft against **real data** and preview the path
  (steps/branches/pauses/terminal) **without creating a run or any side effect**.
- **Tabs:** none (Details → Simulate).
- **Actions:** pick a real subject record (entity + record id) · optional context
  overrides · simulate approval decisions (per step) · Run simulation · view trace.
- **Permissions:** `workflow.manage`.
- **Validation:** definition must pass `validateWorkflow` first; simulation reads real
  data read-only; **no** `erp_workflow_instances`/effects/events written.
- **SmartSync:** online-only (requires connectivity to read real data + run).

## 9. Publish Screen
- **Purpose:** validate + simulate gate, then publish an immutable version and make it
  the live `latest_version`.
- **Tabs:** none (a confirm dialog from Details header).
- **Actions:** Validate · (require ≥1 passing simulation) · Publish.
- **Permissions:** `workflow.manage` (global templates: platform owner).
- **Validation:** `validateWorkflow` must return zero errors AND a recorded successful
  simulation; on publish → snapshot to `erp_workflow_definition_versions(version+1)`,
  set `status='published'`, bump `latest_version`. New instances use the latest
  published; running instances stay on their pinned version.
- **SmartSync:** online-only.

## 10. Archive Screen
- **Purpose:** retire a workflow so it no longer matches new events; in-flight runs
  finish on their pinned version.
- **Tabs:** none (a confirm action from List/Details).
- **Actions:** Archive · Unarchive (back to draft).
- **Permissions:** `workflow.manage`.
- **Validation:** archive sets `status='archived'` (+ `is_active=false`); dispatcher
  stops matching; existing pinned runs continue; unarchive returns to `draft`.
- **SmartSync:** online-only.

---

## Implementation mapping (Phase 1)
- **Server actions** (`settings/workflows/actions.ts`, gated `workflow.manage`):
  create/update definition, upsert/delete step, publish, archive/unarchive, clone/
  promote (templates + version restore), validate, simulate — all reuse
  `validation.ts` (executor validators), `simulate.ts` (runtime), the engine RPCs,
  and `0180` versioning. **No execution logic in the UI.**
- **UI** (`settings/workflows/*`, forms only): List + Details(tabs: Overview/Trigger/
  Steps/Versions/Simulate) + Templates + Publish/Archive confirms. No drag-&-drop,
  no canvas (Phase 2).
- **Reuse-only:** engine (`erp_workflow_*`), runtime (`advanceRun`), executors
  (registry + `validate`), event catalog, condition-eval, trigger-match. One engine,
  one runtime, one builder.
