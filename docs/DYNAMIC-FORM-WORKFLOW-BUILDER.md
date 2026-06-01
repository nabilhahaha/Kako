# VANTORA — Dynamic Form & Workflow Builder: Architecture Proposal

*Proposal only — no implementation. Lets Company Admins (with permission) create new request types — form + rules + workflow + effect — without development.*

> **Key insight:** most pieces already exist — custom fields (`erp_custom_fields`, 0087), the generic Workflow & Approval Engine (definitions/steps/instances/tasks, all approver types incl. route/account owner + hierarchy), and the five foundations (Audit, Permission Matrix, Notification, Raw Data, Customer 360). This builder is mainly **assembly + a generic submission path**, not green-field.

---

## Summary (copy-friendly)

> **Dynamic Form & Workflow Builder.** A no-code way for company admins to define a **request type** = (1) a **form schema** (typed fields + sections), (2) **field rules** (required/visibility/validation/conditional), (3) a bound **approval workflow** (reusing every existing approver type), and (4) an optional **effect** applied on approval (update/create master data) via a **whitelisted** handler set. New submissions store values as JSONB, start the workflow, and flow through all foundations automatically: **audited**, **permission-gated**, **notified**, **emitted as raw facts**, and surfaced in **Customer 360**. Global templates + per-company forms; full multi-tenant RLS. Covers New Customer, Data Update, GPS Correction, Trade Spend, Old Expiry, Price Exception, Credit, and any future process as **configuration, not code**. **Recommendation: build the builder CORE before the first FMCG pack (it turns most FMCG request types into configuration), after closing the P0 readiness items; roll out master-data EFFECT handlers incrementally with whitelisting + the Permission Matrix.**

---

## 1. Dynamic Form Builder

A **form definition** is a versioned schema owned by a tenant (or a global template).

- **`erp_form_definitions`**: `id, company_id (NULL=global template), key, name_ar/en, module, target_entity (optional), workflow_key (bound workflow), effect (jsonb), status, version, is_latest, created_by`.
- **`erp_form_fields`**: `form_id, key, label_ar/en, type, section, sort_order, required, options jsonb, validation jsonb, visibility jsonb, default_value`.

**Field types:** text · number · date · dropdown · multi-select · attachment · image · GPS · signature · **section** (grouping/header). Reuses and extends the existing `erp_custom_fields` type set (text/number/date/dropdown already there); adds multi-select, attachment, image, GPS, signature, section. Attachment/image map to `erp_entity_attachments`; GPS captures `gps_lat/lng + geofence/source`; signature stored as an attachment (image) + hash.

## 2. Field Rules

All rules are **declarative JSONB**, evaluated by the same condition engine the workflow already uses (`erp_workflow_condition_met`), so there is one rules language across forms and workflows.

- **Required/Optional:** `required` flag (+ conditional-required via a `required_when` rule).
- **Visibility rules:** `visibility` JSONB — show/hide a field based on other field values (e.g., show "competitor name" when "has competitor" = yes).
- **Validation rules:** `validation` JSONB — min/max, length, regex, allowed ranges; enforced client-side and re-checked server-side on submit.
- **Conditional fields:** `visibility`/`required_when` referencing sibling values; section-level conditions supported.

## 3. Workflow Assignment

A form **binds to a workflow definition** (the existing engine). The builder reuses **Workflow Builder-lite** to compose steps/approvers:

