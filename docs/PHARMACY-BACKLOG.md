# Pharmacy Demo — Tracked Backlog

Status: deferred (tracked, not built in the current Shift/Cashbox + Critical Action slice).

These items were explicitly split out so the reusable **Shift / Cashbox foundation**
and the **Critical Action standard** could land first. The City Care Pharmacy (DEMO)
tenant on `vantora-staging` runs today on the shift/cashbox flow; the items below are
the deeper pharmacy-native data model that the demo currently approximates with the
generic catalog + reports.

| # | Item | What it adds | Depends on | Notes |
|---|------|--------------|-----------|-------|
| B1 | **Batch model** | Per-batch stock rows (batch no, qty, cost, received date) under each product | — | Foundation for B2–B5. New `erp_product_batches` table, tenant-scoped RLS. |
| B2 | **Expiry model** | Expiry date attached to each batch; FEFO picking on sale | B1 | Drives the expiry-risk buckets natively instead of the current product-level approximation. |
| B3 | **Lot tracking** | Lot/serial trace from receipt → sale (recall + supplier trace) | B1 | Regulated-goods requirement; links movements to a lot id. |
| B4 | **Dead-stock engine** | Server-side classifier: no-sale / slow-moving / dead-stock windows | — (uses sales history) | Replaces the ad-hoc demo report query with a reusable, parameterised engine. |
| B5 | **Expiry-risk engine** | Server-side expired / ≤30 / ≤60 / ≤90-day buckets + write-off proposal | B1, B2 | The **Expiry write-off** Critical Action flow plugs in here (see below). |

## Critical Action flows still pending these backlog items

The Critical Action standard (`useCriticalAction` / `CriticalActionButton`) is live and
already wired into:

- **Shift close** (irreversible, print receipt) — `/cashbox`
- **Cash handover** (the close action carries the counted cash forward to the next shift)
- **Expense posting** (reason required) — `/cashbox`
- **Price change** (reason required, audited) — `/sales/pricing`

Pending a data model:

- **Expiry write-off** — blocked on **B1 + B2 + B5**. Once batches carry expiry, the
  write-off becomes a Critical Action over a batch (irreversible + reason + audit +
  stock movement), reusing the exact same `CriticalActionButton` pattern.

## FMCG extension (after review checkpoint)

The same standard is ready to extend (post-review) to: invoice finalization,
collection posting, return approval, van reconciliation, stock transfer, customer
approval. No new infrastructure required — each is a `CriticalActionButton` whose
`execute` calls the existing server action and whose audit is written server-side.
