# VANTORA — Inventory Foundation Architecture (Proposal)

**Status:** Architecture only — **no code, no migrations, no implementation, no
branches.** Architecture review first.
**Goal:** a **generic, industry-neutral inventory foundation** (distribution,
retail, manufacturing, clinics, pharmacies, services, future verticals) — one stock
ledger, one costing layer, reused everywhere; the **costing layer** that the
approved Finance Foundation depends on (Finance §8A) lives here.
**Discipline (same as Workflow/Search/Finance):** *reuse over rebuild; additive;
flag-gated; multi-tenant + permission model preserved; one engine, zero duplicate
logic.*

> **Not greenfield.** A working inventory core exists on `main`:
> `erp_inventory_stock` (product×warehouse: quantity, reserved_qty),
> `erp_stock_movements` (movement ledger with polymorphic `reference_type/id`),
> `erp_warehouses` (branch-scoped, `is_van`), `erp_product_serials` (serial/IMEI +
> `unit_cost`), `erp_transfer_orders`/lines, `erp_stock_counts`/lines,
> `erp_fashion_reservations`, + `inventory.view/adjust/count/transfer/export`. This
> proposal **formalizes** that core and fills gaps: a first-class **costing layer**,
> generic **lots/expiry**, **bins**, and a **generic reservation/available** model.

---

## Core principle: the stock-movement ledger is the source of truth

Exactly like the GL journal: **`erp_stock_movements` is append-only truth**;
on-hand / reserved / available are **projections** maintained from it. Every change
(receipt, issue, transfer, adjustment, count correction) is a movement with a
polymorphic `reference_type/reference_id` back to its source document. This makes
balances reconstructable, auditable, and the natural emission point for valued
events to Finance.

---

## 1. Inventory valuation (FIFO / Weighted Average / Standard Cost)

The **costing layer** owns valuation (per the Finance §8A boundary); the GL never
computes cost.
- **FIFO:** a **cost-layer ledger** (receipt lots: qty + unit cost + date); issues
  consume oldest layers; COGS = Σ consumed layer cost.
- **Weighted Average:** a **moving-average unit cost** per (product, [warehouse],
  scope) recomputed on each receipt; issues valued at current average.
- **Standard Cost:** a **standard-cost master** (per item/period) values
  movements at standard; **variances** (purchase-price, usage) are computed and
  carried on the event for Finance to post to variance accounts.
- **Method is a setting** (per item / category / company), resolved in the costing
  layer; different items can use different methods concurrently. Switching a method
  later is a costing-layer change, not a ledger redesign.
- **Serial-level cost** already exists (`erp_product_serials.unit_cost`) → serialized
  items can value at actual.

---

## 2. Lots and batches

Generic **lot/batch model** (gap today): `inventory_lots` (product, warehouse,
lot/batch number, manufacture/expiry dates, received qty, cost link). Stock and
movements gain an **optional `lot_id`** (lot-tracked items require it; others
ignore it). **Issue strategy** is configurable per item — FIFO, **FEFO** (first-
expiry-first-out, for pharma/clinic/food), or manual lot selection. Lot balances
are a projection of lot-keyed movements.

## 3. Expiry management

Built on lots (`expiry_date`): **near-expiry detection** as a scheduled scan
(reuse the Workflow **tick**) emitting an `inventory.near_expiry` event →
markdown/return/quarantine workflows (this is exactly the near-expiry process
modeled earlier). **FEFO** issue selection prevents shipping soon-to-expire stock;
expired stock is quarantined/written off via an approval workflow. Expiry windows
configurable per item/category.

## 4. Serial numbers

Reuse + formalize `erp_product_serials` (serial_no, **imei**, status, warehouse_id,
**unit_cost**, purchase_ref/sale_ref, customer_id, received/sold). Serialized items
track each unit through its lifecycle (received → in-stock → reserved → sold →
returned), value at actual cost, and are searchable by serial/IMEI (Search OS).
Serial state is reconciled against movements.

## 5. Warehouses and bin locations

Reuse `erp_warehouses` (branch-scoped, `is_van` mobile/van stock, `assigned_to`).
Add an **optional bin/location dimension** (`warehouse_bins`: warehouse → zones/
bins) so stock can be keyed by **(warehouse, bin, lot, serial)**; bin-less tenants
ignore it. Van warehouses are first-class (field sales / van stock). Warehouse
types (main, transit, quarantine, van, consignment) as configuration.

## 6. Transfers and adjustments

- **Transfers:** reuse `erp_transfer_orders` (from/to warehouse, status,
  approved_by) — generalized with **in-transit** handling (a transit warehouse /
  two-phase ship→receive) so stock is never lost between sites; van transfers and
  customer transfers are variants of the same model. Approval via Workflow.
