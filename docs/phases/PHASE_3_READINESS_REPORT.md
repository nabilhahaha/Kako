# VANTORA — Phase 3 (Sales / FMCG Distribution) Readiness Report

**Date:** 2026-06-07 · **Status: ✅ FMCG distribution core complete & staging-ready
(new work flag-OFF; existing capabilities live).**

Phase 3 was **reuse-heavy**: the Sales/FMCG domain is already extensively built. Our
additive contributions filled the **Collections** gap (multi-invoice settlement) and
added a **coverage/KPI** read-model, all flag-gated (`KAKO_DISTRIBUTION`) and additive.
Discipline held: data integrity first · additive-only migrations · flags OFF · no gate
bypasses · reuse-over-rebuild.

---

## 1. Capability matrix (prioritized FMCG areas)

| Area | Status | Backing (existing unless noted) |
|------|--------|----------------------------------|
| **Journey Plans** | ✅ Exists | `erp_journey_plans` (weekday/frequency/effective windows), `erp_today_journey()`, sort modes (manual/nearest/optimized/hybrid). |
| **Route management** | ✅ Exists | `erp_routes` (rep, van warehouse, working days), `erp_route_customers` (sequence). |
| **Customer coverage** | ✅ Exists + **enhanced** | Plan/visit data + **new** `coverageKpis()` (coverage%, missed, off-route). |
| **Visit execution** | ✅ Exists | `erp_visits` (GPS check-in/out, geofence), `erp_check_in_visit()`, reasons. |
| **Van Sales** | ✅ Exists | Van warehouses, `erp_stock_requests` (+approval), `erp_van_reconciliations` (variance). |
| **Collections** | ✅ **Enhanced (this phase)** | Legacy `erp_payments` + **new** `erp_collections`/`erp_collection_allocations`, allocation engine + settlement service (multi-invoice, oldest-first/specified, on-account). |
| **Returns** | ✅ Exists | `erp_sales_returns`/`_lines`, `erp_return_reasons`, analytics, atomic completion. |
| **Supervisor monitoring** | ✅ Exists + **enhanced** | Approval workflows + **new** `coverageKpis()`/`rollupCoverage()` (strike rate, productive, team roll-up). |
| **Route reconciliation** | ✅ Exists | `erp_van_reconciliations`/`_lines` (expected vs actual, variance, approval threshold). |
| **Coverage compliance** | ✅ Exists + **enhanced** | `erp_visit_compliance` (out-of-route/GPS), day-close coverage %, + new KPI engine. |

