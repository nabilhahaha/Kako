# Raw Data Import — Specification (for review before migration changes)

This spec defines the agent/distributor raw-data template, validation, date
normalization, and the net-sales rule. **Migrations are NOT changed yet** — the
proposed `sales_fact` / `import` DDL is included here for your approval first.
Once approved, I'll fold it into `0001`/`0003` and update the runbook.

Template file (refreshed): `docs/templates/raw-data-template.csv`.

---

## 1. Final raw data template fields

Canonical field keys (source headers are mapped to these at import; real files
may use any header names). `→ target` shows where the value lands.

### Required (14)
| # | Field | Canonical key | Type | → target |
|---|---|---|---|---|
| 1 | Customer Name | `customer_name` | text | sales_fact + customer dim |
| 2 | Customer Code | `customer_code` | text | sales_fact + customer dim |
| 3 | City | `city` | text | resolved → `city` / sales_fact |
| 4 | Channel | `channel` | text | resolved → `channel_id` |
| 5 | Invoice Number | `invoice_number` | text | sales_fact |
| 6 | Invoice Date | `invoice_date` | date (multi-format → normalized) | `sales_fact.invoice_date` |
| 7 | Item Name | `item_name` | text | sales_fact |
| 8 | Item Code | `item_code` | text | sales_fact |
| 9 | Roshen Item Code | `roshen_item_code` | text | **master SKU** on sales_fact / product dim |
| 10 | Sales Value Excluding VAT | `sales_value_excl_vat` | numeric(18,2) | sales_fact (SLA basis input) |
| 11 | Sales Quantity in Cartons | `sales_qty_cartons` | numeric(18,3) | sales_fact |
| 12 | Sales Quantity in Pieces | `sales_qty_pieces` | numeric(18,3) | sales_fact |
| 13 | Returns Value | `returns_value` | numeric(18,2) | sales_fact (separate) |
| 14 | Cash Discount | `cash_discount` | numeric(18,2) | sales_fact (separate) |

### Optional (configurable, stored when present)
| # | Field | Canonical key | Type | → target |
|---|---|---|---|---|
| 1 | Salesman Name | `salesman_name` | text | sales_fact |
| 2 | Route Number | `route_number` | text | sales_fact |
| 3 | Return Reason | `return_reason` | text | sales_fact |
| 4 | Agent/Distributor Name | `agent_name` | text | cross-check vs upload context |
| 5 | Agent/Distributor Code | `agent_code` | text | cross-check vs selected agent |
| 6 | Branch Name / Code | `branch_name` / `branch_code` | text | cross-check vs hierarchy |
| 7 | Region / Area | `region_area` | text | cross-check vs hierarchy |
| 8 | Transaction Type | `transaction_type` | enum: Sale/Return/Credit Note | `sales_fact.txn_type` |
| 9 | Gross Value Before Discount | `gross_value_before_discount` | numeric(18,2) | sales_fact |
| 10 | Net Value After Discount | `net_value_after_discount` | numeric(18,2) | sales_fact (reported, for reconciliation) |
| 11 | VAT Amount | `vat_amount` | numeric(18,2) | sales_fact |
| 12 | Return Quantity in Cartons | `return_qty_cartons` | numeric(18,3) | sales_fact |
| 13 | Return Quantity in Pieces | `return_qty_pieces` | numeric(18,3) | sales_fact |
| 14 | Credit Note Number | `credit_note_number` | text | sales_fact |
| 15 | Reporting Month | `reporting_month` | month (YYYY-MM) | `sales_fact.period_month` (else derived from invoice_date) |
| 16 | Invoice Status | `invoice_status` | enum: Posted/Cancelled/Draft | `sales_fact.invoice_status` |
| 17 | Unit of Measure | `unit_of_measure` | text | sales_fact |
| 18 | Carton→piece factor | `carton_to_piece_factor` | numeric | sales_fact / product dim |
| 19 | Barcode | `barcode` | text | sales_fact / product dim |
| 20 | Item Category / Brand / Family | `item_category` (+ `brand`,`product_family`) | text | sales_fact / product dim |

---

## 2. Required vs optional — rules

- **Required** fields must be present (mapped) **and** non-empty per row; a
  missing required mapping blocks the batch from validating.
- **Optional** fields are stored when present; absence never blocks import.
- **Agent identity** comes from the **upload context** (you pick the agent when
  uploading), so `agent_code`/`agent_name` in the file are *optional
  cross-checks* — a mismatch raises a warning, not a hard error.
- Hierarchy (branch/region/area) is derived from the agent, so the file's
  `branch_*`/`region_area` are cross-checks too.

---

## 3. Validation rules

Row-level (failures flagged in `raw_import_row.error`, original always kept):
- **Required presence** — all 14 required fields non-null.
- **Numeric** — `sales_value_excl_vat, returns_value, cash_discount,
  sales_qty_cartons, sales_qty_pieces` (and optional numeric fields) parse as
  numbers; thousands separators/currency symbols stripped.
- **Date** — `invoice_date` parses under the batch's confirmed format (see §4);
  unparseable → row flagged, excluded from `sales_fact`.
- **Channel** — resolves to an active `channel` for the company (by name or
  code); unknown channel → flagged.
- **Enums** — `transaction_type ∈ {Sale, Return, Credit Note}`,
  `invoice_status ∈ {Posted, Cancelled, Draft}` (case-insensitive); unknown →
  flagged.
- **Sign/consistency** — returns represented as positive `returns_value`;
  `transaction_type = Return/Credit Note` should carry a non-zero return value
  or `credit_note_number` (warn if not).
