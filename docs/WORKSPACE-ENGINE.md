# VANTORA Workspace & Dashboard Engine

**Status:** Specification v1 — _design only_. No implementation, no schema, not merged, not deployed.
**Scope:** A configurable, persona-based **engine** for home dashboards, navigation, quick actions, and workspace sections — built from reusable widgets, governed like DFG, seeded by Industry Packs, and customizable per company **without code changes**.
**Authority:** This document is the authoritative reference for all workspace/dashboard/navigation work. It composes with — and reuses — the Authorization Model (`AUTHORIZATION-MODEL.md`) and Dynamic Field Governance (DFG). Deviations require an amendment here first.

---

## 1. Goals & principles

1. **An engine, not screens.** There are no hardcoded dashboards. Every home/workspace is an assembled, data-driven layout of reusable widgets.
2. **Persona-based.** Experience is shaped to the persona (Sales Rep, Supervisor, ASM/RSM, Warehouse, Finance, Owner, + future) — not one-size-fits-all.
3. **Company-configurable without code.** The Company Admin configures Home Dashboard, Navigation, Quick Actions, Widgets, and Workspace Sections at runtime.
4. **Governed like DFG.** The same governance philosophy (default → role/persona → user, with locked/visible/hidden levels and pack inheritance) extends to **Dashboard, Navigation, and Workspace** governance.
5. **Industry-Pack seeded, company-customizable.** Packs ship default layouts per business type; each company forks and customizes; reset-to-pack is always available.
6. **Authorization-aware.** Every widget/menu/action is gated by the Authorization Model — capability, scope, limits, module, and DFG fields — so a configured layout never shows data a user may not see.
7. **Future-proof.** New widget = register in the catalog. New persona = add a mapping. New vertical = ship a pack. None require touching the engine.

---

## 2. Domain model (core concepts)

```
Widget        a reusable, self-describing building block (data + config + gating)
Section       an ordered, titled group of widgets (a workspace area)
Surface       a configurable area: Home | Navigation | Quick Actions | Workspace
Layout        the assembled, ordered config for a Surface (sections + widgets + placement)
Persona       an experience archetype a user maps to (Sales Rep, Finance, …)
Pack          an Industry default bundle of Layouts for a business type
Governance    the resolution + lock rules that merge Pack → Company → Persona → User
```

A **Workspace** for a user = the resolved set of Surfaces (Home dashboard, Navigation, Quick Actions, Workspace sections) for their persona, after governance + authorization filtering.

---

## 3. Widget contract (the reusable building block)

Widgets are declared in a **code registry** (like the permission catalog) — the catalog is versioned with the app; *instances and placement* are data (configurable). Each widget declares:

```ts
Widget := {
  key,                  // 'sales.summary', 'route.coverage', …
  title,                // i18n key (ar/en)
  category,             // sales | collections | inventory | approvals | personal | analytics
  dataSource,           // server resolver id (returns the widget's data, scope-aware)
  configSchema,         // typed params: period, branch, top-N, thresholds, target source…
  requiredCapability?,  // Authorization key gating visibility (module.resource.action)
  module?,              // feature-module gate (widget unavailable if module off)
  scopeAware: true,     // data ALWAYS respects the user's scope via RLS
  sizes,                // supported grid sizes (e.g. 1×1, 2×1, 2×2, full)
  verticals,            // applicable business types ('*' = all)
  refresh,              // static | interval(n) | on-nav
}
```

**Guarantees every widget must honor:**
- **Scope:** data is filtered by the user's scope (RLS) — a rep's "Sales" widget shows only their customers' sales.
- **Capability:** the widget renders only if the user holds `requiredCapability` (and the `module` is enabled).
- **Limits/DFG:** any sensitive field inside a widget obeys DFG; amount limits (where relevant) follow the authz constraints.
- **Empty/loading/error** states via shared primitives (`EmptyState`, skeletons).

---

## 4. Widget catalog (initial reusable set)

Each maps to a data source, a gating capability, and a module. Items marked **(dep)** depend on a capability that may be a future build → recorded as a gap (see §11), not a blocker.

