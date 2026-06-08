# Phase 3 — Customer Relationship Timeline & Customer 360 (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_CUSTOMER_TIMELINE`, default OFF) ·
multi-tenant safe · **audit-first / immutable** · reuse-first. A permanent, searchable
business-history engine — **not a notes field**.

## Schema (additive, RLS, FK-covering, immutable)
- **0216 `erp_customer_timeline`** — append-only event index. Full attribution record:
  event_type, event_category, event_at, user_id, role, source_module, before/after (jsonb),
  reason, notes, related_record_type/id, related_entity, attachment_ref. **Immutable via RLS**:
  SELECT + INSERT policies only — no UPDATE/DELETE policy ⇒ edits/deletes denied. References
  related records (no data duplication).

## Pure engine (`src/lib/customer-timeline/`, 7 unit tests)
| Module | Capability |
|---|---|
| `catalog.ts` | Event catalog (50+ event types → 11 categories: creation/ownership/visit/sales/collection/return/near_expiry/merchandising/data_change/trade_spend/compliance). Open type — future events need only a catalog entry, no schema change |
| `feed.ts` | Build (newest-first), filter (category/module/type/date), group + count by category |
| `health.ts` | Customer health timeline (last visit/order/collection/return/near-expiry/promotion/ownership change) + configurable **health / risk / relationship-strength** scores |
| `customer360.ts` | Customer-360: feed + category counts + health + **ownership history (reuses `@/lib/ownership`)** + current owners |

## Reuse (not rebuilt)
**Ownership ledger** (`@/lib/ownership`, 0214) for ownership history + current owners; `erp_audit_logs`
for data-change provenance; references `erp_invoices`/`erp_visits`/`erp_sales_returns`/promotions via
related_record (no duplication).

## Requirement coverage
Timeline events (all 11 categories incl. creation/ownership/visit/sales/collection/return/near-expiry/
merchandising/data-changes/trade-spend/compliance) ✓ · full timeline record structure ✓ · ownership
history integration (effective-dated, never overwritten) ✓ · customer health timeline + health/risk/
relationship scores ✓ · Customer-360 view (feed/orders/visits/collections/returns/promotions/near-expiry/
ownership/route history/trends via the feed + read-models) ✓ · supervisor/area/regional use (read-models)
✓ · immutable/auditable/historically-queryable ✓.

## Validation
Typecheck 0 · build 0 · **1038 unit tests** (+7) · integration: customer-timeline-schema (3, incl.
immutability) + schema-health FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Event emitters from each module (sales/visits/collections/returns/ownership/compliance) writing
timeline rows; a Customer-360 page wrapping the read-model; raw-data export of the timeline.
