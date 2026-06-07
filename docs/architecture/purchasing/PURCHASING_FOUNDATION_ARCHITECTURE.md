# VANTORA — Purchasing Foundation Architecture (Proposal)

**Status:** Architecture only — **no code, no migrations, no implementation, no
branches.** Architecture review first.
**Goal:** a generic, industry-neutral **procure-to-pay (P2P)** foundation —
Purchase Request → RFQ → PO → Goods Receipt → supplier invoice → payment, plus
returns, supplier pricing and landed cost — reused across all verticals.
**Discipline:** *reuse over rebuild; formalize what exists first; additive;
flag-gated; multi-tenant + permission model preserved; one engine, zero duplicate
logic.*

> **Not greenfield.** Existing on `main`: `erp_purchase_orders`/`_lines` (status,
> `approved_by`, line `received_qty`), `erp_goods_receipts`/`_lines` (PO-linked,
> warehouse, **batch_number/expiry_date** on receipt lines),
> `erp_purchase_returns`/`_lines`, `erp_supplier_payments`, `erp_receipt_vouchers`,
> `erp_suppliers`, `erp_price_lists` (**sell-side**), and `purchasing.manage/export/
> return`. The P2P **spine (PO → GRN → return → pay)** already works; the gaps are
> the front (PR, RFQ) and the costing front (supplier price lists, landed cost).

The **document spine** mirrors the ledger pattern: each P2P document carries a
status lifecycle and links downstream via `reference_type/reference_id`, so receipts
and journals drill back to the PO/PR.

---

## A. Capability-by-capability (formalize vs gap)

### 1. Purchase Requests — **GAP (design)**
No PR table today. Add `purchase_requests`/`_lines` (requester, cost center, need-by
date, justification, status draft→submitted→approved→converted). PR is the demand
origin; **approval via Workflow** by amount/department; an approved PR converts to
an RFQ or directly to a PO. Optional reorder-driven auto-PR from Inventory
low-stock events (§9).

### 2. RFQ / Quotations — **GAP (design)**
No RFQ today. Add `rfqs`/`_lines` + `supplier_quotations`/`_lines`: an RFQ fans out
to candidate suppliers; quotes are captured/compared (price, lead time, terms);
**award** (an approval point) creates a PO from the winning quote. Quote prices can
seed/refresh supplier price lists (§6).

### 3. Purchase Orders — **EXISTS → formalize**
Reuse `erp_purchase_orders`/`_lines` (supplier, po_number, status, totals,
`approved_by`, line `received_qty`). Formalize: status lifecycle
(draft→approved→partially_received→received→closed/cancelled), **approval by
amount/threshold** (Workflow), currency + tax derivation (Finance tax engine),
delivery terms/Incoterms, and PR/RFQ provenance.

### 4. Goods Receipt (GRN) — **EXISTS → formalize**
Reuse `erp_goods_receipts`/`_lines` (PO-linked, warehouse, **batch_number/
expiry_date**). Formalize: **partial & over/under receipt** vs PO `received_qty`,
**lot/serial capture on receipt** (already carries batch/expiry → feeds Inventory
lots §9; serials via `erp_product_serials`), QC/inspection hold (quarantine
warehouse), and receipt = the **valued stock-in event** to Inventory/Finance.

### 5. Supplier Returns — **EXISTS → formalize**
Reuse `erp_purchase_returns`/`_lines` (supplier, PO ref, reason, `approved_by`).
Formalize: return reasons, link to the originating GRN/lot/serial, **symmetric
reversal** of stock + cost + tax, and debit-note generation to AP. Approval via
Workflow.

### 6. Supplier Price Lists — **GAP (design)** (existing `erp_price_lists` is sell-side)
Add **supplier-specific** pricing: `supplier_price_lists`/`_items` (supplier ×
product → cost price, currency, MOQ, price breaks, lead time, validity dates,
supplier SKU/barcode). Sources: RFQ quotes (§2), PO history, manual. PO line
pricing defaults from the active supplier price list; feeds standard-cost/PPV
comparisons (Finance §8A). Kept separate from the sell-side `erp_price_lists`.

### 7. Landed Cost Allocation — **GAP (design)**
Add `landed_cost`/`_allocations`: capture additional acquisition costs (freight,
duty, insurance, clearing) and **allocate across received lines** by a basis
(value/weight/qty/volume). The allocated landed cost is fed to the **Inventory
costing layer** so it lands in item cost (FIFO layer / moving-avg / standard
variance) — Inventory owns the costing math; Purchasing supplies the cost + basis.
Finance posts the clearing/accrual via posting rules.

