# Go-Live Step 1 — Demo-Cleanup Review (PITR + scope + rollback)

**Status: REVIEW ONLY — no data mutated.** Approve after PITR is enabled + verified.
**Project:** `vantora-staging` (`rsjvgehvastmawzwnqcs`, eu-west-1, Postgres 17.6). **Date:** 2026-06-10.

**Key fact:** the project currently holds **exactly one tenant** (the demo *Nile FMCG Distribution Group*)
and **all 58 `auth.users` are `@nile-group.test`** — there is **no real/production data** here yet, and
**no non-demo identities**. Cleanup is therefore low-risk and fully reproducible.

---

## 1. PITR — enable & verify (your action; I cannot do this)

I have **no tool** to enable PITR or take a Supabase backup (the MCP exposes no backup/PITR API; the
sandbox can't reach the DB for `pg_dump`). PITR is a **dashboard + billing** action you perform:

**Enable**
1. Dashboard → project `vantora-staging` → **Database → Backups**.
2. Ensure the project is on **Pro** (daily backups are included on Pro; **PITR** is a paid add-on on top).
3. Enable **Point-in-Time Recovery**. Wait until the backups panel shows an **active PITR window**
   (an earliest-restorable timestamp that advances over time).

**Verify (before any cleanup)**
- Backups panel shows **PITR: enabled** with a non-empty restore window, **or** at least one **completed
  daily backup** with a timestamp.
- Note the **current UTC time** just before cleanup — that becomes your guaranteed restore target.
- I can re-confirm project health via MCP (`get_project` → `ACTIVE_HEALTHY`), but **I cannot read the
  backup catalog** — you must confirm the restore point exists in the dashboard.

> Belt-and-suspenders: even without PITR, this exact demo tenant is **fully reproducible** by re-running
> `supabase/pilot/reference-company.sql` (now includes the refined roles). PITR is still the formal gate.

## 2. Restore-point testing procedure (prove it's restorable — non-destructive)

Test the restore **without touching** the live project:

1. In Dashboard → Database → Backups, use **Restore** → **restore to a new project** (or clone) targeting
   your chosen timestamp. This provisions a *separate* project from the backup — production is untouched.
2. On the restored copy, run the **integrity + data checks**:
   - `SELECT count(*) FROM erp_companies;` → 1 (Nile FMCG)
   - `SELECT count(*) FROM auth.users;` → 58
   - schema integrity: 270 `erp_*` tables, FMCG RPCs present (the same checks used to certify staging).
3. If counts + integrity match, the restore is **proven**. Delete the throwaway restored project.
4. Record: backup timestamp tested, restore succeeded, checks passed → this is your rollback guarantee.

(If your plan only has daily backups, the same test applies to the latest daily snapshot. PITR additionally
lets you pick an exact second.)

## 3. Exact demo-cleanup scope (what WILL be deleted) — live counts

Everything below is **tenant/demo data** scoped to the single demo company + its identities. **Transaction
tables are already empty** (no sell/collect ran on staging); the rows are master/org data.

| Object | Rows to delete |
|---|--:|
| `auth.users` (`@nile-group.test`) | 58 |
| `erp_profiles` | 58 |
| `erp_user_branches` | 63 |
| `erp_companies` | 1 |
| `erp_branches` | 13 |
| `erp_warehouses` (main + vans) | 23 |
| `erp_departments` | 10 |
| `erp_job_titles` | 27 |
| `erp_company_role_permissions` (tenant-scoped) | 441 |
| `erp_product_categories` | 5 |
| `erp_products_catalog` | 18 |
| `erp_suppliers` | 3 |
| `erp_price_lists` | 1 |
| `erp_price_list_items` | 18 |
| `erp_routes` | 28 |
| `erp_inventory_stock` | 414 |
| `erp_return_reasons` | 5 |
| `erp_van_sales_settings` | 1 |
| `erp_fmcg_settings` | 1 |
| `erp_customers` · `erp_invoices` · `erp_collections` · `erp_sales_returns` · `erp_credit_notes` · `erp_van_reconciliations` · `erp_work_sessions` · `erp_purchase_orders(+lines)` · `erp_transfer_orders(+lines)` · `erp_price_rules` | 0 (already empty) |

**Planned method (data-only, one transaction, run *after* PITR confirmed):**
1. `DELETE FROM auth.users WHERE email LIKE '%@nile-group.test';` (cascades to `erp_profiles` +
   `erp_user_branches`).
2. Delete the demo company by id; rely on `ON DELETE CASCADE`, deleting any non-cascading children in FK
   order first (branches → warehouses → stock/routes/customers → documents → settings →
   company_role_permissions).
3. Verify zero rows remain for that `company_id` and `*.test` users **before commit**.

**No `DROP SCHEMA`, no migration re-run, no DDL.** Pure `DELETE`.

## 4. What remains UNTOUCHED

| Kept | Count / note |
|---|---|
| Schema — `public` `erp_*` tables | 270 (unchanged) |
| Schema — public functions / RPCs | 189 (unchanged) |
| `erp_roles` (21 system + 4 refined) | 25 (incl. merchandiser/cash_van/collection_officer/credit_controller) |
| `erp_role_permissions` (global defaults) | 394 |
| `erp_modules` / `erp_features` | 11 / 8 |
| Cash-van credit guard trigger + function | kept (global object) |
| Tenant-scoped numbering index (`0268`) | kept |
| `auth.users` non-`*.test` | 0 exist → nothing real to lose |
| Other tenants | none exist → none affected |
| `kako-fmcg` | not touched, not referenced |

After cleanup the project = **clean schema + roles + lookups, zero business data** — ready for real import.

## 5. Rollback steps

| Scenario | Rollback |
|---|---|
| **Primary (PITR)** | Dashboard → Database → Backups → **Restore** to the timestamp recorded in §1 (immediately pre-cleanup). Full revert of the `DELETE`. |
| **Daily backup** | Restore the latest pre-cleanup daily snapshot (coarser than PITR but complete). |
| **Reproduce demo** | Re-run `supabase/pilot/reference-company.sql` (+ `reference-activity-and-validate.sql`) to rebuild the demo tenant from scratch — independent of any backup. |
| **Mid-transaction abort** | The cleanup runs in **one transaction**; if the pre-commit verification fails, `ROLLBACK` — no rows deleted. |

**Hard gate:** I will **not** run §3 until you confirm in the dashboard that PITR (or a verified daily
backup) restore point exists, per §1–§2.
