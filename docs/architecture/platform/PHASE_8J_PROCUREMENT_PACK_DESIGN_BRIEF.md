# Phase 8J — Procurement Pack: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_PROCUREMENT_PACK`). **Optional
pack.** Last in the Phase 8 order.

## 1. Intent
Extend the existing purchasing foundation into a fuller procurement workflow — requisitions,
RFQs/quotes, approval-routed POs, goods receipt matching — for distributors who manage upstream
buying from principals/suppliers. Stays within distribution procurement; **not** a general ERP
financial suite (honors the DO-NOT-START boundary).

## 2. Reuse vs net-new
- **Reuse:** Phase 2 purchasing — purchase orders, suppliers, supplier returns, AP (0190/0191);
  the **workflow engine + 8A** for approval routing; `erp_approval_authority_rules` (0227) for
  spend limits (authored by 8A, enforcement per the governance-phase decision); attachments for
  quote/PO documents.
- **Net-new:** purchase requisitions, RFQ/quote capture + comparison, requisition→PO conversion,
  and 3-way match (PO ↔ receipt ↔ invoice) on top of existing PO/AP.

## 3. Data model (additive)
- `erp_purchase_requisitions` (+ lines), `erp_rfqs`/`erp_supplier_quotes` (+ lines),
  `erp_goods_receipts` (+ lines) linking to existing `erp_purchase_orders`. Company-scoped RLS;
  FK-covering indexes. Reuses existing supplier + product + PO/AP tables.

## 4. Forms / Field-Governance / Mobile / Offline
- Requisition/quote entry reuse **forms** (8F) + custom fields. Approvals act via the workflow
  task surface (mobile act-on-tasks). Procurement authoring is back-office (online); **no offline
  scope** (financial/inventory writes — same boundary as offline orders/returns/stock, which are
  deferred).

## 5. Audit / Security / Multi-tenant
Requisition/RFQ/PO/receipt lifecycle audited (reuses existing PO audit + workflow audit). Spend-
limit approval via 8A + authority rules. Company-scoped RLS; suppliers/quotes never cross tenants.

## 6. Integration
3-way match feeds existing AP (0191). Supplier integration via the Integration Hub (Phase 6).
Approval routing via 8A. Procurement spend can feed reports/dashboards (8C/8B). GL posting reuses
the **existing** AP posting — no new financial engine.

## 7. Phasing / Risks / Non-goals
- **8J-1** requisitions + approval routing (via 8A). **8J-2** RFQ/quotes + comparison +
  requisition→PO. **8J-3** goods receipt + 3-way match → AP.
- **Risk:** scope creep into general ERP procurement/MRP → strictly distribution buying; **no MRP**
  (DO-NOT-START). **Risk:** depends on 8A for routing → sequence after 8A (it is, by order).
- **Non-goals:** not MRP/manufacturing; not a general financial suite; no offline; no new GL engine.

**Recommendation:** proceed as the final **optional pack** behind `KAKO_PROCUREMENT_PACK` (OFF),
reusing Phase 2 purchasing + 8A approvals + existing AP. Sequence last, as planned. Await approval.

---

## Phase 8 brief set — complete

With this, all Phase 8 pre-implementation design briefs exist (8A, 8D, 8E, 8F, 8C, Drag-and-Drop,
8B, 8G, 8I, 8H, 8J), each grounded in actual reuse, additive, flag-gated default OFF, with security/
multi-tenant/audit/mobile/offline/integration analysis. **None are implemented** — each awaits
design-review sign-off, after which implementation proceeds engine-first under the standard
discipline (additive migrations, flags OFF, integration tests before merge).