- **Adjustments:** stock corrections as movements with **reason codes** (damage,
  loss, found, revaluation); above-threshold adjustments and count variances are
  **approval points** (Workflow). Counts (`erp_stock_counts`) post variance
  movements on finalize.

## 7. Reservations and available stock

Generalize beyond `erp_fashion_reservations` to a **generic reservation ledger**
(product/lot/serial, warehouse, qty, owner ref, **soft vs hard**, `reserved_until`,
status). **Available = on_hand − hard_reserved − allocated** (soft/cart reservations
shown separately). Reservations expire via the tick (release on `reserved_until`).
Order/quote/cart flows reserve; fulfilment converts reservation → issue movement.

## 8. Inventory costing-layer boundaries

The **boundary** (the guarantee of "no redesign" for Finance):
- **Owned here:** cost-layer ledger (FIFO), moving-average state, standard-cost
  master + variance config, serial cost — i.e. *how value is computed*.
- **Emitted:** a **valued movement event** carrying the computed cost (+ variance
  breakdown for standard cost) on each financially-relevant movement.
- **NOT here:** GL accounts/journals (Finance owns *value posted*). Inventory never
  writes journals; it emits valued events; Finance's posting rules create the entry.
- Recosting / standard rolls / period-end revaluation produce adjusting valued
  events → Finance posts adjusting journals.

## 9. Integration with Finance Foundation

- Inventory emits **valued movement events** (`stock.received`, `stock.issued`/COGS,
  `stock.transferred`, `stock.adjusted`, `stock.revalued`); the Finance **posting
  engine** subscribes and posts via rules (Inventory / COGS / GR-IR / variance
  accounts). `movement.reference_type/id` ↔ `journal.reference_type/id` give
  two-way drill-down.
- **Perpetual vs periodic** inventory is a Finance posting-rule choice; this layer
  just supplies movements + costs either way.

## 10. Integration with Workflow Platform

- **Approvals:** transfers, adjustments/write-offs above threshold, count-variance
  acceptance, expiry quarantine/disposal, reservation overrides — authored in the
  existing Builder/Canvas (maker-checker).
- **Events:** reuse `stock_transfer.completed`; add `inventory.near_expiry`,
  `inventory.low_stock`/reorder, `stock.*` valued events — one bus, multiple
  consumers (Finance posting + Search projector + notifications).
- **Tick:** scheduled near-expiry scans, reorder-point checks, reservation expiry,
  cycle-count scheduling — reuse the runtime tick + idempotency.
- **Egress allow-list:** external WMS/3PL/marketplace stock sync as governed
  connectors.

## 11. Integration with Search OS

Add inventory **providers** to the unified index: products (SKU/barcode — already
in Search V1), **warehouses**, **lots/batches** (lot number + expiry), **serials**
(serial/IMEI), and **stock positions** (find "where is product X / how much in
warehouse Y"). Deep-link to the product/warehouse/lot/serial. Reuses the index +
palette; identifier search already covers barcode/serial-style codes.

## 12. Multi-company & multi-warehouse support

- **Scoping standardized:** company via warehouse→branch→company (serials already
  carry `company_id`); the foundation standardizes to **company + warehouse +
  (optional) bin** with RLS using the platform primitives (`erp_user_company_id`,
  `erp_has_branch_access`, `(select auth.uid())`).
- **Multi-warehouse:** stock keyed by warehouse (+ bin/lot/serial); cross-warehouse
  visibility, per-warehouse reorder points, and inter-warehouse transfers with
  in-transit. **Van warehouses** (`is_van`) model mobile field stock.
- **Multi-company:** strict tenant isolation on stock/movements/lots/serials;
  optional **consignment/inter-company transfer** as a future configured flow (not a
  new engine).

---

## Design principles (carried from Workflow/Search/Finance)

One stock ledger (movements = truth; balances = projections), one costing layer
(method-as-setting), events as the integration seam to Finance, approvals via
Workflow, discoverability via Search, additive + flag-gated rollout, RLS-first
multi-tenancy. No second stock engine; no per-industry fork.

---

## Open questions for review

1. **Costing-layer storage:** dedicated cost-layer ledger for FIFO + moving-avg
   state table + standard master (recommended) vs. a single valuation table — scope
   for phase 1.
2. **Bins in V1?** ship the optional bin dimension now, or reserve the seam and add
   later?
3. **Reservation generalization:** migrate `erp_fashion_reservations` into the
   generic reservation ledger, or run both during transition?
4. **In-transit transfers:** transit-warehouse model vs. ship/receive two-phase on
   the transfer order?
5. **Lot/expiry scope:** which verticals require lots/FEFO in V1 (pharma/clinic/food)
   to prioritize?
6. **First consumer:** validate the foundation against which flow first — purchase
   receipt → COGS on sale (perpetual) is the natural end-to-end test with Finance.

*Architecture only — no code, migrations, implementation, or branches. Awaiting
architecture review/approval before any implementation.*
