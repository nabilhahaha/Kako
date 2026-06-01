# ERP Sync — inbound ingestion, conflict policy & preflight (PR-3)

Idempotent inbound ingestion of master/transaction data keyed on `external_id`.
The scheduling framework (`erp_sync_jobs`/`erp_sync_runs`, 0094) decides *when*;
`erp_sync_ingest(entity, rows, source, erp_system)` (0153) does the *what*.

## Entities & fields
- **customer** — `external_id`*, `code`, `name`, `channel`, `classification`, `branch` (branch code)
- **product** — `external_id`*, `code` (SKU), `name`, `category` (code), `subcategory` (code), `brand`, `unit`, `sell_price`
- **invoice** — `external_id`*, `invoice_number`, `branch` (code), `customer` (external_id), `status`, `net_amount`, `total_amount`, `created_at`, `lines[]` (`product` = external_id|code, `qty`, `unit_price`, `line_total`)

\* required. Categories/sub-categories are auto-created per company `(company_id, code)`.

## Idempotency
Each entity is upserted by `external_id` (customers/products scoped per company;
invoices by the globally-unique `external_id`). Re-running the same payload
**updates in place** — never duplicates. Invoice lines are replaced on update.

## Conflict policy — `source_wins`
Inbound is authoritative: on a matching `external_id`, the external values
overwrite the local record.
- **Customer conflicts:** name/channel/classification/branch overwritten; local
  id + relationships preserved.
- **Product conflicts:** name/brand/category/price overwritten; SKU (`code`) kept.
- **Invoice conflicts:** status (incl. `cancelled`)/amounts overwritten; lines
  fully replaced. A `cancelled` status removes the invoice from commercial
  actuals (facts exclude draft/cancelled).

(A future per-company setting can switch to `vantora_wins` or `manual_review`,
already modelled on `erp_sync_jobs.conflict_policy`.)

## Sync audit & ERP source tracking — `erp_sync_map`
Per synced entity: `external_id`, `internal_id`, `erp_system`, `source`,
`created_via_sync`, `updated_via_sync`, `last_result` (created/updated/skipped/
error), `error`, `last_synced_at`. Per-batch stats in `erp_sync_ingest_runs`
(processed/created/updated/skipped/errors/status). Supports **multiple ERP
systems per platform** (each row tags its `erp_system`).

## Dashboard
`erp_sync_dashboard()` → per entity: last sync, mapped count, error count,
distinct `erp_systems`, and the latest run (processed/created/updated/errors).
Surface at `/settings/sync`.

## Connectivity preflight (before pilot)
1. Confirm the ERP exposes (or accepts) customers, products, invoices with a
   stable `external_id`.
2. Map the ERP's branch/category/SKU codes to the codes used here.
3. Dry-run a small batch into a **non-production** company; verify
   `erp_sync_dashboard()` counts + zero errors, then re-run the same batch and
   confirm **0 created / N updated** (idempotency).
4. Validate a `cancelled` invoice removes itself from commercial actuals.
5. Schedule the pull/push job (`erp_sync_jobs`) and confirm the scheduler
   (`/settings/scheduler`) shows green runs.
