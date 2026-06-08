# Business-Process Foundation — Demo Runbook

Demonstrates the three approved demo workflows on the **Workflow Builder (8A)** foundation, running
over the **existing workflow engine** (approval routing · conditions · notifications ·
record-update · SLA/escalation · approval inbox). All flag-gated, multi-tenant, audited.

## Scope as built (this session)

| Capability | Status |
|---|---|
| 8A — Workflow template catalog (`erp_workflow_templates`) + 3 seeded demo templates | ✅ #253 |
| 8A — Instantiate template → engine definition/steps + templates UI (`/settings/workflows/templates`) | ✅ #254 |
| 8A — Demo-template step configs corrected + engine-aligned template validation | ✅ #255 |
| Engine primitives the demos use — approval / **condition (8D primitive)** / **notification (8E primitive)** / update_record / escalation / approval inbox | ✅ pre-existing engine |
| 8E (notification prefs/channels/delivery-log), 8D (rule-builder UX), 8F (Form Builder) — *fuller builders* | ⏳ next increments |

The three demo flows are **runnable now**: the condition + notification steps they use are existing
engine executors; 8E/8D/8F add richer authoring/depth on top but are not required to run the demos.

## Enable

Set per-environment (default OFF): `KAKO_WORKFLOW_BUILDER=1` (builder + templates),
`KAKO_NOTIFICATION_CENTER` optional. The acting user needs `workflow.manage` to author and the
relevant approver roles (`supervisor`/`manager`/`accountant`) to act.

## Provision (once per tenant)

1. Go to **Settings → Workflow Templates** (`/settings/workflows/templates`).
2. For each of the three templates, click **Use template** → it clones into a **draft** definition
   under **Settings → Approval Workflows** (`/settings/workflows`), owned by your company, audited
   (`workflow.template.instantiate`).
3. Review and **Publish** each draft (the engine snapshots a version; published defs are immutable).

## The three demo workflows

### 1) Customer Data Update Request  (`customer_data_update`, entity `customer_change_request`)
- **Step 1 — Approval:** Supervisor review (SLA 24h, escalate → manager).
- **Step 2 — Update record:** on approval, apply the change to the allow-listed
  `erp_customer_change_requests` (status → approved).
- **Step 3 — Notification:** notify the requester (`customer_update_approved`, in-app).
- **Demo path:** a field/back-office user raises a customer data-update request → supervisor sees it
  in the **approval inbox** → approves → record updated → requester notified. Out-of-SLA →
  escalation to manager.

### 2) Old / Near-Expiry Approval  (`old_expiry_approval`, entity `inventory_expiry`)
- **Step 1 — Condition:** `days_to_expiry ≤ 30` (engine `condition` executor).
- **Step 2 — Approval:** Warehouse manager (SLA 48h, escalate → admin).
- **Step 3 — Notification:** notify stock controller (`expiry_approved`, in-app).
- **Demo path:** a near-expiry stock item triggers the workflow → condition gates items within the
  threshold → manager approves the disposition → controller notified.

### 3) Trade Spend Approval  (`trade_spend_approval`, entity `trade_promotion`)
- **Step 1 — Approval:** Sales manager (SLA 24h).
- **Step 2 — Condition:** `amount > 10,000` → routes to finance (over-cap branch).
- **Step 3 — Approval:** Finance (accountant) approval, only when over cap (SLA 48h).
- **Step 4 — Notification:** notify requester of the decision (`trade_spend_decided`).
- **Demo path:** a trade-spend promotion is submitted → sales manager approves → **if over the cap**
  the over-cap condition routes to finance for a second approval; otherwise it completes → requester
  notified. Demonstrates **multi-level + conditional** routing.

## What each demo proves

- **Multi-level + conditional approval routing** (Trade Spend over-cap branch).
- **SLA + escalation** (all three, via the existing `erp_workflow_tick`).
- **Record update on approval** (Customer Data Update).
- **Notifications** on completion (all three; in-app via `erp_notifications`).
- **Audit trail** end-to-end (instantiation + each run transition).
- **Multi-tenant isolation** (definitions/instances/tasks are company-scoped RLS; templates are
  global-read + tenant-owned).

## Requirements coverage

- **Dynamic Field Governance compatible:** record-update + any field rendering go through the
  existing governance resolution (no parallel field path).
- **Multi-tenant safe:** RLS throughout; templates global-read + tenant-owned.
- **Full audit trail:** instantiation + run transitions audited.
- **Mobile-first:** approvers act from the mobile approval surfaces (act-on-tasks).
- **Offline-aware where applicable:** authoring/approval are online (server-authoritative); offline
  approval is a deliberate later increment (reuses the Step 1 pattern).
- **ERP-integration-ready:** triggers bind to the existing event bus; notifications/outbound via
  the dispatcher + Integration Hub.
- **Feature-flagged:** `KAKO_WORKFLOW_BUILDER` (default OFF).

## Remaining (approved, next increments)

8E notification preferences/channels/templates/delivery-log · 8D rule-builder authoring UX (the
condition primitive is already engine-native) · 8F Form Builder for richer request data capture
(reusing custom fields + survey engine + governance + Step 1 offline). These deepen the foundation;
the three demos above run on what is merged today.
