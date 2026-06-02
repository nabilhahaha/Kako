# Slice — ERP Attachments — Design Review

> **Design for approval — no build yet (review-first).** A generic, tenant-scoped,
> RLS-protected attachments capability that links files to any record (customers,
> invoices, visits, routes, approval requests, …), with audit trail, file
> ownership, and soft delete. Additive; reuses Supabase Storage for bytes + a new
> metadata table for everything else. Production remains on hold.

## 1. Goal & requirements (owner)
A **generic `erp_attachments`** table that is **tenant-scoped** and **RLS-protected**,
linking attachments to **Customers · Invoices · Visits · Routes · Approval
Requests**, with **audit trail**, **file ownership**, and **soft-delete** support —
and reusable for every other entity later.

## 2. Grounding — current state
- Files today live **only in Supabase Storage buckets** (`visit-photos`,
  `near-expiry-photos`, created in 0001) — **public read, authenticated insert**.
  There is **no metadata table**, so: no record↔file linkage, no per-record
  attachment list, no cascade/cleanup, no ownership/audit, no access control beyond
  "public".
- The **Entity Framework** already advertises `attachments: true` as a default
  capability for every entity (`entities.ts`) — but nothing implements it yet. This
  slice makes that capability real, once, for all entities.
- The platform already has the polymorphic **(entity, record_id)** pattern (workflow
  instances) and a tenant RLS pattern (`company_id = erp_user_company_id()`), plus
  `erp_log_audit()` for the audit trail — all reused here.

## 3. Proposed schema — `erp_attachments` (additive)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid NOT NULL → `erp_companies` | tenant; auto-set by `erp_set_company_id()` |
| `entity` | text NOT NULL | registry key: `customer` / `invoice` / `visit` / `route` / `customer_change_request` / … |
| `record_id` | uuid NOT NULL | the linked record's id (polymorphic, like workflow) |
| `bucket` | text NOT NULL | storage bucket (default `attachments`) |
| `path` | text NOT NULL | object path `{company_id}/{entity}/{record_id}/{uuid}.{ext}` |
| `file_name` | text NOT NULL | original display name |
| `mime_type` | text | |
| `size_bytes` | bigint | |
| `uploaded_by` | uuid → `erp_profiles` | **file ownership** |
| `created_at` | timestamptz default now() | upload time (audit) |
| `deleted_at` | timestamptz NULL | **soft delete** (null = active) |
| `deleted_by` | uuid NULL | who removed it |

Indexes: `(company_id, entity, record_id) WHERE deleted_at IS NULL` (per-record
list, the hot path), `(company_id, created_at)`, `(uploaded_by)`. RLS + company-id
trigger, same pattern as other tenant tables.

## 4. RLS & permissions
- **Tenant isolation:** `USING (erp_is_platform_owner() OR company_id =
  erp_user_company_id())` (read/write).
- **Per-entity gating (app layer):** uploading/listing attachments for a record
  requires the parent entity's own manage permission (e.g. `customers.manage` for a
  customer, `sales.sell` for an invoice) — resolved from the Entity Framework
  registry, so it's automatic per entity.
- **Delete:** the **uploader** or a holder of the entity's manage permission may
  soft-delete (Decision §8.4).
- **Soft-deleted rows** are hidden from normal reads (`deleted_at IS NULL` in the
  list query + a partial index).

## 5. Storage strategy
- **New private bucket `attachments`** (not public) — attachments include invoices/
  approvals which shouldn't be world-readable. Access via **short-lived signed
  URLs** generated server-side after the RLS check. (The legacy public photo
  buckets stay as-is for backward compatibility; new uploads go to `attachments`.)
- **Path convention:** `{company_id}/{entity}/{record_id}/{uuid}.{ext}` — tenant-
  prefixed for clean isolation and easy per-tenant cleanup.
- **Storage RLS** on `storage.objects` for the `attachments` bucket scoped so a
  user can only read/write objects under their company's prefix.

## 6. Linking model (the five targets + reuse)
Generic `(entity, record_id)` covers all of them with no per-entity columns:
- **Customers** → `entity='customer'` · **Invoices** → `entity='invoice'` ·
  **Visits** → `entity='visit'` · **Routes** → `entity='route'` · **Approval
  Requests** → `entity='customer_change_request'` (and any workflow entity).
- Any future entity registered in `entities.ts` gets attachments for free.

## 7. Audit trail, ownership, soft delete
- **Audit:** every upload and delete writes an `erp_log_audit('attachment.upload' /
  '.delete', entity, record_id, {file_name, attachment_id})`.
- **Ownership:** `uploaded_by` stamped from `auth.uid()`; surfaced in the UI.
- **Soft delete:** sets `deleted_at`/`deleted_by`; the storage **object is retained**
  and purged later by a retention job (ties into the DB-scalability "retention"
  recommendation) — so deletes are reversible and auditable. (Decision §8.3.)

## 8. App layer (when built)
- **Server actions:** `uploadAttachment(entity, recordId, file)` (validate type/
  size, write to storage, insert row, audit); `listAttachments(entity, recordId)`
  (active only, with signed URLs); `deleteAttachment(id)` (soft, audit).
- **UI:** a reusable **`<Attachments entity recordId />`** panel (drop-zone + list
  with name/size/owner/date + download + delete) embedded on the customer, invoice,
  visit, route, and approval-request screens. Mobile/RTL.
- **Entity Framework:** wire the existing `attachments` capability to this panel so
  every capable entity shows it.
- **Limits:** max size (e.g. 10 MB) + allowed MIME types (images + pdf + common
  office docs) enforced server-side (Decision §8.5).

## 9. Decisions to confirm
1. **Storage:** new **private `attachments` bucket + signed URLs** (recommended,
   secure) vs reuse the existing public buckets? *(Recommend private.)*
2. **Linking:** generic **`(entity, record_id)`** (recommended; reuses the registry,
   works for all 5 + future) vs per-entity FK columns?
3. **Soft delete:** keep the storage object and purge via a **retention job**
   (recommended; reversible/auditable) vs delete the object immediately?
4. **Delete rights:** uploader **or** entity-manage permission (recommended) — or
   manage-permission only?
5. **Limits:** confirm max size (10 MB?) + allowed types.
6. **Scope:** pilot wires the panel to the **five named entities**; the rest inherit
   it as they're needed. Confirm.

## 10. Verification plan (when built)
- Migration rolled-back-live: table + indexes + RLS present; `erp_set_company_id`
  stamps tenant; soft-deleted rows hidden; 0 residue.
- Integration (DB): tenant isolation (company A can't read company B's attachments);
  ownership stamped; soft-delete hides the row. Unit: type/size validation. Storage
  RLS: cross-tenant object read denied. `tsc`/build. Migration **held from production**.

*(Design only — nothing built. On your §9 answers I build one reviewed slice
(migration + storage bucket/RLS + actions + the reusable panel on the five
entities + tests), staging-validated and held from production. Then any entity
gains attachments via the registry with no rework.)*
