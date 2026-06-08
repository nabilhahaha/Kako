# Phase 8C — Report Builder: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_REPORT_BUILDER`).

## 1. Architecture & intent
A no-code **report definition + saved-view** layer over the platform's existing read-models and
raw-data export. The platform already exposes rich read-models (sales/distribution/perfect-store/
route-intel/trade-spend/attribution dashboards), a **raw-data export** (`attribution` dashboards +
`toRawDataRows`), an **entity registry**, and **search**. 8C lets a tenant *compose, save, share,
and schedule* tabular/aggregate reports over **governed, RLS-scoped** data — **without** writing
arbitrary SQL.

## 2. Reuse vs net-new
- **Reuse:** the entity registry (allowed fields per entity), the raw-data export rows + existing
  aggregate read-models, the export/print patterns, search, and field-governance (column-level
  visibility). The `report.aggregate.view` / `reports.view` permission model.
- **Net-new:** a **report definition** (entity/source, selected columns, filters, group-by,
  aggregates, sort), saved views, and (optionally) scheduled delivery via the Notification Center
  (8E). **No ad-hoc SQL** — definitions compile to safe, parameterized, RLS-scoped queries over an
  allow-listed field set.

## 3. Data model (additive)
- `erp_report_defs` (`company_id?, code, name, source_entity, definition jsonb, visibility,
  is_active`), `erp_report_saved_views` (`report_def_id, company_id, user_id?, params jsonb`).
  Company-scoped RLS; global report templates platform-owned. FK-covering indexes.

## 4. Forms / Field-Governance compatibility (core requirement)
Column selection is constrained to the entity registry's allowed fields **and** the acting role's
field-governance visibility — a report can never surface a column the user couldn't see in the UI.
Form responses (8F) are reportable via the raw-data export.

## 5. Mobile / Offline
Reports are read-only; mobile renders saved views (responsive tables/cards). No offline authoring;
cached last-result view is a later optional enhancement. No offline write concern.

## 6. Audit / Security / Multi-tenant (highest-scrutiny area)
- **No arbitrary SQL.** Definitions compile to parameterized queries over allow-listed fields;
  every query is **RLS-scoped** to the caller's company — a report cannot read another tenant's
  data. Column visibility honors governance. Export volume is rate-limited + audited (data-exfil
  control, mirroring the security review's guidance).
- Report runs + exports + schedule changes audited.

## 7. Integration
Scheduled reports deliver via the Notification Center (8E) / Integration Hub. Results export reuse
existing export. Feeds the Dashboard Builder (8B) as data sources.

## 8. Phasing / Risks / Non-goals
- **8C-1** report def + safe query compiler over the entity registry (engine-first, unit-tested
  compiler + RLS proof). **8C-2** builder UI + saved views. **8C-3** scheduled delivery (via 8E).
- **Risk:** SQL injection / RLS bypass → no raw SQL, parameterized + allow-listed + RLS, with a
  dedicated cross-tenant test. **Risk:** export exfil → rate-limit + audit. **Risk:** heavy
  aggregates → cap/limit + async for large runs.
- **Non-goals:** not raw SQL access; not a BI warehouse; dashboards are 8B; charts/widgets need the
  Drag-and-Drop framework (separate roadmap item, prerequisite for 8B).

**Recommendation:** proceed behind `KAKO_REPORT_BUILDER` (OFF), **engine-first on the safe query
compiler** (the security-critical core) with a cross-tenant RLS test before any UI. Await approval.
