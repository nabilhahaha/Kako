# Pre-Apply Review Package (Foundation)

**Status: prepared, NOT applied.** Awaiting explicit approval before any Supabase
migration runs. No dashboards.

> ✅ **Local validation done.** All migrations + seed were executed against a
> throwaway **PostgreSQL 16** instance (with Supabase stubs for `auth.users`,
> `auth.uid()`, role `authenticated`). Result: **20 tables, 3 views, 15 enums,
> 4 helper functions, 40 RLS policies across all 20 tables** — applied cleanly.
> A functional SLA test (actual 1,500 / target 2,000) returned achievement
> 75.0%, gap 500, status **At Risk** as expected.

Required import standard (approved, enforced by this design):
**never blind replace · never blind append · always detect date range & overlap
· always recommend the safest mode · always require user confirmation · always
preserve raw history + superseded batches.**

---

## 1. Final list of migration files
| File | Purpose |
|---|---|
| `supabase/migrations/0001_foundation_schema.sql` | Tables, enums, indexes |
| `supabase/migrations/0002_rls_policies.sql` | RLS: helpers + 40 policies |
| `supabase/migrations/0003_sla_views.sql` | SLA actual/performance views |
| `supabase/seed.sql` | Company, KSA, channels, sample hierarchy + value maps |
| `supabase/rollback_foundation.sql` | Destructive down script (kept, not run) |

Apply order: **0001 → 0002 → 0003 → seed**.

## 2. Tables added/changed (20 new; nothing pre-existing is altered)
- **Org:** company, country, region, city, area, branch, channel, agent
- **Masters:** product (master SKU=roshen_item_code), customer
- **Users:** profile, user_scope
- **Mapping engine:** column_mapping_profile, column_mapping_version, value_mapping
- **Import:** import_batch, raw_import_row, import_issue
- **Reporting:** sales_fact, sla_target
- **Enums (15):** org_level, app_role, agent_type, import_status, mapping_status,
  value_dimension, issue_severity, txn_type, invoice_status, sales_value_basis,
  vat_handling, discount_handling, returns_handling, sla_actual_basis, import_mode

## 3. RLS impact
- RLS **enabled on all 20 tables**; **40 policies**.
- Helpers: `app_role()`, `is_global()` (company_manager/admin),
  `my_area_ids()`, `my_region_ids()`.
- **Company manager / admin** → global read; **area manager** → only assigned
  areas (data **and** structure: region/area/branch/agent reads scoped).
- Reference (company/country/channel/city/product/customer) readable by
  authenticated; writes global. Pipeline writes via service-role server actions.
- `company_id` on every tenant table for future multi-company isolation.

## 4. Import engine tables
- `import_batch` — one upload per agent; carries `import_mode`,
  `period_month`, `period_start/period_end`, `mapping_version_id`,
  `resolved_field_mapping`, `resolved_value_mapping`, `calculation_policy`,
  `detected_date_format`, `uploaded_by`, `confirmed_by`, status, counts.
  Partial unique index = one active `imported` batch per agent+month.
- `raw_import_row` — original row as **jsonb** + date-parse annotations.
- `import_issue` — validation findings (error/warning/info) for preview.
- `sales_fact` — normalized lines incl. `line_hash` for overlap/dedupe.

## 5. Mapping engine tables
- `column_mapping_profile` — per-agent default (one default/agent).
- `column_mapping_version` — immutable versions (source_headers, field_mapping,
  value_mapping, **calculation policy**, version_number, status).
- `value_mapping` — channel/city/return_reason/salesman/customer/item, agent-
  specific + company-wide fallback.
- Editing a mapping → new version; historical batches keep their version.

## 6. Calculation policy fields (on `column_mapping_version`)
`sales_value_basis` (incl. `net_after_returns_excluding_vat`), `vat_handling`
(+`vat_rate`), `discount_handling` (incl. `store_only`), `returns_handling`,
`sla_actual_basis`. Per-row `sla_actual_value` resolved at import; SLA views
just sum it. Verified bases: Agent-01 SUM(ex-VAT), Agent-02/03 SUM(net ex-VAT).

## 7. Import modes & safety rules
- Modes: `full_period_replace`, `incremental_append`, `replace_overlapping`,
  `correction_reprocess` (`import_mode` enum).
- Overlap detection via `line_hash`; recommend safest mode; **user confirms**.
- Safety: never delete raw; never silent overwrite; replacements →
  `status='superseded'`; batch stores import_mode, date range,
  mapping_version_id, calculation_policy, uploaded_by, confirmed_by.

## 8. Seed data summary (all `on conflict do nothing`, re-runnable)
Company **Roshen** · Country **Saudi Arabia (SA)** · Channels MT/TT/HRC/WS ·
Regions Central/Western/Eastern · Areas Riyadh North & South, Jeddah, Dammam ·
2 branches · 2 sample agents · channel & city **value-mapping** examples
(TT/Traditional/GT→TT, جدة/JED→Jeddah, …). No users seeded (created in P1).

## 9. Exact Supabase apply commands (run only after approval)
**A) CLI**
```bash
cd roshen
supabase login
supabase link --project-ref wrkugzssuoxneftzappa
# RECOMMENDED: validate on a branch first
supabase branches create foundation-test   # or apply to a scratch project
supabase db push                            # applies 0001, 0002, 0003
supabase db execute --file supabase/seed.sql
supabase gen types typescript --linked > src/lib/database.types.ts
```
**B) MCP / dashboard**
- `apply_migration` for `0001_foundation_schema`, `0002_rls_policies`,
  `0003_sla_views` (in order) → `execute_sql` for `seed.sql` →
  `generate_typescript_types` → `get_advisors` (review security/perf).

## 10. Rollback plan
- **Preferred:** restore the pre-apply snapshot, or delete the test branch.
- **Scripted (destructive):** `supabase/rollback_foundation.sql` drops only the
  objects 0001–0003 created (reverse dependency order); never touches `auth.*`.
- Because P1 only **creates** objects, rollback risks no existing data.

## 11. What happens after applying migrations
- 20 tables + 3 views + 15 enums + 4 functions + 40 RLS policies created on the
  target project (empty until imports/targets exist).
- Seed populates Roshen/KSA reference data.
- `src/lib/database.types.ts` generated for type-safe queries.
- `get_advisors` reviewed; any RLS/security notes addressed.
- **Still no dashboards and no UI** — next phases (P2 import pipeline, P3
  targets, P4 SLA dashboard) follow separately.
- Existing Vite app and any other project data are untouched (new schema only).

---

**Awaiting your explicit “apply” before anything runs.** Recommended first
target: a **Supabase branch** (not production) for a final live check, then
promote.
