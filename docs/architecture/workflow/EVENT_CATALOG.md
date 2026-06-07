# VANTORA — Event Catalog & Dispatcher (P0-01 Phase 2)

Event Bus producers + the Event → Workflow dispatcher. Implements Constitution
Art. 43 (Event Constitution) feeding Art. 32 (Workflow OS), reusing the single
engine (ADR-007). Best-effort + additive: **no business logic changed**, no UI,
no Workflow Builder.

## Event Catalog

All events are appended to **`erp_events`** (tenant-isolated via RLS, `actor_id` =
acting user, `source='app'`). `entity` is the neutral key the Workflow OS matches.
Producers call `recordEvent(...)` after the action's success point; failures are
swallowed (never break the business op).

| Event type | entity | Emitted from | record_id | payload |
|---|---|---|---|---|
| `customer.created` | customer | `customers/actions.ts` → `upsertCustomer` (create) | new customer id | code, name, requires_approval |
| `customer.updated` | customer | `upsertCustomer` (staged + direct update) | customer id | staged? |
| `customer.approved` | customer | `decideCustomer` (workflow-final approve + legacy approve) | customer id | — |
| `order.created` | order | `sales/orders/actions.ts` → `createSalesOrder` | order id | customer_id, net_amount |
| `order.approved` | order | **none — not wired** (sales orders have no approval state: draft/confirmed/invoiced/cancelled). Reserved in the catalog. | — | — |
| `invoice.issued` | invoice | `sales/invoices/actions.ts` → `issueInvoice` | invoice id | — |
| `invoice.voided` | invoice | `voidInvoice` | invoice id | reason |
| `payment.received` | payment | `recordPayment` | idempotency_key ?? invoice_id | invoice_id, amount, payment_method |
| `return.approved` | return | `sales/returns/actions.ts` → `completeReturn` | return id | refund_method |
| `visit.completed` | visit | `field/actions.ts` → `checkInVisit` (only when **not** blocked) | visit_id | customer_id, work_session_id |
| `stock_transfer.completed` | stock_transfer | `inventory/transfers/actions.ts` → `completeTransfer` | transfer id | — |

Catalog constants: `src/lib/workflow/event-types.ts` (`EVENT.*`, `EVENT_ENTITY`).

## Dispatcher Architecture

```
 server action (success)
   └─ recordEvent({...})            src/lib/workflow/emit.ts   (best-effort, never throws)
        ├─ emitEvent → erp_events   (bus + audit + tenant isolation)        [events.ts]
        └─ dispatchEvent(event)                                              [dispatcher.ts]
             ├─ candidates()  → active definitions where trigger_event = event.type   [repository.ts]
             ├─ selectTriggeredDefinitions()  pure match on trigger_config             [trigger-match.ts]
             ├─ start(def)    → erp_workflow_start(key, entity, record_id, ctx)   (EXISTING engine RPC)
             └─ link(instance)→ set erp_workflow_instances.trigger_event_id/branch_id  (0176 columns)
                                   │
                                   ▼
                        workflow run (instance + first task)
                        SLA timers + escalation handled by the existing
                        engine (steps.sla_hours / erp_workflow_tick).
```

- **Inline dispatch (Phase 2):** events are dispatched in the **same authenticated
  request** as emission, so `erp_workflow_start` has the user's company/branch
  context. Every event is still persisted to `erp_events` for audit + future
  consumers (projections, integrations, AI).
- **Idempotency / one-active-per-record:** enforced by the engine's
  `uq_wf_instance_active` index — a duplicate start surfaces as `skipped`, never an
  exception.
- **No-op until configured:** the seed workflow is `trigger='manual'`
  (`trigger_event = NULL`), so dispatch is a single indexed lookup returning nothing
  until a company defines an event-triggered workflow (via the future Builder).
- **Future (documented, not built):** a background cron consumer of the `erp_events`
  feed (cursor by `seq`) for `source` in `integration|sync|system` events that have
  no request context — it would impersonate `actor_id` (reusing
  `src/lib/sync/server/impersonate.ts`) to call the engine with company context.

## Services added

| File | Purpose |
|---|---|
| `src/lib/workflow/event-types.ts` | Canonical event catalog constants + entity map |
| `src/lib/workflow/events.ts` | `emitEvent` (dedupe-safe) + `readEventFeed` (Phase 1) |
| `src/lib/workflow/trigger-match.ts` | Pure `matchesTrigger` / `selectTriggeredDefinitions` (Phase 1) |
| `src/lib/workflow/repository.ts` | `listDefinitionsForEvent`, `planWorkflowsForEvent`, RPC reuse wrappers (Phase 1) |
| `src/lib/workflow/dispatcher.ts` | `dispatchEvent` engine + `makeDispatchDeps` (Supabase-backed) |
| `src/lib/workflow/emit.ts` | `recordEvent` — the producer helper (emit + inline dispatch, best-effort) |

## Tests
- `trigger-match.test.ts` — 9 cases (event/entity/branch/where matching, global-vs-company precedence).
- `dispatcher.test.ts` — 6 cases (start+link, entity-less no-op, already-active skip, no-match, filtered, multi-start).
- Full suite green (838 passing) after wiring all producers (additive; no existing test changed).

## Migration impact
**None.** Phase 2 reuses the `0176` schema (`erp_events` + the additive workflow
columns). No new tables, columns, or migrations.

## Constraints honored
Use `erp_events` only ✓ · no business logic changes (best-effort, post-success,
swallows errors) ✓ · no UI ✓ · no Workflow Builder ✓ · full audit (every event on
the bus with actor + payload) ✓ · full tenant isolation (RLS + company-scoped emit) ✓.
