# P1 — Apply Runbook (Foundation)

Status: **prepared, NOT executed.** Migrations remain reviewable files; nothing
is applied to the live Supabase project until you give the go-ahead. No
destructive change is performed by P1 (it only **creates** new objects).

Confirmed decisions baked into the migrations:
- Currency = **SAR** (column default on `sales_fact` and `sla_target`).
- Primary target grain = **agent × channel × month**, auto rolled up to
  branch / area / region / **company** in `sla_performance`.
- Direct area/region/branch/company targets remain supported (set
  `sla_target.level` accordingly).
- SLA thresholds = **Achieved / On Track ≥95% pace / At Risk ≥80% pace / Behind**.
- **Calendar days** for MVP; `sales_fact.is_selling_day` reserved so we can
  switch to a Saudi selling-day calendar without a schema change.
- **Channels are configurable** per company (`channel` table, not hardcoded).

---

## 1. Final migration review checklist

| Requirement | Status | Where |
|---|---|---|
| `company_id` on every tenant table | ✅ | `country, region, city, area, branch, channel, agent, profile, user_scope, import_batch, sales_fact, sla_target` |
| Reporting tables carry a reporting period | ✅ | `period_month` on `import_batch, sales_fact, sla_target` |
| Prevent duplicate **active** import per agent+month | ✅ | partial unique index `one_active_batch_per_agent_month` (status='imported') |
| Preserve original uploaded row as JSONB | ✅ | `raw_import_row.raw jsonb not null` |
| Denormalized hierarchy keys on `sales_fact` | ✅ | `company/country/region/area/branch/agent/channel` ids |
| Area Manager cannot see other areas (data **and** structure) | ✅ | RLS on `sales_fact, sla_target, import_batch` + `region/area/branch/agent` reads scoped via `my_area_ids()` |
| Configurable channels | ✅ | `channel` table, unique `(company_id, name)` |
| Currency = SAR | ✅ | defaults on `sales_fact`, `sla_target` |
| Selling-day flexibility | ✅ | `sales_fact.is_selling_day` reserved; pace logic isolated in `sla_performance` |
| Roll-up to company | ✅ | `sla_performance` company-level union |

Pre-apply sanity:
- Apply order must be **0001 → 0002 → 0003**, then `seed.sql` (optional).
- `auth.users` must exist (it does on any Supabase project) — `profile.id`
  references it.
- No existing tables are altered or dropped → safe on the empty Roshen project.

---

## 2. Safe apply plan

1. **Backup / snapshot first.** Even though P1 only creates objects, take a
   Supabase backup (Dashboard → Database → Backups) or a fresh project
   snapshot so rollback is trivial.
2. **Apply to a throwaway branch/project first** (recommended): use a Supabase
   *branch* or a scratch project, run 0001–0003 + seed, eyeball the tables and
   `select * from sla_performance` behavior, then promote.
3. **Apply in order** 0001, 0002, 0003 (each is idempotent-friendly for a fresh
   schema; they assume the objects don't yet exist).
4. **Seed** with `seed.sql` (safe: all `on conflict do nothing`).
5. **Smoke checks** (read-only):
   - `select count(*) from company, country, region, area, branch, channel, agent;`
   - `select * from sla_performance;` (empty until sales/targets exist — should
     not error)
   - Create one test area-manager `profile` + `user_scope`, then verify (as that
     user) that `select * from area;` returns only their area.
6. **Generate TypeScript types** for the app (read-only): see §4.

Stop conditions: any error during 0001–0003 → halt, run rollback (§3) on the
scratch project, fix the migration file, retry. Never hand-edit the live schema.

---

## 3. Rollback plan

- **Preferred:** restore the pre-apply backup/snapshot from step 2.1, or delete
  the scratch branch/project. This is the cleanest, zero-residue rollback.
- **Scripted (destructive, file kept, not run):**
  `supabase/rollback_foundation.sql` drops only the objects 0001–0003 created,
  in dependency order. It does **not** touch `auth.*` or anything pre-existing.
  Use only if a backup isn't available and you intend to remove the foundation.
- Because P1 creates rather than mutates, rollback never risks existing data.

---

## 4. Required Supabase commands

Pick ONE path. **Do not run until approved.**

**A) Supabase CLI (local → linked project)**
```bash
# from roshen/
supabase login
supabase link --project-ref wrkugzssuoxneftzappa

# review what would run
supabase db diff --linked            # optional inspection

# apply migrations in order (CLI runs files under supabase/migrations/)
supabase db push                     # applies 0001, 0002, 0003

# seed (optional)
supabase db execute --file supabase/seed.sql

# generate types for the app
supabase gen types typescript --linked > src/lib/database.types.ts
```

**B) MCP / dashboard (no local CLI)**
- Apply each file's contents via the Supabase MCP `apply_migration` tool
  (name = `0001_foundation_schema`, etc.), in order 0001 → 0002 → 0003.
- Run `seed.sql` via `execute_sql`.
- Generate types via `generate_typescript_types`.
- After apply, run `get_advisors` (security + performance) and address any RLS
  warnings before exposing the app.

**Rollback command (only if needed, destructive):**
```bash
supabase db execute --file supabase/rollback_foundation.sql
```

---

## 5. Seed data preview

`seed.sql` inserts (all under company **Roshen** / country **Saudi Arabia**):

| Entity | Rows |
|---|---|
| Channels | Modern Trade (MT), Traditional Trade (TT), HoReCa (HRC), Wholesale (WS) |
| Regions | Central (CEN), Western (WST), Eastern (EST) |
| Areas | Riyadh North, Riyadh South (Central); Jeddah (Western); Dammam (Eastern) |
| Branches | Riyadh North Branch (RUH-N-01), Jeddah Central Branch (JED-01) |
| Agents | AGT-1001 (Riyadh North, MT), AGT-2001 (Jeddah, TT) |

All inserts are `on conflict do nothing` (re-runnable). No users are seeded —
`profile` rows are created from real `auth.users` in P1 step 5.

---

## 6. Required sample raw data format / template

Template file: `docs/templates/raw-data-template.csv`. One file **per agent per
month**; headers can differ in the real file and are mapped during import
(`import_batch.column_mapping`). Canonical fields:

| Canonical field | Required | Type | Notes |
|---|---|---|---|
| `txn_date` | ✅ | date (YYYY-MM-DD) | transaction date; drives `period_month` |
| `agent_code` | ✅ | text | matches `agent.code` (e.g. AGT-1001) |
| `channel` | ✅ | text | must match a configured `channel.name`/`code` |
| `city` | ◻ | text | resolved/attached to region if present |
| `customer` | ◻ | text | informational |
| `sku` | ◻ | text | product code |
| `product_name` | ◻ | text | product description |
| `quantity` | ✅ | number | units sold |
| `gross_amount` | ✅ | number | before discounts |
| `net_amount` | ✅ | number | **drives SLA actuals** |
| `currency` | ◻ | text | defaults to SAR if omitted |

Validation at import: required fields present; `quantity/gross/net` numeric;
`txn_date` parseable; `agent_code` and `channel` resolve to existing records;
unknown values are flagged per row (`raw_import_row.error`) without dropping the
original data.

> To finalize the column mapping to your real exports, please share **one
> sample raw file** from an agent — I'll align the canonical fields and default
> mapping to it.

---

## What P1 will produce (once approved)
1. Foundation schema + RLS + views applied (on a branch first, then live).
2. KSA seed in place.
3. `src/lib/database.types.ts` generated for type-safe queries.
4. One area-manager test user + scope, with an RLS isolation check passing.
5. No dashboards yet (per instruction).
