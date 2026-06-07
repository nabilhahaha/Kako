# VANTORA — Phase 2 (Purchasing) Kickoff Plan

**Date:** 2026-06-07 · **Status:** in progress · **Discipline:** data integrity first ·
additive-only migrations · flags OFF by default (`KAKO_PURCHASING`) · no gate bypasses ·
no UX regressions · reuse-over-rebuild.

## What already exists (survey)
Suppliers (`erp_suppliers`), purchase orders + lines (`erp_purchase_orders` /
`_lines`), goods receipts + lines (`erp_goods_receipts` / `_lines`, trigger →
`erp_stock_movements` → on-hand + legacy GL journal), supplier payments
(`erp_supplier_payments`), purchase returns (`erp_purchase_returns`, schema/RPC only).
The Phase-1 `goods.received` posting rule (0189) is seeded but inert.

## Primary gaps (Phase 2 scope)
1. **Supplier invoice / bill** model — *absent*.
2. **3-way match** (PO ↔ GRN ↔ Invoice) — *absent*.
3. **AP sub-ledger / aging** — only a `supplier.balance` summary today.
4. **Payment terms** on supplier / due-date logic — *absent*.
5. **PO approval workflow** — *absent* (reuse the Workflow OS, don't rebuild).
6. **Purchase-returns UI/actions** — schema exists, no app layer.

## Increment plan (dependency order)
1. **3-way-match engine (pure)** ← *this increment*. No DB. The control core that the
   bill/AP layer consumes. `KAKO_PURCHASING` flag (OFF).
2. **Supplier invoice (bill) data model** — `erp_supplier_invoices` /
   `_invoice_lines` (link to PO line + GR line), match-status + status lifecycle,
   payment-terms/due-date on supplier + bill. Additive, RLS, inert.
3. **Matching service** — load PO/GRN/invoice lines → run the engine → persist
   match status + hold/approve. Unit-tested over a gateway (DB-free), thin Supabase impl.
4. **AP sub-ledger / aging** — per-supplier transaction log + aging buckets (additive view/table).
5. **GL wiring (Augment)** — supplier-invoice posting (Dr GR-IR / Cr AP) reconciled with
   the Phase-1 receipt leg, distinct reference types; flag-gated.
6. **PO approval** via Workflow OS (reuse) + **purchase-returns app layer**.
7. **End-to-end integration tests** + Phase 2 readiness report.

## Boundary / safety
- Finance core untouched; any GL posting reuses the Phase-1 engine under distinct
  reference types (zero double-post), all flag-gated OFF.
- Additive migrations only; no change to existing PO/GR/payment behaviour.

## Augment reconciliation note (logged for the GL increment)
The **legacy goods-receipt trigger already posts a GL journal** (Inventory Dr / AP Cr).
The Phase-1 `goods.received` rule posts Inventory Dr / GR-IR Cr. When the engine path is
activated these must not **double-post inventory** — the supplier-invoice leg will close
GR-IR → AP, and the legacy trigger posting will be retired in the same reviewed cutover.
Until then both Phase-1 and Phase-2 GL remain flag-OFF. (Decision register; revisit at
increment 5.)
