# Roadmap — Commercial Performance Pack (post-FE-5)

Status: **roadmap / not yet implemented.** Captured per request to follow the
Field Execution pack. Builds on the same scoped performance/filter architecture
(see FMCG-PACK-1-FE4-CONVENTIONS.md §4b). **Core rule applies throughout:**
**Effective Result = User Allowed Scope AND Selected Filters.**

---

## 1. Flexible date filtering (dashboard + filter engine)
A shared date-range resolver used by every dashboard/report:
1. **Custom range** (from/to)
2. **Month-to-date**
3. **Last month**
4. **Quarter-to-date**
5. **Year-to-date**
6. **Same period last year** (the selected period shifted −1 year)
7. **Previous comparable period** (immediately preceding equal-length window)

Implementation note: a single `resolveDateRange(preset, anchor)` → `{from,to,
compareFrom,compareTo}` so comparisons are first-class. Reused by Field Execution
trends and all commercial reports.

## 2. Sales/commercial comparisons (value AND quantity)
Every commercial metric carries both **value** and **quantity**:
- Current period **sales value** vs **same period last year**.
- Current period **sales quantity** vs **same period last year**.
- Current period vs **previous month / previous comparable period**.
- **Growth % (value)** and **Growth % (quantity)**.

Feeds: a `Sales` fact source (actuals) on the raw-fact spine (company, branch→
region/area, channel, classification, category/sub-category/SKU/brand, customer,
route, rep, date, value, quantity). Scope + filters applied at the base layer.

## 3. Target Engine
Suggest → export → edit → re-upload → validate → import:
1. Select **route / rep / customer group** (+ optional category / sub-category /
   SKU / channel / classification) and the **new target month**.
2. System **suggests a monthly target** from **historical actual sales** of the
   in-scope customers (e.g. trailing N months, seasonality-aware later).
3. Suggestion granularity: **total / category / sub-category / SKU / channel /
   customer classification**.
4. **Export to Excel** (the suggested target, pre-filled).
5. User **edits** the Excel manually.
6. User **re-uploads** the edited file.
7. System **validates and imports** the final target.

Reuses the Builder's import framework (column mapping, validation) where possible.

## 4. Downstream (connects later)
- **Achievement %** = actual ÷ target (value & quantity).
- **Growth %** (value & quantity) vs comparison period.
- **Commission / incentive** calculation off achievement + rules.

## 5. Non-negotiable: scope everywhere
All suggested targets, actual sales, comparisons, exports, achievement, growth,
commission **respect the logged-in user's allowed hierarchy scope** —
`Effective = Scope AND Filters`. New dimensions/metrics are added at the scoped
base layer (after `erp_fe_team()` / `erp_fe_sees_all()`), never before, so they
inherit the rule automatically. Exports contain only in-scope rows.

## 6. Suggested build order
1. Date-range resolver + presets + comparison windows (shared).
2. Sales actuals fact source + value/quantity comparison functions (scoped).
3. Commercial dashboards (value & quantity, growth %, comparisons; scoped + filtered).
4. Target Engine — suggest from history (scoped) → Excel export → re-upload →
   validate → import.
5. Achievement % / growth % surfaces.
6. Commission & incentive engine.
