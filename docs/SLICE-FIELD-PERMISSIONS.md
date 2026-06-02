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

## 10. Customer hierarchy — a first-class FMCG business entity (NEW)

**Finding:** `erp_customers` has **no** parent/child link today (only geo: Region→Area→Branch→Customer). The hierarchy is built as a **first-class business relationship** — not merely a field-inheritance helper — and is the single backbone later reused by pricing, trade spend, rebates, promotions, and approvals.

### 10.1 Structural model (additive on `erp_customers`, nullable ⇒ zero regression)
```
parent_customer_id    uuid references erp_customers(id)   -- branch → its Head Office; null = top-level
customer_account_type text   -- 'head_office' | 'branch' | 'independent'  (canonical; replaces is_head_office)
```
- **Schema is depth-agnostic** (self-reference) so **multi-level needs no redesign later**; the **app restricts to single level for the pilot** (a `branch` points to a `head_office`/`independent`; a `head_office` has no parent). Cycle/same-company guards enforced.
- Reusable read helpers (recursive CTE, depth-1 today, depth-N ready): `erp_customer_ancestors(id)`, `erp_customer_descendants(id)`.

### 10.2 Customer master flags (additive, nullable, company-configurable)
| Field | Type | Notes |
|---|---|---|
| `is_vat_registered` | bool | backs "VAT fields only when registered" |
| `payment_type` | text `cash`/`credit` | backs "Credit Limit only for credit customers" |
| `credit_control_enabled` | bool | turns AR credit checks on/off per customer |
| `customer_status` | text `active`/`inactive`/`suspended`/`blocked` | lifecycle; `blocked`/`suspended` can gate new sales |
| `requires_customer_approval` | bool (nullable) | per-customer override of company default; null = inherit |
| `customer_business_type` | ref/text | Retail/Wholesale/HORECA/Key Account/E-Commerce/Distributor |

> **Reconciliation note:** `customer_business_type` overlaps the existing **company-managed** `segment`/`channel` lookups (which already include retail/wholesale/horeca/ecommerce/key_account/distributor). To stay consistent with the established "master data, not hard-coded enums" principle, the **recommendation** is to model `customer_business_type` as an `erp_customer_lookups` kind (or map to channel/segment) rather than a fixed enum. `customer_account_type`, `customer_status`, `payment_type` stay system enums (structural/lifecycle). *(Decision 10 below.)*

