# Universal Change Request Engine — platform design

**Status:** Signed off — implementing per §14 · **Flag:** `KAKO_CHANGE_REQUESTS` (default OFF)
**Author:** platform · **Supersedes:** the entity-specific `erp_customer_change_requests` flow (which it generalizes and can absorb)

A **reusable platform capability** — not a feature — that lets any current or future
master-data entity (Customers, Products, Suppliers, Routes, Vehicles, Salesmen,
GPS, VAT/CR/National-Address, and entities shipped by future modules / industry
packs) be changed through a governed, audited, multi-level-approved request flow,
**without changing engine code**. New entities are added by **registering metadata**,
not by editing the engine.

---

## 1. Principles

1. **Metadata-driven.** Entity types, fields, validation, approval rules, notifications
   and workflow steps are **configuration**, resolved at runtime from a registry —
   never hardcoded `if entity === 'customer'` branches.
2. **Reuse, don't reinvent.** Built entirely on the existing workflow engine, event
   bus, DFG, audit, notification, permission, and attachment subsystems.
3. **One mechanism for all entities.** Single tables, single lifecycle, single apply
   path. "Update 1 customer" and "reassign 200 routes" are the same engine.
4. **Safe by construction.** Apply targets are constrained by an allowlist; every
   write is governed (DFG), validated, and audited before/after. Flag-gated, default OFF.
5. **Extensible by registration.** A module or industry pack adds an entity by
   inserting a metadata row (+ optional code-side validator/adapter). Zero engine change.

---

## 2. Architecture at a glance

```
        register metadata (per entity)            ┌──────────────────────────────┐
  module / industry pack  ───────────────────────▶│  erp_change_request_entities │  (registry)
                                                   │  erp_change_request_fields*  │
                                                   └──────────────┬───────────────┘
                                                                  │ resolves config
 user (create CR)                                                 ▼
   │  submitChangeRequest(entity, targets[], changes, effective_at?, attachments?)
   ▼
 erp_change_requests ──┬─ erp_change_request_targets (bulk: N rows)
   (header, status)    └─ erp_change_request_values  (field-level proposed changes)
   │
   │ emit  change_request.submitted (erp_events)
   ▼
 WORKFLOW ENGINE (existing)  erp_workflow_start → tasks → erp_workflow_decide
   • approval step(s): role / permission / EXTERNAL  (multi-level, company-specific)
   • SLA + escalation + notifications  (erp_workflow_tick, erp_notify)
   │ on final approve → update_record flips erp_change_requests.status
   ▼
 APPLY  erp_change_request_apply(request_id)   [generic, metadata-driven]
   • if effective_at in future → status 'scheduled' (cron applies when due)
   • else iterate targets: validate → capture before → write target_table → audit before/after
   • per-target status; partial-failure tolerant
   ▼
 erp_audit_logs (before/after)   +   erp_notify(requester)   +   target rows updated
```

*`erp_change_request_fields` = optional per-entity field metadata; field governance
itself is delegated to DFG (`erp_field_config`/`erp_field_access`).

---

## 3. Metadata registry (the heart)

### 3.1 `erp_change_request_entities` — entity-type registry (source of truth)

One row per governed entity type. `company_id IS NULL` = **platform/global default**
(seeded by core or an industry-pack migration); a row with `company_id` set =
**tenant override/addition**. Resolution = company row first, else global — the same
fallback the workflow engine already uses.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid null | null = global default; set = tenant-specific |
| `entity_key` | text | e.g. `customer`, `product`, `route`, `vehicle`, `salesman` |
| `target_table` | text | must be in the **CR apply allowlist** (see §10) |
| `id_column` | text | default `id` |
| `label_en` / `label_ar` | text | |
| `create_permission` | text | permission to raise a request (e.g. `customers.manage`) |
| `approve_permission` | text | permission an approver needs (e.g. `customers.approve`) |
| `workflow_key` | text | definition key, default `change_request:{entity_key}` |
| `allowed_fields` | jsonb | optional whitelist of changeable field keys (else DFG decides) |
| `validation` | jsonb | declarative rules (see §8) |
| `supports_effective_dating` | bool | default true |
| `supports_bulk` | bool | default true |
| `bulk_max` | int | safety cap (e.g. 1000) |
| `attachment_types` | jsonb | allowed doc types (CR copy, VAT cert, …) |
| `notification_template` | text | message template key for `erp_notify` |
| `is_active` | bool | |
| stamps | | company_id trigger, created/updated_by, timestamps |

UNIQUE `(company_id, entity_key)`. RLS: read global + own company; write company admin
(global rows seeded by migration only).

