# Agent Sample 02 — Default Mapping Profile (verified)

> **Separate profile** from agent-sample-01 (different layout — does NOT reuse
> agent-01's mapping). Verified against `Roshen_May_.xlsx`, sheet `Sheet1`,
> **2,996 rows**, **2026-05-02 → 2026-05-09**. File not committed (contains
> customer data).

Artifacts: `field-mapping.json`, `value-mapping.json`.

---

## 1. Profile summary
- 49 columns; **returns are split** into Good / Expiry / Damaged (qty + value),
  not negative rows.
- **`NetSalseValue` is provided directly** and already nets returns:
  `NetSalseValue ≈ GrossValue − GoodReturnValue − DamageReturnValue −
  ExpiryReturnValue` (verified: only **8/2,996** rounding-edge rows; ΣNet
  513,648.64 vs Σ(Gross−returns) 513,615.84).
- **Real Roshen master SKU** present (`ItemRefNo`) — unlike agent-01.
- Two date columns: `InvoiceDateInt` (YYYYMMDD int) and `DocDate` (Excel serial).
- 1,729 invoices · 1,500 customers · 73 items · 15 city/branches.

## 2. Mapping JSON
See `field-mapping.json`. Notable choices:
- `city`/`branch_name` ← **BranchDescLan1**; `branch_code` ← BranchRefNo.
- `roshen_item_code` ← **ItemRefNo** (true master SKU); `item_code` ← ItemID.
- `net_sales_ex_vat` ← **NetSalseValue** (typo preserved exactly), used directly.
- `gross_sales_ex_vat` ← GrossValue.
- **Split returns** mapped to new columns: `return_qty_good/expiry/damage`,
  `return_value_good/expiry/damage`; `returns_value` = their sum (comparability).
- `cash_discount` ← Discount (store only); `vat_amount` ← SalseItemTaxVal.
- Extras kept in raw: AreaManager*, Supervisor*, PaymentMethod, ItemStatus,
  ItemCategory1/2, Return*Tax/WihTax, RouteName, SalesmanCode.

## 3. Calculation policy
| Field | Value |
|---|---|
| sales_value_basis | `net_after_returns_excluding_vat` |
| vat_handling | `value_excludes_vat` (0.15) |
| discount_handling | `store_only` |
| returns_handling | `returns_already_deducted` |
| sla_actual_basis | `net_sales_excluding_vat` (direct from NetSalseValue) |
| **SLA Actual** | **SUM(NetSalseValue) = 513,648.64 SAR** (May 2026) |

VAT excluded from SLA; `InvoiceAmountWihTax` stored for reconciliation only.

## 4. Value mapping suggestions
**Channel** (this agent → canonical):
| Source | Canonical | Rows |
|---|---|---|
| DSD-Cash Van | Cash Van (CVAN, **new**) | 2,364 |
| DRD-TRADING | Traditional Trade (TT) | 564 |
| DSD-GFF | Internal / GFF (**new**) | 34 |
| DSD-Key Account | Key Account (or MT) | 23 |
| DSD-Wholesale | Wholesale (WS) | 11 |

→ Agent-01 and Agent-02 use **different channel taxonomies**; value mapping
normalizes both. Recommend defining one **master canonical channel list**
(e.g. TT, MT, WS, HoReCa, E-commerce, Internal/GFF, Cash Van, Key Account, B2B)
and mapping each agent's strings into it.

**City** ← BranchDescLan1 (RIYADH→Riyadh, JIZAN→Jazan, HASA→Al Ahsa, KHAMIS→
Khamis Mushait, etc. — full table in `value-mapping.json`).

## 5. Validation issues
| Check | Result |
|---|---|
| NetSalseValue vs Gross−returns | 8/2,996 rounding-edge → `RETURN_RECONCILE` warning |
| Date (InvoiceDateInt YYYYMMDD + DocDate serial) | both parse; primary=InvoiceDateInt |
| Region | **no Region column** → derive from branch→region map / AreaManager |
| Channel resolvable | needs new canonicals (Cash Van, GFF, Key Account) |
| roshen_item_code | present (ItemRefNo) ✓ |
| invoice_status | none (ItemStatus is item-level) → treat all posted |
| Expired items | 274 rows (ItemStatus=Expired) — near-expiry signal |

## 6. Missing canonical fields (vs template)
- `region` (derive), `unit_of_measure`, `sales_qty_cartons` (pieces only),
  proper `invoice_status`, `credit_note_number`, `barcode`, `brand`/
  `product_family` (ItemCategory1/2 could supply these).

## 7. Separate-profile confirmation
✅ Created as **agent-sample-02**, an independent `column_mapping_profile` /
version with its **own field mapping, value mapping, and calculation policy**.
It does **not** reuse agent-01's mapping. The engine selects the profile by
agent at upload, so each agent keeps its own layout, channel taxonomy, SLA
basis, and date handling.

---

## Engine updates made for this file (migrations — reviewable, not applied)
1. **Multiple date sources** — `invoice_date` supports `source` + `fallback`
   with per-source `format` (`yyyymmdd_int`, `excel_serial_date`); both raw
   values preserved in `raw_import_row`, normalized to `invoice_date`.
2. **Agent-specific SLA basis** — already per-version; added enum
   `net_after_returns_excluding_vat` and `discount_handling = store_only`.
3. **Agent-specific channel mapping** — per-agent `value_mapping` rows.
4. **BranchDescLan1 as branch/city source** — mapped.
5/6. **Split returns** — added `return_qty_good/expiry/damage` and
   `return_value_good/expiry/damage` to `sales_fact`.
7. **Exact `NetSalseValue` spelling** preserved as the source alias.

Confirmations: migrations **not applied**, no dashboards.
