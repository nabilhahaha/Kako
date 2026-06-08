# VANTORA — Platform Owner UX, Industry Pack & Module Governance Review

**Type:** Review + recommendations (verified against actual code/migrations 0017–0226). Reuse-first.

## 1. Current behavior report (verified)
**Structure is table-driven (no hardcoded lists in app code) — a major strength.**

| Layer | Tables | Behavior |
|---|---|---|
| **Industry catalog** | `erp_business_type_roles` (0022), `erp_business_type_modules` (0036/0044), `erp_companies.business_type` | 20+ business types; each maps to a role-template set + a module set |
| **Module library** | `erp_plan_modules` (0027, coarse), `erp_business_type_modules` (fine), `erp_company_modules` (per-company) | **Single unified catalog**; visibility = company_modules ∩ plan_modules. Same module def across industries (dormant until enabled) — **no duplication** |
| **Feature/capability** | `erp_role_permissions` (0017), licensing (0095/0098/0156) | crm/workflow/analytics/field_ops/integrations/pos as capabilities; seeded per type |
| **Pack assignment / enablement** | `erp_company_modules` | On creation `erp_seed_company_modules()` copies the type's modules; Platform Owner toggles per module; reset-to-defaults available |
| **Role templates → copies → overrides** | `erp_roles`/`erp_role_permissions` (template) → `erp_company_roles`/`erp_company_role_permissions` (copy, 0021) → company-admin overrides (0125) | On creation, the template is **copied** into the company; the company edits its own copy; **platform template edits do NOT propagate** to existing companies |
| **Compliance packs** | legal entities/registrations (0202), submissions (0203), certificates (0205) | One default legal entity per company; per-entity tax registrations; pack connectors flag-gated/paused |
| **Versioning** | `erp_field_config_versions` (0117) only | Field configs versioned (draft/published/archived + rollback). **Roles/modules/plans had NO version history** (until 0226) |

**Platform Owner UI (exists, 15+ pages under `/platform/`):** overview dashboard, companies list + Company-360 (modules/plan/members), global roles editor, plans+modules editor, activity/audit, staff, billing, analytics.

**Key finding — repeated module presentation does NOT cause data duplication:** modules are one catalog; the apparent repetition across industries is *presentation* of the same definitions, gated by company∩plan. The duplication risk is **UX-side** (the same long module list shown per company), not schema-side.

## 2. Recommended behavior
1. **Keep the single module catalog** (it already avoids duplication). Improve the UI to present **module groups/categories** + an industry-default "recommended set" diff, not a flat list (reduces cognitive load at scale).
2. **Version platform role templates** (implemented in 0226) so template evolution is tracked and upgrades are explicit (RULES 5–8).
3. **Surface "current / latest / upgrade-available" per company** for roles (RULE 7) — implemented as `versionStatus()` over `erp_company_role_versions` + `erp_role_template_versions`.
4. **Make all template→company propagation explicit** (already the behavior for roles/modules; now formalized + visible for roles).

## 3. Versioning strategy
- **Platform role templates** → `erp_role_template_versions` (role_key, version_no, status draft/published/archived, snapshot). Editing a template = publishing a **new version**; existing adoptions are untouched.
- **Modules/plans**: recommend the same snapshot-version pattern later if drift becomes a concern (catalogued as backlog; not blocking — module changes already affect new companies only via the seed copy).
- **Field configs** already versioned (0117) — the proven pattern this reuses.

## 4. Upgrade strategy
- **Explicit only** (RULE 6). A company adopts a version (`erp_company_role_versions.adopted_version`). Upgrading runs the pure `planUpgrade(oldBase, newBase, override)` which applies the new base **and re-applies the company's override** — so customizations survive (RULE 8). No automatic/silent/forced propagation (RULES 3/4).

## 5. Company isolation validation
- **Structural isolation**: every per-company artifact (`erp_company_roles`, `erp_company_role_permissions`, `erp_company_modules`, `erp_company_role_versions`) is a **separate row keyed by company_id** under company-scoped RLS (`erp_user_company_id()`/`erp_is_platform_owner()`). Company A's edits are physically different rows from Company B's — no shared mutable state. The pure upgrade engine operates on one company's data and returns only that company's result. See the RULE-9 validation report.

## 6. Platform Owner UX recommendations
- **Catalog-first navigation**: Industry → (recommended modules diff) → Modules (grouped) → Capabilities, instead of repeating the full module list per company.
- **Role template version manager**: list templates with versions, publish new version, and a per-company **"Upgrade available"** column + one-click explicit upgrade showing the override-preservation preview.
- **Bulk-safe operations**: show impact ("affects new companies only") before publishing a template; never imply retroactive change.
- **Compliance pack panel**: per-company country-pack enablement surfaced alongside legal entities/registrations.
- **Scale**: all the above are table-driven + paginated; managing hundreds of companies stays O(1) per screen via read-models, not per-company bespoke config.

*Review only. The mandatory Role Template Versioning & Override policy is implemented additively in migration 0226 + `src/lib/role-templates/` (see the validation report).*
