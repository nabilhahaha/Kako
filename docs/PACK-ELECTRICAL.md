# VANTORA — Electrical Retail & Wholesale Pack — Design Review

> Build-track slice **Electrical Pack** — **design for approval, no
> implementation yet.** First pilot target (per `PLATFORM-REVIEW.md` §14). An
> **Industry Pack = bundle of Core modules + vertical features on the shared
> core** — it reuses the existing pricing, inventory ledger, transfers, and
> returns, and **adds only** the electrical-specific layers. Additive +
> idempotent; **no deletions; protected verticals unchanged**; reviewed against
> the official baseline (`PLATFORM-REVIEW.md`) — no baseline architecture change.

---

## 1. What already exists (reuse — do NOT rebuild)
Grounded in the codebase:
- **Tiered pricing:** `erp_wholesale_tiers` / `erp_wholesale_prices` (per-tier per-
  product) / `erp_wholesale_customer_tier` (customer→tier); perm `wholesale.pricing`;
  module `wholesale`. (migration 0060)
- **Inventory:** `erp_products_catalog` (incl. `cost_price`, `sell_price`),
  `erp_inventory_stock`, immutable `erp_stock_movements` ledger (types incl.
  `purchase_in`, `sale_out`, `transfer_*`, `return_in`, `adjustment`,
  `opening_balance`), `erp_warehouses`. (0005)
- **Stock transfers:** `erp_transfer_orders` / `_lines` + `erp_complete_transfer`
  RPC (paired out/in movements). (0005 / 0008)
- **Sales returns:** `erp_sales_returns` / `_lines` + `erp_complete_sales_return`
  RPC (restock `return_in` + contra-revenue journal + customer balance). (0005 /
  0008)
- **Business type `electronics`** already exists (roles incl. **technician**;
  modules sales/inventory/purchasing/accounting + pos/returns/warehousing +
  analytics; ELECTRONICS setup-wizard profile). (0034/0036/0044/0095)

**Greenfield (must design):** serial-number tracking, warranty, RMA, **supplier/
purchase returns**, and the "Project" pricing tier. Everything else extends the
above.

## 2. Pack shape & naming
- **Pack key:** `electrical` (already in `licensing-catalog.ts` INDUSTRY_PACKS +
  `packForBusinessType`). The pack **maps onto the existing `electronics`
  business type** (no new business-type churn) and bundles: `sales, inventory,
  purchasing, accounting(finance), pos, analytics` (+ `wholesale` for tiers).
- **No new top-level module key** is required: electrical features ride on
  existing modules; gating uses existing module + new permissions.

## 3. Multi-tier pricing (Retail / Semi-wholesale / Wholesale / Project)
**Reuse `erp_wholesale_tiers`** — seed four named tiers for electrical companies:
`retail`, `semi_wholesale`, `wholesale`, `project`. Prices live in the existing
`erp_wholesale_prices` (tier×product). Customer default tier via
`erp_wholesale_customer_tier`.
- **Retail / Semi-wholesale / Wholesale** = standard tier price lookup (existing
  resolution path; no new logic).
- **Project pricing** = a **quote-time override tier**: a project sells at
  negotiated prices that may sit below wholesale, scoped to a deal. Design choice
  (decision §13.1): model "Project" as a **tier** for the default catalog price
  **plus** an optional **per-line manual price override** (already supported on
  order/invoice lines) captured under a `project_ref`. **Recommended:** tier +
  line-override (no new pricing engine) rather than a separate project-quote
  subsystem in V1.
- **Tier resolution order** stays: explicit line override → customer's assigned
  tier price → product `sell_price` fallback.

## 4. Serial-number tracking
New, additive — a serial registry layered on the stock ledger:
- **`erp_product_serials`** — one row per physical unit: `id, company_id,
  product_id, serial_no` (+ optional `imei`), `status`
  (`in_stock|sold|returned|rma|scrapped`), `warehouse_id` (current location),
  `purchase_ref`, `sale_ref`, `customer_id`, `received_at`, `sold_at`,
  standard fields (`external_id`, `created/updated_*`). Unique `(company_id,
  serial_no)`.
- **Per-product flag** `is_serialized` (on `erp_products_catalog`, default false)
  — only serialized products require serial capture; others behave exactly as
  today (zero impact on non-electrical tenants).
- **Movement linkage:** serial status transitions are driven by the existing
  ledger events (`purchase_in`→in_stock, `sale_out`→sold, `return_in`→returned,
  transfer updates `warehouse_id`). Serial capture is **optional at V1 entry
  points** and enforced only when `is_serialized` (decision §13.2).

## 5. Warranty management
- **`erp_warranties`** — `id, company_id, product_serial_id` (FK) **or**
  `(product_id, invoice_id)` for non-serialized, `customer_id`, `start_date`,
  `period_months`, `end_date` (generated), `terms`, `status`
  (`active|expired|void`), standard fields.
- **Defaults:** a per-product `warranty_months` (on catalog, nullable) seeds the
  warranty on sale; overridable per line. Expiry is a generated/derived column;
  no scheduler needed for V1 (status computed on read; optional pg_cron sweep is
  a follow-up).

## 6. RMA process (Return Merchandise Authorization)
A light workflow on top of returns — **distinct from but feeding** the existing
returns:
- **`erp_rma`** — header: `id, company_id, branch_id, rma_number, customer_id,
  product_serial_id|product_id, invoice_ref, reason, fault_description,
  status` (`requested|approved|received|repair|replace|refund|closed|rejected`),
  `resolution`, `approved_by`, standard fields.
