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

---

## Platform Roadmap — Enterprise FMCG requirements (approved, queued)

> All built on the existing Workflow & Approval Engine + canonical services.
> Additive; no engine/architecture redesign.

1. **Customer Route Ownership** — route-based and account-owner-based approvals
   (see "Queued" above). Core `account_owner` + subject-anchored resolution;
   Distribution-pack `route_owner` + route-aware routing; graceful fallback;
   optional per company.

2. **Data Update Requests** — workflow request type for master-data changes:
   **CR (commercial registration), VAT, National Address, GPS, Contact Details**.
   Entity `data_update_request` (typed payload: field, old/new value, target
   record). Approver chain by company config; **approved outcome writes the new
   value to the master record** via an outcome handler; fully audited.

3. **GPS Correction Workflow** — a focused Data Update flow for customer GPS:
   field-captured coordinate → approval → **automatic master-data update** of the
   customer location, with the prior value retained in the audit/event trail.

4. **Cash Customer workflow** — walk-in / non-registered customer handling: a
   request to transact (or to create a one-off cash customer) routed for approval
   where company policy requires it; outcome creates/links the cash customer.
   (Roadmap only; not started.)

5. **Full Raw Data Layer (reusable analytics/AI spine)** — an append-only,
   module-agnostic fact/event layer so every module writes normalized rows once
   and analytics/AI read without future redesign.
   - **Shared dimensional spine (every fact row):** Date & Time · User · Branch ·
     Route · Supervisor · Salesman · Customer · Channel · Classification · SKU ·
     UOM · Quantity · Value · Cost · Gross Profit · Returns · Return Reason ·
     GPS Coordinates · Workflow Status.
   - **Design:** a normalized fact table (e.g. `erp_raw_facts`) keyed by
     `module` + `event_type` + `occurred_at`, carrying the spine as typed columns
     plus a `details` JSONB for module-specific extras; dimension references by id
     (resolved to the existing customer/route/user/branch/SKU tables) with
     denormalized snapshots for point-in-time accuracy. Append-only + indexed for
     time/branch/route/customer/SKU; partition-ready by date.
   - **Reusable across:** Visits, Merchandising, Inventory, Trade Spend, Old
     Expiry, Sales Execution, and future modules — each emits raw facts through a
     thin writer, never its own bespoke analytics schema.
   - **Workflow-aware:** `workflow_status` on each fact lets approval state flow
     into analytics (e.g., approved vs pending corrections), tying the engine to
     reporting.
   - **Goal:** a single, stable schema that BI/AI reporting can target now and as
     modules grow — no future database redesign.

## Platform-Foundation Phase (after Customer Route Ownership, BEFORE FMCG packs)

> Cross-cutting scalability foundations. Recorded now; not started — to run as a
> dedicated phase so FMCG-specific workflow packs build on a stable base.

1. **Audit Trail Engine** — track every create / update / delete / approval /
   status change, storing **old value, new value, user, timestamp, approval
   reference**. Generalizes today's `erp_audit_logs` + `erp_workflow_events` into
   a uniform, queryable trail across all entities.
2. **Role & Permission Matrix** — permission-based security (not role-only):
   granular **view / create / edit / approve / export / admin** permissions per
   resource, layered on the existing `erp_roles` / company-role matrix.
3. **Universal Notification Engine** — one centralized notification service,
   **email first**, with future WhatsApp / SMS / Teams / Push channels (the
   `erp_notifications.channel` field already anticipates this).
4. **Raw Data Framework** — standard audit/context fields on every module row
   (**company, branch, route, customer, user, date, time, status, GPS,
   attachments, workflow reference**) feeding the Full Raw Data Layer spine;
   future-ready for analytics, BI and AI.
5. **Customer 360 Foundation** — a single customer profile aggregating sales,
   visits, requests, approvals, trade spend, expiry and future modules.

### Sequencing
M4(b) Onboarding → **M4(c) Module Activation & Integrations** → **Customer Route
Ownership** → **Platform-Foundation Phase (items 1–5 above)** → FMCG-specific
workflow packs (Data Update / GPS Correction → Raw Data Layer → Cash Customer →
HR / Purchasing / Expenses / Discounts / …), each an additive engine/handler
increment.