### 3.2 Code-side typed accessor

`src/lib/change-requests/registry.ts` exposes a typed read of the metadata
(`getChangeRequestEntity(entityKey, companyId)`), plus two small **code registries**
for the cases metadata can't express as data:
- **named validators** — `registerValidator(name, fn)` for complex/business validation
  referenced by `validation.rules[].validator`;
- **external approval adapters** — `registerApprovalAdapter(name, adapter)` (§7.3).

Packs shipped as code register validators/adapters at import; packs shipped as data
insert metadata rows. Either way the **engine is untouched**.

---

## 4. Data model (request + targets + values)

### 4.1 `erp_change_requests` — request header

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid | tenant |
| `entity_key` | text | FK-by-convention to the registry |
| `scope` | text | `single` \| `bulk` |
| `status` | text | see §5 state machine |
| `reason` | text null | requester's justification |
| `effective_at` | timestamptz null | null/≤now = immediate; future = scheduled |
| `requested_by` | uuid | |
| `decided_by` | uuid null | last approver |
| `decided_at` | timestamptz null | |
| `applied_at` | timestamptz null | |
| `workflow_instance_id` | uuid null | link to `erp_workflow_instances` |
| `summary` | jsonb null | denormalized counts for lists (targets, fields) |
| stamps | | company_id trigger, timestamps |

### 4.2 `erp_change_request_targets` — affected records (bulk = N, single = 1)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `request_id` | uuid | FK |
| `company_id` | uuid | |
| `target_id` | text | the record's id in `target_table` |
| `status` | text | `pending` \| `applied` \| `failed` \| `skipped` |
| `error` | text null | per-target failure reason |
| `applied_at` | timestamptz null | |

### 4.3 `erp_change_request_values` — proposed field changes (before/after)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `request_id` | uuid | FK |
| `company_id` | uuid | |
| `target_id` | text null | null = applies to **all** targets (shared bulk patch); set = per-target override |
| `field_key` | text | governed field |
| `old_value` | jsonb null | captured at create for single; captured **per target at apply** for bulk |
| `new_value` | jsonb | proposed value |

**Before/after audit:** for a single request old/new are captured up front. For bulk
shared patches the "before" differs per record, so it is captured **per target at apply
time** and written to `erp_audit_logs` (action `change_request.apply`, details carry
`{entity_key, target_id, field_key, old, new}`). Nothing is guessed.

---

## 5. Lifecycle / state machine

```
 draft ─submit─▶ submitted ─(workflow start)─▶ pending
   pending ─reject─▶ rejected
   pending ─approve(final)─▶ ┌ effective_at future ─▶ scheduled ─(due,cron)─▶ applying
                             └ effective now/null   ─────────────────────────▶ applying
   applying ─ all targets ok ─▶ applied
   applying ─ some fail ──────▶ partially_applied
   applying ─ all fail ───────▶ failed
   (any pre-apply) ─cancel─▶ cancelled
```

`pending` ⇄ multi-step approvals are internal to the workflow instance; the request
stays `pending` until the instance completes. Idempotent apply (re-running a
`scheduled`/`applying` request only touches still-`pending` targets).

---

## 6. Approval workflows (reuse + configurable + multi-level)

- **Trigger:** submit emits `change_request.submitted` to `erp_events`; the engine
  auto-starts the definition whose `trigger_event` matches (existing mechanism).
- **Per-entity default definition:** `change_request:{entity_key}`, seeded **from
  metadata** by a generic routine (migration template / `erp_change_request_sync_workflows()`),
  so adding an entity seeds its default chain — no engine edit. Default chain:
  1. `approval` — `approver_type='permission'`, `approver_ref = metadata.approve_permission`
     (multi-level = add steps), SLA + `escalate_to` (existing).
  2. `update_record` — flip `erp_change_requests.status` to `approved`
     (`table='erp_change_requests'`, `patch={status:'approved'}`, `id_from_context`).
  3. `api_call` (system) — invoke `erp_change_request_apply(request_id)` (or DB does it
     on the status flip; see §10).
  4. `notification` — notify requester (`erp_notify`, template from metadata).
- **Company-specific rules / multi-level:** a company creates a company-scoped
  definition with the same `workflow_key` in the **Workflow Builder** (`/settings/workflows`);
  it overrides the global default via the existing company-vs-global resolution. Extra
  approvers, parallel/sequential, thresholds-by-condition all use existing step features.

---

## 7. External approval hooks (design seam, adapters fast-follow)

