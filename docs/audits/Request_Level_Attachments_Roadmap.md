# Request-Level Attachments (Proof Documents) — Future Enhancement (backlog)

**Status:** Roadmap / future enhancement only — **not started; document only.** Recorded 2026-06-19.

## Objective
Allow a **change request** (the G7 "Request Change" flow on `erp_customer_change_requests`, and related customer requests) to carry **proof documents** — e.g. an updated CR certificate, VAT certificate, or national-address letter — that the approver can review before applying the change.

## Core requirement
- Files are stored in **object storage** (e.g. Supabase Storage / S3-compatible bucket), **not** in the database. The DB holds only a lightweight **reference** (bucket key + metadata), so there is **no impact on platform performance** (no large BLOBs in Postgres, no bloated rows/JSONB, no heavy reads).

## Design sketch (when scheduled)
- **Reference model:** a small `attachmentRef` (or a join row) on the change request pointing at the object-storage key + `{ filename, mime, size, uploaded_by, uploaded_at }`. Reuse the existing **Attachments** component/pattern already used by the customer record (entity + recordId → storage), pointed at the change-request id.
- **Upload:** signed-URL direct-to-bucket upload from the client (no file bytes through the app server), then persist the reference on submit.
- **Review:** the approver sees the attached proofs (signed read URLs, short-lived) alongside the requested field changes in the Approvals queue.
- **Lifecycle:** attachments are immutable once submitted; retained with the request for audit; access is RLS/permission-scoped like other customer attachments.
- **Performance:** only references in the DB; bytes never touch Postgres; thumbnails/preview optional and lazy.

## Cross-cutting
- **Governance:** attachments inherit the request's visibility/permissions; no new field-access level needed.
- **Audit (G5 envelope):** record `attachmentRef`(s) in the structured audit on submit/apply.
- **Storage hygiene:** lifecycle/retention policy + orphan cleanup when a request is cancelled/rejected (configurable).

## Disposition
**Parked** as a future enhancement to the Request Change workflow (G7). Reuses the existing Attachments + object-storage pattern; the database keeps only references. Nothing implemented until a dedicated, approved workstream.
