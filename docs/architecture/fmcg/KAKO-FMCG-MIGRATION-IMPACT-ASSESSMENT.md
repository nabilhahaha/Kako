# kako-fmcg — Migration Impact Assessment & Upgrade Plan

**Status: ASSESSMENT ONLY — no schema changes applied.** Approval required before any change.
**Target project:** `kako-fmcg` (`nrvydmkxjnctdlaxdhur`, eu-west-1) · **Repo target:** this branch (migrations `0001–0268`).

---

## 1. Current schema version (kako-fmcg)

| Fact | Value |
|---|---|
| Migration tracking | `supabase_migrations.schema_migrations` — **131 applied** |
| Highest `0NNN` applied | **`0173_snapshot_inventory`** |
| `erp_*` tables | **135** |
| Companies | **44** (multi-vertical: clinic 5, general 4, wholesale 4, delivery 3, pharmacy 3, **clothing 3**, supermarket 3, workshop 3, butchery 2, services 2, hotel 2, + 11 more incl. restaurant, salon, laundry, bakery, cafe, electronics…) |
| Users | **60** (`auth.users`) |
| Data | 145 invoices · 59 customers · 225 products |

**Character:** `kako-fmcg` is a **multi-vertical dev/demo environment**, not a single production tenant. Data volume is modest.

## 2. Comparison vs the repository schema — **divergent fork, not a version gap**

The two histories share an ancestor (~migration 0102) and then **diverged in different product directions**. This is confirmed bidirectionally:

- **kako-fmcg has migrations the repo lacks** (retail/fashion line): `0161_fashion_owner_cash`, `0165_void_invoice`, `0166_returns_exchanges`, `0167_installment_flexibility`, `0171_retail_analytics`, `0172_backups`, `0173_snapshot_inventory`. Its early history uses **pre-renumber names** (`erp_0005_part1…`, `org_structure`, `workflow_engine`, `custom_fields`) and its `0NNN` sequence has **gaps** (0067→0096, 0102→0118→0146).
- **The repo has migrations kako-fmcg lacks** (FMCG van-sales line): `0106_pricing_engine`, `0109_customer_approval`, `0128_fmcg_master`, `0140_return_reasons`, the van-sales set `0251/0265–0268`, **40 migrations in 0103–0145**, and **93 migrations ≥ 0174**.

**Concrete FMCG gap on kako-fmcg** — 13 tables absent: `erp_van_sales_settings`, `erp_fmcg_settings`, `erp_return_reasons`, `erp_price_rules`, `erp_credit_notes`, `erp_collections`, `erp_collection_allocations`, `erp_van_reconciliations`, `erp_journey_plans`, `erp_customer_lookups`, `erp_alerts`, `erp_modules`, `erp_features` (plus their RPCs: `erp_van_sell/return`, `erp_settle_collection`, `erp_compute_van_reconciliation`, `erp_user_has_permission`, `erp_resolve_price`, …).

> **Key conclusion:** the repo's `0NNN` numbers do **not** correspond to kako-fmcg's applied `0NNN` numbers (different content at the same number). A linear "apply the missing migrations" is therefore **not possible** — it is a *merge of two divergent schemas*.

## 3. Migration-impact report (applying the repo chain to populated kako-fmcg)

Scan of the repo chain (`0001–0268`):

| Operation class | Files | Impact on a populated, divergent DB |
|---|--:|---|
| `DROP TABLE` (incl. idempotent re-creates) | 33 | Re-creates would hit existing divergent objects; some are genuine drops |
| `DROP COLUMN` | 20 | Potential data loss on shared tables |
| `ALTER COLUMN … TYPE/SET NOT NULL` | 1 | Fails if existing rows violate |
| `DELETE/TRUNCATE` | 29 | Data-touching (mostly re-seed of lookup/permission rows) |
| `DROP FUNCTION/TYPE/POLICY` | 153 | Mostly `CREATE OR REPLACE` churn; safe, but high volume |
| **`ADD COLUMN … NOT NULL`** | **21** | **Needs a default/backfill or fails on existing rows** |
| **Data backfills (`UPDATE … SET`)** | **47** | Assume the repo's lineage state of the data |
| **`ALTER` of shared tables** (`erp_customers/products_catalog/invoices/branches/companies/warehouses`) | **29** | **Highest conflict risk** — these assume the repo's version of tables that kako-fmcg reached via *different* migrations |

## 4. Destructive migrations (data-loss capable)

The repo chain contains operations that **drop columns/tables or delete rows**. Re-running the chain on kako-fmcg would execute these against live data. Notable: `0103_customer_model_expansion`, `0106_pricing_engine`, `0128_fmcg_master_extensions`, `0137_uom_pricing_foundation`, `0140_return_reasons`, `0251_van_sales_settings` (each contains `DROP`/re-create or `DELETE` of seed data), plus the 20 `DROP COLUMN` and 29 `DELETE/TRUNCATE` sites. On a clean DB these are intended; on kako-fmcg's divergent, populated schema they are **unsafe**.

## 5. Data-migration requirements

- **21** `ADD COLUMN … NOT NULL` sites require a default or a backfill step against kako-fmcg's existing rows (44 companies, 59 customers, 225 products, 145 invoices).
- **47** migrations perform `UPDATE … SET` backfills that assume the repo's prior data shape.
- Permission/role/lookup **re-seeds** (`DELETE` + `INSERT` on `erp_role_permissions`, lookups) would overwrite kako-fmcg's current grants.

