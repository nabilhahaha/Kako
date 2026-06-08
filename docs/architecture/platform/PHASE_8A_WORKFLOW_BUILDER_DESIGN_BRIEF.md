# Phase 8A — Workflow Builder: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive
migrations only · multi-tenant RLS · governance + auditability · feature-flagged default OFF.

> The workflow **engine** already exists and is mature (see §3). Phase 8A is overwhelmingly a
> **no-code BUILDER + template library** layered on top — not a new engine. This brief scopes
> only the net-new builder surface and how it composes the existing primitives.

## 1. Architecture

```
   Builder UI (no-code)                Templates library
   ┌───────────────────────────┐       ┌─────────────────────────────┐
   │ canvas (drag steps) +      │       │ Customer / Price / Trade-    │
   │ conditional logic + multi- │◀─────▶│ Spend / Return / Collection /│
   │ level approval + escalation│       │ Purchase / Credit / Data-    │
   │ + delegation + draft/publish│      │ Update approval templates    │
   └─────────────▲──────────────┘       └─────────────────────────────┘
                 │ writes definition versions (draft → publish)
   ┌─────────────┴───────────────────────────────────────────────┐
   │ EXISTING workflow engine (reused, unchanged):                │
   │  definitions + versions (publishing) · steps (condition/     │
   │  approval/reject/task/notification/api_call/update_record/   │
   │  delay/escalation) · runtime (run state, attempts, effect    │
   │  ledger, claiming) · triggers/events · dispatcher · egress · │
   │  SLA/escalation tick (workflow-tick) · canvas layout         │
   └──────────────────────────────────────────────────────────────┘
```

8A adds: (a) a **richer builder UX** (conditional-logic editor, multi-level approval +
escalation + delegation configuration, reusable templates, draft/publish lifecycle surfaced in
the UI), and (b) a **seeded template library**. The runtime, step semantics, persistence, and
dispatch are **reused as-is**.

## 2. Data model (additive only)

The engine's tables already cover the core: `erp_workflow_definitions`, `…_definition_versions`
(publishing), `…_steps`, `…_instances`, `…_tasks`, `…_egress_rules`, `…_step_effects`,
`erp_approval_authority_rules`, plus canvas layout. **8A net-new is minimal:**

- **`erp_workflow_templates`** (additive) — the reusable template catalog: `id, company_id?
  (NULL = platform/global seed), code, name, name_ar, category (customer|price|trade_spend|
  return|collection|purchase|credit|data_update|custom), definition jsonb, is_active`.
  Company-scoped RLS for tenant templates; global seeds readable by all (platform-owned).
- **(Reuse)** delegation could ride an additive `delegate_to`/`delegation` column on the
  approval task/authority model **or** a small `erp_approval_delegations` table
  (`company_id, from_user, to_user, effective_from, effective_to`) — decide at design time;
  the temporary-access pattern (0227 + the new expiry sweep) is the precedent.

No changes to existing engine tables beyond optional additive columns. No destructive migrations.

## 3. Workflow engine design (reused — what exists)

- **Definitions + versions** with a **draft → publish** lifecycle (0179/0180); canvas layout
  persisted (0181).
- **Step types:** `condition · approval · reject · task · notification · api_call ·
  update_record · delay · escalation` (`WorkflowStepType`).
- **Runtime:** generalized run state machine with bounded attempts (`MAX_RUN_ATTEMPTS`), an
  **effect ledger** (idempotent side-effects), **single-flight claiming** (FOR UPDATE SKIP
  LOCKED + lease, 0182), retry/delay via `next_action_at`, and the **SLA/escalation tick**
  (`erp_workflow_tick`) driven by `/api/internal/workflow-tick` (CRON_SECRET).
- **Triggers + events:** event-driven foundation (0176/0184) + `trigger-match`; **egress rules**
  (0/`erp_workflow_egress_rules`) + a **dispatcher** for outbound effects.

8A consumes all of this; it does not modify runtime semantics.

## 4. Approval routing

- **Multi-level** chains compose existing `approval`/`reject` steps in sequence; **conditional**
  branches use `condition` steps (e.g. amount thresholds → different approvers).
- **Authority limits**: `erp_approval_authority_rules` (0227) already models "who can approve what
  up to which limit" — 8A's builder configures it; enforcement wiring of approval-authority is a
  *separate, later governance-phase decision* (kept dormant now, exactly as the Step 2 scope
  decision left it). 8A's builder may **author** rules without activating enforcement.
- **Escalation**: existing `escalation` step + SLA tick.
- **Delegation**: net-new config (see §2) — an approver delegates to another for a window;
  resolved at task-assignment time. Grant-only, audited, time-bounded (mirrors temp-access).

## 5. Dynamic Forms compatibility

- Approval steps that capture data reuse the **custom-fields** layer (`erp_custom_fields`, 0087)
  and — once shipped — the **Form Builder (8F)**. 8A references a form/field-set by id on a
  step's config; it does **not** embed its own form engine. The builder's "data-update" and
  "task" steps bind to existing custom-field definitions, so forms authored in 8F are usable in
  workflows without coupling the two builders.