**New this phase (PRs #159–#162, +#163 e2e/report):** allocation engine, `0192`
collection model, settlement service, coverage/KPI engine — **858+ unit, 38 integration
tests** across all phases; build clean.

## 2. Cross-cutting dimension validation

| Dimension | Supported? | Evidence |
|-----------|------------|----------|
| **Multi-company** | ✅ | All tables RLS-scoped; new e2e proves `erp_collections` A↮B isolation; tenant insert-stamping; cross-company write rejected. |
| **Multi-branch** | ✅ | Branch-scoped RLS via `erp_user_branch_ids()` on collections/visits/orders/routes; `branch_id` FKs throughout. |
| **Multi-salesman** | ✅ | `erp_routes.rep_id`, `erp_customers.salesman_id`, `erp_visits.salesman_id`, `erp_journey_plans.salesman_id`; `erp_today_journey(p_salesman,…)`. |
| **Supervisor hierarchy** | ✅ | `erp_regions.manager_id`, `erp_areas.manager_id`, branch→company; permission-based approvers (`erp_user_has_permission`); `rollupCoverage()` aggregates a team. |
| **Route ownership** | ✅ | `erp_routes.rep_id` + `erp_route_customers`; van warehouse `assigned_to`; out-of-route compliance keyed to the rep's plan. |
| **Approval workflows** | ✅ | `erp_workflow_definitions`/`_steps` (approver types incl. role/manager/permission); visit-compliance, day-close, van-recon, customer-transfer approvals; FMCG thresholds in `erp_fmcg_settings`. |
| **Offline / mobile-first** | ◑ Supported by design | Idempotent creates (`erp_invoices.idempotency_key`), `created_source`/`updated_source` provenance, event bus for async dispatch. A formal **offline sync/queue + conflict resolution** is the one explicit build-out (Phase 3.x) — the data model already supports it (no redesign). |

## 3. Future-requirement extensibility (no redesign needed)

| Future requirement | Extension point already present |
|--------------------|----------------------------------|
| **GPS check-in/out** | Live: `erp_visits.check_in/out_lat/lng`, `gps_distance_m`, `gps_status`, geofence in `erp_check_in_visit()`. |
| **Route riding** (supervisor accompanies rep) | Visit + compliance model + supervisor hierarchy; add a `ride_along` visit attribute / supervisor visit link — additive. |
| **Perfect Store** | `erp_customer_attributes` (flexible lookup-driven) + visit reasons/compliance → scorecard as additive attributes + a KPI view. |
| **MSL** (Must-Stock List) | Per customer segment/channel (`erp_customer_lookups`) + product catalog → an additive `msl` mapping table; OOS check reads it. |
| **OOS** (out-of-stock) | Van/customer stock checks at visit → additive `visit_stock_check` rows; no schema redesign. |
| **Merchandising** | Visit-linked additive capture (photos/checklists) via attributes + attachments; reuses the events/audit infra. |
| **Near Expiry** | `erp_products_catalog.expiry_days` + GRN `batch_number`/`expiry_date` already captured → additive near-expiry flag on van recon / returns. |
| **Cash Van vs Delivery Van** | `erp_warehouses.warehouse_type='van'` + `assigned_to`; add a `van_mode` attribute — additive; order/invoice flow already supports both immediate (cash) and order→deliver. |
| **Customer Health Scoring** | Coverage/strike-rate KPIs + AR aging + returns analytics already computable per customer → additive scoring read-model; no core change. |

**Conclusion on extensibility:** every listed future requirement maps to an **additive
table/attribute + read-model**, reusing the existing customer-attributes, lookups,
visit/compliance, events, and KPI primitives. **No redesign of the core distribution
model is required.**

## 4. Data-integrity invariants (new work)
- **Cash application:** never apply more than an invoice's outstanding; never allocate
  more than the collection; overpayment → on-account (never lost). Engine + service
  unit-tested; e2e proves invoice `paid_amount`/status update.
- **Constraints:** `applied_amount > 0`, `UNIQUE(collection_id, invoice_id)` (e2e-proven).
- **Tenant isolation:** RLS on `erp_collections`/`_allocations` (multi-company e2e).
- **Additivity:** new collection model is **parallel** to legacy `erp_payments` — no
  change to existing payment/AR behaviour. Migration `0192` additive, idempotent,
  schema-health FK+RLS invariants pass.

## 5. Migrations & rollback
`0192` collections settlement (additive; idempotent; FK-covered; RLS). Rollback =
flags OFF + inert schema (new model unused until `KAKO_DISTRIBUTION` on); no data
mutation; clean additive-drop if ever needed.

## 6. Deferred sub-tracks (Phase 3.x — owner greenlight)
1. **Offline-first sync & conflict resolution** for field execution (model already supports; needs the sync layer).
2. **Van load manifest** (formal load list linking request→sales→reconciliation).
3. **Domain-event wiring** for the remaining sales events (`payment.received`, `visit.completed`, `order.approved`, …) — infra ready, additive.
4. **Supervisor KPI dashboard UI** + persisted KPI read-model (engine is built; surfacing is a UI increment).
5. Perfect Store / MSL / OOS / merchandising / customer-health **scorecards** (additive, per §3).

## 7. Stop-conditions
None encountered. No data-integrity, security, irreversible-migration, or architectural-
conflict issues. All new behaviour flag-OFF; existing FMCG behaviour unchanged.

**Conclusion:** the **Phase 3 FMCG distribution core is complete and staging-ready** —
existing capabilities validated across multi-company/branch/salesman/supervisor/route/
approval dimensions, the Collections gap closed with a tested multi-invoice settlement
model, a coverage/KPI engine added, and **all listed future requirements supported
additively without redesign**. Offline sync + the listed scorecards are clearly-scoped
Phase 3.x sub-tracks for owner greenlight.