### 8. Approval Workflows — **reuse Workflow Platform**
No bespoke approval code. PR approval, PO approval (by amount/tier), RFQ award,
return approval, landed-cost approval, supplier onboarding — each a **workflow
definition** authored in the existing Builder/Canvas, with **maker-checker** SoD
and SLA/escalation. `approved_by` columns already present are set by the runtime.

---

## B. Integrations

### 9. Inventory integration
- **GRN → valued receipt movement** into the Inventory stock ledger (the receipt
  already captures warehouse + batch/expiry → creates/updates **lots**; serials via
  `erp_product_serials`).
- **Landed cost** flows into the Inventory **costing layer** (§7) so item cost
  reflects true landed cost.
- **Returns → issue/withdrawal movements** (symmetric).
- **Reorder loop:** Inventory `inventory.low_stock` events can auto-raise a PR/PO
  (§1) — one bus, Purchasing subscribes.

### 10. Finance integration
- Events drive posting rules (reuse the Finance posting engine):
  `goods.received` → **GR/IR or inventory accrual** (Dr Inventory / Cr GR-IR);
  supplier invoice → **AP** (Dr GR-IR / Cr AP + input tax); `supplier.payment` →
  Dr AP / Cr Bank; landed cost → Dr Inventory / Cr clearing; returns reverse.
- **Three-way match** (PO ↔ GRN ↔ supplier invoice) as a control + an approval gate
  on mismatch (Workflow). `reference_type/id` gives PO↔receipt↔journal drill-down.
- Tax via the Finance **tax engine** (input/recoverable, withholding).

### 11. Search OS integration
Add purchasing **providers** to the unified index: purchase orders (PO number),
purchase requests, RFQs/quotations, goods receipts (receipt number), purchase
returns, and **suppliers** (code/name/phone/VAT — supplier provider). Find by
document number / supplier; deep-link to the document. Reuses index + palette.

### 12. Multi-company support
Scoping standardized to **company** (via supplier/branch/warehouse → company), RLS
using platform primitives (`erp_user_company_id`, `erp_is_platform_owner`,
`erp_has_branch_access`, `(select auth.uid())`). Per-company suppliers, price lists,
approval thresholds, and document number sequences. Optional inter-company purchasing
as a future configured flow (not a new engine).

---

## C. Gap register (documented separately, as requested)

| # | Capability | State | Gap to add |
|---|---|---|---|
| 1 | Purchase Requests | **Missing** | `purchase_requests`/`_lines` + PR→RFQ/PO conversion + approval |
| 2 | RFQ / Quotations | **Missing** | `rfqs`/`_lines`, `supplier_quotations`/`_lines`, compare + award |
| 6 | Supplier Price Lists | **Missing** (sell-side exists) | `supplier_price_lists`/`_items` (cost, MOQ, breaks, validity, supplier SKU) |
| 7 | Landed Cost Allocation | **Missing** | `landed_cost`/`_allocations` + basis → Inventory costing layer |
| — | Three-way match | **Partial** | match engine across PO/GRN/supplier-invoice + mismatch approval |
| — | Supplier invoice (bill) | **Partial** | formalize supplier-invoice doc between GRN and payment (AP) |

**Already present (formalize, not rebuild):** Purchase Orders (+lines, approval,
partial receipt), Goods Receipts (+lines, batch/expiry), Supplier Returns,
Supplier Payments / Receipt Vouchers, Suppliers.

---

## Design principles (carried from Workflow/Search/Finance/Inventory)

P2P document spine with status + `reference_type/id` linkage; events as the seam to
Inventory + Finance; approvals via Workflow; discoverability via Search; costing math
delegated to the Inventory costing layer; additive + flag-gated; RLS-first
multi-tenancy. No second purchasing engine; no per-industry fork.

---

## Open questions for review

1. **PR↔RFQ↔PO flow depth in V1:** full PR→RFQ→award→PO, or PR→PO (RFQ later)?
2. **Supplier invoice / three-way match:** introduce a first-class supplier-invoice
   document now (recommended for AP correctness) vs. post AP directly from GRN?
3. **Landed cost basis set** for V1 (value/qty/weight/volume) and timing (at receipt
   vs. retro-allocation on a later freight bill)?
4. **Supplier price list scope:** simple cost + validity first, or price breaks/MOQ/
   lead time in V1?
5. **Reorder automation:** auto-PR from Inventory low-stock in V1 or later?
6. **First consumer flow:** PO → GRN → three-way match → AP → payment as the
   end-to-end validation against Inventory + Finance.

*Architecture only — no code, migrations, implementation, or branches. Awaiting
architecture review/approval before any implementation.*
