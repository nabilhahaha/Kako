# VANTORA — Import Engine Extension

> Production-grade onboarding for transactional / child entities. **Additive** —
> extends the existing entity-driven Import Engine (`entities.ts` registry +
> `validateImport`/`runImport`); **no new tables, no production data change, no AI.**
> Prepared `2026-06-04`.

## 0. Goal

Close the entity-coverage gap identified in the Integration Hub sprint by enabling
production imports for the five high-leverage FMCG onboarding entities:

| # | Entity | Table | Why it matters |
| - | --- | --- | --- |
| 1 | **Invoice Lines** | `erp_invoice_lines` | Migrate historical sales detail (per-product) |
| 2 | **Collections** | `erp_payments` | Open AR / payment history against invoices |
| 3 | **Opening Stock** | `erp_inventory_stock` | Go-live warehouse + van balances |
| 4 | **Warehouses / Vans** | `erp_warehouses` | Physical + mobile stock locations |
| 5 | **Sales Returns** | `erp_sales_returns` | Historical returns / credit notes |

All five are **child / transactional** records that reference master data
(invoices, products, customers, branches, warehouses) by a human code or number —
so the engine had to learn **foreign-key (referential) resolution** before it
could safely write them. That is the core of this extension.

## 1. What was missing (engine gap)

The registry already declared a `ref` field *type*, but the engine never resolved
it — a `*_ref` value was copied to the payload raw, so any FK-bearing entity
failed on insert. Additionally, `runImport` unconditionally stamped
`import_job_id` / `created_by` / `custom`, which **do not exist** on these child
tables (verified against production). Writing them would abort every insert.

This extension adds:
1. **FK resolution** — declarative `ref` spec (`{ table, match[], column }`) +
   a batched resolver that turns codes/numbers into ids.
2. **Referential-integrity validation** — a provided ref that doesn't resolve is a
   blocking error (`"Invoice \"INV-9\" not found"`), reported per row.
3. **Column-aware stamping** — each descriptor declares the audit columns its
   table actually has (`stamps`); the engine only writes those.
4. **Dependency ordering** — `dependsOn` metadata + a topological sort so parents
   import before children.
5. **Large-file safety** — distinct-value collection + chunked `IN (...)` lookups.

## 2. Patterns researched (and what we adopted)

| Platform | Their FK-import pattern | Adopted in VANTORA |
| --- | --- | --- |
| **ERPNext** Data Import | "Link" fields resolved by name/ID; dependency-ordered doctype imports; dry-run with error rows | `ref` resolution by business key; `dependsOn` order; validate-then-preview |
| **Odoo** import | External IDs (`__export__`) + relational lookup by name; "Test import" before commit | match on `external_id` **or** natural key (`code`/`barcode`/`invoice_number`); server re-validate before write |
| **SAP Business One** DTW | Object templates; parent objects loaded before child documents; staged load | recommended import order (masters → documents); per-job audit as the staging record |
| **Dynamics 365** Data Import | Entity maps + **alternate keys** for upsert; per-row error log | `uniqueKey` upsert + multi-column `match[]` (alternate keys); `error_log` on `erp_import_jobs` |
| **Salesforce** Data Loader | Upsert by external id; relationship fields via external id | `uniqueKey = external_id`/natural key upsert; refs resolvable via `external_id` |

**Net design:** resolve a foreign key by **any** of several business identifiers
(`match: ['code','barcode','external_id']`), batch the lookups, and fail the row
(not the whole file) when a required ref is unresolved.

## 3. Architecture

```
File (CSV / XLSX / JSON)
  → MAPPING (header → EntityDescriptor field)              [entities.ts]
  → buildRefMaps()  distinct *_ref values → batched IN()   [actions.ts]
                    per ref field × match column, chunked   (RLS-scoped)
  → VALIDATE (validateCore): required / type / dedupe
                    + referential integrity (unresolved ref = error)
  → PREVIEW (valid vs RowIssue errors)
  → IMPORT (runImport): strip *_ref → merge resolved FK columns
                    + column-aware stamping (entityStamps)
                    + upsert by uniqueKey (mode)
  → AUDIT (erp_import_jobs: mapping, status, rows, error_log)
```

### 3.1 FK resolution (`src/lib/erp/import-refs.ts` — pure)
- `RefSpec { table, match[], column }` — declared per field on the descriptor.
- `collectRefValues(rows, refFields)` / `resolveRowRefs(row, refFields, maps)` —
  pure helpers (fully unit-tested) that map a row's ref values to FK columns and
  report unresolved ones. No I/O — the server action owns the DB queries.

### 3.2 Batched lookups (`buildRefMaps` in `actions.ts`)
For each ref field: collect the **distinct, non-empty** values across the whole
file, then query the target table in **chunks of 400** over each `match` column,
building a `loweredValue → id` map. One round of small queries regardless of file
size — safe for large imports. A missing/optional match column is skipped, not
fatal.