- **Step shape:** an approval step may set `approver_type='external'` with
  `config={ adapter: 'email'|'erp'|'government'|'api', ... }`. The engine creates the
  task as usual but routes the *decision* through an adapter instead of an in-app actor.
- **Outbound:** when such a task activates, a dispatcher calls the named adapter
  (registered via `registerApprovalAdapter`) to push the approval out (send email,
  call ERP/government/API). Adapters are **registrations**, not engine code.
- **Inbound:** one generic, signed callback route
  `POST /api/change-requests/approvals/callback` verifies the caller, maps the external
  reference to the workflow task, and calls the existing `erp_workflow_decide`. This is
  the single seam every external system uses.
- **Now:** ship the `external` type, the adapter registry, and the callback seam
  (+ a no-op `email` stub). Concrete government/ERP integrations are later registrations.

---

## 8. Validation (declarative + extensible)

`metadata.validation` holds declarative rules evaluated before submit and again before
apply (trust boundary):

```jsonc
{ "rules": [
  { "field": "vat_number", "required": true, "regex": "^3\\d{14}$" },
  { "field": "credit_limit", "type": "number", "min": 0, "max": 1000000 },
  { "field": "classification_id", "reference": "erp_customer_classes" },
  { "field": "cr_number", "validator": "saudi_cr" }   // named code validator
] }
```

Built-in declarative checks (`required`, `type`, `min/max`, `regex`, `enum`,
`reference`-exists) cover most fields; anything bespoke is a **named validator**
registered in code (`registerValidator('saudi_cr', fn)`). Field **governance**
(who may edit which field) is delegated to DFG — the CR engine refuses any field the
requester can't `edit` per `resolveAccess`.

---

## 9. Effective dating, bulk, attachments, notifications, audit, RBAC

- **Effective dating** — `effective_at`. Approval of a future-dated request → `scheduled`;
  a generic cron `erp_change_request_run_due()` (same infra as `erp_workflow_tick`)
  applies due requests. One mechanism for next-month prices, next-week routes, dated transfers.
- **Bulk** — `scope='bulk'`, up to `bulk_max` targets; apply iterates with **per-target
  status + audit** and is partial-failure tolerant (`partially_applied`). Shared patch
  (`target_id` null) or per-target overrides.
- **Attachments** — reuse `erp_attachments` + `uploadAttachment` with
  `entity='change_request'`, `record_id=request_id`; add a nullable **`doc_type`** column
  to `erp_attachments` (additive, benign for all entities) — the **primary, queryable
  classification** going forward (CR copy, VAT cert, national address, photo, contract,
  approval doc). Document categories themselves live in a **doc-type registry**
  (`erp_change_request_doc_types`, global + per-company), so industry packs introduce new
  categories **without a schema change**; `metadata.attachment_types` references them by key,
  and validation can require a given `doc_type` per entity. No new upload system;
  `change_request` added to the attachment entity-permission map.
- **Notifications** — `erp_notify` on submit (approvers, via workflow tasks), and on
  approved / rejected / applied / failed (requester), template from metadata. The existing
  `channel` column carries future email/WhatsApp without schema change.
- **Audit** — every state transition and every per-target field write goes through
  `erp_log_audit` (`change_request.submit|approve|reject|apply|schedule|cancel`) with
  before/after in `details`.
- **RBAC** — minimal new permissions `change_requests.create`, `change_requests.approve`,
  `change_requests.manage` (catalog + capabilities), **plus** per-entity perms from
  metadata (reusing `customers.approve`, `products.manage`, … where they already exist).

---

## 10. Security

- **Apply allowlist.** `erp_change_request_apply` only writes to tables in a dedicated
  CR allowlist (mirrors `UPDATE_RECORD_ALLOWLIST`); metadata `target_table` is validated
  against it at registration and at apply. New master-data tables (`erp_products_catalog`,
  `erp_suppliers`, routes, vehicles, salesman profile) are added to the allowlist explicitly.
- **DFG enforcement.** No field is written unless the requester had `edit` access at
  create AND the apply re-checks governance — the request can't smuggle a protected field.
- **SECURITY DEFINER** apply/sweep functions stamp company from session and are tenant-scoped;
  RLS on every CR table.
- **External callback** is signature/token-verified and maps strictly to one task.
- **Flag-gated** `KAKO_CHANGE_REQUESTS` (default OFF); surfaces `notFound()` when off.

---

## 11. Extensibility — adding an entity (the whole point)

