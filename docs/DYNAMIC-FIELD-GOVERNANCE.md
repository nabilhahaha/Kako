# Dynamic Field Governance — Platform-Wide Design (Review First)

*VANTORA multi-tenant ERP · grounded in the live schema (migrations 0001–0113) · **design only — no implementation**, no merge, no production migrations.*

> Generalizes the customer-scoped `docs/SLICE-FIELD-PERMISSIONS.md` (FP-a/b/c) into **one engine for every entity**. The Customer slice becomes the first instance of this platform capability — same tables, same resolver, generalized.

---

## 1. Goal

One **company-configurable field governance engine**, platform-wide: each company shapes any entity's screen — visibility, editability, required, ordering, custom fields, conditional rules, role/permission access — with **zero code changes**, enforced server-side and fully audited.

**Pilot wires Customers only**, but the architecture covers, with no schema change per entity:

> Customers · Suppliers · Products · Orders · Invoices · Returns · Visits · Routes · Warehouses · Approval Requests · Workflow Forms · Attachments Metadata · **future custom modules**

## 2. Three invariants (your explicit requirements)

1. **Safe defaults — no config ⇒ behaves exactly as today.** The engine is a *no-op overlay*: with no `erp_field_config`/`erp_field_access` rows for an entity, fields render in registry order, all visible/editable per that entity's existing permission. No migration backfill, per-entity opt-in, **zero regression**.
2. **Admin lockout protection.** Company Admin / IT Admin / Platform Owner can **never** hide or disable critical configuration fields from themselves (details §7).
3. **Audited with before/after.** Every field-config/access change records the prior and new value (details §8).

## 3. The field dictionary — entity registry (already exists)

`src/lib/erp/entities.ts` is the **universe of core fields** per entity (descriptors with `key`, labels, `type`, `required`, capabilities). The engine reads it to know which core fields exist for an entity, merges **custom fields** (`erp_custom_fields`, already per-(company, entity)), and overlays per-company config + access.

- Entities that already declare a field catalog (customer, product, …) are governable immediately.
- Entities not yet catalogued get **custom-field governance now**, and **core-field governance** as soon as their catalog is added to the registry — a small, incremental, additive step per entity (no engine change).

## 4. Data model — generic, entity-agnostic (additive)

### `erp_field_config` — per-company layout & metadata, one row per `(company_id, entity, field_key)`
`source('core'|'custom')`, `section`, `sort`, `is_active`, `is_sensitive`, **`is_protected`**, `default_access('hidden'|'view'|'edit'|'required')`, `inheritance('none'|'inherit'|'inherit_locked')` (for hierarchical entities), `condition jsonb` (applicability), optional label overrides. **Absent row ⇒ registry default.**

### `erp_field_access` — per-subject access, one row per `(company_id, entity, field_key, subject_type, subject_key)`
`subject_type('role'|'permission')`, `subject_key`, `access('hidden'|'view'|'edit'|'required')`. **Absent row ⇒ `field_config.default_access` ⇒ registry default.**

### Reused, unchanged
- **`erp_custom_fields`** — custom-field definitions (type/options/validation/conditional visibility). Already entity-generic.
- **`erp_audit_logs`** + `logAudit` — config-change audit (§8).

**RLS:** both new tables tenant-scoped; **read** by any company member (forms need the layout), **write** by company admin / platform owner only. Entity is just a string key → one set of tables serves all entities.

## 5. The one capability set → how each is delivered

| Capability | Mechanism |
|---|---|
| **Visibility** | `access='hidden'` + read redaction |
| **Editability** | `access ∈ view/edit` + server write enforcement |
| **Required** | `access='required'` and/or `field_config`; enforced on save |
| **Ordering** | `field_config.sort` + `section` |
| **Custom fields** | existing `erp_custom_fields`, overlaid by config/access |
| **Conditional visibility** | `field_config.condition` over record + company context (generalizes `isFieldVisible`) |
| **Role / permission access** | `erp_field_access` subject = role **or** permission (most-permissive merge) |
| **Company-level config** | everything keyed by `company_id` |
| **Audit** | `logAudit` before/after on every config/access write (§8) |

