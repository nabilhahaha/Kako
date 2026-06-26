# Import Compatibility Rules (format-agnostic engine)

> **This engine is not tied to one fixed template.** Any agent/distributor can
> upload any Excel/CSV structure. The system reads the headers, previews rows,
> and maps source columns to Roshen canonical fields. The mapping is **saved per
> agent** and **reused automatically** on future uploads. If an agent changes
> their file format later, a **new mapping version** is created **without
> affecting historical imports**. Support is delivered through: saved mapping
> profiles, mapping versions, value mapping, validation, and per-version
> calculation policies.

The three sample agents (agent-01 line/negative-returns, agent-02
split-returns + direct NetSalseValue, agent-03 Doc-Type rows + total row) are
**examples**, not the contract. The rules below define compatibility for **any**
file.

---

## 1. Field tiers

### Required — needed for a successful SLA import (missing → **blocks commit**)
| Canonical | Accepted alternatives |
|---|---|
| `invoice_number` | — |
| `invoice_date` | any supported format (see §6) |
| customer | `customer_code` **or** `customer_name` |
| item | `item_code` **or** `item_name` |
| sales value | `sales_value_excluding_vat` **or** `net_sales_excluding_vat` |
| location/segment | `channel` **or** `branch`/`city` |
| quantity | `sales_qty_pieces` or `sales_qty_cartons` *(if available in the file)* |

> A required field is satisfied if **any** of its alternatives is mapped and
> non-empty. Quantity is required **only when the file provides a quantity
> column**; value-only files still import.

### Recommended — import allowed, missing → **warning**
`customer_code`, `customer_name`, `city`, `channel`, `salesman_name`,
`route_number`, `roshen_item_code`, `item_name`, `returns_value`,
`cash_discount`, `vat_amount`, `branch`, `agent/distributor`.

### Optional enrichment — missing → **no issue**
`supervisor`, `area_manager`, `payment_method`, `invoice_status`,
`item_category`, `brand`/`product_family`, `barcode`, `free_quantity`,
`return_reason`, `return_type`, `document_type`.

---

## 2. Import behavior
- **Required missing** → commit **blocked**; validation errors listed in the
  preview (`import_issue`, severity `error`).
- **Recommended missing** → import **allowed** with **warnings**.
- **Optional missing** → import proceeds, **no issue**.
- Original rows are **always** preserved verbatim in `raw_import_row.raw` (jsonb).
- The **mapping version** and **calculation policy** used are **always** stored
  on the batch (`mapping_version_id`, `calculation_policy`).
- A **preview** is **always** shown before commit (mapped columns, unmapped
  required, errors, warnings, duplicate-invoice risks, date errors, channel/city
  values needing mapping, sample resolved `sla_actual_value`).

---

## 3. Calculation flexibility (per mapping version — never hardcoded)
`sla_actual_value` is resolved per row at import from the version's policy
(`sales_value_basis`, `vat_handling`, `discount_handling`, `returns_handling`,
`sla_actual_basis`). Reporting just sums `sla_actual_value`. Verified examples:

| Agent | SLA Actual | Basis |
|---|---|---|
| Agent 1 | SUM(Invoice Amount ex Vat) | `sales_value_excluding_vat` |
| Agent 2 | SUM(NetSalseValue) | `net_sales_excluding_vat` (direct) |
| Agent 3 | SUM(Net Amount Excl Vat) | `net_sales_excluding_vat` (direct) |

VAT is always stored separately and excluded from SLA. Discounts are stored for
analysis; subtracted only when the policy says so (no double-deduction).

---

## 4. Date flexibility
Supported input formats, all normalized to **`YYYY-MM-DD`**:
`excel_serial_date`, `yyyymmdd_int` (20260502), `DD/MM/YYYY`, `MM/DD/YYYY`,
`YYYY-MM-DD`, `DD-Mon-YYYY`, and best-effort text dates. Multiple date sources
allowed (primary + fallback). Per row we store `raw_invoice_date`,
`normalized_invoice_date`, `date_parse_confidence`, `date_parse_error`.
**Low-confidence or unparseable dates are flagged** and excluded from
`sales_fact` (original retained); ambiguous DMY/MDY is resolved by the
**confirmed batch format**, never silently guessed.

---

## 5. Value mapping flexibility
Source values are normalized to canonical values via `value_mapping`, with
**agent-specific** rules and a **company-wide** fallback (`agent_id IS NULL`),
for: `channel`, `city`/`branch`, `item`/`SKU`, `customer`, `salesman`,
`return_reason`, `document_type`. Unmapped values are flagged
(`UNKNOWN_CHANNEL`, `UNKNOWN_CITY`, …) in the preview so they can be mapped
before commit.

---

## 6. Row filters
A mapping may declare a `row_filter` (e.g. exclude trailing total/summary rows —
"import only when `invoice_number` present") so aggregates aren't
double-counted (see agent-03 Tala).

---

## What blocks import vs. warns (quick reference)
| Situation | Result |
|---|---|
| Any **required** tier field unmapped/empty | **BLOCK** |
| Date unparseable / low confidence on a row | row flagged & excluded (batch can still commit) |
| Unknown channel/city value | **warning** (map before commit recommended) |
| **Recommended** field missing | **warning** |
| **Optional** field missing | no issue |
| Trailing total/summary row | excluded by `row_filter` |
| Duplicate invoice line | **warning** |

The engine adapts to each agent's reality through saved profiles + versions +
value mapping + validation + calculation policy — no fixed template required.