### 3.3 Column-aware stamping (`entityStamps`)
Legacy master-data entities (no `stamps`) keep the full audit set
(`import_job_id`, `created_by`, `updated_by`, `updated_at`, `custom`). The five
new child tables declare exactly what they have — e.g. `erp_invoice_lines` has
none (`stamps: {}`), `erp_warehouses` has only `updated_at`, `erp_sales_returns`
has `created_by` + `updated_at`. The engine never targets a non-existent column.

### 3.4 Dependency ordering (`orderEntitiesByDependency`)
`dependsOn` on each descriptor encodes the FK graph
(`invoice_line → [invoice, product]`, `stock → [warehouse, product]`,
`warehouse → [branch]`, …). A stable topological sort yields a **recommended
import order** (masters before documents) so refs resolve. Cycles and
out-of-set deps degrade gracefully.

## 4. The five descriptors (FK + required + audit)

| Entity | Required fields | Refs (`*_ref → column`) | uniqueKey | Stamps |
| --- | --- | --- | --- | --- |
| **warehouse** | branch_ref, code, name | branch_ref→branch_id (`erp_branches`.code/external_id) | code | updated_at |
| **stock** | warehouse_ref, product_ref, quantity | warehouse_ref→warehouse_id; product_ref→product_id | — (insert) | updated_at |
| **collection** | invoice_ref, amount | invoice_ref→invoice_id (`erp_invoices`.invoice_number/external_id) | — (insert) | none |
| **sales_return** | branch_ref, customer_ref, return_number | branch_ref→branch_id; customer_ref→customer_id; invoice_ref→invoice_id *(optional)* | return_number | created_by, updated_at |
| **invoice_line** | invoice_ref, product_ref, quantity, unit_price | invoice_ref→invoice_id; product_ref→product_id | — (insert) | none |

Required flags match each table's NOT-NULL-without-default columns (verified in
production); columns with DB defaults (e.g. `payment_date`, `status`,
`total_amount`, `reserved_qty`, `is_van`) are optional.

## 5. Validation & error reporting
- **Required / type** (number, date, email) — unchanged engine rules.
- **Referential integrity** — a non-empty ref that doesn't resolve → blocking
  `error` (`"<Label> \"<value>\" not found"`). An empty required ref is caught by
  the standard required-field check.
- **Dedupe within file** — `dedupeKeys` (e.g. stock on `warehouse_ref+product_ref`,
  returns on `return_number`) flag duplicates as warnings.
- **Partial-safe import** — error rows are skipped; the rest import. Every row
  failure (validation or DB) lands in `erp_import_jobs.error_log`; the job records
  `success_rows` / `failed_rows` / `status`.

## 6. Modes & matching
`insert` / `update` / `upsert` / `skip`, matched by the entity `uniqueKey`
(alternate-key style). Entities without a natural unique key (stock, collection,
invoice_line) are **insert-oriented** (opening balances / historical detail);
in-file dedupe still guards against accidental double rows.

## 7. Large-file handling
- Distinct-value collection means N rows → at most `ceil(distinct/400)` lookup
  queries **per ref column**, not per row.
- Server-side parse (XLSX/CSV) + per-row write loop with per-row error capture.
- The job row is created first (status `importing`) so progress/outcome is
  auditable even for big files.

## 8. Boolean coercion
`type:'boolean'` cells (e.g. `warehouse.is_van`) accept `true/false/1/0/yes/no/
y/n/t/f` and Arabic `نعم/لا/صح/خطأ/مفعل/معطل`; blanks/unknowns keep the column
default rather than being forced.

## 9. Safety / constraints honoured
- **No new tables**, no schema change — all five tables exist in production.
- **No production data change** in this sprint (engine code only).
- **RLS-scoped** — every lookup and write goes through the tenant client;
  `integrations.manage` gates the engine.
- **No regression** — legacy entities have `stamps` undefined (full audit set) and
  their non-spec `type:'ref'` fields keep raw-copy behaviour; only fields that
  declare a `ref` spec are resolved/stripped.
- **No AI, no dashboards, no unrelated features.**

## 10. Tests
- `import-refs.test.ts` — pure FK resolution (collect, resolve, missing, optional).
- `entities-import.test.ts` — the five descriptors (refs, required, uniqueKey,
  dedupe), `entityStamps` (new vs legacy), and `orderEntitiesByDependency`.
- Plus i18n parity + keys-usage and the existing engine/monitor suites.

## Validation
`tsc` · `vitest` · `next build` — see PR.

*Additive; reuses the existing engine/registry/audit; no new tables, no production
data change, no AI.*
