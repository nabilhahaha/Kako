# VANTORA — Scalability & Capacity Review

Principal-DB-Architect review ahead of customer onboarding. Current footprint is
TEST data (largest operational table ≈ 130 rows), so this is a **model + projection**
review with the safe improvements already applied (migrations 0157/0158 + a
schema-health regression guard).

## 0. What was applied this pass
- **0157** — covering indexes for **all 112 unindexed foreign keys** (eliminates
  seq-scan joins + slow cascade DELETEs). Unindexed-FK count is now **0**.
- **0158** — wrapped `auth.uid()` in `(SELECT …)` in the **6** RLS policies that
  re-evaluated it per row (`auth_rls_initplan`) → evaluated once per query.
- **Regression guard** — `src/test/integration/schema-health.test.ts` fails CI if a
  future migration reintroduces an unindexed FK or a per-row `auth.uid()`.

---

## 1. Multi-tenant scaling model
- **Shared database, shared schema, row-level isolation.** One Postgres (Supabase);
  every tenant table carries `company_id` (or scopes via `branch_id → company`),
  enforced by RLS (`erp_is_platform_owner() OR company_id = erp_user_company_id()`).
- **Verdict:** correct and cost-efficient to ~10k tenants on a single primary. The
  isolation boundary is RLS — **strong, and now verified** (read+write sweeps, all
  129 tables). The scaling axis is *total rows*, not *tenant count* per se.
- **When to evolve:** beyond a single primary's write ceiling (≈ tens of thousands
  of tenants / high write TPS) → (a) read replicas for reporting, then (b)
  tenant sharding by `company_id` (citus/partition-by-tenant) or a
  cell-based architecture. Not needed for the pilot horizon.

## 2. Database indexing strategy
- **FK coverage: now 100%** (0157). Postgres does not auto-index FKs; this was the
  single biggest latent bottleneck.
- **Tenant scoping:** every `company_id` column should lead an index; RLS filters by
  it on every query. (Confirmed present on the hot tables; the schema-health guard
  + advisor will surface any new gaps.)
- **Recommended composite indexes** for the high-volume/time-series tables (add when
  data justifies, via `CREATE INDEX CONCURRENTLY`): `(company_id, created_at DESC)`
  on audit logs / notifications / invoices / visits / journal_lines, and
  `(branch_id, created_at DESC)` on POS/visit tables. These serve the dominant
  "latest N for this tenant/branch" access pattern with an index-only-ish scan.
- **Partial indexes** for hot, selective predicates (e.g. open cash sessions,
  unpaid invoices, due installments) — a few already exist (`uq_erp_cash_sessions_open`,
  `idx_erp_install_sched_due`); extend this pattern instead of full indexes.

## 3. High-volume tables (growth model + plan)
| Table | Grows with | Risk | Plan |
|-------|-----------|------|------|
| `erp_audit_logs` | every sensitive mutation | unbounded | **retention + monthly partition** (see §8/§9); composite `(company_id, created_at)` |
| `erp_visits` / `erp_clinic_visits` | field & clinic ops | high | `(company_id, created_at)`; partition by month at scale |
| transactions: `erp_invoices`, `erp_invoice_lines`, `erp_journal_lines`, `erp_stock_movements`, `erp_installment_payments`, `erp_cash_movements` | sales volume | high | FK-indexed (0157); add `(company_id, created_at)`; archive closed periods |
| `erp_workflow_instances` / `erp_workflow_tasks` | approvals | medium | FK-indexed (0157); archive completed instances |
| `erp_notifications` | per-user events | high (fan-out) | retention (e.g. 90d) + `(user_id, created_at)`; already FK-indexed |

## 4. Attachment / file storage
- Files belong in **Supabase Storage (object store)**, never as bytea in Postgres;
  `erp_entity_attachments` should hold only **metadata + a storage path** (keeps the
  primary small and backups fast). Action item: confirm no large binary columns and
  that uploads go to Storage with per-tenant path prefixes + RLS-equivalent bucket
  policies. (`uploaded_by` now indexed.)

## 5. Reporting architecture
- **Current:** server components fetch **capped** row sets (≤ ~8k) and aggregate in
  **JS** — deliberately simple, no SQL group-by/materialized views. Correct and fast
  **per company** (bounded volumes).
