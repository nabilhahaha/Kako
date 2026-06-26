# Column Mapping Engine + Sales Calculation Policy (design)

Each agent/distributor may deliver Excel/CSV in a **different layout and with
different value semantics**. The platform therefore uses a flexible,
**versioned** mapping engine: per-agent column mapping, value mapping, and a
**per-version sales calculation policy** so net sales is never a single
hardcoded rule. Migrations are updated but **not applied**.

---

## 1. Tables (in `0001_foundation_schema.sql`)

| Table | Role |
|---|---|
| `column_mapping_profile` | One logical mapping per agent; `is_default` (partial unique → one default/agent); points to `current_version_id` |
| `column_mapping_version` | Immutable versions: `source_headers`, `field_mapping`, value snapshot, **calculation policy**, `version_number`, `status`, author/timestamps |
| `value_mapping` | Source-value → canonical rules (`channel/city/return_reason/salesman/customer/item`); `agent_id NULL` = company-wide fallback |
| `import_batch.mapping_version_id` | The exact version used for that import (+ `resolved_field_mapping`, `resolved_value_mapping`, `calculation_policy` snapshots) |
| `import_issue` | Validation issues for the preview/review step (error/warning/info, code, field, row, message, raw_value) |
| `raw_import_row` | Original row as `jsonb` + date-parse annotations (`raw_invoice_date`, `normalized_invoice_date`, `date_parse_confidence`, `date_parse_error`) |

Versioned-edit safety: editing a mapping **creates a new version** and repoints
`current_version_id`. Existing `import_batch` rows keep the
`mapping_version_id` they were imported with — **old imports are never mutated**.
Re-processing a historical batch is an explicit action that stamps a new
version onto a new batch (the old one becomes `superseded`).

---

## 2. Upload & reuse flow

1. **First upload (per agent):** pick agent + reporting month → upload → system
   reads headers + previews sample rows → user maps each source column to a
   canonical field → validate required → save as the agent's **default**
   mapping (`version_number = 1`).
2. **Reuse:** subsequent uploads auto-load the default version; if headers match
   (or are similar) fields auto-map. User reviews/confirms before import.
3. **Edit anytime:** changes create a new version; apply to **future** imports
   only, unless the user explicitly reprocesses an old batch.
4. **History:** every version is retained (`version_number`, author, timestamps,
   `status`).

---

## 3. Canonical target fields

Required (14): `customer_name, customer_code, city, channel, invoice_number,
invoice_date, item_name, item_code, roshen_item_code, sales_value_excluding_vat,
sales_qty_cartons, sales_qty_pieces, returns_value, cash_discount`.

Optional: `salesman_name, route_number, return_reason, agent_name, agent_code,
branch_name, branch_code, region, area, transaction_type,
gross_value_before_discount, net_value_after_discount, vat_amount,
return_qty_cartons, return_qty_pieces, credit_note_number, reporting_month,
invoice_status, unit_of_measure, carton_to_piece_conversion, barcode,
item_category, brand, product_family`.

(Full type/target table in `RAW-DATA-IMPORT-SPEC.md`.)

---

## 4. Value mapping

`value_mapping` normalizes differing source values to one canonical value per
dimension. Resolution order: agent-specific rule → company-wide fallback →
exact match against the dimension table → otherwise flag `UNKNOWN_*`.

| Dimension | Source examples | Canonical target |
|---|---|---|
| `channel` | TT, Traditional, Traditional Trade, GT | `channel_id` |
| `channel` | MT, Modern, Modern Trade | `channel_id` |
| `city` | Jeddah, JED, جدة | `city_id` |
| `return_reason` | Expired, EXP, منتهي | `canonical_text` |
| `salesman` | free text variants | `canonical_text` (or future salesman dim) |
| `customer` | code/name variants | `customer` master |
| `item` | local SKU variants | `roshen_item_code` master |

---

## 5. Sales calculation policy (per mapping version)

Because agents express value differently (before/after discount, incl/excl VAT,
returns pre-deducted…), each version carries a policy. Columns on
`column_mapping_version`:

