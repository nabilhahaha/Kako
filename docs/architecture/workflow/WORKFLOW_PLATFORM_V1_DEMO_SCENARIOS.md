# VANTORA — Workflow Platform V1 Demo Scenarios

Each scenario is built **entirely with the existing platform** — engine, runtime,
9 executors, event bus, and the Phase-1 forms / Phase-2 canvas. Nothing below
needs a new engine, runtime, or executor. Where a scenario needs an event the
catalog does not yet have, it is called out as **“new catalog event”** (a producer
`emit()` + a constant in `event-types.ts`) — *not* an engine change.

Legend — a workflow = a **definition** (entity + `trigger_event` + `trigger_config`)
+ ordered **steps** (each a node/`step_type`). Branches use `next_on_success` (✓)
and `next_on_failure` (✗); approval pauses until decided; published versions are
immutable and pin running instances.

---

## 1. Customer Update Approval

**Goal:** changes to a customer require admin sign-off before they take effect.

- **Entity:** `customer` · **Trigger:** `customer.updated` (existing) ·
  `trigger_config.where`: e.g. `{ "fields_changed": ["credit_terms","name"] }`.
- **Steps:**
  1. `condition` — `any` of sensitive fields changed → ✓ continue, ✗ end (auto-ok).
  2. `approval` — approver_type `company_admin` (SLA 24h, `escalate_to` manager).
  3. `update_record` — table `erp_customers`, `patch:{ approval_status:'approved' }` (✓).
  4. `notification` — channel `in_app`, template `customer_update_approved`.
  - Approval ✗ → `reject` node (terminal; `update_record` reverts/flags).
- **Platform pieces:** condition-eval DSL, approval task + escalation, update_record
  (allow-listed table), notification executor. Built in forms or canvas identically.

---

## 2. Credit Limit Approval

**Goal:** a credit-limit request above a threshold needs tiered approval.

- **Entity:** `credit_limit_request` · **Trigger:** manual (raised from the credit
  screen) or `customer.updated` on the limit field.
- **Steps:**
  1. `condition` — `amount > 50000` → ✓ tiered path, ✗ single-approver path.
  2. `approval` (tier-1) — `role` = finance_supervisor.
  3. `approval` (tier-2) — `company_admin` (parallel `mode` + `required_approvals`
     for a quorum if desired); SLA + escalation.
  4. `update_record` — set the approved `credit_limit` on `erp_customers` (✓).
  5. `notification` — notify the requesting rep.
  - Any ✗ → `reject` (request denied; notify with reason).
- **Platform pieces:** numeric condition, sequential/parallel approval, quorum,
  update_record, notification. (This is the original credit-review flow,
  generalized.)

---

## 3. Trade Spend Approval

**Goal:** a promotional/trade-spend request is approved and (optionally) pushed to
an external finance system.

- **Entity:** `trade_spend` (**new catalog event** `trade_spend.submitted`) ·
  Trigger on submission.
- **Steps:**
  1. `condition` — budget tier by `amount` / `account`.
  2. `approval` — `role` = trade_marketing_manager (SLA, escalation).
  3. `approval` — `company_admin` for amounts over tier.
  4. `api_call` — POST to the finance connector to reserve budget (**egress
     allow-list** must include the connector/domain; deny-by-default otherwise).
  5. `update_record` — mark `trade_spend.status = 'approved'`.
  6. `notification` — confirm to requester + finance.
- **Platform pieces:** condition, multi-tier approval, **api_call with egress
  governance**, update_record, notification. Demonstrates outbound integration
  safely.

---

## 4. Purchase Request

**Goal:** a purchase request routes by amount, then creates a follow-up task for
procurement.

- **Entity:** `purchase_request` (**new catalog events** `purchase.requested`,
  later `purchase.approved`) · Trigger `purchase.requested`.
- **Steps:**
  1. `condition` — `amount < 10000` → ✓ auto-approve path, ✗ approval path.
  2. `approval` — `role` = department_head, then `company_admin` over a tier.
  3. `update_record` — `purchase_request.status='approved'`.
  4. `task` — create a procurement task (assignee_type `role`=procurement,
     `due_in_hours`).
  5. `notification` — notify requester.
  - On approval, a producer emits `purchase.approved`, which can trigger a
    **downstream** PO-creation workflow (composition without sub-engines).
- **Platform pieces:** condition routing, approval, update_record, **task creation**,
  notification, event chaining via the bus.

---

## 5. Leave Request

**Goal:** an HR leave request is approved by the manager with SLA escalation.

- **Entity:** `leave_request` (**new catalog event** `hr.leave_requested`) ·
  Trigger on submission.
- **Steps:**
  1. `condition` — `days > 5` → ✓ two-step approval, ✗ single approval.
  2. `approval` — `user`/`role` = line_manager (SLA 48h).
  3. `escalation` — if SLA breached, `escalate_to` = department_head.
  4. `approval` — HR (`role`=hr) for long leave.
  5. `update_record` — `leave_request.status='approved'`; (HR system sync via
     `api_call` if external).
  6. `notification` — notify employee + manager.
- **Platform pieces:** condition, approval, **escalation node + SLA**, update_record,
  notification. Pure HR process on the same engine.

---

## 6. Near-Expiry Process

**Goal:** when stock nears expiry, route it for markdown/return decisions.

- **Entity:** `inventory_lot` / `stock` · **Trigger:** `stock_transfer.completed`
  (existing) or a **scheduled “event”** `inventory.near_expiry` emitted by a daily
  job (future timer trigger; today a producer emits it during the expiry scan).
- **Steps:**
  1. `condition` — `days_to_expiry <= 30` → ✓ act, ✗ end.
  2. `notification` — alert the branch manager.
  3. `approval` — branch manager chooses markdown vs return (✓ markdown / ✗ return).
  4a. ✓ `update_record` — apply markdown flag/price policy.
  4b. ✗ `task` — create a return task for the warehouse.
  5. `delay` — wait 7 days, then `condition` re-check / `notification` reminder.
- **Platform pieces:** condition, notification, approval **branching to two
  different actions**, update_record, task, **delay (tick-resumed)**. Shows a
  non-approval, operational business process — the canvas’s “business process”
  generality.

---

## How each is built (same recipe, two surfaces)

1. **Define** the workflow: pick `entity`, `trigger_event` (catalog) +
   `trigger_config`, visibility, name.
2. **Author steps**: in the **forms** Step editor or by **dragging nodes** on the
   canvas and connecting ✓/✗ — both write the same `erp_workflow_steps` rows.
3. **Validate**: `validateWorkflow` (executor validators + event-catalog check +
   cycle detection) — zero errors required to publish.
4. **Simulate**: dry-run against a real record (no run, no side effects) and review
   the trace.
5. **Publish**: immutable version snapshot; new events start the latest version;
   running instances stay pinned.
6. **Run**: a domain `emit()` → dispatcher → `erp_workflow_start` → `advanceRun`
   drives the executors; approvals pause for `erp_workflow_decide_runtime`; delays
   resume on the tick; `api_call` honors the egress allow-list; every result is
   audited.

> Scenarios 1–2, 6 use **only existing catalog events**. Scenarios 3–5 add a
> catalog event + producer (a few lines) — never a new engine, runtime, or executor.
