# Customer Workbench — FMCG Governance & Master-Data Review

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** *Audit & review only — no implementation, no architecture change, no business-logic change.*

## Executive summary

Three pivotal findings shape every recommendation below:

1. **The edit gate is coarse, not field-level.** `upsertCustomer` requires `customer.create` (create) or `customers.manage` / `customer.edit` (edit). A user with `customer.edit` can edit **every** field directly. Field-level restriction exists **only** through the optional **field-governance** config (`resolveLayout`: `hidden < view < edit < required`, per company · per field · per role/permission, with admin-lockout protection) — but its **registry default is `edit`**, i.e. *no shipped policy forces non-admins into request flows for sensitive fields.* The mechanism exists; the **default governance policy does not.**

2. **A generic change-request backbone already exists and is under-used.** `erp_customer_change_requests (changes JSONB · reason · requested_by · decided_by · status)` can carry **any** field-change request (Address / CR / VAT / National Address / Data Correction). `upsertCustomer` already notes "reps without `customer.create` use the governed customer-request flow." This is the spine for the requested request-types — mostly **not surfaced** in the Workbench.

3. **Per-customer pricing does not exist.** `erp_price_lists` are **branch-scoped + `is_default`**; there is **no `price_list_id` / pricing group / discount group on the customer** and no customer→price-list link. So "Assigned Price List / Pricing Group / Discount Group / pricing overrides / resolution hierarchy" are **not modelled** — this is a **pricing-governance workstream**, not a Workbench display task.

---

## 1. Current state

### Request / approval flows that exist today
| Flow | Mechanism | Gate |
|------|-----------|------|
| Credit-limit change | `requestCreditLimitChange` (critical action `customer.creditLimitOverride`) **and** FMCG `requestCreditLimit` | `credit.request.create` |
| GPS change | `requestCustomerGpsChange` (`customer.gpsChangeApproval`) | action policy |
| Generic data-update approval | `requestCustomerApproval` (`customer.dataUpdateApproval`) | action policy |
| Customer / salesman / route / region / branch **transfer** | `erp_customer_transfers` (from/to salesman·route·region·branch + reason + status) | `customer.transfer` |
| Generic field-change request | `erp_customer_change_requests` (JSONB) | governed rep flow |
| Status change | critical action `customer.statusChange` (reason mandatory) | `customers.change_status` |
| Approval (onboarding) | approval workflow → `approval_status` | `customers.approve` |

### Audit
`erp_audit_logs (actor_id · actor_email · action · entity · entity_id · details JSONB · created_at)`. **Changed-by** and **timestamp** are first-class; **old/new value · role · reason · request-ref** all live (if at all) inside `details` — **not structured or guaranteed.**

### Territory / assignment (all on the customer record)
`branch_id · region_id · area_id · route_id → erp_routes · salesman_id · visit_day`. **Visit frequency** lives in `erp_journey_plans` (weekly/biweekly/monthly) — JP-engine-owned.

---

## 2. Gap analysis

| Area | Gap |
|------|-----|
| **Field-level governance** | No shipped default policy; `customer.edit` is all-or-nothing. Non-admins are not *forced* into request flows for sensitive legal/commercial fields unless a company hand-configures governance. |
| **Request flows surfaced** | Only credit/GPS/transfer/generic-approval are surfaced in the UI. **Address / CR / VAT / National Address / Data-Correction** requests have a backbone (`erp_customer_change_requests`) but **no dedicated UI**. |
| **Pricing governance** | Per-customer price list / pricing group / discount group / overrides / resolution hierarchy **do not exist**. |
| **Audit completeness** | `details` JSONB is not a structured old→new/role/reason/request-ref envelope; coverage is inconsistent across edit paths. |
| **Workbench visibility** | Credit limit · payment terms · salesman · route · region · area · visit day · health · last-activity are not surfaced in the 360 read view (most editable only in the Profile form). |

---

## 3. FMCG recommendations

1. **Ship a default field-governance policy** (a sensitivity tier per field) so non-admins get `view` (not `edit`) on legal/commercial/financial/territory fields out-of-the-box — reusing the **existing** `resolveLayout` engine (config/data, not new architecture).
2. **Surface the change-request flow** for Address / CR / VAT / National Address / Data Correction using the **existing** `erp_customer_change_requests` — one "Request a change" affordance on the read-only fields for non-admins; an approver applies it.
3. **Structure the audit envelope** — standardise `details` to always carry `{ field, oldValue, newValue, role, reason, requestRef }` for every direct edit and every applied request (no new table; tighten the writer).
4. **Treat pricing as its own governance workstream** — model `customer.price_list_id` (+ optional pricing/discount group) and a resolution hierarchy (customer → segment/channel → branch → default). Out of scope for the Workbench until modelled.
5. **Surface read-only operational/commercial context** in the 360 (credit limit · terms · salesman · route · region · area · visit day · health · last-activity) — display only, edits stay governed.

---

## 4. Priority ranking