## 6. Dynamic Field Governance compatibility

- The **field-governance** layer (0114, `/settings/field-governance`) governs per-field
  visibility/editability by role. Workflow steps that render or write fields **must honor** the
  same governance resolution used elsewhere (no workflow-specific bypass): a step cannot expose
  or write a field the acting user's role isn't permitted to see/edit. 8A reuses the existing
  governance check at render/apply time — it introduces no parallel field-access path.

## 7. Mobile support

- Approvers act on tasks from the mobile field/approval surfaces (existing approval-center +
  task list). 8A's builder is an **admin/back-office** screen (desktop-first, like the current
  workflow canvas) — not a field-rep screen. Mobile scope = **acting on** tasks (approve/reject/
  delegate), not authoring. Task cards are read + action only, permission-gated.

## 8. Offline considerations

- Workflow **authoring** is online-only (admin, connected). **Acting** on an approval task
  offline is possible only via the Step 1 offline pattern and is **deliberately out of 8A scope
  initially**: approval is a server-authoritative state transition with routing/authority
  implications, so an offline approve would need the same "Pending Validation → server verdict"
  treatment as offline collections. Recommend: **online-only approvals for 8A**; revisit offline
  approval as a dedicated increment (it reuses the offline-sync engine + a `workflow_action`
  intake handler if approved later).

## 9. Audit requirements

- Every authoring action (create/edit/publish/unpublish template or definition) and every runtime
  transition (step entered, approved, rejected, escalated, delegated) logs via `erp_log_audit`
  (the engine already audits run transitions; the builder adds authoring-side audit). Template
  publish records actor + version. Delegations are audited (grant-style).

## 10. Security implications

- **AuthZ:** builder gated by `workflow.manage`; acting on tasks by the task's required
  permission/authority. No new RLS model — tenant templates are company-scoped RLS; global seeds
  are platform-owned and read-only to tenants.
- **`api_call` step** is the highest-risk primitive (outbound HTTP): it already flows through the
  dispatcher/egress layer; 8A must keep `api_call` authoring behind `workflow.manage` + egress
  allow-listing and **never** let a tenant target internal/cron endpoints (SSRF guard at the
  dispatcher — verify/strengthen as part of 8A).
- **Idempotency:** runtime effect ledger prevents double-execution on retry (reused).

## 11. Multi-tenant impact

- Tenant-authored definitions/templates are company-scoped (RLS); global templates are seeded
  platform-owned and cloned-on-use into the tenant. One tenant's workflows can never read,
  trigger, or dispatch into another's (RLS + the engine's company scoping). The shared runtime
  tick processes each run under the originating user's impersonated, RLS-scoped client (existing
  pattern in `workflow-tick`).

## 12. Integration strategy

- **Triggers** bind to existing domain events (the event foundation 0176/0184) — e.g. "customer
  created", "price change requested", "collection recorded" — so workflows hook the modules
  already emitting events without per-module code.
- **Outbound** actions reuse the dispatcher + egress rules + the Integration Hub (Phase 6) for
  external systems; `notification` steps reuse `erp_notifications`.
- 8A ships **no new integration transport** — it composes existing triggers/effects.

## 13. Flags & phasing

- Flag: `KAKO_WORKFLOW_BUILDER` (default OFF) layered on the existing `workflow` module gate.
- **8A-1**: template catalog (`erp_workflow_templates`) + seed the 8 approval templates + clone-
  on-use (engine reuse; no UX risk). **8A-2**: builder UX (conditional-logic editor, multi-level
  + escalation + delegation config, draft/publish surfacing). **8A-3**: delegation model + audit.
  Each additive, flag-gated, integration-tested.

## 14. Risks

| Risk | Mitigation |
|---|---|
| `api_call` SSRF / internal-endpoint abuse | Egress allow-list + block internal hosts; `workflow.manage` only; review at 8A |
| Builder authoring approval-authority that isn't enforced | 8A authors rules; enforcement stays dormant (Step 2 decision) — document clearly so admins aren't misled |
| Offline approval expectations | Explicitly online-only in 8A; deferred increment |
| Field-governance bypass via workflow steps | Reuse the single governance resolution; no parallel path |
| Scope creep into 8B/8C/8F | 8A = approvals/process builder only; dashboards/reports/forms are their own phases |

## 15. Non-goals

Not a new engine; not the Form Builder (8F); not Dashboard/Report builders (8B/8C); not the
Drag-and-Drop framework (separate roadmap item, prerequisite for 8B); approval-authority and the
other dormant 0227 primitives are **not** activated here.

## 16. Recommendation

Proceed 8A as a **builder + template layer** over the existing engine, in the 8A-1→8A-3 phasing,
flag-gated `KAKO_WORKFLOW_BUILDER` (OFF). Highest reuse (~70%+), low engine risk; the genuine new
risk surface is `api_call` egress (already partly mitigated) and the delegation model. **Await
design-review approval before implementation.**
