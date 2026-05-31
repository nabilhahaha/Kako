# VANTORA Business OS — Data Integration Layer

> A reusable, company-scoped platform capability — **not** a per-industry
> feature. It must work for any business type and any module.

This document is the architecture + roadmap for VANTORA's data integration:
**Excel/CSV import** (the commercial priority — customers migrating old data)
and **external system integration** (REST API, webhooks, sync). It records what
is **built**, what is a **safe placeholder**, and what is **planned**, so nothing
is over-claimed.

Status legend: ✅ built · 🟡 placeholder (UI/coming-soon, no live processing) ·
🔜 planned (schema/design only).

---

## 1. Overview & principles

- **Multi-tenant & RLS-first.** Every import job, mapping template, integration,
  API key, webhook, and log row is `company_id`-scoped and RLS-enforced. One
  company can never read or write another's data — same invariant as the rest of
  the platform (see `ARCHITECTURE.md` §2).
- **Permission-gated.** A new capability `integrations.manage` controls access to
  the whole area (data import, templates, integrations, API keys, webhooks, logs).
- **Generic / entity-based — the core rule.** The engine is built **around
  entities, NOT business types.** There is no retail-specific, clinic-specific,
  or FMCG-specific integration. One engine serves retail, FMCG, clinics,
  manufacturing, warehouses, services, distribution, and corporate alike. Import
  targets and integration objects are declared in a registry keyed by a neutral
  `entity` string — e.g. `customer`, `supplier`, `product`, `service`,
  `employee`, `asset`, `invoice`, `order`, `visit`, `ticket`, and
  `custom_entity` — each entity declaring its fields + a writer. A new module (or
  a future custom entity) plugs in by registering its entity descriptor; no new
  screens, no new logic. The flows are identical everywhere: imports use
  **Upload → Mapping → Validation → Preview → Import**; external integrations use
  **API keys + webhooks + REST APIs + scheduled sync jobs**.
- **Auditable.** Every import/export/sync writes a log row (source, target,
  payload, status, error, retry, timestamps).

---

## 2. Excel / CSV Import Engine

User flow (the standard 4 steps): **Upload → Map → Validate → Import**.

1. **Upload** — admin uploads `.xlsx` / `.csv` / `.json` for a chosen target
   entity. We read headers + a sample client-side (SheetJS/papaparse; JSON keys
   for JSON) and create an **import job** (`draft`). Direct import is never
   allowed — every import MUST go through Upload → Mapping → Validation →
   Preview → Import.
2. **Map** — show a mapping screen: each uploaded column → a VANTORA field of the
   target entity (e.g. *"Client Name" → customer_name*, *"Route" → route_number*).
   Unmapped/required fields are flagged. Mapping can be **saved as a template**.
3. **Validate** — run row-by-row checks and show a preview table (valid / error /
   warning rows + a summary). Checks: missing required fields, duplicates,
   invalid dates/numbers/emails, unknown branch/product/reference.
4. **Import** — insert valid rows in batches through the normal server actions
   (so business rules + RLS apply), updating the job's counters and error log.
   Status moves `validating → ready → importing → completed / failed`.

**Import targets = entities** (declared in the same entity registry; each maps to
fields + a writer): `customer`, `supplier`, `product`, `service`, `employee`
(user), `branch`, `department`, `asset`, `inventory`, `invoice`, `order`,
`visit`, `ticket`, opening balances, and `custom_entity` later. Because targets
are entities, every current and future VANTORA module reuses the same engine.

### Engine contract (V1 — built, generic)

The registry descriptor (`src/lib/erp/entities.ts`) declares per importable
entity: `fields` (key/label/type/required + per-field `severity`), a `uniqueKey`
(defaults to `external_id`) and `dedupeKeys` for duplicate detection. The engine
(`settings/import/actions.ts`) is ONE pipeline for all entities:

- **`validateImport(entity, rows)`** → classifies issues as **error / warning /
  info** and returns `{ issues, errorRows, warningRows, validRows }`. Import
  proceeds **with warnings** but **never imports rows with errors**.
- **`runImport(entity, fileName, mapping, rows, mode)`** → `mode` ∈
  **insert / update / upsert / skip** (matched by the entity unique key). Error
  rows are skipped; each written record is **stamped for audit**:
  `import_job_id`, `external_id`, `created_by` / `updated_by`, timestamps. The
  job (summary + validation/error report) is saved in **Import History**
  (`erp_import_jobs`).
