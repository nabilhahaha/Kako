# Features & Applications on the Admin Workbench — Review + Industry-Pack Hierarchy Evaluation

Migration of Features & Applications (`/settings/features`, commit `dd91922`) onto the Admin Workbench, plus the requested evaluation of evolving the flat entitlement/module model into **Industry Pack → Modules → Features**. UX standardization only — `setFeatureFlag` / `applyFeatureTemplate` reused verbatim; no business-logic, permission, RLS, or workflow change.

---

## 1. Features workbench — what shipped

- **Left:** capability **groups** (domains: inventory · pos · governance · scanning · contacts), each showing `enabled/total`, plus a **Templates** entry.
- **Center:** the selected group's **features** as toggles (`setFeatureFlag`), or the **Templates** apply buttons (Lite / Standard / Enterprise → `applyFeatureTemplate`).
- **Right:** per-domain summary + live **ActivityFeed** (`feature_flag` / `feature_template`).
- URL-addressable (`?id=<domain>`), tablet drawer, keyboard-navigable list.

This already renders a **two-tier** view (group → feature) — a natural proving ground for the hierarchy question below.

### Capture points (live preview, `/settings/features`)
1. Group list + Templates entry; pick **POS** → its features as toggles with the enabled badge.
2. Toggle a feature (saves; toast); right panel logs it in Activity.
3. **Templates** entry → apply **Standard**; watch features update + the audit entry.
4. Tablet/mobile: context drawer.

---

## 2. Current model (as built today)

Four overlapping, mostly **flat** layers:

| Layer | Table / source | Role |
|-------|----------------|------|
| **Feature flags** | `erp_feature_flags` + `FEATURES` catalog (grouped by `domain`, with `lite/standard/enterprise` templates) | tenant capability toggles; gate nav/UI/validation |
| **Company modules** | `erp_company_modules` (+ `erp_plan_modules` plan-lock) | which app modules a company has on |
| **Entitlements** | `erp_company_entitlements` (`module_key` + `feature_key` + `is_enabled`) | licensing + UAO/Role-Override gating |
| **Plans** | `erp_plans` + `erp_plan_modules` | plan → modules |

**Already present (informally):** `licensing-catalog.ts` distinguishes **Core Modules vs Industry Packs (verticals)**, with a **pack → core preselect map** and **pack → suggested-role sets**; `classifyModuleKey()` returns `'core' | 'pack'`; the company detail has a **Packs** tab. So a pack concept exists — as an **onboarding classification**, not a formal hierarchical entitlement tree.

**Symptoms of the flat model:** the same "module" appears in plans, company_modules, entitlements, and (as a domain) in features; there is no single source of truth for "what this industry gets," and packs are preselect hints rather than a resolved layer.

---

## 3. Evaluation — should it become Industry Pack → Modules → Features?

**Proposed hierarchy**
```
Industry Pack (Pharmacy / FMCG / Retail / …)
  └─ Modules (inventory, pos, accounting, …)        ← core + pack modules
       └─ Features (fine-grained toggles)            ← today's feature flags
```

**Pros**
- One clear mental model; the admin left panel becomes a natural **Pack → Module → Feature** drill-down (the workbench already does Module → Feature).
- Industry onboarding becomes "pick a pack" → modules + feature defaults resolve automatically (formalizes today's preselect map).
- Plans reference **packs**, not raw modules; entitlements become pack-aware; resolution has one authority.
- Removes the duplication between plan_modules / company_modules / entitlements / feature domains.

**Cons / risk**
- This is a **business-model change, not UX** — it touches entitlement resolution, plan→module mapping, the auth/module resolver, RLS scoping of entitlements, and a **migration of existing flat data**. It is explicitly **out of scope** for the admin-UX standardization (which must not change logic/RLS/permissions).
- Backward-compatibility and pilot risk: every tenant's current modules/entitlements must map cleanly to packs.
- Needs its own design-first workstream with a reuse audit + security review — the same playbook as User Access Overrides / Role Overrides.

**Reuse already available to build on:** the `INDUSTRY_PACKS` catalog, `classifyModuleKey` (core/pack), the pack→core preselect map, the Packs UI tab, and the `domain` grouping in the feature catalog. The foundations exist; what's missing is a **formal `pack → modules → features` resolution layer** and pack-aware entitlements.

---

## 4. Recommendation

- **For this pass: keep the flat model.** The Features migration is presentation-only; do not change the entitlement/module model here.
- **Adopt the hierarchy as a separate, design-first capability** (roadmap item, default-OFF, additive, gated — the proven UAO/Role-Override pattern), not folded into the admin-UX work. Suggested phasing:
  1. **`erp_industry_packs`** (pack → modules + feature defaults), seeded from the existing `INDUSTRY_PACKS` catalog — additive, no behavior change.
  2. **Resolution layer:** `pack → modules → features`, consumed read-only first (display), then authoritative behind a flag.
  3. **Plans & onboarding reference packs**; entitlements become pack-aware (backward-compatible mapping of current flat data).
  4. **Workbench evolves** the left panel into Pack → Module → Feature drill-down (pure UX, rides on the new model).
- **Gate, validate, security-review** before any tenant — exactly like UAO.

I can produce a full **Industry-Pack hierarchy design + reuse audit** (like the UAO/Role-Override specs) as the next design deliverable whenever you want — kept separate from the admin-UX migrations.

---

## 5. Validation (this migration)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Full suite | ✅ 1592 passed / 192 skipped |
| i18n parity + key-usage | ✅ passed |
| Production build | ✅ green (`/settings/features` compiled) |
| Logic / permissions / RLS / workflow | ✅ unchanged |

Commit `dd91922` on `claude/pilot-ux` (PR #319) · live on the preview at `/settings/features`.

---

## 6. Next

Per your order: **Branches** is next, then **Settings → Integrations**. Branches will largely reuse the Companies "Branches" tab components. Say the word and I'll proceed — and separately, tell me if you want the Industry-Pack hierarchy design/reuse-audit drafted as its own workstream.
