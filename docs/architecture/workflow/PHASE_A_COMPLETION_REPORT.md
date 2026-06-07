# VANTORA — Phase A Completion Report

Phase A (engine prerequisites before the Workflow Builder UI) is **complete**.
One engine, one runtime, zero duplicate logic. No UI written.

## Scope delivered

### 1. `resumeRun` wiring (approval → runtime resume)
- New SECURITY DEFINER RPC **`erp_workflow_decide_runtime`** (`0179`): authorizes +
  marks an approval task for a **runtime-owned** run (`runtime_state` set) **without**
  engine advancement — the TS runtime owns advancement. Hard guard: raises if the
  instance is **not** runtime-owned, so legacy approval workflows can never be routed
  here by mistake.
- `approvals/actions.ts:decideTask` now branches: **runtime-owned** task →
  `erp_workflow_decide_runtime` + **`resumeRun(instanceId)`** (the runtime's approval
  executor sees the decided task via `approvalDecision` and advances —
  approved→success branch, rejected→failure branch). **Legacy** task → `erp_workflow_decide`
  exactly as before (unchanged).
- Result: a generalized run paused at an approval step resumes automatically on decision,
  with no change to the existing approval engine or legacy flows.

### 2. Tick impersonation (per-actor, tenant-isolated)
- `/api/internal/workflow-tick` now advances each due run **as its originating user**
  (`started_by`) via `createImpersonatedClient(..., purpose: 'workflow-runtime')` —
  short-lived JWT, RLS applies, audited to `sync_impersonation_log`. **No blanket
  service-role execution** of run side effects.
- **Tenant isolation preserved:** the impersonated client is company/branch scoped by RLS;
  a run can only touch data its originating user is authorized for.
- **Fail-safe:** runs with no `started_by` are **skipped** (`no-actor`) for an operator to
  handle, rather than run with elevated privilege.
- The engine's `erp_workflow_tick` (approval SLA + escalation) is still invoked first (reuse).

### 3. `api_call` egress allow-list (approved connectors + domains only)
- New table **`erp_workflow_egress_rules`** (`0179`): per-company `domain` (exact or `.suffix`)
  + optional `connector_key`, `is_active`. RLS company-scoped; company auto-fill + updated_at
  triggers; FK-covered.
- The adapter's `httpCall` enforces it **before any fetch**: pure `isEgressAllowed(host,
  connector, rules)` checks **approved domain AND approved connector** (rule `connector_key`
  NULL = any; else must match the step's `connector`). A denied call returns **403**
  (→ `api_call` executor: **failed, non-retryable**) and **never fires**, and emits a
  **`workflow.egress.denied`** audit event.
- **Approved connectors only:** a step's `api_call.connector` must satisfy a rule's
  `connector_key`; domains with no rule are denied by default (deny-by-default).

## Requirements check
| Requirement | Status |
|---|---|
| Approved connectors only | ✓ `connector_key` gate in `isEgressAllowed` (deny-by-default) |
| Approved domains only | ✓ exact/suffix domain match; unknown host → 403, no fetch |
| Full audit | ✓ `decide_runtime` → `erp_log_audit`; impersonation → `sync_impersonation_log`; egress denial → `workflow.egress.denied`; step results → `workflow.step.*` |
| Tenant isolation preserved | ✓ impersonation under RLS; egress rules company-scoped; runtime company/branch-scoped throughout |

## Validation evidence (isolated branch, then torn down)
- `0178` + `0179` applied cleanly on a prod-clone branch.
- `erp_workflow_decide_runtime` present; `erp_workflow_egress_rules` present; a rule inserted;
  **FK-coverage invariant: zero uncovered FKs** (schema-health passes).
- Unit tests: `egress.test.ts` (6) added; workflow suite **50 passing**; full suite green;
  `tsc` clean.

## Migration impact
- **`0179_workflow_phase_a.sql`** — additive: `erp_workflow_decide_runtime` (new RPC, does
  **not** modify `erp_workflow_decide`) + `erp_workflow_egress_rules` (new table, RLS,
  triggers, FK-covered). No existing engine RPC/table/constraint modified.
- The Builder-phase publishing/versioning migration is renumbered to **`0180`** (future).

## Risks & technical debt
- **Egress default-deny** means `api_call` does nothing until a company adds rules — intended,
  but operators must be told (Builder/admin UI for egress rules is a later task).
- Impersonation reuses the reconcile primitive (now `purpose`-tagged); a dedicated workflow
  token issuer could be split out later.
- Two condition evaluators (runtime TS + engine SQL) still pending convergence (unchanged).
- `decideTask` does an extra read (task→instance) to route; negligible.

## What this unblocks
With Phase A done, builder-made workflows that **mix approval + automated steps** can be
published and run safely: approvals resume the runtime, the tick runs under the right user,
and `api_call` is egress-locked.

## Status
**Phase A complete — stopped for review.** The Workflow Builder UI starts **only after Phase A
approval**. Reference: `WORKFLOW_ENGINE_STATUS.md` (Phase A → done), `WORKFLOW_BUILDER_ARCHITECTURE.md`
(approved; UI gated on this report's approval).