| Policy field | Options | MVP default |
|---|---|---|
| `sales_value_basis` | gross_before_discount · net_after_discount · excluding_vat_before_discount · excluding_vat_after_discount | `excluding_vat_before_discount` |
| `vat_handling` | value_excludes_vat · value_includes_vat (uses `vat_rate`) | `value_excludes_vat` |
| `discount_handling` | discount_already_deducted · subtract_cash_discount · ignore_discount_for_sla | `subtract_cash_discount` |
| `returns_handling` | returns_already_deducted · subtract_returns_value · store_returns_only | `subtract_returns_value` |
| `sla_actual_basis` | sales_value_excluding_vat · net_sales_excluding_vat · gross_sales_excluding_vat · custom_formula_later | `net_sales_excluding_vat` |

**Resolution at import (per row), stored on `sales_fact`:**
1. **VAT →** if `value_includes_vat`: `ex_vat = source_sales_value / (1 + vat_rate)`;
   else `ex_vat = source_sales_value` (or `sales_value_excl_vat` if supplied).
2. **gross_sales_ex_vat** = ex-VAT value normalized to *before discount*: if the
   basis is an *after_discount* one and the discount is known, add it back;
   otherwise use ex_vat as gross.
3. **net_sales_ex_vat** = `gross_sales_ex_vat`
   − (`cash_discount` only if `subtract_cash_discount`)
   − (`returns_value` only if `subtract_returns_value`).
   `*_already_deducted` / `ignore_*` / `store_returns_only` mean **do not
   subtract again** → prevents double deduction.
4. **sla_actual_value** = the column named by `sla_actual_basis`
   (`sales_value_excl_vat` | `gross_sales_ex_vat` | `net_sales_ex_vat`).
5. Persist `gross_sales_ex_vat`, `net_sales_ex_vat`, `sla_actual_value`, the
   original source values, `returns_value`, `cash_discount`, and the
   `calculation_policy_used` snapshot.

MVP default reproduces: **SLA Actual = Sales Value Excl VAT − Returns − Cash
Discount**, but each agent can deviate safely.

The SLA views simply `sum(sla_actual_value)` — no per-agent logic leaks into
reporting.

---

## 6. Date normalization

Stored per row: `raw_invoice_date` (original), `normalized_invoice_date`
(YYYY-MM-DD), `date_parse_confidence` (0–100), `date_parse_error`; detected
format on the batch (`import_batch.detected_date_format`). Format is detected on
mapping and **confirmed/overridden** (stored in `field_mapping.invoice_date.format`)
so ambiguous DMY/MDY values are never silently guessed. Unparseable rows are
flagged and excluded from `sales_fact` while the original is retained.

---

## 7. Import safety — preview/review before commit

The review step (status `previewed`/`validated`) surfaces, from `import_issue`
+ `raw_import_row`:
- mapped columns and **unmapped required fields**
- validation errors and warnings
- **duplicate invoice** risks (`invoice_number + roshen_item_code`)
- date parsing errors and low-confidence parses
- **channel/city values needing mapping** (`UNKNOWN_CHANNEL` / `UNKNOWN_CITY`)
- the resolved calculation policy + a sample of computed `sla_actual_value`

The user must confirm before commit to `sales_fact`.

---

## 8. Audit & rollback

Every import retains: original file (`storage_path` + `file_checksum`), original
rows (`raw_import_row.raw` jsonb), `mapping_version_id`, `calculation_policy`,
`uploaded_by`, `created_at`, `agent_id`, `period_month`, `status`. Users can:
**cancel** a pending import (`status=cancelled`), **supersede/re-upload** the
same agent+month (old → `superseded`, enforced by the partial unique index),
**view batch history**, and **reprocess** a batch under a new mapping version
(new batch, old one superseded — originals untouched).

---

## 9. RLS (in `0002_rls_policies.sql`)

Mapping profile/version and value mapping are readable for agents within the
user's area scope (global roles see all; value mapping also exposes company-wide
`agent_id IS NULL` rules); writes are global / service-role. `import_issue`
visibility follows its batch. Area managers still cannot see other areas.
