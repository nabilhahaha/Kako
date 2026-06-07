# VANTORA — Event Dependency Map

How domain events flow from producers, through the bus, to consumers and workflows
(Constitution Art. 43 → Art. 32). Companion to `EVENT_CATALOG.md`.

## Dependency direction (must not be violated)

```
 business actions ─emit─▶ erp_events (bus) ─consume─▶ dispatcher ─start─▶ engine/runtime ─emit─▶ erp_events
        (producers)                            (Phase 2)        (one engine)     (workflow.* events)
```

- Producers depend on `emit.ts` only (never on the dispatcher/runtime).
- The dispatcher depends on the bus + workflow definitions (never on producers).
- The runtime depends on the engine tables + executors (never on producers).
- Everything is company-scoped (RLS); no cross-tenant dependency.

## Producer → Event → Consumer matrix

| Event | Producer (file) | Primary consumer | Downstream / future consumers |
|---|---|---|---|
| `customer.created` | `customers/actions.ts:upsertCustomer` | dispatcher → workflows w/ `trigger_event=customer.created` | onboarding workflow, CRM health, AI |
| `customer.updated` | `upsertCustomer` (staged+direct) | dispatcher | change-review workflow, audit |
| `customer.approved` | `decideCustomer` | dispatcher | post-approval automations, AI |
| `order.created` | `sales/orders/actions.ts:createSalesOrder` | dispatcher | fulfillment/credit workflows |
| `order.approved` | *(reserved — no producer; no approval state)* | — | — |
| `invoice.issued` | `sales/invoices/actions.ts:issueInvoice` | dispatcher | AR follow-up, ETA submit, analytics |
| `invoice.voided` | `voidInvoice` | dispatcher | reversal/audit workflows |
| `payment.received` | `recordPayment` | dispatcher | collection close, dunning stop |
| `return.approved` | `sales/returns/actions.ts:completeReturn` | dispatcher | refund/restock workflows |
| `visit.completed` | `field/actions.ts:checkInVisit` (unblocked) | dispatcher | coverage/compliance, coaching |
| `stock_transfer.completed` | `inventory/transfers/actions.ts:completeTransfer` | dispatcher | replenishment, van reconciliation |
| `workflow.step.<status>` | runtime audit (`runtime-deps.ts`) | analytics/console | AI, SLA dashboards |
| `workflow.notification.sent` / `workflow.escalated` | runtime executors | Notification OS (future) | audit |

## Module dependency graph

```
 customers ─┐
 orders     ├─▶ emit.ts ──▶ events.ts(emitEvent) ──▶ erp_events
 invoices   │        └────▶ dispatcher.ts ──▶ repository.ts ──▶ erp_workflow_definitions
 returns    │                     │                              (trigger_event match)
 field      │                     └─ trigger-match.ts (pure)
 inventory ─┘                     └─ erp_workflow_start (engine) ──▶ erp_workflow_instances
                                                                         │
                                              runtime-service ──▶ runtime.ts ──▶ executors/* ──▶ effects + workflow.* events
```

## Completed items
- 10 producers wired (best-effort, post-success); `order.approved` reserved.
- Inline dispatch (Phase 2) consuming events in-request.
- `workflow.*` runtime audit events emitted to the bus.

## Remaining items
- Background bus consumer (cursor by `seq`) for `source ∈ {integration,sync,system}` events that have no request context (would impersonate `actor_id`).
- Event projections / read models for Analytics OS.
- Reconcile-worker emission (offline-created records emit on materialization) — currently only the online path emits.

## Risks
- **Producer drift:** a new business mutation that forgets to emit → silent gap. Mitigation: a producer checklist (this map) + future lint/test asserting catalog coverage.
- **Inline-dispatch latency:** event-triggered workflows add a query (+ start) to the producing request; negligible until workflows are configured, but real at scale — the background consumer is the decoupling path.
- **Ordering:** events are per-`seq` per company; cross-entity causal ordering is not guaranteed.

## Technical debt
- Two emission paths long-term (inline now; background consumer later) — converge once the consumer exists.
- `payment.received` uses `entity='payment'` with `record_id = idempotency_key ?? invoice_id` (no first-class payment id from the RPC).

## Future Workflow Builder dependencies
- The Builder must surface the **event catalog** (this map) as the trigger picker (event_type + `trigger_config` filter editor).
- It must show **producer coverage** (which events actually fire) so users don't build triggers for non-emitted events.
- It writes `erp_workflow_definitions.trigger_event` / `trigger_config`; the dispatcher already consumes these.

---
*Status, completed/remaining components, known risks, technical debt, Builder prerequisites, and the future roadmap are tracked centrally in `WORKFLOW_ENGINE_STATUS.md`.*
