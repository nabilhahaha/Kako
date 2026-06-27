# PROPOSAL — Manager KPI Engine (DEFERRED — do not build yet)

Status: **Captured, not started.** Build only after the current Organization
and Home polish is approved. No fake KPI data. No Monday API now (later we may
import KPI targets from Monday Excel/CSV via the existing import patterns).

Goal: a flexible, reusable **Manager KPI Engine** (definitions + assignment +
target/fact/forecast + auto/manual facts + attachments + include/exclude rules
+ reporting), NOT a fixed KPI page.

---

## 1. KPI Definition (Admin-authored)
- name, category, applies-to role
- period_type: **Monthly / Quarterly / Yearly / Custom** (per KPI — independent
  of every other KPI)
- target_type: Amount / Count / Percentage / Yes-No / File-based
- fact_source: Auto (from imported raw data) / Manual / Mixed
- requires_attachment: yes/no
- formula / calculation rule
- include / exclude filters

## 2. KPI Assignment
Assign a KPI to any of: Manager (user), Role, Region, City, Distributor,
Main Channel (TT/MT), Sub Channel (Cash Van / Wholesale / Discounter /
Small Grocery / Modern Trade), Period.

## 3. Target / Fact / Forecast (per KPI record)
- target, fact/actual, forecast
- achievement % = fact/target, forecast achievement % = forecast/target
- gap vs target, gap vs forecast
- status: Achieved / On Track / At Risk / Behind / Critical
- safe handling of zero/missing target (N/A, validation flag)

## 4. Auto-Fact KPIs (pull from existing data)
Sales (sales_fact), Coverage (coverage/SLA views), Active customers,
Invoice count, Distributor sales, Channel sales.

## 5. Manual KPIs
Collection from distributor, Presentation completed, Business review completed,
Market report submitted, Payment confirmation, other manual business KPIs.
Support: manual value, notes, attachment/proof upload, optional approval/review.

## 6. Attachments
Proof files (PDF / image / Excel / PowerPoint / other) via Supabase Storage.
Metadata only in DB; never store file bytes in tables. Reuse the existing
attachment uploader + signed-URL pattern (task/request attachments).

## 7. Include / Exclude rules
KPI definitions support filters and exclusions, e.g. Coverage KPI may exclude
Gulf Catering Company and/or Small Grocery; Sales KPI may include/exclude
specific channels/distributors per setup.

## 7c. Per-KPI period + unit independence (no global assumptions)
Every KPI definition controls its **own** period_type AND unit; the engine must
never assume all KPIs are SAR or all are monthly. Each definition/record carries
its own target / fact / forecast / achievement % / forecast achievement % /
gap-vs-target / gap-vs-forecast, all expressed in that KPI's unit and period.

Mixed examples that must coexist:
- Monthly · Tons — Sales Volume, target 20, forecast 19, fact auto from imported
  volume/quantity (convert KG→Tons if source differs).
- Quarterly · SAR — Sales Value, target 3,000,000, forecast 2,900,000, fact auto
  from imported sales value.
- Monthly · Percentage — Coverage, target 80%.
- Monthly · SAR or Count — Collection (SAR) / Presentation (Count or Yes-No).

`period_type` enum (when built): monthly / quarterly / yearly / custom.
`period_name` examples: "June 2026", "Q2 2026", "2026", or a custom range.

## 7b. KPI Units & Conversions (units are first-class — not money-only)
Supported units: **SAR, Tons, KG, Cartons, Pieces, Customers, Invoices,
Percentage, Count, Yes/No, File/Document.**

Rules:
- Store `unit` on BOTH the KPI definition and each KPI record (record inherits
  from definition by default; record may not override the unit, only values).
- Display target / fact / forecast / gap / achievement using the record's unit
  (e.g. "38 / 50 Tons", "80%", "Yes"). Percentage and Yes/No render specially.
- Volume units (Tons/KG/Cartons/Pieces) support **conversion rules** when the
  source data unit differs from the KPI target unit:
  - definition holds `source_unit` + `target_unit` + `conversion_factor`
    (e.g. source KG → target Tons, factor 0.001; or pieces→cartons via pack size).
  - auto-fact resolver converts source measure → target unit before compare.
  - keep raw source value + converted value for audit.
- Achievement = converted_fact / target (guard divide-by-zero); gap in target unit.
- Yes/No and File/Document targets: achievement is boolean/threshold-based
  (e.g. proof attached = achieved), not a ratio.

Examples (real-shaped, not seeded):
1. Sales Value — target 1,000,000 **SAR**, auto from sales_fact net amount.
2. Sales Volume — target 50 **Tons**, fact 38 / forecast 47 (source raw qty/weight,
   convert KG→Tons if needed).
3. Coverage — target 80 **%**, auto from coverage/SLA view.
4. Collection — target 500,000 **SAR**, manual entry or finance import.
5. Presentation — target **Yes/No** or **Count**, manual + attachment proof.

Schema impact (when built): add `unit`, `source_unit`, `target_unit`,
`conversion_factor` to `kpi_definition`; add `unit`, `source_fact_raw`,
`fact` (converted) to `kpi_record`. A `kpi_unit` enum covers the list above.

## 8. Reporting
By Manager, Region, City, Distributor, Main Channel (TT/MT), Sub Channel;
Monthly, Quarterly, YTD (later). Roll-ups respect Region → City → Distributor →
channel hierarchy and the distributor_coverage matrix.

## 9. Constraints
- No fake KPI data; real values only (empty/coming-soon states otherwise).
- No Monday API now; later import targets from Monday Excel/CSV via the import
  pipeline.
- Additive, RLS-respecting; reuse queries/actions/components; keep separate
  from Workspace/Requests; follow the platform UX navigation constitution
  (overview + dedicated child routes).

---

## Proposed schema sketch (for when we build — NOT applied)
Company-scoped tables; every table has company_id, created_at, updated_at,
created_by/updated_by where applicable; RLS mirrors org scope helpers.

- `kpi_category` — id, company_id, name, slug, active
- `kpi_definition` — id, company_id, name, category_id, applies_to_role,
  period_type, target_type, fact_source, requires_attachment, formula,
  filters (jsonb include/exclude), active
- `kpi_assignment` — id, company_id, definition_id, owner_user_id?, role?,
  region_id?, city_id?, distributor_id?, main_channel_id?, sub_channel_id?,
  period_type, period_name
- `kpi_record` — id, company_id, definition_id, assignment_id, period_name,
  owner_user_id, region_id?/city_id?/distributor_id?, main_channel_id?,
  sub_channel_id?, target, fact, forecast, notes, status, source_reference
  (computed % / gaps via a `security_invoker` view `kpi_scorecard`)
- `kpi_attachment` — id, company_id, kpi_record_id, storage_path, filename,
  mime_type, size_bytes, uploaded_by
- `kpi_audit_log` — id, company_id, kpi_record_id, actor_id, action,
  field, from_value, to_value, created_at

Status enum: achieved / on_track / at_risk / behind / critical / no_target.

Auto-fact resolvers map a KPI definition to a source query (sales_fact,
SLA/coverage views, customer, invoice count) honoring include/exclude filters.

Implementation order (when approved): schema + RLS → definitions admin →
assignment → records (auto + manual) → attachments → reporting → optional
Monday Excel/CSV import → reconciliation.
