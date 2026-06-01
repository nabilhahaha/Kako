# Workflow & Approval Engine — Foundation Roadmap

Generic, entity-agnostic engine reused across company- and platform-scope
approvals. Additive only; no engine/workflow redesign per increment.

## Shipped
- **M1 — Foundation:** `scope`, versioning, delegation, `erp_workflow_events`
  timeline, engine-level audit triggers.
- **M2 — Request & Approval Center UX:** `/requests` (Approvals · My Requests · History).
- **M3 — Platform scope:** platform approver types, platform inbox, scope-aware
  RLS + notifications, full audit coverage.
- **Hierarchical approvers:** `manager` / `department_head` via the existing org
  hierarchy (`reports_to`, `erp_departments`), resolved to concrete users at
  task creation.

## In progress
- **M4 — Request types (in order):**
  - **M4(a) Billing & Subscription** — `subscription_change` platform workflow +
    typed request table + outcome handler → canonical subscription service.
  - **M4(b) Onboarding** — tenant onboarding/provisioning requests.
  - **M4(c) Customization / Module activation / Integrations** — platform-scope
    enablement requests.

## Queued — immediately after the M4 thread (before future FMCG workflow packs)
### Customer Route Ownership & subject-anchored approvers
Approved design. Additive resolver extension; reuses `erp_routes`,
`erp_customers` (`route_id`, `salesman_id`), `erp_user_branches`, `reports_to`.
No new core tables.

- **Core engine:** `account_owner` approver type (→ `customer.salesman_id`) and
  **subject-anchored** resolution — resolve `manager`/`department_head` relative
  to the request's subject owner (stored on the instance context at start), not
  only the requester. Generic; available to any company.
- **Distribution/FMCG pack:** `route_owner` approver type (→ `customer.route_id`
  → `erp_routes.rep_id`) and route-aware routing, gated by the `distribution`
  module.
- **Optional per company:** driven by the `distribution` module toggle. Route
  ownership is never required.
- **Graceful fallback:** Route Owner → Account Owner → Branch Manager → Company
  Hierarchy. Non-distribution companies use Customer → Account Owner → Company
  Hierarchy.
- **Resolution timing:** owners resolved to concrete users at task creation, so a
  route-owner change affects **new** requests while **in-flight** requests keep
  their already-resolved approvers.
- **Tenant isolation & existing definitions:** preserved (company-scoped joins;
  no change to current definitions).
- **Import mapping (future):** optional customer-import columns — Route, Route
  Owner, Salesman, Customer Ownership — present only when `distribution` is
  enabled, ignored otherwise.

## Later — FMCG / domain workflow packs
HR (leave), purchasing (PO), expenses, inventory adjustments, discounts,
user-access / permission-change — each as a workflow definition + outcome
handler (+ typed table for heavy domains), using the engine and the
subject-anchored / hierarchical resolvers above.
