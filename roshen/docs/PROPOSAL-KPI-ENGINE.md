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
- period_type: Monthly / Quarterly / Custom
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