## 6. Incompatible tables / RPCs / permissions / indexes

- **Tables:** 29 repo migrations `ALTER` shared tables (`erp_customers`, `erp_products_catalog`, `erp_invoices`, …) expecting the repo's column set; kako-fmcg's versions came from different migrations → **ALTER/constraint conflicts likely**.
- **RPCs:** 153 `DROP/CREATE` function sites; many repo functions (e.g. `erp_issue_invoice`, `erp_next_number`) **already exist on kako-fmcg with different bodies** (its fashion line changed them) → `CREATE OR REPLACE` would silently overwrite kako-fmcg's behavior, risking its fashion/retail flows.
- **Permissions:** repo `0109/0134/0142` re-seed `erp_role_permissions`; kako-fmcg has its own grants → divergence/overwrite.
- **Indexes/constraints:** repo `0268` (tenant-scoped numbering) and others add/replace unique indexes; kako-fmcg has the **old global** numbering (`0039_fix_global_document_numbering`) → index swap may conflict with existing duplicate-shaped data.

## 7. Upgrade risk estimate

| Strategy | Risk | Outcome |
|---|---|---|
| **Linear chain-apply (0001–0268) on kako-fmcg** | 🔴 **Very High / not viable** | Conflicts on shared-table ALTERs, function overwrites, NOT-NULL backfills; likely aborts mid-way and/or breaks kako-fmcg's existing 21 verticals |
| **Additive FMCG patch (Option B)** | 🟠 **Medium** | Adds the 13 missing FMCG tables + RPCs + perms only; preserves the 44 companies; does **not** make kako-fmcg byte-match the repo; needs dependency reconciliation + backup |
| **Wipe + rebuild from repo chain (Option C)** | 🟢 **Low technical risk / 🔴 full data loss** | Drop `public` → apply `0001–0268` fresh → **exactly the repo schema**; destroys all 44 companies, 60 users' app data, and the fashion/other-vertical features |

---

## 8. Step-by-step upgrade plan

Because a linear chain-apply is not viable, the plan is offered for the **two viable strategies**. **Recommended given "disposable" + "match the current repository schema": Option C.**

### Option C — Wipe & rebuild (faithful to the repo schema; recommended if data is disposable)
1. **Backup** (see §10) — mandatory, verified restorable.
2. Capture an inventory snapshot of current companies/users (for the record).
3. `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` on kako-fmcg (via Supabase API) — and clear demo `auth.users` if a clean identity set is wanted.
4. Apply the schema with the **existing `provision-staging` workflow** pointed at kako-fmcg's connection (set `STAGING_PROVISION_DATABASE_URL` to kako-fmcg's session-pooler string) → `legacy-base.sql` + `0001–0268` + integrity verify.
5. Provision the FMCG + Clothing reference tenants, demo users/passwords (same as the staging plan).
6. Validate (see §11).

### Option B — Additive FMCG patch (preserves the 44 companies)
1. **Backup** (mandatory).
2. Author one **idempotent, additive** migration that creates only the 13 missing FMCG tables + their RPCs + permission rows, with `IF NOT EXISTS` / `ON CONFLICT`, **touching no existing table destructively** and **not** `CREATE OR REPLACE`-ing functions kako-fmcg already defines differently.
3. Reconcile dependencies (e.g. `erp_user_has_permission`, `erp_resolve_price`) against kako-fmcg's existing objects.
4. Apply via Supabase API (small, fits), verify, then provision the FMCG reference tenant.
5. Validate.

## 9. Rollback strategy
- **Primary:** restore from the pre-change backup/PITR (Supabase dashboard) — full revert.
- **Option C:** rollback = restore backup (the wipe is otherwise irreversible).
- **Option B:** each new object is additive; rollback = `DROP` the objects created by the single patch migration (script the inverse), or restore backup. No existing object is altered, so revert is clean.
- **Hard gate:** do not start until a **verified restorable** backup exists.

## 10. Backup requirements
- I **cannot** take a backup with the available tooling (no MCP backup trigger; no Postgres egress for `pg_dump`).
- **You must**, before any change: enable **PITR** or take an on-demand backup in the Supabase dashboard (`kako-fmcg` → Database → Backups), **and confirm it's restorable**. For extra safety, a `pg_dump` from a machine that can reach the DB.

## 11. Validation criteria (post-upgrade)
- **Schema integrity:** the provisioner's check passes (all PR #311 objects present), or for Option B, the 13 tables + RPCs exist.
- **Existing data intact** (Option B): company/user/invoice counts unchanged (44 / 60 / 145); spot-check 2–3 non-FMCG verticals still function.
- **FMCG works:** provision the FMCG reference tenant; run the dry-run (`INV-…`, collection, return+CN, reconciliation variance 0) and the **109-assertion** role validation — all green.
- **Logins:** every demo user authenticates.
- **No regressions:** existing RLS/permissions for the other verticals unchanged (Option B) — confirm a sample of their grants.

---

## Recommendation
- If kako-fmcg's data is **truly disposable** and you want it to **match the repo exactly** → **Option C** (clean, lowest technical risk; destroys current data — needs backup + the connection secret for the apply step).
- If you want to **keep the 44 companies** and just **add FMCG** → **Option B** (additive, medium risk).
- A blind **linear chain-apply is not on the table** — it would conflict and likely break the environment.

**No changes will be made until you approve one of these options.**