- **Quantity coherence** — if both cartons & pieces and a
  `carton_to_piece_factor` are present, `pieces ≈ cartons × factor` (warn on
  mismatch beyond tolerance).

Batch-level:
- **Period consistency** — all `invoice_date` values fall inside the selected
  reporting month (or `reporting_month` matches); out-of-period rows → warn.
- **Duplicate active import** — blocked by the existing partial unique index
  (one `imported` batch per agent+month); re-upload supersedes.
- **Duplicate lines** — same `invoice_number + roshen_item_code` within the
  batch → warn (possible double count).
- A batch with any **required-field/date** errors cannot be committed until
  errors are resolved or the offending rows are explicitly excluded.

---

## 4. Date normalization approach

Goal: accept many agent formats, store one standard `YYYY-MM-DD`.

1. **Detect on mapping** — when the `invoice_date` column is mapped, sample the
   column and infer the dominant format (e.g. `DD/MM/YYYY`, `MM/DD/YYYY`,
   `YYYY-MM-DD`, `DD-Mon-YYYY`, `DD.MM.YYYY`, or Excel serial numbers).
2. **Confirm/override** — the detected format is shown for confirmation and
   stored on the batch: `column_mapping.invoice_date = { source, format }`. This
   removes ambiguity for cases like `03/04/2026` (DMY vs MDY) — we never guess
   silently on ambiguous values.
3. **Convert** — parse each value with the confirmed format → `YYYY-MM-DD`;
   numeric values are treated as Excel serials (epoch 1899-12-30).
4. **Preserve original** — the untouched row (incl. the raw date string) stays
   in `raw_import_row.raw`.
5. **Store normalized** — `sales_fact.invoice_date` holds the standardized date;
   `period_month = date_trunc('month', invoice_date)` (or explicit
   `reporting_month` when provided).
6. **Reject/flag** — values that don't match the confirmed format, are
   out-of-range, or ambiguous-unconfirmed → row flagged with a clear reason and
   excluded from `sales_fact` (kept in raw for audit/fix).

Recommendation: **confirm the format per batch** rather than pure auto-detect —
deterministic and audit-friendly, especially across agents with different
locales.

---

## 5. Net sales calculation — CONFIGURABLE per mapping version

Net sales is **not** a single hardcoded rule. Each agent mapping version carries
a **sales calculation policy** (`sales_value_basis`, `vat_handling` + `vat_rate`,
`discount_handling`, `returns_handling`, `sla_actual_basis`). At import the
engine computes and stores, on `sales_fact`:
- original values (`source_sales_value`, `sales_value_excl_vat`, `gross_value`,
  `net_value_reported`, `vat_amount`), `returns_value`, `cash_discount`
- calculated `gross_sales_ex_vat`, `net_sales_ex_vat`
- `sla_actual_value` — the figure counted toward SLA, chosen by
  `sla_actual_basis`
- `calculation_policy_used` snapshot

**MVP default policy** reproduces:
`SLA Actual = Sales Value Excl VAT − Returns Value − Cash Discount`, but each
agent can deviate without double-deduction. Full details and the resolution
steps are in **`MAPPING-ENGINE.md` §5**.

**Counting rules for actuals:**
- Only rows from an `imported` batch (existing rule).
- Only `invoice_status = Posted` (Cancelled/Draft excluded; NULL = posted).
- The SLA views simply `sum(sla_actual_value)` — no per-agent logic in reporting.

Quantities: both `sales_qty_cartons` and `sales_qty_pieces` are stored;
reporting can show either. A `carton_to_piece_factor` (line or product master)
lets us reconcile/convert. `roshen_item_code` is the **master SKU** for all
product-level grouping when present (fallback to `item_code`).

---

## 6. Recommended missing / supporting fields

- **Product master** (`product`, keyed `company_id + roshen_item_code`) holding
  `item_name, brand, item_category, product_family, barcode, uom,
  carton_to_piece_factor`. Keeps conversions/brand consistent instead of
  trusting every file; `sales_fact` keeps the SKU code + a FK.
- **Customer master** (`customer`, keyed `company_id + customer_code`) holding
  `customer_name, city, channel` — enables clean customer analytics and fixes
  name spelling drift.
- **`tax_rate` / `vat_rate`** — to validate `vat_amount` vs `sales_value_excl_vat`.
- **`source_row_id` / line hash** — natural-key for idempotent re-imports and
  duplicate detection.
- **`promotion_id` / `discount_type`** — if discounts will be analyzed by type.
- **`price_per_piece`** (derived) — optional convenience for reporting.

These are recommendations, not blockers; the required 14 + listed optionals are
sufficient for the SLA MVP.

---

## `sales_fact` model — IMPLEMENTED in `0001` (reviewable, not applied)

The rich line model is now in the migration: identity/customer/item fields,
normalized `invoice_date` + `period_month`, classification (`txn_type`,
`invoice_status`, `credit_note_number`, `salesman_name`, `route_number`,
`return_reason`), original money values, the **calculated** `gross_sales_ex_vat`
/ `net_sales_ex_vat` / `sla_actual_value` + `calculation_policy_used`, and
carton/piece quantities. Net sales is computed per the mapping version's policy
(no generated column) — see `MAPPING-ENGINE.md` §5.

`sla_actual_agent_month` sums `sla_actual_value`, filtered to Posted invoices.

## What still helps to finalize
1. A **real sample file** from one agent (any format) to lock the column mapping
   and confirm the date format(s) in use.
2. Whether to pre-populate **product/customer masters** from a reference list or
   let them accrue from imports.