| Widget | key | Gating capability | Module | Personas (default) |
|---|---|---|---|---|
| Sales | `sales.summary` | `sales.*.view` | sales | Rep, Supervisor, ASM/RSM, Owner |
| Collections | `collections.summary` | `sales.payment.collect` / `accounting.view` | sales/accounting | Rep, Finance, Owner |
| Route Coverage | `route.coverage` | `field.sales` | field/sales | Rep, Supervisor, ASM/RSM |
| Target Achievement **(dep)** | `target.achievement` | `reports.view` | targets | Rep, Supervisor, ASM/RSM, Owner |
| Stock | `inventory.levels` | `inventory.stock.view` | inventory | Warehouse, Branch Mgr, Owner |
| Near Expiry **(dep)** | `inventory.nearExpiry` | `inventory.expiry.view` | inventory | Warehouse, Branch Mgr |
| Approvals | `workflow.myApprovals` | (any approve cap) | workflow | Supervisor, ASM/RSM, Finance, Owner |
| Tasks **(dep)** | `tasks.myTasks` | — | tasks | all |
| Calendar | `calendar.agenda` | `field.sales` / `clinic.*` | field/clinic | Rep, Clinic personas |
| Alerts | `alerts.feed` | — (cross-module, self-gating) | — | all |
| Top Customers | `sales.topCustomers` | `sales.*.view` | sales | Supervisor, ASM/RSM, Owner |
| Top Sales Reps | `sales.topReps` | `reports.view` | sales | Supervisor, ASM/RSM, Owner |

The catalog grows by registration; nothing here is a fixed dashboard — these are parts.

---

## 5. Personas

Personas are an **experience archetype**, decoupled from roles so the same role can map to different experiences and new personas can be added without new roles.

| Persona | Typical role(s) | Default workspace emphasis |
|---|---|---|
| Sales Rep | `salesman` | Route coverage, my sales, collections, calendar, tasks |
| Supervisor | `supervisor` | Team coverage, team sales, approvals, top reps |
| ASM / RSM | `area_manager` / `regional_manager` | Region sales, targets, top customers/reps, approvals |
| Warehouse | `warehouse_keeper` | Stock, near-expiry, stock requests, transfers |
| Finance | `accountant` | Collections, AR/AP, approvals, alerts |
| Owner | `admin` / company owner | Company KPIs, sales, collections, approvals, alerts |
| _Future_ (Clinic Reception, Restaurant Manager, …) | per vertical | shipped by the Industry Pack |

**Derivation:** a user's persona is derived from their primary role via a configurable **role→persona map** (Company Admin editable), with an optional explicit per-user persona override. Multi-role users resolve to a primary persona (highest-rank role) or a merged workspace (governance decides).

---

## 6. Surfaces (what is configurable)

