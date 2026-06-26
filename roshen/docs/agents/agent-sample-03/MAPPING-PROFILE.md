# Agent Sample 03 (Tala) — Default Mapping Profile (verified)

> **Separate profile** from agent-01 and agent-02 (different layout — no reuse).
> Verified against `Tala.xlsx`, sheet `Sheet1`: **1,390 transaction rows** plus
> **1 trailing total row that is EXCLUDED**, 2026-05-02 → 2026-05-10. File not
> committed (customer data).

Artifacts: `field-mapping.json`, `value-mapping.json`.

---

## 1. Profile summary
- 169 invoices · 92 customers · 67 items.
- **Returns/credit/debit are separate negative rows** distinguished by `Doc Type`
  (Sales, Good returns, Damaged returns, Expire returns, Credit Note, Debit Note).
- **Discount already reflected**: `Gross Sales Excl Vat − Discount Amount =
  Net Amount Excl Vat` (0 mismatches across 1,390 rows); `Net With Vat = Net Excl
  Vat + VAT`.
- Per-row `Vat Rate` column; `Reference No` is the master SKU.

## 2. Mapping JSON
See `field-mapping.json`. Highlights:
- `net_sales_ex_vat` ← **Net Amount Excl Vat** (direct, SLA basis);
  `gross_sales_ex_vat` ← Gross Sales Excl Vat Sar.
- Three discount types stored: `cash_discount`←Discount Amount,
  `doc_discount`←Doc Discount Amount, `item_discount`←Item Discount Amount.
- Quantities: sold cartons/pieces, free cartons/pieces, note(return) cartons/pieces.
- `roshen_item_code`←Reference No; `carton_to_piece_factor`←Item Carton Config.
- `transaction_type`←Doc Type (via value mapping, incl. **Debit Note**).

## 3. Calculation policy
| Field | Value |
|---|---|
| sales_value_basis | `excluding_vat_after_discount` |
| vat_handling | `value_excludes_vat` (use per-row `Vat Rate`) |
| discount_handling | `discount_already_deducted` (3 discount types stored, analysis only) |
| returns_handling | `returns_already_deducted` (negative rows) |
| sla_actual_basis | `net_sales_excluding_vat` (direct from Net Amount Excl Vat) |
| **SLA Actual** | **SUM(Net Amount Excl Vat) = 441,436.31 SAR** (May 2026) |

VAT excluded from SLA; `Net Amount With Vat Sar` stored for reconciliation only.

## 4. Value mapping suggestions
**Channel:** Discount Stores→**Discounter** (new, 783), Wholesale→WS (359),
Retail→Traditional Trade (221, or a dedicated "Retail" — confirm), blank→
UNKNOWN_CHANNEL (27).
**City:** Riyadh, Dammam, Khobar→Al Khobar, Jubail; 164 blanks (may infer from
Branch Name `tala dammam`→Dammam).
**Doc Type → txn_type:** Sales→sale; Good/Damaged/Expire returns→return (with
return_reason); Credit Note→credit_note; Debit Note→debit_note.

## 5. Validation issues
| Check | Result |
|---|---|
| Trailing total row | **excluded** (blank `Doc Id`, Net Excl Vat = 441,436.31 = Σ txn rows) |
| Gross−Discount = Net Excl Vat | 0 mismatches ✓ |
| City Name En blanks | **164** → UNKNOWN_CITY (infer from branch) |
| Channel Name blanks | **27** → UNKNOWN_CHANNEL |
| Reference No blanks | **3** → fall back to Item Id for SKU |
| Doc Date | 0 blank; Excel serial |
| Returns | negative rows by Doc Type → not double-counted |

## 6. Missing canonical fields
- `region` (no column; derive from city/branch), `unit_of_measure`,
  proper `invoice_status`, `credit_note_number` (Doc Id used), `barcode`,
  `brand`/`product_family` (catalog category/subcategory available).

## 7. Separate-profile confirmation
✅ Created as **agent-sample-03**, an independent profile/version with its own
mapping, value mapping, channel taxonomy, and calc policy. Does **not** reuse
agent-01 or agent-02.

## 8. Total-row exclusion confirmation
✅ The final total/summary row is **excluded** at import via the row filter
"import only when `Doc Id` is present". Without exclusion the SLA would double
(its Net Excl Vat equals the full transaction sum).

---

## Engine/schema updates (migrations — reviewable, not applied)
- `txn_type` enum gains **`debit_note`**.
- `sales_fact` gains `doc_discount`, `item_discount`, and `free_qty_cartons`.
- Row-filter convention (`row_filter.exclude_total_row`) documented for the
  import engine.

Confirmations: migrations **not applied**, no dashboards.