## 5.1 Field grouping / sections (confirmed — already covered)

Large forms stay usable via **configurable, orderable sections per company** — already supported by the DFG-1 schema, no redesign:

- **`erp_field_config.section`** assigns each field to a group (Commercial / Financial / Legal / Contacts / Location / Credit / **any custom section** — the section is just a company-chosen key).
- **`erp_field_config.sort`** orders fields within a section; **section order is derived** from each section's lowest field `sort` (reordering fields reorders sections).
- **Composes with everything**: a field's section is independent of `access` / `is_active` / `condition`, so grouping works alongside **visibility, editability, required, custom fields, and conditional visibility** — a field shows in its section only when applicable and not hidden.
- Custom fields carry a section too (same `section` column, `source='custom'`), so company-defined fields slot into any group.

**Optional enhancement (DFG-2, additive — no DFG-1 schema change):** an `erp_field_sections(company_id, entity, key, label_ar, label_en, sort)` table for **explicit bilingual section labels and section-level drag-ordering**. Until then, sections render from the distinct `section` keys ordered by field `sort`.

**Section presentation metadata (DFG-2, additive — no DFG-1 schema change).** An `erp_field_sections` table makes sections first-class with the presentation attributes needed for very large forms (100+ fields):
```
erp_field_sections(
  company_id, entity, key,            -- the section identity (matches field_config.section)
  label_ar, label_en,                 -- explicit bilingual labels
  description_ar, description_en,      -- help text shown under the section title
  icon,                               -- icon name (lucide key) per section
  collapsible      bool default true, -- can the user fold this section?
  default_collapsed bool default false,-- initial expanded/collapsed state
  sort             int                 -- section-level drag-ordering
)
```
- **Icons per section** → `icon`. **Descriptions/help text** → `description_ar/en` (the existing `FormSection` already renders an optional description). **Collapsible** → `collapsible`. **Default expanded/collapsed** → `default_collapsed`.
- **Backward-compatible:** absent row ⇒ section renders with its key as the label, no icon, expanded, ordered by field `sort` (today's behavior). The table only *enriches* presentation.

**Mobile-friendly rendering (DFG-3 form renderer).** Sections render as a **single-column accordion** on mobile: collapsible cards (honoring `default_collapsed`), one field per row, large tap targets, RTL-aware — so a 100+-field form stays scannable on a phone. On desktop the same sections render as the existing multi-column `FormSection` groups. The renderer is driven entirely by the resolved layout + section metadata, so the **same configuration** produces both.

## 6. Resolver & enforcement (generic, one implementation)

`src/lib/erp/field-governance.ts` (pure, unit-tested):
- `resolveFieldLayout(entity, ctx, record?) -> OrderedField[]` — registry ⨝ `erp_field_config` ⨝ `erp_field_access` ⨝ `erp_custom_fields`, resolved for the current user (+ record for conditions/inheritance). Precedence: **applicability(condition) → company-active → subject access (most-permissive across roles+permissions) → inheritance → admin safety**.
- `applyWriteAccess(entity, input, current, layout) -> { data, missingRequired[] }` — drops fields the user can't edit, enforces required. **The real protection.**

**Defense in depth (per entity):**
1. **UI** renders from `resolveFieldLayout` (order, section, hidden/readonly/required).
2. **Server write** runs `applyWriteAccess` in the entity's upsert action — bypassing the UI can't set a forbidden field.
3. **Read redaction** strips `hidden` fields from the payload (app-layer for pilot; DB column-level privileges are a documented post-pilot upgrade). Tenant RLS remains DB-authoritative.

## 7. Admin lockout protection (invariant #2)

Hard guarantees enforced in **both** the resolver and the config-save action:

- **Platform Owner** bypasses field governance entirely (ultimate backstop — always full access).
- **Company Admin / IT Admin** are clamped to **≥ View on every field** and **≥ Edit on protected fields** — the resolver never returns `hidden` for them.
- **Protected fields** (`is_protected`): entity **identity/critical** fields (e.g. `code`, `name`, and configuration-critical keys) are protected by default (registry-declared). The **config-save action rejects** any attempt to set a protected field to `hidden`/disabled **for admin subjects**, or to remove an admin's access to the **field-governance settings page** itself.
- A **save-time invariant check**: the resulting configuration must leave admins able to (a) see every field and (b) reach the governance UI. Violations are rejected with a clear message — you cannot accidentally lock yourself out.

## 8. Audit with before/after (invariant #3)

Every create/update/delete on `erp_field_config` / `erp_field_access`:
```
logAudit(supabase, {
  action: 'update',                         // or create / delete
  entity: 'field_config' | 'field_access',
  entityId: `${entity}:${field_key}`,        // e.g. 'customer:credit_limit'
  details: { subject, before: {…}, after: {…} },   // full prior + new values
  companyId,
})
```
- The action **reads the current row first**, then writes, then logs `before`/`after`.
- Surfaced in the existing audit viewer; add `field_config`/`field_access` entity labels. *(Optional post-pilot: a dedicated `erp_field_config_audit` table for richer, queryable history.)*

## 9. Entity coverage & how each plugs in

| Entity | Wire-up (no schema change) |
|---|---|
| Customers (pilot) | registry catalog (exists) → form uses `resolveFieldLayout`; upsert uses `applyWriteAccess` |
| Suppliers, Products | registry catalogs (exist) → same wiring |
| Orders, Invoices, Returns | add field catalogs to registry → wire forms/actions |
| Visits, Routes, Warehouses | add catalogs → wire |
| Approval Requests / **Workflow Forms** | govern the workflow context/form-field schema rendered in `/approvals` |
| **Attachments Metadata** | govern `erp_attachments` metadata fields (category/labels/custom) |
| Future custom modules | register the entity + catalog → instantly governable |

Each entity is enabled by (1) ensuring its field catalog is in the registry and (2) routing its form to `resolveFieldLayout` and its upsert to `applyWriteAccess`. The config/access tables and resolver are shared.

## 10. Rollout (pilot-safe, additive, staging-validated)

- **DFG-1 — Generic model + resolver + enforcement + audit** (one migration: `erp_field_config` + `erp_field_access` + RLS; `field-governance.ts`; `applyWriteAccess`; read redaction; before/after audit). **Customers wired.** *Zero-config = today.*
- **DFG-2 — Admin governance UI** (`/settings/field-governance`, entity-agnostic: reorder, sections, active/sensitive/protected, default access, role/permission × access grid, inheritance, condition builder, add/disable custom fields). Admin-lockout invariants enforced on save; all changes audited before/after.
- **DFG-3 — Data-driven Customer form** (render from `resolveFieldLayout`).
- **DFG-4+ — Per-entity enablement** (Suppliers → Products → Orders → Invoices → …), each its own small, staging-validated slice.

This **supersedes** the customer-only FP-a/b/c plan: same tables and resolver, generalized to all entities from day one (only the *wiring* is incremental).

## 11. Decisions for your confirmation (recommended in bold)

- **G1.** Audit uses the existing `erp_audit_logs` with before/after in `details` for the pilot; dedicated `erp_field_config_audit` table deferred. → **Recommend.**
- **G2.** Protected fields = registry-declared identity/critical defaults (e.g. `code`, `name`), companies may add more, but the admin-visibility invariant is non-negotiable. → **Recommend.**
- **G3.** Read protection = app-layer redaction for the pilot; DB column-level privileges post-pilot. → **Recommend.**
- **G4.** Subject = **role + permission** (most-permissive merge), as already approved for the customer slice. → **Recommend.**
- **G5.** Build platform-generic tables now (DFG-1), wire entities incrementally (Customers first). → **Recommend.**

---

*Design only. Nothing implemented, nothing merged, no production migrations. Production remains on hold pending your review.*
