# Roshen KSA Branch Management Platform — Foundation Proposal

This document is the **foundation** for the platform, before any dashboards are
built. It covers the data model, access model, import pipeline, SLA
calculation model, the first MVP screens, and a phased implementation plan.

The concrete SQL lives in `supabase/migrations/` and `supabase/seed.sql` and is
a **proposal — not yet applied** to any Supabase project. Nothing here touches
the live database until you approve it.

> Scope note: the goal is a **KSA branch-management & SLA platform** — managing
> performance across company manager → area managers → regions/areas/branches →
> agents/distributors, driven by uploaded raw data. We start with the SLA
> (target vs actual) module as first priority.

---

## 1. Database schema proposal

Hierarchy and flow:

```
company → country (KSA) → region → area → branch (→ city) → agent / distributor
                                                              │
                              raw upload per agent/month ─────┘
                                      │  (map columns, keep originals)
                                      ▼
                               import_batch + raw_import_row
                                      │  (normalize)
                                      ▼
                                  sales_fact  ──────►  SLA actuals
                                                          ▲
                                  sla_target  ────────────┘  (target vs actual)
```

**Organizational hierarchy** (`0001_foundation_schema.sql`)
| Table | Purpose |
|---|---|
| `company` | Top entity (keeps the door open for multi-country later) |
| `country` | KSA (`iso_code = SA`) |
| `region` | Central / Western / Eastern … |
| `area` | Manager-assignable unit (the key scoping level) |
| `city` | Optional geography under a region |
| `branch` | Physical branch under an area; optional `city_id` |
| `channel` | Modern Trade / Traditional Trade / HoReCa / Wholesale |
| `agent` | Agent/distributor under a branch; `code` is unique and matches raw files |

**Users & scope**
| Table | Purpose |
|---|---|
| `profile` | Mirrors `auth.users`; holds `role` (`app_role` enum) |
| `user_scope` | Grants area managers (and future scoped roles) visibility to specific areas/regions/branches |

**Import pipeline**
| Table | Purpose |
|---|---|
| `import_batch` | One uploaded file per agent per month; stores `column_mapping`, status, counts, storage path |
| `raw_import_row` | Original rows preserved verbatim as `jsonb` (audit & re-processing) |

**Reporting**
| Table | Purpose |
|---|---|
| `sales_fact` | Normalized sales lines; hierarchy keys denormalized for fast, RLS-friendly queries. Only rows from an `imported` batch count |
| `sla_target` | Monthly target at any level (country/region/area/branch/agent) × optional channel |

Key design choices:
- **One active batch per agent/month** is enforced by a partial unique index;
  re-uploading supersedes the old batch but keeps its raw rows.
- **Denormalized hierarchy keys on `sales_fact`** keep dashboards and RLS fast
  (no deep joins on the hot path).
- **`sla_target.level` + nullable entity FKs** let a target be set at any level;
  a unique index (with a sentinel UUID for NULLs) prevents duplicates.
- **`channel_id NULL` on a target = all channels**, so you can set either a
  blended target or per-channel targets.

---

## 2. Role and access model

Roles (`app_role` enum): `company_manager`, `area_manager`, and reserved for
later: `branch_manager`, `sales_supervisor`, `salesman`, `finance`, `admin`.

| Role | Visibility | Manage |
|---|---|---|
| Company Manager | **All KSA** — every region/area/branch/agent & report | Everything |
| Area Manager | **Only assigned areas** (and their branches/agents) via `user_scope` | Read + review (no structural edits in MVP) |
| Admin | Global (operational) | Everything incl. users/structure |
| Future roles | Tighter scopes layered on the same helpers | TBD |

Enforced with **Row Level Security** (`0002_rls_policies.sql`):
- Helper functions: `app_role()`, `is_global()` (company_manager/admin),
  `my_area_ids()` (areas assigned directly or via an assigned region).
- `sales_fact` / `sla_target` / `import_batch`: global roles see all; area
  managers see only rows whose `area_id ∈ my_area_ids()`. Higher-level
  (region/country) targets are visible to an area manager when they cover one
  of their areas.
- Reference dimensions (region/area/branch/agent/channel) are readable by any
  authenticated user; only global roles may write them.
- **Writes** for import/normalization run through **server actions using the
  service role** after app-level authZ, so heavy pipeline logic isn't
  constrained by per-row policies while client reads stay locked down.

---

## 3. Raw data upload / import design

Per agent/distributor, per month:

1. **Select** agent + reporting month.
2. **Upload** Excel/CSV → file stored in Supabase Storage; rows parsed.
3. **Map columns** — map source headers to canonical fields:
   `txn_date, channel, sku, product_name, quantity, gross_amount, net_amount,
   city, customer`. Mappings are saved on the batch (and reusable per agent as
   a template).
4. **Stage** — create `import_batch (status=pending)` and insert every original
   row into `raw_import_row` (`raw jsonb`, untouched).
5. **Validate** — required fields present, numbers numeric, dates parseable,
   channel recognized. Per-row errors recorded; `error_count` surfaced.
6. **Normalize & commit** — on confirm, resolve agent → branch → area → region →
   country, write clean rows to `sales_fact`, set the previous active batch to
   `superseded`, and mark this one `imported` (`imported_at = now()`).
7. **Idempotent re-uploads** — same agent + month replaces cleanly; originals
   are always retained for audit.

This satisfies the foundation requirement: store the import batch, keep original
uploaded values, and normalize into clean reporting tables.

