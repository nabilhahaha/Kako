# VANTORA — Dynamic Form & Workflow Builder: Core Implementation Plan

*Plan only — no implementation. Builds on existing pieces: custom fields (`erp_custom_fields`, 0087), the Workflow & Approval Engine, and the five foundations (Audit, Permission Matrix, Notification, Raw Data, Customer 360). Additive; no engine rewrite.*

> **Goal:** Company Admins (with permission) define new request types — form + rules + workflow + effect — as **configuration, not code**. Every submission flows through the foundations automatically (audited, permission-gated, notified, emitted as raw facts, visible in Customer 360).

---

## Summary (copy-friendly)

> **Builder Core plan.** Deliver in 6 additive increments: **B1 data model** (`erp_form_definitions`, `erp_form_fields`, `erp_form_submissions` + RLS + audit); **B2 form designer** (admin UI to add/order fields, sections, options) gated by a `forms` matrix permission; **B3 field types & rules** (text/number/date/dropdown/multi-select/attachment/image/GPS/signature/section + required/visibility/validation/conditional, reusing the workflow condition language); **B4 workflow assignment** (bind/compose a workflow via builder-lite, all approver types incl. route/account owner + hierarchy); **B5 submission processing** (render → validate → store values JSONB → `erp_workflow_start` → in-app + dispatch notifications → emit raw fact); **B6 effect handlers** (one generic `form_submission` outcome handler dispatching to a **whitelisted** effect set: `record_only`, `update_field`, `create_entity`, `set_credit_limit`, `set_gps`). Attachments via `erp_entity_attachments`; multi-tenant via global templates + per-company overrides + RLS; everything audited and analytics-emitting. Effects roll out one vetted handler at a time. First FMCG request types become configured forms.

---

## Principles
- **Reuse, don't rebuild:** custom-field types, the workflow engine, the condition engine (`erp_workflow_condition_met`), and the foundations.
- **Additive & multi-tenant:** global templates (`company_id NULL`) + per-company forms; RLS on everything.
- **Safety first on effects:** no-code → master-data mutation only via **whitelisted, reviewed** handlers + the Permission Matrix + full audit.

## Data model (B1)
- **`erp_form_definitions`**: `id, company_id (NULL=global), key, name_ar/en, module, target_entity, workflow_key, effect jsonb, status, version, is_latest, created_by, created_at`.
- **`erp_form_fields`**: `id, form_id, key, label_ar/en, type, section, sort_order, required, options jsonb, validation jsonb, visibility jsonb, default_value, created_at`.
- **`erp_form_submissions`**: `id, company_id, form_id, record_id, submitter, values jsonb, status, created_at`.
- RLS: definitions/fields readable by tenant members (+globals), writable by company admin (own) / owner (global); submissions company-scoped. Audit-capture attached to all three (Foundation #1).

## 1. Form designer (B2)
Admin UI (`/settings/forms`, gated by `forms:edit`): list/create forms; per-form designer to **add fields, set type, group into sections, reorder (drag), edit labels/options**, mark required, set rules, and bind a workflow. Live preview of the rendered form. Global templates shown read-only with “clone to customize”.

## 2. Field types (B3)
`text · number · date · dropdown · multi-select · attachment · image · GPS · signature · section`. Reuses the `erp_custom_fields` type set (text/number/date/dropdown) and extends it. Attachment/image → `erp_entity_attachments`; signature → image attachment + hash; GPS → `gps_lat/lng + geofence/source`. `options` JSONB holds choices for dropdown/multi-select.

## 3. Conditional logic (B3)
Declarative JSONB evaluated by the **same condition engine the workflow uses**:
- **required/optional** (+ `required_when`),
- **visibility** rules (show/hide by sibling values),
- **validation** (min/max/length/regex/range, client + server),
- **conditional fields & sections**. One rules language across forms and workflow steps.

## 4. Workflow assignment (B4)
Bind a form to a workflow definition or compose steps inline via **Workflow Builder-lite**. All approver types supported: `route_owner`, `account_owner`, `manager`, `department_head` (subject-anchored on the form's `customer_id`), `company_admin`, specific `user`/`role` (**custom approvers**), and platform scope for vendor-gated forms. Conditional routing/thresholds over submitted values. Approvers resolved to concrete users at task creation.

## 5. Attachments (B3/B5)
Attachment/image/signature fields write to `erp_entity_attachments` keyed to the submission (`entity='form_submission'`, `record_id=submission.id`); counts/types feed the raw fact and Customer 360. Upload policy (size/type/scan) + signed URLs per the readiness review (P1).

## 6. Permissions (B2/B5)
New `forms` resource in the Permission Matrix: `forms:edit` (build), `forms:view`, per-form **submit/approve** via the matrix `create`/`approve` actions. Each form may declare a required submit permission. Builder and submission both permission-gated; platform-scope forms gated by platform permissions.

## 7. Submission processing (B5)
Submit flow: render form (respecting visibility/validation) → server re-validates against the schema → store `values` in `erp_form_submissions` → `erp_workflow_start(form.workflow_key, 'form_submission', submission.id, values)` (values become the workflow `context` for routing) → notifications via `erp_notify_send` → **emit a raw fact** (`module=form.module`, customer/amount/gps extracted from values, `workflow_status`). Status tracked in the Request & Approval Center (`/requests`).

## 8. Effect handlers (B6)
One generic `form_submission` outcome handler dispatches by the form's `effect` config to a **whitelisted** set, each a vetted handler with an entity/field allow-list:
- `record_only` (default), `update_field` (whitelisted master field, e.g., customer VAT/GPS), `create_entity` (e.g., customer), `set_credit_limit`, `set_gps`.
Effects roll out **one at a time** (the main security surface). On approval the handler runs as the deciding user (RLS applies); platform-scope effects gated to owner.

## 9. Admin experience (B2)
- Forms list with status/version; clone-from-template; drag-order designer; rules editor; workflow binder (visualizing the chain); effect selector (from the whitelist with field mapping); preview; publish/version.
- Submitter sees the rendered form from the Request Center; requesters track status; approvers act in the inbox / platform inbox.

## 10. Multi-tenant controls (all increments)
Global templates vs per-company forms; RLS isolation on definitions/fields/submissions; versioning so in-flight submissions keep their schema; per-form permission gating; effects respect tenant + permission scope. No cross-tenant visibility.

---

## Delivery increments & milestones
| Increment | Scope | Reports |
|---|---|---|
| **B1** | Data model + RLS + audit | migration + checkpoint |
| **B2** | Form designer UI + `forms` permission | checkpoint |
| **B3** | Field types + rules engine (reuse condition engine) | checkpoint |
| **B4** | Workflow binding (builder-lite + approver types) | checkpoint |
| **B5** | Submission processing (start + notify + raw fact) | checkpoint |
| **B6** | Effect handlers (`record_only`/`update_field` first; others incremental) | checkpoint per effect |

**Testing:** extend the integration suite (form definition CRUD, submission → workflow start, effect apply, RLS isolation, permission gating). CI-gating.
**Rollout:** additive migrations applied via the staging→production guarded flow, after the 0099–0113 cutover.
**Outcome:** the first FMCG request types (New Customer, Data Update, GPS Correction, Credit, Price Exception, Trade Spend intake) ship as **configured forms**, not bespoke code.

*Plan only — nothing implemented. Awaiting approval to begin B1 after the production cutover.*
