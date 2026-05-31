# VANTORA — Electrical Pack — Sub-slice B Design Review (Serials + Warranty + RMA)

> Build-track slice **Electrical Pack — Sub-slice B** — **design for approval, no
> implementation yet.** Follows Sub-slice A (✅ merged; 0096 applied to prod). The
> §13 decisions from `PACK-ELECTRICAL.md` are already locked and carried here:
> serial capture **enforced only when `is_serialized`**; warranty/RMA **additive**;
> **RMA orchestrates** the existing returns/accounting; **extend
> `erp_complete_transfer`** in place for serialized transfers; static `cost_price`
> **+ optional per-serial `unit_cost`**. Additive + idempotent; **no deletions;
> protected verticals unchanged**; reviewed against the official baseline — no
> baseline architecture change.

---

## 1. Scope
Add the three greenfield electrical features on top of the existing inventory
ledger + returns (no rebuild):
1. **Serial-number tracking** — per physical unit, status-driven by the ledger.
2. **Warranty management** — per serial (or per non-serialized sale line).
3. **RMA** — a light return-authorization workflow that **orchestrates** the
   existing sales-return + (new) purchase-return paths.

## 2. New schema (migration 0097, additive + idempotent)
### 2.1 Catalog flags (columns on `erp_products_catalog`)
- `is_serialized BOOLEAN NOT NULL DEFAULT false` — only serialized products
  require serial capture; **default false → zero behaviour change for every
  existing product and non-electrical tenant.**
- `warranty_months INTEGER` (nullable) — default warranty term to seed on sale.

### 2.2 `erp_product_serials`
`id, company_id, product_id (FK), serial_no TEXT, imei TEXT NULL, status
erp_serial_status DEFAULT 'in_stock', warehouse_id (FK, current location),
unit_cost NUMERIC(14,2) NULL` (optional exact landed cost — §6),
`purchase_ref UUID NULL, sale_ref UUID NULL, customer_id UUID NULL,
received_at, sold_at, external_id, created/updated_*`.
- **New enum** `erp_serial_status`: `in_stock | sold | returned | rma | scrapped`.
- Unique `(company_id, serial_no)`. Branch/company-scoped RLS.

### 2.3 `erp_warranties`
`id, company_id, product_serial_id UUID NULL (FK), product_id UUID NULL,
invoice_id UUID NULL, customer_id, start_date DATE, period_months INTEGER,
end_date DATE` (**generated**: `start_date + period_months`), `terms TEXT,
status` derived on read (`active` until `end_date`, else `expired`; `void`
explicit), `external_id, created/updated_*`. One of serial / (product+invoice)
identifies the covered item.

### 2.4 `erp_rma`
`id, company_id, branch_id, rma_number TEXT UNIQUE, customer_id UUID NULL,
supplier_id UUID NULL, product_serial_id UUID NULL, product_id UUID NULL,
invoice_ref UUID NULL, reason TEXT, fault_description TEXT, status erp_rma_status
DEFAULT 'requested', resolution TEXT, sales_return_id UUID NULL,
purchase_return_id UUID NULL, approved_by, external_id, created/updated_*`.
- **New enum** `erp_rma_status`: `requested | approved | received | repair |
  replace | refund | closed | rejected`.
- Branch-scoped RLS like returns. `rma_number` via `erp_next_number(branch,'rma')`.

## 3. Serial lifecycle (driven by the existing ledger — no parallel truth)
- **Receive** (`purchase_in`): serials captured → `in_stock`, `warehouse_id` set,
  `unit_cost` from receipt.
- **Sell** (`sale_out`): serials on the invoice → `sold`, `sold_at`, `customer_id`,
  `sale_ref`; warranty row seeded from `warranty_months`.
- **Sales return** (`return_in`): serial → `returned`.
- **Purchase return** (`return_out`, sub-slice A): serial → `scrapped`/`returned`.
- **Transfer**: `erp_complete_transfer` **extended in place** to update each
  serial's `warehouse_id` for serialized lines (guarded by `is_serialized`;
  non-serialized path byte-for-byte unchanged — decision §13.4).
- **Enforcement** (decision §13.2): a guard helper only **requires** serial
  capture when `is_serialized` is true; everything else behaves exactly as today.

