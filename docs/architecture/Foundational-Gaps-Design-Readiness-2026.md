# Foundational Gaps — Design & Implementation Readiness

**Design only — no implementation. No feature expansion beyond the audited scope.** Five
foundational items that unblock the onboarding wizard, each **reuse-first** (built on
existing tables/engines/screens). All new tables are `company_id`-scoped under RLS
(`company_id = erp_user_company_id()`), matching the frozen baseline.

Readiness legend per item: **Wire-now** (exists) · **UI-exposure** (engine exists, new
screen) · **Backend** (small new schema/API) · **Future** (out of this scope).

---

## 1. Configurable Organization Hierarchy — `erp_org_levels`, `erp_org_nodes`

**Scope:** per-company, renamable/reorderable org levels + a node tree, replacing
hard-coded Region→Area→Branch→Team. **Reuse:** seed from existing
`erp_regions/areas/branches/teams` (they already carry `name/name_ar/manager_id/sort`);
**`erp_branches` stays the canonical "Branch" node** so routes/customers/`erp_user_branches`
keep working unchanged.

**Data model**
```
erp_org_levels(
  id, company_id, name, name_ar, depth int, sort_order int,
  parent_level_id uuid null,            -- level chain (Region→Area→…)
  can_hold_users bool, can_hold_manager bool,
  system_key text null,                 -- 'region'|'area'|'branch'|'team' for compat, null for custom
  created_at, updated_at)
erp_org_nodes(
  id, company_id, level_id, parent_node_id uuid null,
  name, name_ar, manager_user_id uuid null, sort_order int, is_active bool,
  legacy_ref_type text null, legacy_ref_id uuid null,  -- → erp_regions/areas/branches/teams (compat)
  created_at, updated_at)
```
**Backward-compat seed (migration):** for each company, create levels from its current
structure and nodes from `erp_regions/areas/branches/teams` (carry `manager_id →
manager_user_id`, `sort`). Nodes keep `legacy_ref` so existing `branch_id` references are
intact. **Scoping unchanged** — visibility still reads the frozen `reports_to` subtree
(node-subtree scoping is future, behind a flag — not in this scope).

**UX (Org Structure Builder — wizard step 4 / Settings → Organization):** levels editor
(rename/reorder/add) + **drag-drop node tree** + tap-to-assign manager. Reuses
`settings/organization`, `settings/regions`, `settings/branches` data.

**Readiness:** Backend = 2 tables + seed migration + read/write API. UI-exposure = the
drag-drop builder screen. Wire-now = existing org data + manager fields. Future =
node-subtree scoping flag.

---

## 2. Configurable Product Hierarchy — `erp_product_levels`, `erp_product_nodes`

**Scope:** per-company renamable product levels + node tree. **Reuse:**
`erp_product_categories` is **already a `parent_id` tree** with `name/name_ar/sort_order` —
seed nodes directly from it; keep `erp_products_catalog.category_id` as the product link
(add an optional `node_id` mirror). `brand` (text on products) can become an optional level
later — **not in this scope**.

**Data model**
```
erp_product_levels(
  id, company_id, name, name_ar, depth int, sort_order int,
  parent_level_id uuid null, system_key text null,  -- 'category'|'brand'|… / null for custom
  created_at, updated_at)
erp_product_nodes(
  id, company_id, level_id, parent_node_id uuid null,
  name, name_ar, sort_order int, is_active bool,
  legacy_category_id uuid null,         -- → erp_product_categories (compat)
  created_at, updated_at)
-- optional: erp_products_catalog.node_id uuid null  (mirror of category_id during transition)
```
**Backward-compat seed:** create a "Category" level + nodes from `erp_product_categories`
(preserving the `parent_id` tree and `sort_order`); product→category assignments remain
authoritative (node = category). Reports/MSL/pricing keep using `category_id`; an
`erp_product_subtree(node_id)` helper (mirrors `erp_user_subtree`) rolls up when needed.