- **Scaling limit:** cross-tenant **platform analytics** aggregate capped sets in JS;
  at 1k–10k companies the cap distorts totals and the fetch grows.
- **Recommendation (when needed):** move heavy/cross-tenant aggregates to SQL
  (group-by) backed by **scheduled rollup tables / materialized views** refreshed
  off-peak (e.g. `erp_daily_company_metrics`). Keeps dashboards O(1) regardless of
  transaction volume. Per-company operational reports can stay JS-aggregated longer.

## 6. Analytics query patterns
- Per-company: bounded, index-served (post-0157). Good to ~10k tenants.
- Platform-wide: the `≤8k cap + JS` pattern is the first thing to convert to
  pre-aggregated rollups. No correlated N+1 patterns observed in the platform pages
  (they batch with `Promise.all`).

## 7. Caching opportunities
- **Auth resolution is the hottest app-tier path.** `getUserContext()` +
  `getPlatformContext()` run several queries **per request** (profile, memberships,
  branches, company, role perms, plan/company modules, platform perms). `erp_branches`
  already shows the highest scan counts.
  - **Request-level memoization** (React `cache()` / per-request singleton) so a
    single render resolves context once.
  - **Short-TTL cache** for the near-static catalogs (`erp_plans`, `erp_plan_modules`,
    `erp_roles`, `erp_role_permissions`, `erp_business_type_modules`) — they change
    rarely and are read on most requests.
- **DB:** the `(SELECT fn())` initplan pattern (now complete) caches RLS function
  results per statement. Keep `SECURITY DEFINER` helper functions `STABLE`.
- **Connection pooling:** ensure the app uses the Supabase **transaction pooler**
  (PgBouncer, port 6543) for serverless/edge to avoid connection exhaustion — the
  one `auth_db_connections` advisory points here.

## 8. Archiving & retention
- **No retention today** → audit logs / notifications / visits grow forever.
- Define per-table policies, e.g.: audit logs hot 12–24 months then cold/export;
  notifications 90 days; closed workflow instances 12 months; financial records kept
  per legal/tax requirements (never auto-deleted — **archive, don't delete**).
- Implement as a scheduled job (pg_cron / edge function) that moves cold rows to an
  archive table/partition or exports to object storage. **Deletion of financial
  records is out of scope and would require explicit approval.**

## 9. Partitioning requirements
- Not needed now (tiny tables). **Trigger point ≈ 10–50M rows per table** or when
  index maintenance/vacuum/retention-deletes hurt.
- **Range-partition by `created_at` (monthly)**: `erp_audit_logs`, `erp_notifications`,
  `erp_stock_movements`, `erp_visits` — makes retention a partition `DETACH/DROP`
  (instant, no bloat) and keeps indexes small.
- **Hash/list-partition by `company_id`** only if a single tenant becomes a hotspot.
- Partitioning is a heavier migration on populated tables — do it **before** tables
  get large (cheap now, expensive later); plan it as a pre-scale milestone.

## 10. Expected bottlenecks by scale
| Scale | Primary bottleneck | Mitigation (in priority order) |
|-------|--------------------|-------------------------------|
| **100 companies** | None at the DB. App-tier: per-request auth queries. | Request-level memoization of `getUserContext`/`getPlatformContext`; transaction pooler. *(FK indexes done.)* |
| **1,000 companies** | Platform analytics (JS over capped cross-tenant sets); audit/notification growth; connection count under serverless. | Pre-aggregated rollup tables for platform dashboards; retention policies; catalog caching; confirm pooler. |
| **10,000 companies** | Total write volume + index maintenance on the big-5 tables; reporting; single-primary ceiling. | Monthly range-partitioning of high-volume tables; read replica for reporting; materialized rollups; evaluate tenant sharding / cell architecture. |

---

## Priority roadmap (scalability)
1. **(done)** FK index coverage (0157) + RLS initplan (0158) + schema-health guard.
2. **Next, low-risk:** request-level memoization of auth context; transaction pooler confirmation; add `(company_id, created_at)` composite indexes to the big-5 tables (CONCURRENTLY).
3. **Pre-1k:** retention policies (audit/notifications) + platform-analytics rollup tables.
4. **Pre-10k:** monthly range-partitioning of high-volume tables; read replica for reporting.

All items above #2 are reversible/additive; partitioning and sharding are larger,
planned milestones — none are needed for the pilot, but #9 is cheapest done early.
