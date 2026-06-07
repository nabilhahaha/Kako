# VANTORA — Workflow Platform V1 Reuse Strategy

**Thesis:** one entity-neutral engine powers **every** module's approvals and
business processes. A new module gets workflow capability by **adding data, not
code paths** — specifically: (1) emit domain events, (2) author workflow
definitions in the existing builder/canvas, and (optionally) (3) allow-list
external endpoints. **No new engine, runtime, executor, builder, or canvas.**

> The boundary that makes this safe: *execution* stays owned by the Event Bus,
> Workflow Engine, Runtime, and Executors. Modules only **produce events** and
> **consume effects** (via the existing `update_record` / `task` / `notification`
> / `api_call` executors). They never embed workflow logic.

---

## 1. The reuse contract (what any module must provide)

| Step | Module responsibility | Platform provides |
|---|---|---|
| **A. Emit events** | call `emit()` after a domain mutation commits (offline-reconciliation-aware) | the bus (`erp_events`), dispatcher, trigger matching |
| **B. Author workflows** | business users build definitions/steps in forms or canvas | engine tables, runtime, 9 executors, validation, simulation, versioning, templates |
| **C. Effects** | declare `update_record` (table allow-list) / `task` / `notification` / `api_call` (egress allow-list) | executors + governance (RLS, allow-lists, audit) |

That is the entire integration surface. Everything else is configuration.

---

## 2. The three reusable extension points (data, not engines)

1. **Event catalog** (`event-types.ts` + producer `emit()` calls): add a constant
   like `purchase.requested` and emit it. It instantly appears in the builder
   trigger picker.
2. **`update_record` table allow-list**: add the module's table so workflows can
   transition its records safely (RLS still enforced).
3. **`api_call` egress allow-list** (`erp_workflow_egress_rules`): approve the
   module's external domains/connectors (deny-by-default preserved).

No schema change to the engine; these are additive registrations.

---

## 3. Module-by-module reuse (no new engines)

### CRM
- **Events:** `customer.created/updated/approved`, `visit.completed` (exist).
- **Processes:** lead qualification, customer onboarding approval, visit
  follow-up tasks, churn-risk escalation.
- **Effects:** `update_record` on `erp_customers`; `task` for reps; `notification`.
- **New code:** none (events exist) — pure configuration.

### Finance
- **Events:** `invoice.issued/voided`, `payment.received` (exist); add
  `credit.requested`, `trade_spend.submitted` as needed.
- **Processes:** credit-limit approval, trade-spend approval, invoice-void
  authorization, payment exception routing.
- **Effects:** `update_record` (status transitions), `api_call` to finance
  connectors (egress-governed).
- **New code:** a couple of producer `emit()`s + allow-list entries.

### Inventory
- **Events:** `stock_transfer.completed` (exists); add `inventory.near_expiry`,
  `inventory.count_review`.
- **Processes:** near-expiry markdown/return, transfer approval, count-discrepancy
  review (the existing inventory-count review already maps cleanly).
- **Effects:** `update_record`, `task`, `delay`-based reminders.

### Procurement
- **Events (new):** `purchase.requested`, `purchase.approved`, `po.created`.
- **Processes:** purchase-request approval by amount tier, PO creation, supplier
  onboarding, three-way-match exceptions (chained via events).
- **Effects:** approval + `task` (procurement) + `api_call` (supplier portal).

### HR
- **Events (new):** `hr.leave_requested`, `hr.expense_submitted`,
  `hr.onboarding_started`.
- **Processes:** leave approval with SLA/escalation, expense approval, onboarding
  checklists.
- **Effects:** approval + escalation + `update_record` + `api_call` (HRIS).

### Governance
- **Events:** reuse any module's events; add `policy.published`, `audit.flagged`.
- **Processes:** policy sign-off, segregation-of-duties gates, audit routing,
  periodic attestation (via scheduled “events”).
- **Effects:** approval (multi-tier/quorum) + `notification` + `task`; immutable
  **versioning** already provides the audit trail of *what rule ran when*.

### Service
- **Events (new):** `ticket.created`, `ticket.escalated`, `sla.breached`.
- **Processes:** ticket routing, tiered support escalation, SLA-breach handling.
- **Effects:** `task` assignment + `escalation` + `notification` + `api_call`.

---

## 4. Why this needs no new engines (the invariants that hold)

- **Entity-neutrality:** `definition.entity` + the event catalog are just keys; the
  runtime treats every workflow identically.
- **Closed executor set covers the verbs:** approve, branch on condition, notify,
  create task, update a record, call an API, wait, escalate, reject — these are the
  primitives every business process composes from.
- **Composition over extension:** multi-stage cross-module processes are built by
  **chaining events** (one workflow's `update_record`/producer emits the next
  module's trigger event), not by embedding sub-engines.
- **Governance is centralized:** RLS, `update_record`/egress allow-lists, audit,
  and immutable versioning apply uniformly — a new module inherits them for free.
- **Two builder surfaces, one model:** forms and canvas both edit
  `erp_workflow_steps`; adding a module changes no builder code.

---

## 5. Guardrails (to keep “one engine” true as modules adopt it)

1. **No module-local workflow tables or runners.** If a module “needs its own
   engine,” that is a signal to add an event/executor-config, not a fork.
2. **New verbs are rare and central.** If a genuinely new action is required, add
   **one executor** to the shared registry (with `validate` + audited `execute`) —
   never a parallel runtime.
3. **External calls only via `api_call` + egress allow-list.** No bespoke outbound
   HTTP in module code paths.
4. **Record mutations from workflows only via `update_record` (allow-listed).**
5. **Events are after-commit and reconciliation-aware** so offline-first modules
   fire workflows exactly once.

---

## 6. Adoption checklist for a new module

1. List the module's domain events → add constants + producer `emit()`s.
2. Allow-list any tables (`update_record`) and external endpoints (`api_call`).
3. Author starter workflows as **Global/Company templates** in the builder.
4. Validate + simulate against real records; publish (immutable version).
5. Done — runs execute on the shared engine with full audit + versioning.

> Net effect: VANTORA gains CRM/Finance/Inventory/Procurement/HR/Governance/Service
> workflow automation **without a single new engine, runtime, executor set, or
> builder** — only events, allow-list entries, and authored definitions.