**UX (Product Builder — wizard step 8 / Settings):** levels editor + folder-style
drag-drop tree + assign products via search/**existing import** (`settings/import`). Reuses
the catalog + categories.

**Readiness:** Backend = 2 tables + seed-from-categories migration (+ optional `node_id`).
UI-exposure = product-levels builder. Wire-now = existing categories/catalog/import.

---

## 3. Onboarding State Persistence — `erp_onboarding_state`

**Scope:** save / resume / continue-later for the wizard. **Reuse:** `erp_companies.setup_done`
already exists (set on completion); `setup-wizard.ts` consumes the profile.

**Data model**
```
erp_onboarding_state(
  id, company_id unique, template_key text null,
  current_step text, step_status jsonb,   -- { basics:'done', org:'in_progress', tax:'skipped', … }
  draft jsonb,                            -- per-step unsaved values (autosave)
  started_at, completed_at null, updated_at, updated_by)
```
RLS company-scoped. On Go-Live → set `completed_at` + `erp_companies.setup_done = true`.

**UX:** powers the wizard shell (progress rail, "Save & exit", resume banner "3 of 9
done"). No business jargon — pure progress.

**Readiness:** Backend = 1 table + get/save/complete API. UI-exposure = wire the existing
wizard-shell design to it. Wire-now = `setup_done`. **Lowest effort, highest leverage —
build first.**

---

## 4. Document Numbering Configuration UI — over `erp_sequences`

**Scope:** expose the existing numbering engine to admins. **Reuse:** `erp_sequences(branch_id,
seq_type, prefix, current_val)` already generates numbers — the UI only **edits config**.

**Design (no engine change):**
- Screen lists each **document type** (`seq_type`: invoice, collection, return, …, from the
  known catalog) × **branch**, showing **prefix** + **next number** (`current_val`) + a live
  **preview** ("INV-000124").
- Edit prefix and **starting/next number**; **company default** + per-branch override
  (default row = a company-level template applied to branches).
- **Guardrail:** next number **cannot be set below the current value** (prevents duplicate
  document numbers) — the only hard validation.
- **Optional minor extension (flagged, not required):** `padding`, `yearly_reset`, suffix
  format columns → **Future** (keeps current scope minimal).

**Readiness:** Wire-now = `erp_sequences` engine. UI-exposure = new Settings → Document
Numbering screen. Backend = small: a read/write API + the "≥ current" guard (+ optional
company-default seeding). RLS = scope by `branch_id ∈ erp_user_branch_ids()`.

---

## 5. Company Tax / VAT / Currency Setup UI

**Scope:** a business-friendly company finance-settings screen. **Reuse (engine exists, no
new tax engine):** `erp_companies.currency/country/tax_number`; `erp_tax_registrations`
(regime, tax_kind, registration_number, default, effective dates); `erp_country_vat`
(default rate per country, read-only reference); `lib/tax/*`; `settings/einvoice`.

**Design:**
- **Currency:** edit `erp_companies.currency` (picker).
- **Country:** edit `erp_companies.country` → **auto-fills the default VAT rate** from
  `erp_country_vat` (editable).
- **VAT/Tax registration:** `erp_companies.tax_number` + manage `erp_tax_registrations`
  rows (number, regime, effective dates, default) — reuse existing.
- **Default VAT rate:** shown from `erp_country_vat`; per-document treatment continues via
  the existing tax engine (`erp_document_tax_profiles` / determination rules) — **unchanged**.
- E-invoicing stays in `settings/einvoice` (deep-link from this screen).

**Readiness:** Wire-now = companies + tax_registrations + country_vat + tax engine.
UI-exposure = new Settings → Tax & Currency screen (form over existing data). Backend =
minimal (optional `default_vat_rate` convenience field on company or branch tax profile).

---

## Overall Implementation Readiness

| Item | Wire-now | UI-exposure (new screen) | Backend (new) | Future |
|---|---|---|---|---|
| 1 Org hierarchy | existing org data + managers | drag-drop org builder | `erp_org_levels/nodes` + seed | node-subtree scoping flag |
| 2 Product hierarchy | categories tree + catalog + import | product-levels builder | `erp_product_levels/nodes` + seed (+`node_id`) | brand-as-level, subtree rollups |
| 3 Onboarding state | `setup_done` | wire wizard shell | `erp_onboarding_state` + API | sandbox/preview |
| 4 Doc numbering | `erp_sequences` engine | Settings → Numbering | r/w API + "≥ current" guard | padding/yearly-reset/format |
| 5 Tax/VAT/Currency | companies + tax engine + country_vat | Settings → Tax & Currency | optional default-rate field | multi-entity tax nuance |

### Suggested build order
1. **`erp_onboarding_state`** (unblocks the whole wizard; tiny).
2. **`erp_org_levels/nodes`** + seed (the visibility backbone; reuses org data; frozen
   `reports_to` scoping unchanged).
3. **`erp_product_levels/nodes`** + seed from categories.
4. **Document Numbering UI** (pure exposure + one guard).
5. **Tax & Currency UI** (pure exposure over existing engine).

### Guardrails (consistent with the frozen baseline)
- All new tables `company_id`-scoped under RLS; Company-Admin edits **only their company**.
- Backward-compatible: seed from existing tables; legacy refs preserved; **no scoping
  change** (P4 `reports_to` subtree stays authoritative).
- Business-friendly UIs only (Core UX principle); engines unchanged.
- **No feature expansion** beyond these five audited items.

## Status
Design & readiness package — **nothing implemented**. Each item is reuse-first over
existing platform capabilities; only the five tables/screens above are new.