- **Same pipeline for every source.** Excel/CSV/JSON (and later API import) parse
  into the same row shape and pass through the same validate→import path — no
  source-specific or entity-specific import logic.
- **Rollback prep.** Every imported record carries `import_job_id`, so a future
  "undo import by job" is a scoped operation — the structure is in place.

---

## 3. Saved mapping templates

Admins save a column→field mapping once and reuse it (e.g. *"Customer Master
Import Template"*, *"Product List Template"*, *"Inventory Opening Balance
Template"*). Stored per company, per target entity.

---

## 4. External system integration (inbound & outbound)

- **Inbound** — other systems push data into VANTORA via a REST API authenticated
  by a **per-company API key** (later OAuth): create/update customer, create
  sales order, update inventory, create invoice, create delivery request. Every
  call is validated, company-scoped, and logged.
- **Outbound** — VANTORA emits **webhooks** on events: customer created, invoice
  created, payment received, inventory changed, approval completed, delivery
  status updated. Deliveries are retried with backoff and logged.
- **Sync jobs** — scheduled import/export (external ERP in, accounting/BI out).

---

## 5. Database schema (plan)

All tables `company_id`-scoped with RLS (read+write gated on `integrations.manage`
/ company admin). 🔜 unless noted.

```
erp_import_jobs
  id, company_id, target_entity, file_name, mapping_template_id?, mapping jsonb,
  status (draft|validating|ready|importing|completed|failed),
  total_rows, success_rows, failed_rows, error_log jsonb,
  created_by, created_at, completed_at

erp_import_mappings              -- saved templates
  id, company_id, target_entity, name, mapping jsonb, created_by, created_at

erp_integrations                 -- a configured external connection
  id, company_id, name, kind (rest|webhook|sync), direction (in|out|both),
  config jsonb, is_active, created_at

erp_api_keys                     -- per-company keys for inbound API
  id, company_id, name, key_hash, prefix, scopes text[], last_used_at,
  is_active, created_by, created_at, revoked_at

erp_webhooks                     -- outbound subscriptions
  id, company_id, event, url, secret, is_active, created_at

erp_integration_logs             -- every import/export/sync/webhook call
  id, company_id, source_system, target_system, entity, payload jsonb,
  status, error_message, retry_count, created_at, completed_at
```

Notes:
- `erp_api_keys` stores only a **hash** of the key (shown once on creation).
- `erp_integration_logs` doubles as the audit trail for §9.

---

## 6. Security

- Multi-tenancy + RLS on every table above.
- **Per-company API keys** (hashed at rest, scoped, revocable, `last_used_at`).
- **OAuth** (authorization-code) for third-party app access — roadmap.
- **Webhook signatures**: every outbound delivery is HMAC-signed with the
  subscription `secret`; receivers verify the signature header.
- **Rate limiting** on the inbound REST API, per API key.
- New permission **`integrations.manage`** (✅ added to the catalog) gates the
  whole area.
- All integration activity logged in `erp_integration_logs` (audit trail).

---

## 7. UI (under Settings)

A new settings group (🟡 placeholders now; wired incrementally):
**Data Import · Mapping Templates · Integrations · API Keys · Webhooks · Sync Logs.**

---

## 8. Delivery phases (roadmap)

| Phase | Scope | Status |
|---|---|---|
| 0 | Architecture doc + `integrations.manage` permission + Settings placeholders | ✅ this change |
| 1 | CSV/Excel import: upload → map → validate → preview → import (customers, products, suppliers) | 🔜 |
| 1 | Saved mapping templates | 🔜 |
| 2 | More import targets (inventory, opening balances, users, branches, departments, sales) | 🔜 |
| 3 | Inbound REST API + per-company API keys | 🔜 |
| 3 | Outbound webhooks + retry/logs | 🔜 |
| 4 | Scheduled sync jobs; external ERP import; accounting/BI export | 🔜 |

**Why this matters commercially:** customers won't adopt VANTORA without a clean
way to migrate their existing Excel/old-system data. The import engine (Phase 1)
is the highest-value next build in this area.
