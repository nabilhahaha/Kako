# Slice: Dynamic Field-Level Visibility & Permissions (Design — Review First)

*VANTORA multi-tenant ERP · grounded in the live schema (migrations 0001–0111) · design only — no implementation, no merge, no production migrations.*

---

## 1. Goal

Let each **company build its own customer screen with zero code changes**: every field (core *and* custom) can be configured per role to one of four access levels, reordered, grouped, marked required/sensitive, and shown/hidden — all data-driven, enforced server-side, and audited.

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
default_access text default 'edit'   -- baseline for roles w/o an explicit row
label_ar text / label_en text       -- optional per-company relabel
created_by/at, updated_by/at
unique (company_id, entity, field_key)
```

### `erp_field_access` — the per-role access matrix (the heart of this slice)
One row per `(company_id, entity, field_key, role_key)`. **Absent row ⇒ `erp_field_config.default_access` ⇒ registry default.**

```
id          uuid pk
company_id  uuid -> erp_companies
entity      text
field_key   text
role_key    text -> erp_roles.key
access      text check (access in ('hidden','view','edit','required'))
created_by/at, updated_by/at
unique (company_id, entity, field_key, role_key)
```

> Custom-field **definitions** stay in `erp_custom_fields` (type/options/validation untouched). `erp_field_config`/`erp_field_access` add the layout + access *overlay* on top, keyed by `field_key` with `source='custom'`. No duplication of definition data.

**RLS:** both tables tenant-scoped — **read** by any company member (forms need the layout), **write** by company admin / IT admin / platform owner only. `erp_set_company_id` trigger sets `company_id`.

**Seeding (optional, additive):** seed `erp_field_config` for the customer core fields mirroring today's hardcoded sections/order and `is_sensitive` from `SENSITIVE_FIELDS`. With **no** seed and **no** config, behavior is identical to today.

## 4. Resolution logic (pure, unit-tested)

`src/lib/erp/field-access.ts`:

- `resolveFieldAccess(fieldKey, userRoles, configMap, accessMap, isAdmin) -> 'hidden'|'view'|'edit'|'required'`
  - Order `hidden(0) < view(1) < edit(2) < required(3)`.
  - Take the **most-permissive** level across all the user's roles (a user with multiple branch roles gets the highest).
  - No role row → `field_config.default_access` → registry default (`edit`).
  - **Admin safety:** company admin / IT admin / platform owner are **never locked out** — clamped to at least `edit` (prevents self-lockout while configuring). Stated rule, configurable later.
- `applyWriteAccess(input, current, accessByField) -> { data, missingRequired[] }`
  - Drops any field the user can't edit (keeps the old value — mirrors `sensitiveChanges`), and reports empty `required` fields. **This is the real protection.**

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
| — | Add/disable/reorder/configure per company | `/settings/fields` admin UI + `sort`/`is_active`/access grid |

## 8. Proposed build order (pilot-safe, stacked PRs, each staging-validated)

- **FP-a — Model + resolver + enforcement** (migration 0112 tables/RLS; `field-access.ts` + unit tests; customer save runs `applyWriteAccess`; read redaction). *Zero-config = today's behavior.*
- **FP-b — Admin configuration UI** (`/settings/fields`, audited).
- **FP-c — Data-driven customer form** (replace hardcoded sections with layout-driven rendering).

Scope = **customer entity only** for the pilot; the registry-based design extends to invoices/orders/suppliers later with no schema change.

## 9. Decisions for your confirmation (with recommended defaults)

1. **Matrix keyed on role** (recommended, matches your Rep/Supervisor/Finance/Admin examples) vs. role **+** permission keys. → *Recommend role for pilot; permission-key override is a small post-pilot add.*
2. **Read protection = app-layer redaction for pilot**, DB column privileges post-pilot. → *Recommend.*
3. **Admins never locked out** (always ≥ editable). → *Recommend.*
4. **Most-permissive merge** when a user holds multiple roles. → *Recommend.*
5. **Pilot scope = customer entity only.** → *Recommend.*

---

*Design only. No code written, nothing merged, no production migrations. Production remains on hold.*