- **Bridges to existing flows on resolution:**
  - **refund/replace restock** → reuse `erp_sales_returns` +
    `erp_complete_sales_return` (so accounting + restock stay one code path);
  - **repair** → status-only (no stock move) until returned to customer;
  - serial `status` follows RMA (`rma`→`returned`/`sold`/`scrapped`).
- **Permission:** `electrical.rma` (new). **Recommended:** RMA is its own entity
  but **does not** duplicate the returns ledger — it orchestrates it (decision
  §13.3).

## 7. Supplier (purchase) returns — NEW
Today only **sales** returns exist. Add a symmetric supplier-return:
- **`erp_purchase_returns`** / **`_lines`** mirroring the sales-return shape;
  status enum reuse (`draft|approved|completed|cancelled`).
- **`erp_complete_purchase_return(p_return_id)`** RPC (new, SECURITY DEFINER,
  pinned search_path, anon revoked): emits a **new ledger type
  `return_out`** (stock leaves to the supplier), posts the contra-purchase
  journal, and reduces supplier balance — the mirror of
  `erp_complete_sales_return`. (Adds one enum value — additive.)
- **Permission:** `purchasing.return` (new), grouped with purchasing.

## 8. Stock transfers
**No change** — `erp_transfer_orders` + `erp_complete_transfer` are reused as-is.
For serialized products, the transfer simply updates the serial's `warehouse_id`
(handled in the same RPC path; decision §13.4 — extend the existing RPC vs a
serialized variant; **recommended:** extend in place, guarded by `is_serialized`).

## 9. Inventory valuation compatibility
- **V1 keeps the existing `cost_price` model** (static per-product) — the
  Electrical pack is **valuation-compatible**, not a valuation rewrite. All new
  movements (`return_out`, serial-driven) carry cost via the existing
  `cost_price` so stock value and COGS stay consistent with the current ledger.
- **Serialized cost (optional, additive):** `erp_product_serials.unit_cost`
  captures the actual landed cost per unit (from `purchase_in`), enabling
  **exact per-serial COGS** on sale without changing the global model — a clean
  upgrade path toward FIFO/lot costing later (tracked, not built in V1).
- **No change** to existing valuation for non-serialized products or other
  verticals.

## 10. ERP coexistence compatibility
- All new entities carry **`external_id`** (standard field) → syncable via the
  connector framework; serials/warranty/RMA can be **owned by VANTORA** while an
  external ERP owns items/stock/finance (the documented split).
- **Adapter mapping (future presets):** serials ↔ ERP serialized-inventory
  objects where supported (e.g. NetSuite inventory serial numbers, SAP
  serial/equipment); where unsupported, serials/warranty/RMA stay **VANTORA-side
  and are never overwritten** — exactly the protected-data posture in the
  baseline. No adapter code in this slice; mapping presets are a follow-up per
  pilot.
- Tier prices already map through the existing pricing tables.

## 11. App / entity-framework wiring
- Register new entities in `entities.ts`: `product_serial`, `warranty`, `rma`,
  `purchase_return` (importable/exportable/audit/notes via the standard
  capabilities) — so import/export/API/sync come **for free**.
- Nav: an **Electrical** section (gated by the pack) for Serials / Warranty / RMA;
  Supplier Returns under Purchasing; tiers stay under the existing Wholesale
  screens. Permission-gated as usual.
- Setup wizard: extend the ELECTRONICS profile with electrical toggles (serials/
  warranty/RMA, multi-tier pricing) — preselect only; fully editable.

## 12. Migration plan (additive, idempotent — held for approval)
One reviewed migration (next sequential number) that **only adds**:
1. columns: `erp_products_catalog.is_serialized`, `.warranty_months`;
2. tables: `erp_product_serials`, `erp_warranties`, `erp_rma`,
   `erp_purchase_returns(+_lines)` — all with RLS + standard fields;
3. enum value `return_out` on `erp_stock_movement_type`;
4. RPC `erp_complete_purchase_return` (SECURITY DEFINER, pinned search_path,
   anon/public revoked);
5. permissions `electrical.rma`, `purchasing.return` (+ labels) seeded to
   admin/manager (+ technician for RMA);
6. seed four `erp_wholesale_tiers` rows + business-type recommendations for
   `electronics`/`electrical`.
**No data deletion; no change to existing rows' meaning; protected verticals
untouched.** Verified rolled-back-live before any apply (per baseline discipline).

## 13. Decisions to confirm (before building)
1. **Project pricing** = tier + per-line override (no separate quote engine in
   V1)? *(Recommended.)*
2. **Serial capture** optional globally, **enforced only when `is_serialized`**
   (zero impact on non-electrical tenants)? *(Recommended.)*
3. **RMA orchestrates** the existing returns/accounting (no duplicate ledger)?
   *(Recommended.)*
4. **Serialized transfers** = extend `erp_complete_transfer` in place (guarded)
   vs a variant RPC? *(Recommended: extend in place.)*
5. **Valuation** = keep static `cost_price` in V1 + optional per-serial
   `unit_cost` (FIFO/lot costing tracked as a follow-up)? *(Recommended.)*
6. **Business type** = ride on existing `electronics` (no new type) with the
   `electrical` **pack** label? *(Recommended.)*
7. **Build sub-slicing** — ship as **(a) pricing tiers + supplier returns**, then
   **(b) serials + warranty + RMA**, two reviewable PRs — or one? *(Recommended:
   two sub-slices; each design→build→test→PR→review.)*

*(Electrical Pack design — paused for your review + the §13 decisions. On
approval I build per the chosen sub-slicing → test → draft PR → review package;
**no production apply without approval**. Then the Capability-Seed Slice.)*
