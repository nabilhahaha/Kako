# VANTORA Business OS — Entity Framework

> **Create once. Reuse everywhere.**

Every business object in VANTORA is an **entity** (customer, supplier, product,
service, employee, asset, invoice, order, visit, ticket, … and future custom
entities). The Entity Framework gives **every** entity — current and future — the
same set of cross-cutting capabilities **by default**, built once at the
framework level instead of re-implemented per module:

| Capability | What it means |
|---|---|
| **Import** | Excel/CSV import (Upload → Map → Validate → Preview → Import) |
| **Export** | CSV/Excel export of the entity's records |
| **API Access** | Inbound/outbound REST via per-company API keys + webhooks |
| **Audit Log** | Every create/update/delete recorded |
| **Attachments** | Files attached to any record |
| **Notes** | Free-text notes/comments on any record |
| **Custom Fields** | Admin-defined fields without code |
| **Permissions** | view / create / edit / delete / approve / export / manage |

The rule: a module registers its entity **descriptor** once; it then inherits all
eight capabilities automatically. No capability is built separately per module.

Status: ✅ built · 🟡 foundation built (usable, not yet wired into every screen) ·
🔜 planned.

---

## 1. The entity registry (single source of truth)

`src/lib/erp/entities.ts` declares every entity in one registry. A descriptor:

```ts
interface EntityDescriptor {
  key: string;            // neutral id: 'customer', 'product', 'invoice', …
  table: string;          // backing table, e.g. 'erp_customers'
  labelAr: string; labelEn: string;
  // capability config (all default ON):
  importable?: boolean;   // exposes the import target
  exportable?: boolean;
  apiAccess?: boolean;    // inbound/outbound REST
  audit?: boolean;
  attachments?: boolean;
  notes?: boolean;
  customFields?: boolean;
  // import/export field map (column ↔ field) + a writer the import engine calls
  fields?: EntityField[];
  permissionGroup?: string; // which permission group gates it
}
```

Generic helpers (Notes, Attachments, Audit, Custom Fields, Import, Export, API)
read the descriptor and operate on `table` + `record_id` — so they work for any
entity without per-module code. The registry is **entity-based, never
business-type based**: the same engine serves retail, FMCG, clinics,
manufacturing, warehouses, services, distribution, and corporate.

---

## 1a. Standard fields (the entity contract)

Every registry entity carries a standard set of columns so framework features
(audit, import/export, API, sync) work uniformly:

| Field | Purpose | Status |
|---|---|---|
| `company_id` | tenant isolation (directly or via `branch_id`) | ✅ all |
| `branch_id` | branch scope (operational entities) | ✅ where applicable |
| `created_at` / `updated_at` | timestamps | ✅ all |
| `created_by` / `updated_by` | actor audit | ✅ added across registry entities |
| `status` | lifecycle state (where the entity has one) | ✅ where meaningful |
| `external_id` | stable id from an external system — import/sync **dedupe** + linkage; unique per `(company_id, external_id)` | ✅ added |

These are added **NULLABLE** (zero breakage). `created_by`/`status` exist only
where they carry meaning (e.g. invoices/visits/tickets), not on pure line-item
tables. New entities should include the full set from the start.

## 2. Shared capability tables (polymorphic, company-scoped)

These tables are keyed by `(entity, record_id)` so one row type serves **all**
entities. All are `company_id`-scoped with RLS.

```
erp_entity_notes          ✅ foundation
  id, company_id, entity, record_id, body, created_by, created_at, updated_at

erp_entity_attachments    ✅ foundation
  id, company_id, entity, record_id, file_name, file_path, mime_type,
  size_bytes, uploaded_by, created_at

erp_audit_logs            ✅ exists (entity, entity_id, action, actor, payload)

erp_custom_fields         🔜 (entity, key, label, type, options, required)
erp_custom_values         🔜 (entity, record_id, field_id, value) — or jsonb on row

erp_import_jobs / erp_import_mappings           🔜 (see INTEGRATION.md)
erp_integrations / erp_api_keys / erp_webhooks / erp_integration_logs  🔜
```

Why polymorphic: adding a brand-new entity needs **zero** new capability tables —
it immediately has notes, attachments, audit, import/export, and API access by
registering its descriptor.

---

## 3. Permissions per entity

Each entity is gated by its `permissionGroup`, and (roadmap) by the dynamic
action verbs already planned in `ARCHITECTURE.md` §5:
**view / create / edit / delete / approve / export / manage-settings.** So
"who can export customers" or "who can delete invoices" is configured once in the
permission matrix, per entity, for every module.

---

## 4. How a module inherits everything

1. Add (or confirm) the entity in `src/lib/erp/entities.ts` with its table +
   fields + capability flags (all default ON).
2. Drop the shared UI panels on the entity's detail screen:
   `<EntityNotes entity="customer" recordId={id} />`,
   `<EntityAttachments … />`, audit timeline — all read the registry.
3. The Import/Export/API engines pick the entity up automatically from the
   registry (no new screens).

That's the whole contract — **create once at the framework level, reuse
everywhere.**

---

## 5. Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Entity registry (`entities.ts`) + this doc | ✅ |
| 0 | Shared **Notes** + **Attachments** tables (polymorphic, RLS) + helpers | ✅ foundation |
| 1 | Notes/Attachments UI panels wired into core entity detail screens | 🔜 |
| 1 | Generic **Export** (CSV) for any registered entity | 🔜 |
| 2 | **Custom Fields** engine + dynamic render | 🔜 |
| 2 | **Import** engine using the registry (see INTEGRATION.md) | 🔜 |
| 3 | **API access** (REST + keys + webhooks) using the registry | 🔜 |
| 3 | Dynamic permission **actions** per entity | 🔜 |

**Principle for every phase:** build the capability once at the framework level;
each entity inherits it by registry registration — never per-module duplication.
