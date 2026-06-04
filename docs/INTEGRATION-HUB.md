# VANTORA — Integration Hub

> Customer-onboarding data platform. **Additive** — reuses the existing
> entity-driven import engine, integration connectors, and `erp_import_jobs`
> audit; no new tables. Prepared `2026-06-04`.

## 0. Key finding (inspection result)
**9 of the 10 scope items already exist** in the codebase and in production:
- **Import Wizard** (`/settings/import`) — generic CSV/JSON + XLSX, entity-driven
  mapping → validate → preview → import (`import-wizard.tsx`, `parse-actions.ts`,
  `validateImport`/`runImport`, `RowIssue`).
- **Entity registry** (`src/lib/erp/entities.ts`) — `EntityDescriptor` (fields,
  types, `required`, `uniqueKey`, `dedupeKeys`) drives mapping/validation.
- **Connectors** (`/settings/integrations/{connections,api-keys,webhooks,sync}`)
  on `erp_integration_connections` / `erp_integration_api_keys` / `erp_webhooks`
  / sync_engine (all in production).
- **Data Onboarding** (`/settings/data-onboarding`) — entities + import history.
- **Audit** — `erp_import_jobs` (in production).

**The gap = unification + live monitoring.** This sprint adds a single **Data
Migration Center** with live import KPIs, and documents the remaining entity
gaps.

## 1. Architecture
```
File (CSV / XLSX / JSON)
  → parse (parse-actions.ts: XLSX server parse; import-parse: CSV)
  → column MAPPING (header → EntityDescriptor field)   [entities.ts]
  → VALIDATE (required/type/dedupe/unique, RLS tenant)  [validateImport]
  → PREVIEW (valid vs RowIssue errors)
  → IMPORT (upsert by uniqueKey, multi-tenant)          [runImport]
  → AUDIT (erp_import_jobs: mapping, status, rows, error_log)
Connectors (future): erp_integration_connections / api_keys / webhooks / sync_engine
Monitoring: erp_import_jobs → summarizeImportJobs() → Hub KPIs
```
All entity-driven: onboarding a new entity = add one `EntityDescriptor` (the
engine inherits mapping/validation/import/audit). Multi-tenant via RLS +
`company_id`; permission-gated per entity.

## 2. Screens
- **NEW — Integration Hub / Data Migration Center** (`/settings/integration-hub`):
  live import KPIs (jobs, success rate, failed, rows), area tiles (Import Wizard,
  Data Onboarding, Connections, API Keys, Webhooks, Sync), recent-imports audit
  list. Nav entry added (integrations group, `integrations.manage`).
- Reused: Import Wizard, Data Onboarding, Connections, API Keys, Webhooks, Sync.

## 3. Data flow
Upload → parse → map → validate (per-row) → preview (valid + errors) → import
(upsert, tenant-scoped) → `erp_import_jobs` row (status/rows/error_log) →
Hub monitoring. Large imports: server-side parse + batched insert; job row tracks
`total/success/failed_rows`.

## 4. Validation rules (entity-driven)
- **Required** fields (`f(..., {required:true})`), **types** (`email`, `number`,
  `ref` for FK-by-code/name), **dedupe** (`dedupeKeys` within file + vs existing),
  **uniqueKey** (upsert key; defaults `external_id`).
- **Tenant**: every write RLS-scoped + `company_id`; **permission** per entity
  (`EntityDescriptor.permission`).
- Per-row issues surfaced as `RowIssue` (row index + field + message).

## 5. Error handling
Validate step returns `RowIssue[]`; preview shows valid vs error rows; import is
**partial-safe** (`success_rows` / `failed_rows` recorded); `erp_import_jobs.error_log`
stores failures; the job `status` reflects outcome. No silent partial writes.

## 6. Import audit model — `erp_import_jobs` (production)
`id, company_id, target_entity, file_name, mapping (jsonb), status, total_rows,
success_rows, failed_rows, error_log, created_by, created_at, completed_at`.
Full lineage per import; surfaced on the Hub + Data Onboarding history.

## 7. Connector architecture (existing + future)
- **Today (in prod):** `erp_integration_connections` (external systems),
  `erp_integration_api_keys` (programmatic access), `erp_webhooks` (event push),
  sync_engine (sync logs).
- **Future API connectors:** register a connection (type=api) + credentials in
  api-keys; pull/push via the sync engine; map external → `EntityDescriptor`
  fields (reuse the import mapping layer).
- **Future DB connectors:** connection (type=db) + a read adapter feeding the
  same map→validate→import pipeline. No schema change — the connection framework
  + entity registry already model it.

## 8. Competitive analysis
| Product | Their import pattern | VANTORA |
| --- | --- | --- |
| **ERPNext** Data Import Tool | template download, map, dry-run, error rows | ✅ matched (template + map + validate + preview) |
| **Odoo** import | CSV/XLSX, column matching, test | ✅ matched |
| **SAP Business One** DTW | object templates, staged load | ◻ templates exist; staged via job audit |
| **Dynamics 365** data import | entity maps, error logs | ✅ entity maps + error_log |
| **Zoho** import | dedupe, field mapping | ✅ dedupeKeys + mapping |
| **Salesforce** Data Loader | upsert by external id | ✅ `uniqueKey=external_id` upsert |
| **QuickBooks** import | guided per-entity | ✅ Data Onboarding guided entities |

VANTORA matches the core import UX of these platforms and is **entity-driven**
(one descriptor onboards a new object) — an edge over hard-coded importers.

## 9. Gap analysis
**Scope items:** 9/10 already existed; **Integration Monitoring dashboard** was
the gap → **built** (Hub KPIs + recent audit).

**Entity coverage** (requested 10): importable today via the registry —
**Customers ✅, Products ✅, Invoices ✅, Salesmen (users) ✅, Routes ✅**.
**Gaps (need an `EntityDescriptor` + FK-`ref` resolution; tables already exist,
no new tables):**
- **Invoice Lines** (`erp_invoice_lines`) — child-of-invoice; needs parent `ref`.
- **Collections / Payments** (`erp_payments`) — needs `invoice_ref`.
- **Stock** (`erp_inventory_stock`) — opening balances; needs `warehouse_ref` + `product_ref`.
- **Warehouses** (`erp_warehouses`) — needs `branch_ref` (NOT-NULL `branch_id`).
- **Sales Returns** (`erp_sales_returns`) — needs `customer_ref` + `invoice_ref`.

These were **deliberately not added blind** (the engine's `ref` resolution
currently supports region/branch; extending it to product/invoice/customer/
warehouse refs is the safe follow-up). No unsafe descriptors shipped.

## 10. ROI assessment
- **Faster customer go-live:** self-serve entity import (customers/products/
  routes/users today) cuts manual onboarding from days to hours.
- **Lower data-entry cost & errors:** validation + dedupe + preview prevent bad data.
- **Extensible:** the connection framework + entity registry make future API/DB
  connectors additive (no re-architecture).
- **Effort to close entity gaps:** ~small (5 descriptors + `ref` resolution
  extension) — high leverage for FMCG onboarding (stock opening balances,
  warehouses/vans, returns).

## Validation
`tsc` · `vitest` (import-monitor suite + i18n parity + keys-usage) · `next build` — see PR.

*Additive; reuses existing engine/connectors/audit; no new tables, no production
data change, no AI.*
