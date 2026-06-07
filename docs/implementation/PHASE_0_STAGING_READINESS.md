# VANTORA — Phase 0 Staging Readiness Report

**Scope:** Phase 0 (event-producer backbone + Search-live consumer), increments 1–2.
**Status:** ✅ **Ready for staging flag-enablement.** All code additive, **flags OFF
by default** (zero behavior change until enabled). No new architecture/modules; no UX
change.

---

## 1. Producers wired (10 of 11 catalog events)

| Domain event | Seam | Status |
|---|---|---|
| `customer.created` | `customers/actions.upsertCustomer` (create) | ✅ |
| `customer.updated` | `customers/actions.upsertCustomer` (update) | ✅ |
| `customer.approved` | `lib/erp/workflow-handlers.applyWorkflowOutcome` | ✅ |
| `order.created` | `sales/orders/actions.createSalesOrder` | ✅ |
| `order.approved` | `workflow-handlers.applyWorkflowOutcome` | ✅ |
| `invoice.issued` | `sales/invoices/actions.issueInvoice` | ✅ |
| `payment.received` | `sales/invoices/actions.recordPayment` | ✅ |
| `return.approved` | `sales/returns/actions.completeReturn` | ✅ |
| `stock_transfer.completed` | `inventory/transfers/actions.completeTransfer` | ✅ |
| `visit.completed` | `rep/actions` + `sales/pos/actions` (field + POS + no-sale) | ✅ |
| `invoice.voided` | **no producer** — no app-level void action exists yet | ⏳ deferred |

All producer calls fire **after the mutation succeeds**, via the single flag-gated
seam `emitDomainEvent(...)` (`KAKO_EVENTS`), best-effort, never throwing.
`invoice.voided` will be wired when an invoice-void action is implemented (today only
draft `cancelInvoice` exists, which is semantically not a void).

## 2. Search-live consumer (operational)
- `src/lib/search/live.ts` `projectOnEvent(entity, recordId)` — on a domain event,
  re-projects that one entity into `erp_search_documents` via `projectOne` (provider
  registry), gated by **`KAKO_SEARCH_LIVE`**. Wired into the same `emitDomainEvent`
  seam. Maps catalog entity → search provider (customer/product/supplier/order/
  invoice/return/visit/workflow); payment/stock_transfer have no search provider →
  skipped. `pg_cron` reindex remains the reconcile backstop.
- Refactored `backfill.ts` to share `buildDoc` + expose `projectOne` (single-row
  upsert; deletes the doc if the source row is gone).

## 3. Test results
- **`tsc --noEmit`:** clean.
- **Unit/integration suite:** **762 passed / 24 skipped, 0 failed** (incl. 4 event-
  backbone tests: default OFF, no-op when off, emits when on, never throws; + 13
  search tests).
- **Production build:** clean.

## 4. Build status
✅ `next build` compiled successfully; no route/bundle regressions.

## 5. Migration status
**None.** Phase 0 adds no migrations — it reuses `erp_events` (`0176`), the dispatcher,
and `erp_search_documents` (`0185`), all already on `main`. Nothing to apply to
staging beyond what is merged.

## 6. Rollback path
- **Instant:** unset the relevant flag — `KAKO_EVENTS` (producers become no-ops),
  `KAKO_SEARCH_LIVE` (projector no-ops), `KAKO_WF_*` (workflow V1.1). No schema to
  revert (no migrations).
- **Code:** additive only; reverting the PR removes producer calls + the live hook
  with no residual effect (flags default OFF anyway).

## 7. Search-live readiness
Ready: producers emit (when `KAKO_EVENTS` on) → `projectOnEvent` (when
`KAKO_SEARCH_LIVE` on) keeps the index fresh; backfill/reconcile via the existing
daily reindex cron. **Enable order in staging:** `KAKO_SEARCH` (read) → backfill →
`KAKO_EVENTS` → `KAKO_SEARCH_LIVE`.

## 8. UX/UI compliance
**No UX change in Phase 0** — all changes are server-side event emission + indexing
behind flags. Navigation hierarchy, screen hierarchy, role journeys, dashboard
structure, List→Detail→Form, mobile-first FMCG flows, approval-center, search
placement, and quick-action standards (PR #138 / #140) are **untouched and
preserved**. No new screens, routes, or components.

## 9. Dependency status
- **Workflow Platform** (events/dispatch/tick) — on `main` ✅.
- **Search OS Phase 1** (index/providers/backfill) — on `main` ✅.
- **Event bus** `erp_events` (`0176`) — on `main` ✅.
- **Foundations (#131–#136)** — approved & frozen; alignment maintained (events are
  the integration seam they each consume). No foundation code required by Phase 0.
- Producers depend only on the existing `recordEvent`/emit (reuse).

---

## Recommended staging rollout (next step)
1. Enable Workflow V1.1 in order **C2 → C3 → C1** (staging), soak.
2. Confirm `KAKO_SEARCH` + run reindex backfill (already shipped).
3. Enable **`KAKO_EVENTS`** → verify events flow (mutation → `erp_events` → dispatch).
4. Enable **`KAKO_SEARCH_LIVE`** → verify single-record freshness; reconcile backstop.
5. Observe (counters/dead-letter); pilot FMCG tenant first; then production (guarded).

*Phase 0 increments 1–2 complete; gates green; additive + flag-gated OFF. Stop for
review / staging enablement.*
