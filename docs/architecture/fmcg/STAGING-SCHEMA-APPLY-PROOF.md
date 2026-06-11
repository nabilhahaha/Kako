# VANTORA — Supabase API Schema-Apply: Proof, Risks & kako-fmcg Rebuild Plan

**Status:** method **proven** on `vantora-staging`. **`kako-fmcg` untouched** — its Option-C
rebuild is gated on a confirmed restorable backup (your action).
**Date:** 2026-06-10.

---

## 1. Results — the schema-apply method is proven

**Method:** apply `supabase/ci/legacy-base.sql` + all **250** repo migrations to a Supabase
project via the **token-authenticated Management API** (`execute_sql`). This needs **no
database password, no GitHub runner, and no pooler/IPv6/connection-secret** — it sidesteps
every connection problem we hit earlier.

**Executed on `vantora-staging`** (`rsjvgehvastmawzwnqcs`):

| Step | Result |
|---|---|
| `DROP SCHEMA public CASCADE` + recreate + grants + `pgcrypto` | applied |
| `legacy-base.sql` (legacy FieldSync stubs; **not** `bootstrap.sql`) | applied |
| 250 migrations, sorted order, 35 line-capped batches | **zero skips, zero errors** |
| Schema-integrity verification | **passed** |
| Duration | ~69 min, unattended |

**Independently verified afterward:**

| Check | Value |
|---|---|
| `erp_*` tables | **270** |
| public functions | **188** |
| FMCG RPCs (`erp_van_sell`, `erp_van_return`, `erp_settle_collection`, `erp_compute_van_reconciliation`, `erp_user_has_permission`, `erp_resolve_price`) | **all present** |
| `erp_van_sales_settings`, `erp_return_reasons` | present |
| `0268` tenant-scoped invoice-number index | present |
| Seed data | **21 roles, 394 role-permissions** |

**Verdict: SCHEMA COMPLETE** — a clean full-schema apply via the API works end-to-end.

**`kako-fmcg` during this run:** untouched and unchanged (135 tables, 44 companies, 60 users,
FMCG objects still absent).

**One caveat:** applying via raw SQL leaves `supabase_migrations.schema_migrations` empty (the
migration *tracker* isn't populated). The schema is 100% correct; this only matters for a future
`supabase db push`. The rebuild plan backfills the tracker.

## 2. Risks (for the kako-fmcg Option-C rebuild)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Full data loss** — `DROP SCHEMA public CASCADE` destroys all 44 companies + app data | Your **verified restorable backup** (hard gate) |
| 2 | **Orphaned auth users** — `auth.users` (60) lives in the `auth` schema, so it survives the public wipe; those users would have no profile/access after rebuild | Decide: clear them or leave orphaned (harmless). Demo `*.test` identities are cleared regardless |
| 3 | **Deployed app** points at `kako-fmcg` — after rebuild it sees a fresh, empty FMCG schema | Expected (disposable); the app then works against the new schema + demo users |
| 4 | **Migration tracker** empty after a raw-SQL apply | Backfill `schema_migrations` to match the applied set |
| 5 | Storage buckets / realtime publication / privileged statements | Migrations recreate buckets; the proven run had **0 privilege errors** |

## 3. Exact rebuild plan for kako-fmcg (Option C)

**Not started. Pre-gate: you confirm a restorable backup of `kako-fmcg`.**

1. **Record** current inventory (44 companies / 60 users) for the report (read-only).
2. **Wipe:** `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` + grants + `pgcrypto`; clear demo
   `*.test` auth users (and the 60 existing, if you want a pristine identity set — your call).
3. **Apply schema:** `legacy-base.sql` + 250 migrations via the proven subagent method (~70 min);
   **backfill the migration tracker.**
4. **Verify:** integrity must match `vantora-staging` (270 erp tables · all FMCG RPCs · 0268
   index · 21 roles / 394 perms).
5. **Provision FMCG Reference Company** (Nile FMCG Distribution Group).
6. **Provision Clothing Store Reference Company** (clothing/fashion vertical seed).
7. **Create demo users + passwords**; confirm emails.
8. **Verify every login** (bcrypt match) + **109-assertion role validation** + FMCG dry-run.
9. **Deliver:** login sheet, credentials, tenant inventory, environment report, final certification.

**Rollback strategy:** restore from your backup (the wipe is otherwise irreversible).
**Backup requirement:** I cannot take or verify a backup (no MCP backup trigger, no `pg_dump`
egress) — you must take + verify it in the Supabase dashboard before step 2.
**Validation criteria:** schema integrity green · all logins authenticate · 109/109 role
assertions · FMCG dry-run balanced (invoice/collection/return+CN, reconciliation variance 0).

## 4. Optional de-risking (zero kako-fmcg impact)

`vantora-staging` now holds the full schema. I can **also provision the FMCG + Clothing reference
tenants + demo logins on it now**, proving steps 5–9 end-to-end before touching `kako-fmcg`. This
is safe (disposable, no backup needed) and makes the kako-fmcg execution near-zero-risk.