- **Select approval workflow** (existing definition) or compose steps inline.
- **Approver types (all already supported):** `route_owner`, `account_owner`, `manager`, `department_head` (subject-anchored on the request's customer/owner), `company_admin`, specific `user`/`role` (**custom approvers**), and platform scope (`platform_owner`/`platform_staff`) for vendor-gated forms.
- **Conditional routing & thresholds** via step conditions over the submitted values (e.g., credit amount > X → owner step).
- On submit, the engine resolves approvers **to concrete users at task creation** (so owner changes affect new requests; in-flight keep their approvers).

## 4. Integration with existing foundations

- **Audit Trail:** form/field/definition changes captured (before/after) via the audit-capture triggers; every submission + decision + applied effect audited with `workflow_instance_id` (approval reference).
- **Permission Matrix:** a `forms` resource (`view/create/edit/approve/…`) gates the **builder** (`forms:edit`) and per-form **submit/view**; each form may declare a required permission. Approval uses the matrix `approve` action.
- **Notification Engine:** form events (submitted / decided / escalated) fire via `erp_notify_send` with per-form templates + user/company channel preferences.
- **Raw Data Framework:** each submission/decision **emits a raw fact** (`module = form.module`, `entity_type = form.key`, `customer_id/amount/quantity/gps/...` extracted from values, `workflow_status`) → analytics with no per-form schema.
- **Customer 360:** when a form's values include a `customer_id`, the request appears in the customer's **workflow summary** and **analytics** automatically (extend `erp_workflow_subject_customer` to read `customer_id` from submission values).

**Submission storage:** `erp_form_submissions (id, company_id, form_id, record_id, submitter, values jsonb, status, created_at)`. The workflow instance uses `entity = 'form_submission'` (or the form key) and `record_id = submission.id`; `context = values` (for conditional routing). A **single generic outcome handler** (`form_submission`) applies the form's configured **effect** on approval.

**Effect model (the sensitive part):** `effect` JSONB on the form definition declares one of a **whitelisted** set:
`record_only` (default — just store/approve) · `update_field` (set a whitelisted master field, e.g., customer GPS/VAT) · `create_entity` (e.g., create a customer) · `set_credit_limit` · etc. Each effect is a vetted handler with a **field/entity allow-list** — no-code forms cannot arbitrarily mutate sensitive tables. New effects ship as reviewed handlers over time.

## 5. Multi-tenant considerations

- **Global templates** (`company_id NULL`) ship ready-made forms (New Customer, Data Update, GPS Correction, Credit, …); a tenant **clones & customizes** into its own form (per-company override), exactly like workflow definitions.
- **RLS:** form definitions/fields readable by tenant members (+ globals) ; writable by company admins (own) / owner (global). Submissions company-scoped; values never cross tenants.
- **Versioning:** running submissions keep the form version they started with; edits create a new version.

## 6. Future use cases (all = configuration, not code)

| Use case | Form fields | Workflow | Effect (on approve) |
|---|---|---|---|
| **New Customer Request** | name, code, classification, route, GPS, attachments | route_owner → manager → company_admin | `create_entity: customer` |
| **Customer Data Update** (CR/VAT/National Address/Contact) | field, new value, attachment | account_owner → company_admin | `update_field` (whitelisted) |
| **GPS Correction** | captured GPS + geofence | route_owner → manager | `update_field: customer.gps` |
| **Trade Spend Request** | amount, type, period, customer | manager → (cond: amount) finance/owner | `record_only` (+ future ledger) |
| **Old Expiry Request** | SKU, qty, expiry, photos | supervisor → manager | `record_only` / stock action |
| **Price Exception** | SKU, requested price, customer | manager → (cond) owner | `record_only` / price override |
| **Credit Request** | requested limit, justification | company_admin → (cond: amount) senior | `set_credit_limit` |
| **Any future process** | configured | configured | whitelisted effect |

These mostly map onto patterns already proven (credit-limit, customer onboarding) — the builder generalizes them so admins create them without dev work.

---

## Recommendation & sequencing

**Recommendation: build the Builder CORE *before* the first FMCG pack** — because most FMCG request types (data update, GPS correction, credit, price exception, trade-spend intake) become **configuration** on this builder instead of bespoke code, saving repeated work and keeping them uniform (audited, permission-gated, analytics-emitting). 

**But sequence it safely:**
1. **First close the P0 readiness items** (currency/Region-Area on facts, production cutover of 0099–0112, integration/RLS tests) — the builder rides on those foundations.
2. **Then build the Builder core:** form definitions/fields + rules engine (reusing condition language) + binding to the workflow engine + generic submission + the `record_only` and `update_field`(whitelisted) effects + foundation hooks (audit/permission/notification/raw-fact/360).
3. **Roll out effect handlers incrementally** (`create_entity`, `set_credit_limit`, GPS update) — each a small, reviewed, allow-listed handler — because no-code → master-data mutation is the main security surface; the Permission Matrix + effect whitelist + audit mitigate it.
4. **First "FMCG pack" then becomes largely configured forms** plus any module-specific UI, dramatically reducing pack effort.

**Scope guardrails:** no engine rewrite (reuse workflow + custom-fields + foundations); effects are whitelisted, never arbitrary SQL; everything multi-tenant + permission-aware + audited by construction.

*Architecture proposal only — nothing implemented.*
