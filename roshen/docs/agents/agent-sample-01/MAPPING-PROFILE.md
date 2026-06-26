# Agent Sample 01 — First Default Mapping Profile (review)

> **File access note:** the uploaded workbook did not reach the build
> environment, so the **data-dependent** results (item 9 stats, and confirming
> whether *Total Line Discount* is already reflected in *Invoice Amount ex Vat*)
> are **pending the file**. Everything below that depends only on the column
> layout you described is complete. Run `scripts/preview-import.mjs` against the
> real file to fill item 9 automatically.

Artifacts in this folder:
- `field-mapping.json` — proposed mapping + calculation policy (item 3, 6)
- `value-mapping.json` — channel/depot/class/return-reason scaffold (item 5)
- `../../scripts/preview-import.mjs` — computes item 9 from the file

---

## 1. Sample file profile summary
- One agent/distributor; **source sheet = `Row Data`** (the `Summary` sheet is
  ignored). This layout becomes the agent's **version 1** default mapping.
- Line-level invoice data; **returns are negative rows** (`IsReturn = Yes` →
  negative amount/qty/VAT/net), not separate columns.
- Dates are **Excel serial numbers**.
- Rich set of optional columns (Supervisor, NSM, Class, Warehouse, Region).

## 2. Detected columns (as described)
Cust Name, Cust Account, Depot, Channel, Salesman Name / Sales Man, Region,
Class, Invoice, Invoice Date, Item Id, Item Description, Item Type, SalesUnit,
Inv Qty Each, Inv Qty Cases, Invoice Amount ex Vat, Sales_Total_Tax, Net Amount,
Total Line Discount, IsReturn, Return Reason, Order Status / Line Status,
Warehouse, Supervisor, NSM, Invoice_Key.

## 3. Proposed mapping JSON
See `field-mapping.json`. Highlights & resolved conflicts:
- `city` ← **Depot** (via value mapping) and `branch_code` ← **Depot** too —
  Depot serves both; depot→city handled in `value-mapping.json`.
- `roshen_item_code` ← **Item Id** (no distinct Roshen master code present;
  Item Id is treated as the SKU).
- `net_value_after_discount` ← **Net Amount**, flagged as **NET INCL VAT** →
  stored as `net_value_reported` (reconciliation), **not** as ex-VAT.
- `invoice_status` ← **Order Status** (fallback **Line Status**).
- `transaction_type` ← **IsReturn** via value mapping (Yes→return).
- **Invoice_Key** captured as the line dedupe key.
- Extras with no canonical home (**Class, Supervisor, NSM**) are preserved in
  `raw_import_row.raw`.

## 4. Date parsing result
- Detected format: **`excel_serial_date`** (stored on the batch).
- Conversion: `ISO = epoch(1899-12-30) + serial days` → `YYYY-MM-DD`.
- Stored per row: `raw_invoice_date` (original serial), `normalized_invoice_date`,
  confidence. Non-numeric/out-of-range serials → flagged, row excluded.
- (Actual min/max date range is in item 9 — pending file.)

## 5. Value mapping suggestions
Scaffold in `value-mapping.json`. Needs the file's **distinct values** to
finalize:
- **Channel** → canonical channel (MT/TT/HRC/WS); aliases TT/Traditional/GT→TT,
  MT/Modern→MT already seeded.
- **Depot → City** (e.g. depot code → Riyadh/Jeddah).
- **Class** → kept in raw (optional future `segment` dimension).
- **IsReturn** → `sale`/`return`.
- **Return Reason** → standardized text.

## 6. Recommended calculation policy (this agent)
| Field | Value |
|---|---|
| sales_value_basis | `excluding_vat_before_discount` |
| vat_handling | `value_excludes_vat` (vat_rate 0.15) |
| discount_handling | `ignore_discount_for_sla` * |
| returns_handling | `returns_already_deducted` (negative rows) |
| sla_actual_basis | `sales_value_excluding_vat` |
| **SLA formula** | **SUM(Invoice Amount ex Vat)** over Posted rows (negative returns included) |

\* Your note "store_only_or_already_reflected" maps to `ignore_discount_for_sla`
(store, never subtract for SLA). **Pending verification:** if Net = ex-VAT + VAT
across rows, the discount is already inside ex-VAT → switch to
`discount_already_deducted`. Either way the **SLA number is identical** (SLA
basis is ex-VAT, not net); it only affects `net_sales_ex_vat` analytics. The
preview script reports this automatically.

## 7. Validation issues found (structural, from the layout)
- **No separate Roshen master code** → `roshen_item_code = item_code` (warn).
- **Depot reused** for city + branch → confirm depot→city map (warn).
- **Net Amount is incl-VAT** → must not be used as ex-VAT (handled).
- **Two status columns** (Order/Line) → precedence chosen (Order first).
- **Returns as negative rows** → `returns_handling=returns_already_deducted` so
  SLA isn't double-reduced (handled).
- **Discount reflected?** → unverified until file (see item 6).
- Per-row checks at import: required present, numeric values, serial-date valid,
  channel/depot resolvable, duplicate `Invoice_Key`.

## 8. Missing columns vs canonical template
Not present in this file (expected, not blockers):
- `credit_note_number`, separate `returns_value` / `return_qty_*` (returns are
  negative rows instead)
- `gross_value_before_discount`, `barcode`, `brand`, `product_family`
- `carton_to_piece_conversion` (derivable from Cases vs Each)
- `reporting_month` (derived from invoice_date), `agent_code`/`agent_name`
  (from upload context)

## 9. Import preview summary — PENDING FILE
Run: `node scripts/preview-import.mjs <file.xlsx> "Row Data"` → outputs:
row count · unique invoices · unique invoice keys · unique customers · unique
items · date range · channel breakdown · return-row count · SLA actual
(SUM ex-VAT) · Net-vs-(exVat+VAT) reconciliation (discount-reflected check) ·
duplicate-line indication. I will not estimate these without the data.

## 10. Ready to become the first agent mapping template?
**Yes — conditionally.** The layout is clean and fully mappable; the mapping +
policy above are ready to save as version 1. Two things finalize it:
1. The **file bytes** to run item 9 and confirm distinct Channel/Depot/Class
   values for value mapping.
2. Confirm the **discount-reflected** question (auto-answered by the preview
   script).

Once provided, I'll finalize `value-mapping.json`, set `discount_handling`
accordingly, and (on your go-ahead) seed this as the agent's version-1 mapping —
still without applying migrations or building dashboards.
