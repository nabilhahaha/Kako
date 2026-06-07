# VANTORA — Phase 3 (Sales / FMCG Distribution) Kickoff Plan

**Date:** 2026-06-07 · **Status:** in progress · **Discipline:** data integrity first ·
additive-only migrations · flags OFF by default (`KAKO_DISTRIBUTION`) · no gate bypasses ·
reuse-over-rebuild.

## What already exists (survey) — reuse, don't rebuild
The Sales/FMCG domain is **extensively built**:
- **Customers** — `erp_customers` (+ lookups, attributes, change-requests, approval workflow, region/area hierarchy, GPS).
- **Routes/territories** — `erp_routes`, `erp_route_customers` (sequence).
- **Journey plans** — `erp_journey_plans` (weekday/frequency/effective windows), `erp_today_journey()`, sort modes.
- **Visits** — `erp_visits` + `erp_visit_compliance` (GPS check-in/out, geofence, out-of-route, supervisor approval).
- **Orders/invoices** — `erp_sales_orders/_lines`, `erp_invoices/_lines` (order→invoice→AR).
- **Van sales** — van warehouses, `erp_stock_requests`, `erp_van_reconciliations` (variance + approval).
- **Collections** — `erp_payments` (single-invoice link).
- **Returns** — `erp_sales_returns/_lines`, `erp_return_reasons`, analytics.
- **Supervisor** — workflow engine + permission-based approvers; day-close, recon, compliance, transfer approvals; `erp_fmcg_settings` thresholds.

## Gaps (Phase 3 scope — additive)
1. **Collections (MINIMAL):** no multi-invoice settlement, no overpayment/on-account, no cash-vs-AR variance. ← *increment 1+*
2. **Van load manifest:** stock requests exist, but no formal "what was loaded" manifest linking load → sales → reconciliation.
3. **Journey-plan adherence metrics:** coverage % exists at day-close; no planned-vs-actual adherence/deviation analytics.
4. **Supervisor KPI:** approvals exist; no aggregated KPI (calls/orders/collections/coverage/returns%).
5. **Domain-event wiring:** catalog + bus exist; `customer.*`, `order.approved`, `payment.received`, `visit.completed`, `stock_transfer.completed` not yet emitted.

## Increment plan (dependency order)
1. **Collection settlement (payment allocation) engine — pure** ← *this increment.* Multi-invoice allocation (oldest-first / specified), overpayment→on-account, never over-apply. `KAKO_DISTRIBUTION` (OFF).
2. **Collection settlement data model + service** — `erp_collection_allocations` (collection ↔ invoice applied amounts), persist + update invoice `paid_amount`; AR variance flag. Additive, RLS, inert.
3. **Domain-event wiring** — emit the missing events via `emitDomainEvent` (reuse; `KAKO_EVENTS` OFF) so settlement/visit/order feed the bus.
4. **Journey-plan adherence** — additive adherence capture (planned vs actual) + metrics.
5. **Van load manifest** — manifest on stock-request approval, linked to reconciliation.
6. **Supervisor KPI** — aggregate read-model (views) for rep/route/region.
7. **End-to-end + multi-company integration tests** + Phase 3 readiness report.

## Safety / boundary
- No change to existing customer/route/visit/order/van/return behaviour; all enhancements additive + flag-gated OFF.
- Any GL touchpoint reuses the Phase-1 posting engine under distinct reference types (zero double-post).
- Compatible with Role-Governance, Data-Portability, Country-Compliance foundations (tenant-scoped, additive).