**Flexible mapping engine + calculation policy.** Because each agent's file
layout and value semantics differ, column mapping is **per-agent and versioned**
(`column_mapping_profile` / `column_mapping_version`), value normalization uses
`value_mapping`, and each version carries a **sales calculation policy** so net
sales is not a hardcoded universal rule. `sla_actual_value` is resolved per row
at import. The engine is **format-agnostic** — any agent layout is supported via
saved profiles/versions, value mapping, validation, and calculation policy.
Full design: **`docs/MAPPING-ENGINE.md`**, **`docs/IMPORT-COMPATIBILITY.md`**
(required/recommended/optional tiers + block-vs-warn rules), and
**`docs/RAW-DATA-IMPORT-SPEC.md`**.

---

## 4. SLA target vs actual calculation model

Defined in `0003_sla_views.sql`. Actuals come from `sales_fact` (active batches
only); targets from `sla_target`. Agent+channel+month is the finest grain;
branch/area/region/country actuals are **sums** of it.

For a given entity, month, and as-of date:

| Metric | Definition |
|---|---|
| **Actual (MTD)** | Σ `net_amount` for the entity, month-to-date |
| **Achievement %** | `Actual / Target × 100` |
| **Gap** | `max(Target − Actual, 0)` |
| **Days in month / elapsed** | calendar days (selling-day calendar can refine later via `working_days`) |
| **Pace %** | `elapsed_days / days_in_month × 100` (expected progress to date) |
| **Required run-rate** | `Gap / remaining_days` (avg/day still needed to hit target) |
| **YTD** | cumulative actual from Jan 1 of the period year (`sla_actual_agent_ytd`) |

**Status band** (Actual% vs pace%):
| Status | Rule |
|---|---|
| **Achieved** | Actual ≥ Target |
| **On Track** | Achievement% ≥ 95% of pace% |
| **At Risk** | Achievement% ≥ 80% of pace% (but < On Track) |
| **Behind** | below that |

Views provided: `sla_actual_agent_month`, `sla_actual_agent_ytd`,
`sla_performance_agent`, and `sla_performance` (target vs actual at **any**
level with status). Dashboards read these views; RLS still applies through the
underlying tables.

> Thresholds (95% / 80%) and using calendar days vs a Saudi selling-day
> calendar are **defaults to confirm** — both are one-line changes.

---

## 5. First MVP screen list (SLA-first)

| # | Screen | Role(s) | Notes |
|---|---|---|---|
| 0 | Auth + role-aware app shell | all | builds on the auth already in place |
| 1 | **Data Import** (upload → map → validate → commit) | admin / company mgr | the data source for everything |
| 2 | Import batches list (status, late/missing per agent-month) | company / area mgr | feeds "missing data" alerts |
| 3 | **SLA Targets** entry/import (per level × channel × month) | company mgr | targets to compare against |
| 4 | **SLA Dashboard** — required vs actual, achievement %, gap, status badges; filters by region/area/branch/agent/channel; MTD/YTD | company / area mgr (scoped) | **first priority module** |
| 5 | **Company Manager Dashboard** — KSA target/actual/achievement/gap, best & worst areas, region/branch comparison, agent performance | company mgr | |
| 6 | **Area Manager Dashboard** — assigned branches only, target vs actual by branch, agent performance, late-upload alerts, SLA status | area mgr | |
| 7 | Org & user admin (regions/areas/branches/agents, assignments) | admin | minimal CRUD; can start from seed |

Deliberately **not** in MVP: branch/supervisor/salesman/finance roles, forecasting,
commissions — reserved for later phases.

---

## 6. Implementation plan

| Phase | Deliverable | Depends on |
|---|---|---|
| **P0 — Foundation (this proposal)** | Schema + RLS + SLA views + seed; approval to apply | — |
| **P1 — Apply & wire data** | Run migrations on the Roshen Supabase project; generate TS types; seed KSA structure; create `profile` rows + assign an area manager | P0 approved |
| **P2 — Import pipeline** | Upload + column mapping + batch staging + validation + normalize to `sales_fact` (server actions, service role) | P1 |
| **P3 — Targets** | SLA target entry + bulk import (Excel) per level/channel/month | P1 |
| **P4 — SLA Dashboard** | Read `sla_performance`; filters, MTD/YTD, status badges, charts (recharts) | P2 + P3 |
| **P5 — Manager dashboards** | Company + Area Manager dashboards (scoped), best/worst, comparisons, late-upload alerts | P4 |
| **P6 — Future roles** | Branch/Supervisor/Salesman/Finance scopes & screens | P5 |

Tech: Next.js App Router (server components for scoped reads), Supabase Auth +
Postgres + RLS, server actions for mutations, `xlsx` for parsing, `recharts`
for charts, and the Roshen brand system already in the app.

### Decisions — CONFIRMED
1. **Apply timing**: keep migrations as reviewable files; **do not apply** to the
   live project yet. ✅
2. **Currency**: `SAR` throughout. ✅
3. **Channels**: configurable per company (seeded with Modern Trade / Traditional
   Trade / HoReCa / Wholesale; not hardcoded). ✅
4. **Targets**: primary grain **agent × channel × month**, auto roll-up to
   branch/area/region/company; direct higher-level targets still supported. ✅
5. **SLA thresholds**: keep defaults (Achieved / ≥95% pace On Track / ≥80% pace
   At Risk / Behind). **Calendar days** for MVP, selling-day ready. ✅
6. **Sample raw file**: still requested to finalize the column mapping — see the
   template in `docs/templates/raw-data-template.csv`.

➡️ Apply/rollback details live in **`docs/P1-APPLY-RUNBOOK.md`** (prepared, not
executed).
```
