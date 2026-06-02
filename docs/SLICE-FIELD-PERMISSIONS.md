# Slice: Dynamic Field-Level Visibility & Permissions (Design — Review First)

*VANTORA multi-tenant ERP · grounded in the live schema (migrations 0001–0111) · design only — no implementation, no merge, no production migrations.*

---

## 1. Goal

Let each **company build its own customer screen with zero code changes**: every field (core *and* custom) can be configured to one of four access levels, reordered, grouped, marked required/sensitive, and shown/hidden — all data-driven, enforced server-side, and audited.

**The field engine resolves access along four dimensions:**

```
effective access  =  Field
                   × Subject        (role and/or permission)
                   × Customer type   (context conditions — segment/channel/flags/industry)
                   × Hierarchy        (Head-Office → Branch inheritance)
                   × Company config   (per-company layout, active, defaults)
```

**Four-level access model (per field × per role):**

| Level | Rendered | Returned to client | Writable | Must fill |
|---|---|---|---|---|
| **Hidden** | no | no (redacted) | no | no |
| **View only** | read-only | yes | no | no |
| **Editable** | yes | yes | yes | no |
| **Required** | yes | yes | yes | **yes** |

Worked examples (exactly the user's cases):

| Field | Rep | Supervisor | Finance | Admin |
|---|---|---|---|---|
| Credit Limit | Hidden | View only | Editable | Editable |
| VAT Number | View only | View only | Editable | Editable |

## 2. What we reuse (no reinvention)

| Need | Existing building block |
|---|---|
| Core field catalog | Entity registry `src/lib/erp/entities.ts` (`customer` field list) — the **field dictionary** |
| Custom fields per company (#4) | `erp_custom_fields` table + `DynamicCustomFields` (definitions, types, validation, conditional visibility) — **unchanged** |
| Conditional show/hide by other field values (#5) | `custom-fields.ts` `isFieldVisible` / `VisibilityRule` — kept as-is |
| Roles & per-company role catalog | `erp_roles`, `erp_company_roles`, `erp_company_role_permissions`; resolver `getUserContext()` |
| Permission/role checks in SQL | `erp_user_has_permission(company, perm)`, `erp_is_company_admin(company)` |
| Sensitive-field protection (#6) | `SENSITIVE_FIELDS` + customer approval staged-change workflow (0109) |
| Audit (#7) | `logAudit()` → `erp_log_audit` → `erp_audit_logs` |
| Per-company config pattern | `erp_companies.customers_require_approval` boolean precedent |
| Form layout | `FormSection` component + customer form sections |

**The only real gap:** core fields have no *per-company, per-role* config layer and no ordering/section metadata. This slice adds exactly that overlay.

## 3. Data model (2 new tables — migration 0112)

### `erp_field_config` — per-company, per-field layout & metadata (role-agnostic)
One row per `(company_id, entity, field_key)`. **Absent row ⇒ registry defaults** (zero regression).

```
id            uuid pk
company_id    uuid  -> erp_companies
entity        text          -- registry key, e.g. 'customer'
field_key     text          -- core column key OR custom field key
source        text          -- 'core' | 'custom'
section       text          -- group key (e.g. 'identity','commercial')
sort          int           -- ordering across the whole screen
is_active     bool default true     -- company-wide hide
is_sensitive  bool default false    -- seeded from SENSITIVE_FIELDS for core
default_access text default 'edit'   -- baseline for subjects w/o an explicit row
inheritance   text default 'none'   -- 'none' | 'inherit' | 'inherit_locked'  (see §10)
condition     jsonb                  -- applicability predicate by customer type/context (see §11); null = always
label_ar text / label_en text       -- optional per-company relabel
created_by/at, updated_by/at
unique (company_id, entity, field_key)
```

### `erp_field_access` — the per-subject access matrix (the heart of this slice)
One row per `(company_id, entity, field_key, subject_type, subject_key)`. A **subject** is a **role** *or* a **permission**, so access can be granted by role, by permission, or both. **Absent row ⇒ `erp_field_config.default_access` ⇒ registry default.**

```
id           uuid pk
company_id   uuid -> erp_companies
entity       text
field_key    text
subject_type text check (subject_type in ('role','permission'))
subject_key  text          -- erp_roles.key  OR  a permission key (e.g. 'customers.view_finance')
access       text check (access in ('hidden','view','edit','required'))
created_by/at, updated_by/at
unique (company_id, entity, field_key, subject_type, subject_key)
```

> **Why role + permission (per your direction):** different companies reuse the same role names with different responsibilities, so access is driven by **role**, **permission**, or **both** — maximum flexibility across FMCG / Retail / Manufacturing. The admin UI stays simple (a single grid; a row can target a role or a permission), while the model is permission-aware from day one.

> Custom-field **definitions** stay in `erp_custom_fields` (type/options/validation untouched). `erp_field_config`/`erp_field_access` add the layout + access *overlay* on top, keyed by `field_key` with `source='custom'`. No duplication of definition data.

**RLS:** both tables tenant-scoped — **read** by any company member (forms need the layout), **write** by company admin / IT admin / platform owner only. `erp_set_company_id` trigger sets `company_id`.

**Seeding (optional, additive):** seed `erp_field_config` for the customer core fields mirroring today's hardcoded sections/order and `is_sensitive` from `SENSITIVE_FIELDS`. With **no** seed and **no** config, behavior is identical to today.

## 4. Resolution logic (pure, unit-tested)

`src/lib/erp/field-access.ts` — `resolveFieldAccess(field, ctx) -> 'hidden'|'view'|'edit'|'required'`, evaluated **per field, per customer record, per user** in this **precedence**:

1. **Applicability (Customer type / context — §11):** evaluate `field_config.condition` against the record + company context. Not applicable ⇒ **Hidden** (stop).
2. **Company active:** `is_active=false` ⇒ **Hidden** (stop).
3. **Subject access (role + permission):** **most-permissive** level across **all** the user's subjects — every role (across branches) **and** every permission held. Order `hidden(0) < view(1) < edit(2) < required(3)`. Example: Rep=Hidden, Finance=Editable ⇒ **Editable**. No matching subject row → `field_config.default_access` → registry default (`edit`).
4. **Hierarchy inheritance (§10):** on a **branch** customer, `inherit_locked` clamps access to **View** (value forced from the Head Office); `inherit`/`none` leave step 3 unchanged.
5. **Admin safety:** company admin / IT admin / platform owner are **never locked out** — clamped to ≥ `edit` (overrides steps 3–4; still respects applicability so they don't see truly N/A fields during data entry; the *config* UI always shows every field).

Companion functions:
- `applyWriteAccess(input, current, accessByField) -> { data, missingRequired[] }` — drops any field the user can't edit (keeps old value — mirrors `sensitiveChanges`), reports empty `required` fields. **This is the real write protection.**
- `resolveFieldValue(field, record, parentRecord) -> value` — for inherited fields, returns the effective value (parent value when locked, or when the branch left it blank under `inherit`).

## 5. Enforcement — defense in depth

1. **UI (FP-c):** render fields ordered by `sort`, grouped by `section`; `hidden` omitted, `view` read-only, `required` marked. Driven by a server loader `getFieldLayout('customer')` (registry ⨝ field_config ⨝ field_access ⨝ custom_fields, resolved for the current user).
2. **Write (FP-a):** the customer save action runs `applyWriteAccess` **before** persisting — a rep POSTing `credit_limit` is ignored even if the UI is bypassed; missing required fields reject the save. Sensitive edits still flow through the **existing approval staging** (0109).
3. **Read redaction (FP-a):** server strips `hidden` fields from the payload sent to the client.

> **Honest scope note:** pilot read-protection is **app-layer redaction**, not Postgres column-level privileges. That is sufficient for the pilot (single trusted app), and **DB column-level enforcement is a documented post-pilot item**. Write-side and tenant RLS are fully DB-enforced.

## 6. Configuration UI (IT/Company Admin) — FP-b

New page `/settings/fields` (permission `settings.fields`, or reuse `settings.custom_fields`), modeled on the existing custom-fields manager. Per entity (customer for pilot), the admin can:

- See every field (core from registry + custom from `erp_custom_fields`) in one sortable list.
- **Reorder** (drag → `sort`), assign **section**, toggle **active** (company hide), mark **sensitive**, relabel.
- Edit the **role × access** grid (dropdown per role: Hidden / View / Editable / Required).
- **Add / disable** custom fields (existing flow, surfaced here).
- Every change → `logAudit({ entity:'field_config'|'field_access', action:'update', entityId:'customer:credit_limit', details:{ role_key, from, to } })` → satisfies **#7**.

## 10. Customer hierarchy & field inheritance (NEW — Head Office → Branches)

**Finding:** `erp_customers` has **no** parent/child link today (only geo: Region→Area→Branch→Customer). So a small, additive primitive is required.

**New columns on `erp_customers` (migration 0112, additive, nullable ⇒ zero regression):**
```
parent_customer_id  uuid references erp_customers(id)   -- the Head Office; null = standalone/top-level
is_head_office      bool default false
```
Guards: parent must be the **same company**; **single level** for the pilot (Head Office → its direct branch outlets) — multi-level chains are a documented post-pilot item; a branch cannot be its own parent.

**Per-field inheritance policy** (`erp_field_config.inheritance`):
| Mode | Branch behavior |
|---|---|
| `none` (default) | Each customer independent. **No change from today.** |
| `inherit` | Branch **defaults** to the Head Office value; may override locally (field stays editable per role). |
| `inherit_locked` | Branch is **forced** to the Head Office value; field renders **View-only** on branch records (admins exempt). |

This directly covers the example — **Credit Limit / Payment Terms / VAT / Classification** set at Head Office and inherited (or locked) for branches, *configurable per company* (default `none`).

- **Read:** `resolveFieldValue` returns the parent value when locked, or the parent value when an `inherit` branch left the field blank.
- **Write:** `applyWriteAccess` rejects writes to `inherit_locked` fields on branch records (defense in depth).
- Head Office edits to an inherited field propagate by **reference at read-time** (no row-copy) — branches always reflect the current Head Office value unless overridden.

## 11. Field rules by customer type / context (NEW)

**Finding:** today's conditional engine (`VisibilityRule {when, op, value}`, `isFieldVisible`) only compares one form field to a literal. We **extend** it into a small, reusable predicate evaluated against the **record + company context**, stored in `erp_field_config.condition`.

**Context available to a condition:**
- Customer attributes: `segment_id`, `classification_id`, `channel_id`, `payment_terms_days`, `balance`, any custom field, plus two **new optional flags** (additive, nullable): `is_vat_registered bool`, `payment_type text ('cash'|'credit')` — these back the named examples cleanly.
- Company context: `company.business_type` (e.g. `clinic` = healthcare, `wholesale`/`delivery` = FMCG).

**Operators:** `eq, neq, in, gt, lt, is_set, is_true` (superset of today's). A condition may be a single rule or an **AND** of rules (kept simple for pilot).

**The four examples map directly:**
| Rule | Condition |
|---|---|
| Credit Limit only for credit customers | `{ when:'payment_type', op:'eq', value:'credit' }` |
| Insurance fields only for healthcare | `{ when:'company.business_type', op:'eq', value:'clinic' }` |
| Route fields only for FMCG distributors | `{ when:'segment_id', op:'in', value:[<distributor lookups>] }` |
| VAT fields only when VAT registered | `{ when:'is_vat_registered', op:'is_true' }` |

If a condition is false for a record, the field is **not applicable** ⇒ treated as Hidden (step 1 of the resolver) — for everyone, before role/permission is even considered.

> **Backward-compatible:** the existing value-conditional custom-field visibility (`isFieldVisible`) keeps working unchanged; this is the same idea generalized to context and applied to core fields too.

## 7. Requirement coverage

| # | Requirement | How |
|---|---|---|
| 1 | Field visibility by role/permission | `erp_field_access.access='hidden'` + read redaction |
| 2 | Field editability by role/permission | `access` ∈ view/edit + write enforcement |
| 3 | Required fields by company | `access='required'` and/or `field_config`; enforced on save |
| 4 | Custom fields per company | existing `erp_custom_fields`, overlaid by config/access |
| 5 | Hide/show dynamically | role-based (this slice) **+** value-conditional (`isFieldVisible`, existing) |
| 6 | Sensitive-field protection | `is_sensitive` (seeded from `SENSITIVE_FIELDS`) + approval staging |
| 7 | Audit field-setting changes | `logAudit` on every config/access write |
| 8 | **Inheritance across customer hierarchy** | `parent_customer_id` + `inheritance` policy (§10) |
| 9 | **Field rules by customer type / context** | `condition` predicate over record + company context (§11) |
| — | Add/disable/reorder/configure per company | `/settings/fields` admin UI + `sort`/`is_active`/access grid |

## 8. Proposed build order (pilot-safe, stacked PRs, each staging-validated)

- **FP-0 — Customer hierarchy primitive** (migration: `parent_customer_id`, `is_head_office`, same-company guard; + optional `is_vat_registered`, `payment_type` flags for §11; minimal "Head Office" picker on the customer form). Additive; nullable ⇒ zero regression.
- **FP-a — Field engine: model + resolver + enforcement** (field tables + RLS incl. `inheritance` & `condition`; `field-access.ts` resolver covering all 4 dimensions + `applyWriteAccess` + `resolveFieldValue`, unit-tested; customer save enforcement; read redaction; value inheritance). *Zero-config = today's behavior.*
- **FP-b — Admin configuration UI** (`/settings/fields`: reorder, group, subject×access grid, inheritance mode, simple condition builder, add/disable custom fields — all audited).
- **FP-c — Data-driven customer form** (render applicable + ordered fields; show inherited/locked values; required markers).

Scope = **customer entity only** for the pilot; the registry-based design extends to invoices/orders/suppliers later with no schema change. **Customer hierarchy is single-level** for the pilot.

## 9. Decisions — CONFIRMED

1. **Matrix keys on role *and* permission** (subject = role | permission | both). Admin UI stays a single simple grid; model is permission-aware from day one.
2. **Read protection = app-layer redaction for the pilot.** Hidden fields never returned to the client; visibility enforced server-side before data reaches the UI; write permissions fully enforced; tenant isolation by RLS. DB column-level privileges revisited post-pilot if enterprise customers require it.
3. **Admins never locked out** — company admin / IT admin / platform owner always ≥ Editable.
4. **Most-permissive merge** across all of a user's roles **and** permissions: `Hidden < View < Editable < Required`.
5. **Pilot scope = customer entity only**; design extends to other entities with no schema change.

## 12. New decisions for your confirmation (hierarchy & customer-type — recommended defaults in bold)

6. **Add a single-level customer hierarchy now** (`parent_customer_id` + `is_head_office`); multi-level chains post-pilot. → **Recommend.**
7. **Three inheritance modes** per field (`none` / `inherit` / `inherit_locked`), default `none`, configurable per company. → **Recommend.**
8. **Add two optional customer flags** (`is_vat_registered`, `payment_type` cash/credit) to back the type-rule examples; conditions may also reference segment/classification/channel, custom fields, and `company.business_type`. → **Recommend.**
9. **Resolver precedence** = applicability(type) → company-active → subject(role/permission) → inheritance-lock → admin-safety. → **Recommend.**

---

*Design only. No code written, nothing merged, no production migrations. Production remains on hold.*
