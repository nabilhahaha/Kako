# VANTORA — Sync Engine & Connections

Scheduled, two-way data movement between VANTORA and external systems, built on
the **Connector Framework** (2C-1) + **Sync Engine** (2C-2). Gated by the
**Integrations** module (`integrations.manage`). Architecture context:
[`INTEGRATION.md`](INTEGRATION.md); adapter roadmap:
[`INTEGRATION-ADAPTERS.md`](INTEGRATION-ADAPTERS.md).

---

## 1. Connections (`erp_integrations`)
A connection binds a company to an external system via an **adapter**:
- `kind`: `rest | odata | file`; `direction`: `in | out | both`; `adapter`:
  `generic_rest | csv_sftp` (vendor adapters per the roadmap).
- **Non-secret config** (`config jsonb`): base URL, auth header/scheme, records
  path, etc.
- **Credential in Supabase Vault** — the row stores only a `secret_id` reference;
  the secret never sits in a table column.
- Managed in **Settings → Integrations → Connections** (admin/owner): create,
  **test** (confirms the Vault credential round-trips), enable/disable, revoke.
- Adapters are registered in `src/lib/erp/connectors/` (descriptor + config
  schema + validation). Adding a vendor = register a descriptor + a runtime; no
  new screens, no migration.

## 2. Sync jobs (`erp_sync_jobs`)
One schedulable unit on a connection:
- `entity` (registry key), `direction` (`in`=pull / `out`=push),
  `mode` (`full` | `delta`), `interval_minutes`, `conflict_policy`, `config`
  (path, `field_map`, `cursor_param`, `cursor_field`), `cursor` (watermark).
- Managed in **Settings → Integrations → Sync**: create, **run-now**,
  pause/resume, revoke, plus a runs log.
- **Conflict policy:** `source_wins` (upsert/overwrite), `vantora_wins`
  (insert-only, skip existing), `manual_review` (existing → flagged, not
  overwritten).

## 3. Execution (dispatcher)
- **Trigger:** **Vercel Cron** (`*/15`) → `POST /api/internal/sync-tick`,
  authenticated by `CRON_SECRET` (fails closed → `401`; `503` if service key
  unset). (In-DB jobs like webhooks use `pg_cron`; the sync dispatcher runs in
  Node because pull needs request/response + future SFTP.)
- **Claim:** `erp_sync_claim_due` (service-role, `FOR UPDATE SKIP LOCKED`) picks
  due/forced jobs, opens a `running` run, stamps `last_run_at`, and returns the
  job + connection config + **decrypted Vault credential**.
- **Inbound (pull):** adapter fetches records (`records_path`, `field_map`,
  `cursor_param`/`cursor_field` for delta) → each record written through the
  shared **`ingestRecord`** path (company-scoped; upsert by `external_id`).
- **Outbound (push):** company-scoped entity rows (delta by `updated_at >
  cursor`) → POSTed via the adapter.
- **Finalize:** `erp_sync_complete` records counts (pulled/written/skipped/failed)
  + advances the job `cursor`.

## 4. Runs & reconciliation (`erp_sync_runs`)
- Per-execution log: `status` (`running|ok|partial|failed`),
  pulled/written/skipped/failed, `cursor_before/after`, error, timestamps.
- Reconciliation = per-run counts + conflict policy; `manual_review` conflicts
  are surfaced for resolution (full review-queue UI is a later refinement).
- Errors: transient → backoff/retry on the next tick; permanent → recorded on the
  run; circuit-breaker patterns mirror the webhook delivery model.

## 5. Security model
- RLS-read for company members on jobs/runs/connections; **writes via RPCs only**.
- Mgmt RPCs: `authenticated` + in-function admin/owner guard. Dispatcher RPCs
  (`claim_due`/`complete`): **`service_role` only**. All SECURITY DEFINER with
  pinned `search_path`. Credentials in Vault. Every job change audited.

## 6. Transport status
- ✅ **REST** (`generic_rest`) pull + push.
- ✅ **CSV/JSON over SFTP** (`csv_sftp`) pull + push (sub-slice **2C-3 / B1**;
  `ssh2-sftp-client`, marked a server-external package). File feeds read/write
  whole files (no modified-since cursor → use `mode = full`).
- 🔜 **Vendor adapters:** Dynamics 365 BC → SAP S/4HANA → Oracle NetSuite → Odoo
  (see roadmap).

Both transports support **inbound (pull)** and **outbound (push)** per the
two-way external-compatibility requirement (`INTEGRATION.md` §4b).
