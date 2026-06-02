# VANTORA — Custom Fields & Dynamic Forms

> Core Platform capability (`PRODUCT_PRINCIPLES.md`). Entity-based, per-company,
> **build once / reuse everywhere** — never industry-specific.

## Model
- **Definitions** — `erp_custom_fields` (per `company_id` + `entity`): `key`
  (slug = jsonb key), `label_ar/en`, `type` (text/number/date/boolean/select/
  multiselect/file), `required`, `options`, `validation` (min/max/len/regex),
  `visibility` (conditional rule), `sort`, `is_active`. Unique per
  `(company, entity, key)`. RLS: read = company member/owner; write = company
  admin/owner; every change audited by trigger.
- **Values — Option A (JSONB on the row):** a `custom jsonb` bag on the entity
  table (Phase A: customer/supplier/product/branch; one-line additive column to
  add more). Chosen for import/export round-trip, simple forms binding, read
  performance, and lower ops complexity.

## Shared logic (`src/lib/erp/custom-fields.ts`)
`validateCustomValue`, `coerceCustomValue`, `isFieldVisible`, `slugifyFieldKey` —
used identically by Import and Dynamic Forms (one source of truth).

## Integrations (from day one)
- **Permissions:** `settings.custom_fields` gates the management UI/actions;
  RLS backstops writes with company-admin/owner.
- **Import:** custom fields appear in the mapping step; values validated by
  definition and written into `custom`.
- **Export:** `/api/export` appends active custom-field columns, flattening the
  `custom` jsonb (arrays → `a|b`).
- **Audit:** definition changes logged via `erp_log_audit` (DB trigger).
- **RLS:** company-scoped throughout; values inherit the host entity's RLS.

## Dynamic Forms Foundation (Phase B — next)
`buildFormSchema(entity, company)` = registry `EntityField`s + active custom
fields → one schema (label/type/required/options/validation/visibility).
`validateAgainstSchema` (server + client, reuses the lib above) + a generic
`<DynamicForm>` renderer with required + conditional-visibility rules. Wired into
1–2 entity screens as proof.

## Deferred (extension points only)
Formula/computed fields, cross-entity lookup field type, field-level encryption,
versioned form layouts, drag-and-drop designer, workflow-driven forms.