| Surface | Configurable elements |
|---|---|
| **Home Dashboard** | which sections + widgets, order, size, per-widget config (period/top-N/thresholds) |
| **Navigation** | menu groups, items, order, labels, icons, visibility (governs/augments today's `NAV_SECTIONS`) |
| **Quick Actions** | the action shortcuts shown (Create Invoice, Log Visit, Collect, Receive Stock, …) — each gated by capability |
| **Workspace Sections** | the persona's working areas (e.g. "My Day", "Pending Approvals", "Team") composed of widgets |

All four Surfaces share one engine, one governance model, and one resolution pipeline.

---

## 7. Governance — extend DFG to Dashboard / Navigation / Workspace

The DFG philosophy (config rows + access levels + inheritance + admin lockout) generalizes from *fields* to *layout elements*.

### 7.1 Element access levels
| Level | Meaning |
|---|---|
| `locked` | present and **non-removable** by the user (company-pinned) |
| `default_on` | shown by default; user may hide/reorder (if personalization allowed) |
| `default_off` | available in the catalog; user may add |
| `hidden` | not available to this persona/role |

(Direct analog of DFG's `hidden / view / edit / required` and `inherit / inherit_locked`.)

### 7.2 Three governance domains
- **Dashboard Governance** — which widgets/sections a persona/role sees, their lock state, and default config.
- **Navigation Governance** — which menu items/groups appear, order, labels, lock state.
- **Workspace Governance** — which workspace sections/quick-actions a persona gets.

All three are administered in one **Workspace Studio** (the configuration UX, §9) and resolved by one resolver (§8), mirroring DFG's `resolveLayout`.

---

## 8. Resolution pipeline

Layered, each stage may add/override/lock; later stages cannot override a `locked` element from an earlier stage (admin lockout, like DFG protected fields):

```
1. PACK default      Industry-Pack layout for (business_type, persona, surface)
2. COMPANY config    Company Admin edits/locks (Workspace Studio)
3. PERSONA / ROLE     persona-specific layer (+ multi-role merge)
4. USER personalization   optional add/hide/reorder (only where not locked)
5. AUTHORIZATION filter   drop elements failing capability / module / scope;
                          widget DATA is RLS-scoped at query time
6. DFG filter         sensitive fields within widgets obey field governance
→ EFFECTIVE WORKSPACE
```

**Safe default:** with zero company config, the Pack default (or the built-in default layout) renders — exactly today's behavior, no regression. The engine degrades gracefully to sensible defaults at every layer.

---

## 9. Configuration UX — "Workspace Studio" (Company Admin)

A no-code builder, reusing shared primitives (`SectionHeader`, `FormSection`, `EmptyState`, `ListSearch`) and the DFG versioning pattern:

- **Persona tabs** — configure each persona's Surfaces independently.
- **Home builder** — drag/drop widgets onto a responsive grid; pick size; edit per-widget config; set lock level.
- **Navigation editor** — reorder/group/relabel menu items; toggle visibility; lock.
- **Quick Actions editor** — choose and order action shortcuts.
- **Workspace sections** — compose named sections from widgets.
- **Inherited vs overridden** — pack defaults render muted; company overrides badged (same visualization language as the Permissions UI §17 of the authz spec).
- **Preview as persona** — render the resolved workspace as a given persona before publishing.
- **Draft → Publish + versions** — like `erp_field_config_versions`; safe rollout, revert.
- **Reset to Pack** — revert a persona/surface to the Industry-Pack default with a diff preview.
- **Audit** — every layout change is audited (actor, target persona/surface, before→after, timestamp) — consistent with the authz audit model.

---

## 10. Industry Pack compatibility

- A **Pack** ships default Layouts for its business type across personas and surfaces (e.g. **FMCG** → Sales workspace home; **Clinic** → Appointments home) — but both use the **same engine and widget contract**.
- Packs seed `default` layouts (code/snapshot, like `erp_field_templates`); company customizations are stored separately and **inherit** from the pack.
- **Pack updates** flow to companies that haven't overridden a given element (`inherit`); company-locked/overridden elements are preserved (`inherit_locked` analog), with an opt-in "adopt pack changes" diff.
- A vertical adds personas + widgets + a default layout in its pack — **no engine change**.

**Example:** FMCG and Clinic share one engine; their *packs* differ. FMCG Rep home = Route Coverage + My Sales + Collections; Clinic Reception home = Today's Appointments + Queue + Billing. Same widgets-on-a-grid mechanism, different pack defaults, both company-customizable afterward.

---

## 11. Integration with existing systems

| System | Integration |
|---|---|
| **Authorization Model** | widgets/menus/actions gated by capability + scope + module; data RLS-scoped; amount-bearing widgets respect limits |
| **DFG** | sensitive fields inside widgets obey field governance; the engine *reuses DFG's governance pattern* for layout elements |
| **Modules** (`erp_business_type_modules`) | a widget/menu requiring a disabled module is unavailable |
| **Navigation** (`navigation.ts` `NAV_SECTIONS`) | today's static nav becomes the built-in default layer; governance overlays company config |
| **Shared UI** (`StatCard`, `SectionHeader`, `EmptyState`) | widgets are built from existing primitives; the provider cockpit's tiles are an early example of the widget pattern |
| **i18n** | all titles/labels via ar/en keys with parity (existing test gate) |
| **Capability gaps** | widgets marked **(dep)** in §4 (targets, near-expiry/lot, tasks) follow the same gap rule as the simulation plan — documented gaps feeding the roadmap, not blockers |

---

## 12. Data model (proposed — future, additive, backward-compatible)

Widget **catalog** stays in code (registry). Configuration is data:

| Table | Purpose |
|---|---|
| `erp_workspace_layouts` | `(company_id, persona, surface, layout jsonb, is_active)` — the resolved company config per surface |
| `erp_workspace_layout_versions` | draft/published versions (like `erp_field_config_versions`) |
| `erp_workspace_user_prefs` | `(user_id, surface, overrides jsonb)` — optional personalization |
| `erp_personas` + `erp_role_persona_map` | persona catalog + role→persona mapping (company-editable) |
| `erp_nav_config` | `(company_id, persona, items jsonb)` — navigation governance overlay |
| `erp_quick_actions` | `(company_id, persona, actions jsonb)` |
| `erp_workspace_pack_defaults` | seeded per business_type (snapshot, like `erp_field_templates`) |

With zero config rows the engine renders pack/built-in defaults (no regression). `layout jsonb` keeps placement flexible; widget *keys* are validated against the code catalog.

---

## 13. Future-proofing
- **New widget:** implement the contract + register — instantly available in Workspace Studio.
- **New persona:** add to the persona catalog + role map; ship a default layout.
- **New vertical:** ship a Pack (personas + default layouts); the engine is unchanged.
- **New surface** (e.g. a mobile rep launcher): add a Surface type; same governance/resolution.
- The engine never hardcodes a screen — screens are emergent from catalog + config.

---

## 14. Phasing (each independently shippable, gated)
| Phase | Deliverable | DB? |
|---|---|---|
| 0 | This spec sign-off; widget-catalog + persona inventory | none |
| 1 | Widget registry + contract + 4–5 core widgets rendering from a **built-in** default layout | none |
| 2 | Resolution pipeline + governance levels (read path) | migration (layout tables) |
| 3 | Workspace Studio (Home builder) + draft/publish + audit | — |
| 4 | Navigation + Quick Actions governance | — |
| 5 | Persona model + role→persona map | migration |
| 6 | Industry-Pack default layouts + inherit/reset | migration (pack defaults) |
| 7 | User personalization + remaining widgets | — |

Each phase degrades to defaults if later phases aren't present.

---

## 15. Risks & guardrails
- **Config complexity** — progressive disclosure; ship strong Pack defaults so most companies never touch Studio.
- **Performance** — widget data sources must be indexed and scope-bounded; lazy-load/stagger widget queries; cache where safe.
- **Authorization leakage** — widgets must *never* be a bypass: data is RLS-scoped at query time, not just hidden in layout. A test asserts each widget returns only in-scope rows.
- **Catalog/key drift** — `layout jsonb` references validated against the code catalog; unknown keys render nothing (fail-safe).
- **Governance lockout** — admin can lock elements; engine must prevent a config that hides an admin's own access to Studio (DFG-style lockout protection).

---

## 16. Decision log
| Decision | Choice |
|---|---|
| Model | Workspace **Engine**, not fixed screens |
| Building block | reusable **Widget** (code registry) + data-driven placement |
| Surfaces | Home · Navigation · Quick Actions · Workspace sections |
| Persona | archetype decoupled from role; role→persona map + optional user override |
| Governance | DFG philosophy extended to Dashboard / Navigation / Workspace (levels: locked/default_on/default_off/hidden; pack inheritance) |
| Resolution | Pack → Company → Persona/Role → User → Authorization filter → DFG filter |
| Industry Packs | ship default layouts; company customizes; reset-to-pack; inherit/inherit_locked |
| Authorization | every element gated by capability + scope + module; data RLS-scoped |
| Config UX | "Workspace Studio" (no-code, versioned, audited, preview-as-persona) |
| Catalog vs config | widget catalog in code; layouts/personas/nav in data |

---

## 17. Open questions (for sign-off)
1. **Personalization depth** — allow end-user add/hide/reorder of non-locked widgets, or company/persona-level only at first?
2. **Persona assignment** — derive purely from role, or also allow explicit per-user persona?
3. **Widget data layer** — per-widget server resolvers (typed, simplest) vs. a generic config-driven query layer (more flexible, heavier).
4. **Multi-role merge** — primary-persona-only, or merge widgets from all of a user's roles' personas?
