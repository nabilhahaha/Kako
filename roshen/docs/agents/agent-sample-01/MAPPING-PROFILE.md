# Agent Sample 01 — Default Mapping Profile (verified)

> **Verified against** `Row_Data_up_To_March.xlsx`, sheet `Row Data`,
> **81,273 rows**, **Jul 2025 → Mar 2026**. The file is not committed (~31 MB,
> contains customer data). Calculation policy is **LOCKED** per approval.

Artifacts: `field-mapping.json` (mapping + locked policy + dedupe),
`value-mapping.json` (channel/depot/class), `../../scripts/preview-import.mjs`.

---

## Locked calculation policy
| Field | Value |
|---|---|
| sales_value_basis | `excluding_vat_after_discount` |
| vat_handling | `value_excludes_vat` (rate 0.15) |
| discount_handling | `discount_already_deducted` — store for analysis only, never subtract |
| returns_handling | `returns_already_deducted` (return rows are negative) |
| sla_actual_basis | `sales_value_excluding_vat` |
| **SLA Actual** | **SUM(Invoice Amount ex Vat) = 23,106,476.70 SAR** (Jul’25–Mar’26) |

VAT stored separately (excluded from SLA); Net Amount stored as
`net_value_reported` for reconciliation only.

## Line-level dedupe rule
Primary key = `Invoice` + `LineID` + `Item Id`(roshen_item_code) + `Invoice Date`.
(`Invoice_Key` is invoice-level — 12,774 = unique invoices — so not used alone.)
Fallback when `LineID` is absent: hash of `invoice_number + invoice_date +
customer_code + item_code + quantity + sales_value_excluding_vat`.

---

## 1. Depot → Region / Area suggestions
Region is its own column (6 values) and **depot↔region is many-to-many** (rows
in a depot can carry different regions). Suggested hierarchy: **Region → Area =
Depot → Branch = Depot** (depots are city-level branches). Dominant region per
depot (for seeding area→region):

| Depot (City / Area) | Dominant Region | Rows |
|---|---|---|
| Jeddah | Western | 22,588 |
| Khamis Mushait | South | 14,494 |
| Riyadh | Central | 7,904 |
| Sakaka | North | 6,879 |
| Taif | Western | 5,487 |
| Makkah | Western | 4,415 |
| Madinah | Northwestern | 3,480 |
| Al Baha | South | 3,328 |
| Najran | South | 2,925 |
| Jazan | South | 2,343 |
| Yanbu | Western* | 2,897 |
| Hail | North | 2,250 |
| Tabuk | Northwestern | 1,323 |
| MT (non-geo) | Western | 645 |
| BTB (non-geo) | Western | 297 |
| Al Khobar | Eastern | 18 |

\* Yanbu skews Western (1,947) over Northwestern (950) in the data — confirm
desired region. **BTB / MT are non-geographic depots** → need a real
city/area assignment or an "Other" bucket.

## 2. Monthly sales breakdown (SUM ex-VAT, SAR)
| Month | SLA Actual |
|---|---|
| 2025-07 | 424,652.25 |
| 2025-08 | 803,937.27 |
| 2025-09 | 1,142,054.47 |
| 2025-10 | 1,626,062.29 |
| 2025-11 | 2,083,966.93 |
| 2025-12 | 2,122,367.22 |
| 2026-01 | 4,857,519.49 |
| 2026-02 | 5,627,002.08 |
| 2026-03 | 4,418,914.70 |
| **Total** | **23,106,476.70** |

## 3. Channel value mapping
| Source value | Canonical | Rows | Note |
|---|---|---|---|
| TRADITIONAL TRADE | TT | 79,828 | existing |
| MODERN TRADE | MT | 645 | existing |
| E-commerce | ECOM | 416 | **new channel** |
| INTERNAL SALES | INT | 378 | **new channel** |
| BUSINESS TO BUSINESS | B2B | 6 | **new** (or fold into Wholesale — confirm) |

→ Action: create channels ECOM, INT, B2B (configurable) or fold per your call.

## 4. Return rows & return-value logic
- `IsReturn = Yes`: **2,058 rows**, sum ex-VAT = **−1,765,701.05 SAR**.
- Sale rows ex-VAT = 24,872,177.75; grand total = **23,106,476.70** (returns
  already netted).
- **Return value (analysis)** = ABS(negative return ex-VAT) = **1,765,701.05**.
- Since rows are negative and `returns_handling = returns_already_deducted`,
  SLA is **not** reduced twice.
- Edge cases to flag: **2 rows** negative ex-VAT but `IsReturn ≠ Yes`; **22**
  `IsReturn=Yes` rows that are non-negative → `RETURN_SIGN_MISMATCH` warning.

## 5. Final mapping profile JSON
See `field-mapping.json` (locked policy + dedupe) and `value-mapping.json`
(finalized channel/depot/class values).

## 6. Validation summary
| Check | Result |
|---|---|
| Blank `Invoice Amount ex Vat` | **200 rows** (also blank qty/net) → `MISSING_REQUIRED`; treat as 0 / exclude from SLA (no impact) |
| Date parse (Excel serial) | 0 blanks; all parse to YYYY-MM-DD |
| Channel resolvable | 100% (after adding ECOM/INT/B2B) |
| Depot→city resolvable | 14 cities OK; **BTB, MT** need assignment |
| Net = ex-VAT + VAT | **100%** match → consistent |
| Gross − Discount = ex-VAT | 99.96% (31 exceptions — see item 7) |
| Return sign consistency | 24 edge rows flagged |
| Line duplicates | key = Invoice+LineID+Item+Date |
| Invoice status | all `Invoice` (all posted) |

## 7. The 0.04% discount-mismatch rows
**31 rows** where `Gross Sales − Total Line Discount ≠ Invoice Amount ex Vat`
(all |diff| > 1 SAR, e.g. INV-2025-063053 ROS41817: gross 10,280.77, disc 1,188,
ex 13,662). The anomaly is in the **`Gross Sales`** source column (gross < ex-VAT,
which is impossible) — a source data-quality issue, **not** an SLA problem:
SLA uses `Invoice Amount ex Vat` directly and never subtracts discount, so these
rows are correct for SLA. → Recommend a `GROSS_DISCOUNT_RECONCILE` **warning**
(non-blocking) so they’re visible for cleanup, with no effect on SLA actuals.

---

## Ready to become the first agent mapping template?
**Yes.** Layout, policy, dedupe, channel/depot/class maps, and validation are all
verified against real data. Remaining confirmations (non-blocking):
1. Create channels **ECOM / INT / B2B** (or fold B2B→Wholesale)?
2. Assign **BTB / MT** depots to a real city/area (or "Other")?
3. **Yanbu** region: Western (data-dominant) or Northwestern (geographic)?

Still: migrations not applied, no dashboards.