| # | Item | Value | Effort | Notes |
|---|------|-------|--------|-------|
| **P1** | Default field-governance sensitivity policy (view vs edit by role) | High | Med | Reuses `resolveLayout`; the core governance fix |
| **P1** | Structured audit envelope (old/new/role/reason/request-ref) | High | Med | Compliance backbone |
| **P1** | Surface read-only commercial/territory context in 360 | High | Low | Display only |
| **P2** | Surface change-request UI (Address/CR/VAT/National Address/Data Correction) | High | Med | Backbone exists (`erp_customer_change_requests`) |
| **P2** | Transfer history visibility (salesman/route/territory) | Med | Low | `erp_customer_transfers` populated |
| **P3** | Pricing governance (price list/group/overrides/hierarchy) | High | High | **New modelling — separate workstream** |
| **P3** | Visit frequency / coverage status | Med | Med | **Coverage & JP engine** |

---

## 5. Field-level permission matrix

Legend: **DA** = Direct Edit allowed for Admin (audited) · **RR** = Request Required for Non-Admin · **AA** = Approval Required for All · **RO** = Read-Only/system.

### Legal & commercial data
| Field | Admin | Non-Admin | Classification |
|-------|-------|-----------|----------------|
| Legal name | edit (audited) | request | DA + RR |
| CR number | edit (audited) | request | DA + RR |
| Tax / VAT number | edit (audited) | request | DA + RR |
| National address | edit (audited) | request | DA + RR |
| Address | edit (audited) | request | DA + RR |
| Phone(s) | edit (audited) | request | DA + RR |
| Contact person | edit (audited) | request | DA + RR |
| Email | edit (audited) | request | DA + RR |

### Commercial controls
| Field | Admin | Non-Admin | Classification |
|-------|-------|-----------|----------------|
| Credit limit | edit via critical-action (audited) | request | **AA** (critical action for all) |
| Payment terms | edit (audited) | request | DA + RR |
| Customer status (active/blocked) | edit via critical-action + reason | request | **AA** |
| Approval status | — (workflow only) | — | **RO** (system/approval) |
| Credit-control flags | edit (audited) | request | DA + RR |

### Pricing governance *(not modelled today — target state)*
| Field | Admin | Non-Admin | Classification |
|-------|-------|-----------|----------------|
| Assigned price list | edit (audited) | request | DA + RR *(future)* |
| Pricing group | edit (audited) | request | DA + RR *(future)* |
| Discount group | edit (audited) | request | DA + RR *(future)* |
| Pricing overrides | edit via approval | request | **AA** *(future)* |
| Commercial classification (pricing-affecting) | edit (audited) | request | DA + RR |

### Territory & assignment
| Field | Admin | Non-Admin | Classification |
|-------|-------|-----------|----------------|
| Branch | edit / transfer (audited) | transfer request | DA + RR |
| Region | edit / transfer | transfer request | DA + RR |
| Area | edit / transfer | transfer request | DA + RR |
| Route | edit / transfer | transfer request | DA + RR |
| Assigned salesman | edit / transfer | transfer request | DA + RR |
| Visit day | edit (audited) | request | DA + RR |
| Visit frequency | — *(JP engine)* | — *(JP engine)* | **RO here** (owned by JP) |
| Territory ownership | transfer | transfer request | **AA** (transfer workflow) |

### Customer operations (all via the transfer workflow)
| Operation | Admin | Non-Admin | Classification |
|-----------|-------|-----------|----------------|
| Customer / Salesman / Route / Territory transfer | apply (audited) | transfer **request** | **AA** |

---

## 6. Belongs in the Customer Workbench

- Read-only display of: credit limit · payment terms · salesman · route · region · area · visit day · health status · last visit/order/invoice/collection/return.
- Default field-governance sensitivity policy (view vs edit) via the existing engine.
- Change-request affordances (Address/CR/VAT/National Address/Data Correction) on read-only fields → `erp_customer_change_requests`.
- Transfer **history** (read `erp_customer_transfers`).
- Structured audit envelope + an Audit tab that shows credit/pricing/transfer/territory/status/activation events.

## 7. Belongs in the future Coverage & Journey-Plan Engine

- **Visit frequency** (`erp_journey_plans` owns it) and **coverage status** (derived from JP adherence).
- Journey-plan / route assignment management (the Workbench *reads*; the engine *owns*).

## Separate workstream (neither — needs new modelling)

- **Pricing governance:** `customer.price_list_id` + pricing/discount groups + overrides + resolution hierarchy. The Workbench can only *display/assign* once this is modelled.

---

## 6. Audit-tab review (events to add)

Current feed covers create · update · status-change · approval request · approve/reject · credit-limit request · GPS request. **Recommend adding** (compliance-relevant): credit-limit **decisions**, **pricing changes** (once modelled), **transfers / territory reassignments**, **activation/deactivation**, and any **applied change-request** — each with the structured old→new/role/reason/request-ref envelope.

---

**No implementation performed. No architecture, business-logic, permission, or RLS change. Awaiting your direction on which items move into the Customer Workbench, the Coverage & JP engine, or a dedicated Pricing-governance workstream.**