## 4. RMA orchestration (no duplicate ledger — decision §13.3)
`erp_rma` is a workflow header; on resolution it **delegates** to existing flows:
- **refund / replace** (customer side) → create + `erp_complete_sales_return`
  (restock + contra-revenue), linked via `sales_return_id`; serial → `returned`.
- **return to vendor** → `erp_purchase_returns` + `erp_complete_purchase_return`
  (sub-slice A), linked via `purchase_return_id`; serial → `scrapped`.
- **repair** → status-only (no stock move) until returned to the customer.
- A thin RPC `erp_rma_set_status(p_rma_id, p_status, ...)` (SECURITY DEFINER,
  pinned search_path, anon revoked) advances status + drives the serial status;
  it **calls** the existing return RPCs rather than re-implementing accounting.

## 5. Permissions & wiring
- **New permission** `electrical.rma` (group `electrical`) — admin/manager +
  **technician** (electronics already has the technician role); backfilled to
  existing electronics companies' relevant roles.
- **New permission group label** `electrical` (en "Electrical", ar "الكهربائيات").
- Serial view/capture rides on existing `inventory.view` / `sales.sell` (no new
  perm needed for capture; gated by module).
- **Entities** registered in `entities.ts`: `product_serial`, `warranty`, `rma`
  (import/export/audit/notes for free; serials importable for opening balances).
- **Nav:** an **Electrical** section (gated by the pack/module + perms) →
  Serials, Warranties, RMA. Permission-gated as usual.
- **Setup wizard:** extend the ELECTRONICS profile with serial/warranty/RMA
  toggles (preselect only; fully editable). No business-type change (decision
  §13.6 — rides on `electronics`).

## 6. Valuation compatibility (decision §13.5)
- V1 keeps the **static `cost_price`** model; all new movements carry cost via it,
  so stock value/COGS stay consistent with the current ledger.
- `erp_product_serials.unit_cost` is **optional** and enables exact per-serial
  COGS later **without** changing the global model — a clean upgrade path toward
  FIFO/lot costing (tracked follow-up, not built in B).

## 7. ERP coexistence
All new entities carry `external_id` → syncable. Serials/warranty/RMA are
**VANTORA-owned**; where an external ERP supports serialized inventory, adapter
presets can map serials (NetSuite serial numbers / SAP serial/equipment) — a
per-pilot follow-up. Where unsupported, they **stay VANTORA-side and are never
overwritten** (baseline protected-data posture). No adapter code in this slice.

## 8. Verification plan (when built)
- **Rolled-back live (production project):** schema/enums/tables/columns present;
  `erp_rma_set_status` + transfer extension exist; advisor 0 ERROR + new RPCs
  **not anon-executable**; serialized transfer updates `warehouse_id`; RMA→return
  delegation posts via the existing RPCs; **no-regression** (existing products
  unchanged — `is_serialized` default false; existing transfer/return paths
  identical); protected verticals untouched; **0 residue after rollback**.
- **Unit:** serial status transitions; warranty end-date/derived status; RMA
  status machine + delegation calls; `is_serialized` guard (no enforcement when
  false); entity registry + permission wiring; i18n ar/en parity.
- `tsc` / `next build` / `vitest`. **Production apply held for approval.**

## 9. Decisions to confirm (before building B)
1. **Serial uniqueness** = per company (`(company_id, serial_no)`), `imei`
   optional secondary? *(Recommended.)*
2. **Warranty target** = serial **or** (product+invoice) for non-serialized, with
   a derived `status` + generated `end_date`? *(Recommended.)*
3. **RMA RPC** = thin `erp_rma_set_status` that **delegates** to the existing
   sales/purchase-return RPCs (no duplicate accounting)? *(Recommended.)*
4. **Transfer extension** = extend `erp_complete_transfer` in place, guarded by
   `is_serialized` (non-serialized unchanged)? *(Recommended — matches §13.4.)*
5. **Permission** = one new `electrical.rma` (+ group); serial capture under
   existing perms? *(Recommended.)*
6. **Build as one PR** (serials + warranty + RMA cohere) — or split serials from
   warranty/RMA? *(Recommended: one PR — they share the serial spine and one
   migration; still one reviewable slice.)*

*(Sub-slice B design — paused for your review + the §9 decisions. On approval I
build → rolled-back live verify → tests → draft PR → review package; **no
production apply without approval**. Completing B finishes the Electrical pack;
then the Capability-Seed Slice.)*