### 10.3 Credit model — shared Head Office vs per-branch
Company setting `erp_companies.credit_model text default 'per_branch'` (`'shared_head_office' | 'per_branch'`):
- **`per_branch`** — each customer carries its own `credit_limit`/`balance`; AR & credit checks are per customer (today's behavior).
- **`shared_head_office`** — the **Head Office** holds the limit; branches draw against the **consolidated** balance. Available credit = `HO.credit_limit − consolidated_balance(HO + all branches)`.

Resolver `erp_customer_available_credit(customer_id)` returns the correct figure for either model, so order-entry credit holds work the same call regardless of company policy.

### 10.4 Branch vs Consolidated AR / Aging / Balance (read models, not stored)
Computed from transactions via views/functions (no denormalized columns → no drift):
| Metric | Branch (per customer) | Consolidated (Head Office) |
|---|---|---|
| Balance | `erp_customer_balance(id)` | `erp_customer_consolidated_balance(ho_id)` = self + descendants |
| AR | open invoices for the customer | rolled up over self + descendants |
| Aging (0-30/31-60/61-90/90+) | `erp_customer_aging(id)` | `erp_customer_consolidated_aging(ho_id)` |
| Credit limit / available | own limit | shared HO limit & available |

Surfaced **read-only** on the customer screen (a "Group / Branch" toggle on a Head Office record). Same recursive helpers feed all of them.

### 10.5 Field-value inheritance (the original §10, now one consumer of the hierarchy)
Per-field policy on `erp_field_config.inheritance`:
| Mode | Branch behavior |
|---|---|
| `none` (default) | Independent — **no change from today.** |
| `inherit` | Branch **defaults** to the Head Office value; may override locally (editable per role). |
| `inherit_locked` | Branch **forced** to the Head Office value; renders **View-only** on branches (admins exempt). |

- **Read:** `resolveFieldValue` returns the HO value when locked, or when an `inherit` branch left it blank. HO edits propagate by **reference at read-time** (no row-copy).
- **Write:** `applyWriteAccess` rejects writes to `inherit_locked` fields on branch records.

### 10.6 Designed-in reuse (later slices, no schema redesign)
The same `parent_customer_id` + helpers serve:
- **Pricing** — price rules at Head Office cascade to branches.
- **Trade spend / rebates** — accrue at Head Office, consume/redeem at branches.
- **Promotions** — eligibility defined at Head Office, applied across branches.
- **Customer approvals** — approve the Head Office, auto-apply policy to its branches.
- **Reporting** — consolidated statements/aging by key account.

## 11. Field rules by customer type / context (NEW)

**Finding:** today's conditional engine (`VisibilityRule {when, op, value}`, `isFieldVisible`) only compares one form field to a literal. We **extend** it into a small, reusable predicate evaluated against the **record + company context**, stored in `erp_field_config.condition`.

**Context available to a condition:**
- Customer attributes: `segment_id`, `classification_id`, `channel_id`, `payment_terms_days`, `balance`, any custom field, plus the **new master flags from §10.2** (`is_vat_registered`, `payment_type`, `credit_control_enabled`, `customer_status`, `customer_account_type`, `customer_business_type`).
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

- **FP-0 — Customer hierarchy (structural) + master flags** (migration: `parent_customer_id`, `customer_account_type`, same-company/cycle guards, single-level app rule; the §10.2 flags; recursive `ancestors`/`descendants` helpers; `customer_business_type` lookup; minimal Head-Office picker + flags on the customer form). Additive, nullable ⇒ zero regression. **Approved — first to build.**
- **FP-0c — Credit model + consolidation read layer** (company `credit_model` setting; `erp_customer_balance` / `_consolidated_balance`, `_aging` / `_consolidated_aging`, `available_credit`; Group/Branch view on the customer screen). Read-only rollups; no denormalized columns.
- **FP-a — Field engine: model + resolver + enforcement** (field tables + RLS incl. `inheritance` & `condition`; `field-access.ts` resolver covering all dimensions + `applyWriteAccess` + `resolveFieldValue`, unit-tested; customer save enforcement; read redaction; value inheritance). *Zero-config = today's behavior.*
- **FP-b — Admin configuration UI** (`/settings/fields`: reorder, group, subject×access grid, inheritance mode, simple condition builder, add/disable custom fields — audited).
- **FP-c — Data-driven customer form** (render applicable + ordered fields; show inherited/locked values; required markers).

Scope = **customer entity only** for the pilot; the registry-based design extends to invoices/orders/suppliers later with no schema change. **Customer hierarchy is single-level** for the pilot (schema is depth-N ready).

## 9. Decisions — CONFIRMED

1. **Matrix keys on role *and* permission** (subject = role | permission | both). Admin UI stays a single simple grid; model is permission-aware from day one.
2. **Read protection = app-layer redaction for the pilot.** Hidden fields never returned to the client; visibility enforced server-side before data reaches the UI; write permissions fully enforced; tenant isolation by RLS. DB column-level privileges revisited post-pilot if enterprise customers require it.
3. **Admins never locked out** — company admin / IT admin / platform owner always ≥ Editable.
4. **Most-permissive merge** across all of a user's roles **and** permissions: `Hidden < View < Editable < Required`.
5. **Pilot scope = customer entity only**; design extends to other entities with no schema change.

## 12. New decisions for your confirmation (hierarchy & customer-type — recommended defaults in bold)

6. **Single-level customer hierarchy** (`parent_customer_id` + `customer_account_type`), schema depth-N ready, app restricted to one level for pilot. → **Confirmed.**
7. **Three inheritance modes** per field (`none` / `inherit` / `inherit_locked`), default `none`. → **Confirmed.**
8. **Customer master flags** (§10.2: `is_vat_registered`, `payment_type`, `credit_control_enabled`, `customer_status`, `requires_customer_approval`, `customer_business_type`) — additive, nullable, company-configurable. → **Confirmed.**
9. **Resolver precedence** = applicability(type) → company-active → subject(role/permission) → inheritance-lock → admin-safety. → **Confirmed.**

### New decisions for your confirmation (first-class hierarchy & credit)
10. **`customer_business_type` as a company-managed lookup** (consistent with segment/channel) rather than a hard enum; `customer_account_type`/`customer_status`/`payment_type` remain system enums. → **Recommend.**
11. **Company `credit_model` default = `per_branch`** (today's behavior); `shared_head_office` opt-in. → **Recommend.**
12. **Consolidated AR/aging/balance/credit as computed read models** (views/functions over transactions), not stored columns. → **Recommend.**
13. **Build order:** ship **FP-0 (structural + flags)** first, then **FP-0c (credit + consolidation)** as its own staging-validated slice. → **Recommend.**

---

*Design only. No code written, nothing merged, no production migrations. Production remains on hold.*
