# Proposal — SLA & Coverage Management (expand SLA beyond sales target)

> **Status: PROPOSAL only. No migration applied.** Awaiting approval before any
> schema change. Builds on the working import engine + sales_fact + sla views.

SLA today = sales target vs actual. This expands it into four dimensions:
**Sales Performance · Customer Coverage · Sales-Force Capacity · Service
Capability**, surfaced under a renamed **SLA & Coverage Setup** with tabs:
**Sales Targets · Coverage Targets · Capability Setup · SLA Report**.

## 1. Tables needed

| Table | New? | Purpose |
|---|---|---|
| `sla_target` | exists | Sales targets (keep as-is) |
| `coverage_target` | **new** | Coverage plan per Region/City/Distributor/Channel/Month |
| `capability_setup` | **new** | Manual service-capability inputs per Region/City/Distributor/Month |
| `customer` | exists | Customer master (uploaded customers land here) |
| `sales_fact` | exists | Source of actual sales, active customers, salesmen |

No existing table is altered destructively. Two **new additive** tables only.

## 2. Fields

**`coverage_target`** (planned figures; actuals computed from sales_fact):
`id, company_id, period_month, level (org_level), region_id/city_id/agent_id,
channel_id (null=all), required_customer_universe int, required_active_customers
int, required_coverage_pct numeric, required_productive_pct numeric,
required_visits int (future), created_by, timestamps`.

**`capability_setup`** (manual yes/no + counts):
`id, company_id, period_month, level, region_id/city_id/agent_id,
required_salesmen int, actual_salesmen int, warehouse_required bool,
warehouse_available bool, cashvan_required bool, cashvan_available bool,
supervisor_required bool, supervisor_available bool, notes, created_by, timestamps`.

(`city_id` is included now that 0008 added city to the model.)

## 3. Connection to existing sla_target / sla_performance

- `sla_target` + `sla_performance` keep handling **Sales Performance** unchanged.
- A new **`sla_coverage`** view computes coverage actuals from `sales_fact`
  joined to `coverage_target`.
- A new **`sla_scorecard`** view (or app-side join) combines sales, coverage,
  and capability into one row per entity/channel/month with an **SLA Score**.
- The current SLA Report becomes the "Sales" lens; the combined scorecard is the
  new default SLA Report.

## 4. Extend vs add new tables

**Add new** (`coverage_target`, `capability_setup`) — do **not** overload
`sla_target`. Reason: different grains, different update cadence (capability is
manual; sales/coverage are target+computed), and clean RLS. Sales targets stay
isolated and proven.

## 5. Actuals from sales_fact

- **Actual sales** = `sum(sla_actual_value)` (already live via `sla_performance`).
- **Active customers** = `count(distinct customer_code)` in the month with sales
  (per entity/channel) from `sales_fact`.
- **Productive customers** (MVP) = active customers with positive net sales
  (= active, until a stricter "productive transaction" rule is defined).
- **Uploaded customers** = distinct `customer_code` ever seen for the entity
  (all imported months) — the discovered universe.
- **Coverage %** (MVP, no visit data) = `active_customers /
  required_customer_universe`. When visit data exists later → switch to
  `covered_customers / universe` without schema change (visits column reserved).

## 6. Customer counts from imported data

Computed in a `sla_coverage` view straight off `sales_fact` (no extra writes):
```
active   = count(distinct customer_code) where net_sales_ex_vat > 0
uploaded = count(distinct customer_code)          -- all-time per entity
```
Grouped by period_month + entity (+ channel), rolled up region←city←distributor
exactly like sales. Optionally we also upsert distinct customers into the
`customer` master at import for a persistent universe.

## 7. Capability data entry

Manual form under **Capability Setup** (Admin): pick Month + level + entity,
enter required/actual salesmen and the warehouse/cash-van/supervisor yes-no
pairs. Stored in `capability_setup`. No computation — these are declared facts;
the report compares required vs available and flags gaps.

## 8. RLS & roles

- Both new tables: **read** = `is_global()` or scope-match via the same
  `my_agent_ids()` / `my_region_ids()` helpers added in 0011; **write** =
  `is_admin()` (Company Manager review-only; Area Manager read-only in MVP).
- New views set `security_invoker = on` (same as existing SLA views).
- Company Manager "approve/adjust" → later, via a small RLS change to allow
  `is_global()` writes on these two tables (flagged, not in MVP).

## 9. UI screens

Rename **SLA Targets → SLA & Coverage Setup** with tabs:
1. **Sales Targets** — existing screen (unchanged).
2. **Coverage Targets** — list + dialog (universe, required active, required
   coverage %, productive %).
3. **Capability Setup** — list + dialog (salesmen counts, yes/no capability).
4. **SLA Report** — combined scorecard: Region · City · Distributor · Channel ·
   Month · Sales Target · Actual Sales · Sales Ach % · Required/Active/Uploaded
   Customers · Coverage % (req vs actual) · Required/Actual Salesmen · Salesmen
   Gap · Warehouse req/avail · **SLA Score** · **SLA Status**.

## 10. SLA Score & Status (proposed model)

Weighted 0–100 composite (weights configurable later):
```
SLA Score = 0.40 * min(sales_ach_pct,100)
          + 0.25 * min(coverage_pct / required_coverage_pct *100,100)
          + 0.15 * active_customer_achievement_pct
          + 0.10 * salesmen_availability_pct      (actual/required)
          + 0.10 * service_availability_pct        (warehouse+cashvan+supervisor avail vs required)
```
**SLA Status** bands: Achieved ≥100 · On Track ≥85 · At Risk ≥70 · Behind ≥50 ·
Critical <50. (Aligned to the pace-aware logic already used for sales.)

## 11. Migration plan (on approval)

1. `0012_coverage_capability.sql` — create `coverage_target`, `capability_setup`
   (+ indexes, RLS read/write, grants). Additive.
2. `0013_sla_coverage_views.sql` — `sla_coverage`, `sla_scorecard`
   (security_invoker). Additive (views only).
3. Regenerate types; build the 3 tabs + combined report; screenshots + tests.

All additive; no destructive change; Roshen project only; history recorded.
