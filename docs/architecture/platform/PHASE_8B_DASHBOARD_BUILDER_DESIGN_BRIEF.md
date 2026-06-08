# Phase 8B — Dashboard Builder: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_DASHBOARD_BUILDER`).
**Depends on:** the Drag-and-Drop Framework (its prerequisite) and 8C (Report Builder) as data
sources.

## 1. Intent
A no-code **dashboard composer**: tenants arrange KPI/chart/list widgets onto a saved, shareable
dashboard, fed by the existing read-models and 8C report definitions — all RLS-scoped and
governance-aware.

## 2. Reuse vs net-new
- **Reuse:** `StatCard` + the existing read-models (sales/distribution/perfect-store/route-intel/
  trade-spend/attribution dashboards already render KPIs), the **DnD framework** (layout), **8C**
  report defs (tabular/aggregate widgets), `report.aggregate.view`/`reports.view` permissions,
  and `erp_rep_day_kpis`/`erp_intel_health_snapshots` snapshots for cheap reads.
- **Net-new:** a **dashboard definition** (widget list + grid layout + per-widget data binding) +
  a **widget catalog** (KPI card, trend, leaderboard, table-from-8C, gap list).

## 3. Data model (additive)
- `erp_dashboards` (`company_id?, code, name, name_ar, visibility, is_active`),
  `erp_dashboard_widgets` (`dashboard_id, company_id, type, layout jsonb, binding jsonb, order`).
  Company-scoped RLS; global dashboard templates platform-owned + cloned-on-use. FK-covering
  indexes. Layout persistence uses the DnD framework's persistence contract.

## 4. Forms / Field-Governance compatibility
Widgets bound to 8C reports inherit 8C's allow-listed, governance-filtered columns — a dashboard
can never surface data the viewer couldn't see. KPI widgets bind to existing read-models (already
RLS-scoped).

## 5. Mobile / Offline
Dashboards render responsively on mobile (widgets reflow to cards/stack). Authoring (DnD) is
desktop/tablet-first via the DnD framework (touch-capable). Read-only; cached-last-view is a later
optional enhancement. No offline write concern.

## 6. Audit / Security / Multi-tenant (high scrutiny)
- Every widget reads through an **RLS-scoped** read-model or an 8C report (which itself is
  parameterized + allow-listed + RLS-scoped) — **no widget runs arbitrary SQL**. Cross-tenant
  isolation proven by test (a dashboard can't read another company's data).
- Dashboard create/edit/share + layout changes audited (layout via the DnD audit contract).
- Sharing is company-scoped (a tenant shares within its company; platform templates are read-only).

## 7. Integration
Widgets source from existing read-models + 8C reports; export/snapshot reuse existing patterns.
No new data transport. The Drag-and-Drop framework provides layout; 8C provides tabular data.

## 8. Phasing / Risks / Non-goals
- **8B-1** dashboard def + widget catalog over existing read-models (KPI cards first; no DnD yet —
  fixed layout). **8B-2** DnD layout (once the framework lands). **8B-3** 8C-backed table/chart
  widgets + sharing.
- **Risk:** sequencing — 8B needs DnD + ideally 8C first (documented dependency; 8B-1 can ship with
  a fixed layout if DnD slips). **Risk:** heavy dashboards → per-widget caching + snapshot reads.
  **Risk:** cross-tenant leakage via a widget → RLS + allow-listed sources + cross-tenant test.
- **Non-goals:** not a BI warehouse; not raw SQL; charting beyond the widget catalog is later;
  no external embedding in the initial scope.

**Recommendation:** proceed behind `KAKO_DASHBOARD_BUILDER` (OFF), **after** the DnD framework
(layout) and ideally **after** 8C (data sources). 8B-1 (fixed-layout KPI dashboards over existing
read-models) can start independently if needed. Await approval.