To govern a **new** entity (e.g. Vehicles), a module/pack does **only**:
1. Ensure the target table is in the CR apply allowlist (one-line migration).
2. Insert a metadata row into `erp_change_request_entities` (global or per-company).
3. (Optional) seed/edit field governance in `erp_field_config` for that entity.
4. (Optional) register a named validator / external adapter in code.

The default workflow is seeded from metadata; the UI (create form, approval inbox,
request list, attachments) is **generic** and renders from metadata + DFG. **No engine,
table, route, or component change.**

---

## 12. Feature flag & rollout

`KAKO_CHANGE_REQUESTS` (platform, default OFF). Like Van Sales: the platform flag plus,
where relevant, a per-company enablement. The legacy `erp_customer_change_requests` flow
continues to work; `customer` is registered as the first CR entity and the old flow is
migrated/absorbed in a later phase (no data loss; dual-read during transition).

---

## 13. Testing & CI

- **Pure core** (Vitest): registry resolution, validation evaluation, state machine,
  bulk planning, effective-date gating, before/after diffing.
- **Integration** (pg, `TEST_DATABASE_URL`): submit → workflow approve → apply (single);
  bulk partial-failure; future-dated → scheduled → cron apply; DFG rejection; allowlist
  rejection; external-callback decide; audit before/after; idempotent apply.
- **i18n** parity for all new keys; keys-usage tests. Small, flag-gated PRs; CI-green.

---

## 14. Phased PR roadmap

Each PR is additive, flag-gated (`KAKO_CHANGE_REQUESTS` OFF), CI-green, with tests.

Engine-first (validate the platform before exposing it). Order confirmed at sign-off.

| PR | Phase | Scope |
|---|---|---|
| **0** | — | *This design doc.* |
| **1** | Registry & metadata foundation | CR tables (entities, requests, targets, values), **doc-type registry**, RLS, stamps; CR apply allowlist; strongly-typed code accessors + validator/adapter registries over the DB metadata; pure tests. |
| **2** | Change request lifecycle | `submitChangeRequest` (single), state machine, event emit, DFG + declarative validation, audit; `customer` registered as reference entity #1. |
| **3** | Workflow & approvals | Per-entity default definition seeding from metadata; approval → status flip; multi-level / company-specific overrides; notifications; integration test. |
| **4** | Apply / execution layer | `erp_change_request_apply` (generic, before/after audit, allowlist, DFG re-check); idempotent; integration tests. |
| **5** | Attachments | `doc_type` column + doc-type registry, `change_request` attachment wiring, required-doc validation; tests. |
| **6** | Effective dating | `effective_at`, `scheduled` state, `erp_change_request_run_due()` cron; tests. |
| **7** | Bulk change requests | targets fan-out, `bulk_max`, per-target status/audit, `partially_applied`; tests. |
| **8** | External approval hooks | `external` approver type, adapter registry, signed callback route, email stub; tests. |
| **9** | Generic UI | metadata-driven create form, request list, approval inbox, attachments panel (flag-gated routes). |
| **10** | Customer entity migration | migrate `erp_customer_change_requests` onto the engine; dual-read; deprecate legacy (single-engine end-state). |
| **11** | Additional entities | register Products, Suppliers, Routes, Vehicles, Salesmen + GPS/VAT/CR/National-Address field sets (metadata + allowlist only). |
| **12** | Pilot enablement guide | per-tenant guide (mirrors Van Sales), validation checklist, rollback, monitoring. |

---

## 15. Decisions (signed off)

1. **Metadata source of truth — DB table canonical.** `erp_change_request_entities` is
   authoritative, seedable by industry-pack migrations, with **per-company overrides** as a
   first-class case. Approval / validation / notification / permission config is data-driven.
   **Strongly-typed code accessors + validation wrap the DB metadata** to preserve type safety,
   but the database is canonical. New entities are added by registration/config, not engine code.
2. **`doc_type` on `erp_attachments` — add a nullable column** (additive, backward-compatible)
   as the **primary, queryable** document classification. Document categories live in a
   **doc-type registry** (`erp_change_request_doc_types`) so packs add categories without a
   schema change; validation may require specific doc types per request type.
3. **Legacy customer flow — keep, register `customer` as reference entity #1, absorb later.**
   Lowest risk; existing customer workflows continue uninterrupted; the engine is proven first.
   **Not two systems permanently** — target is a single universal engine with the legacy flow
   gradually absorbed (PR 10) once proven in production.
4. **Phasing — engine first, then UI, then more entities** (order in §14). The platform core
   (lifecycle, approvals, apply, attachments, effective dating, bulk, external hooks) is built
   and validated before the UI consumes it. Objective: a durable platform capability, not a fast demo.
