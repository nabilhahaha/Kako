# Company Onboarding & Hierarchy Platform — Design Package

**Design only — no implementation.** Objective: a new company configures its
**organization hierarchy, reporting hierarchy, product hierarchy, units of measure, and
roles/permissions entirely from the UI**, with **no code changes** and **no hard-coded
levels**. Builds on the frozen authorization/RLS/hierarchy baseline (P1–P4) and reuses
existing platform infrastructure.

## Frozen baseline this builds on
- **Scoping** reads the recursive `reports_to` tree via `erp_user_subtree(uid)` (P4) —
  adding a tier needs only **edges**, not code.
- **Roles/permissions:** `erp_roles` + global `erp_role_permissions` + per-company
  override `erp_company_role_permissions`; **versioned** templates in
  `erp_role_template_versions`; module entitlements in `erp_company_modules`.
- **Products/UoM:** `erp_products_catalog`, `erp_product_uoms` (`uom, factor, is_case,
  barcode, sort` — multi-UoM already present), `erp_product_categories`.
- **Bulk data:** `erp_import_jobs`. **Vertical:** `erp_companies.business_type`.
- **Configurable hierarchy model** (from the prior architecture note):
  `erp_org_levels/erp_org_nodes` + `erp_product_levels/erp_product_nodes`.

---

## 1. Platform architecture

A **config-driven onboarding layer** over the existing engines. Everything an admin
defines becomes **data** (levels, nodes, edges, template rows, UoM rows) — code reads the
data, never hard-codes names like Supervisor / Brand / SKU.

```
Onboarding Wizard (orchestrator + resumable state)
   ├─ Organization Structure Builder ─► erp_org_levels / erp_org_nodes
   ├─ User Assignment & Reporting   ─► erp_user_branches(reports_to) / erp_user_org_assignments
   ├─ Role Template Builder         ─► erp_roles / erp_role_template_versions / erp_company_role_permissions
   ├─ Product Hierarchy Builder     ─► erp_product_levels / erp_product_nodes / products.node_id
   ├─ Multi-UoM Configuration       ─► erp_product_uoms
   └─ Industry Templates            ─► seed packs that pre-fill ALL of the above
Scoping & entitlements (frozen) read this config: erp_user_subtree + company role perms + modules.
```

**Principles:** (1) **data over code** — no hard-coded levels/roles; (2) **template →
edit** — start from an industry pack, customize freely; (3) **resumable & validated** —
the wizard saves progress and gates "go-live" on completeness; (4) **tenant-isolated** —
every table is `company_id`-scoped under RLS; (5) **versioned & audited** — role/template
changes are versioned (reuse `erp_role_template_versions`); structural edits audited.

---

## 2. The seven components

### 2.1 Company Onboarding Wizard
**Purpose:** orchestrate the whole setup as guided, resumable steps.
**UX flow:** Company basics → **pick industry template** → Organization → Reporting →
Roles → Products → UoM → Users → Review & Go-Live. A progress rail shows step status;
each step is independently editable later from Settings.
**Data:** new `erp_onboarding_state(company_id, step, status, payload jsonb, updated_*)`
(resumability + analytics). Reuses `erp_import_jobs` for bulk user/customer/product import.
**Key behaviors:** every step is **pre-filled by the chosen template** and fully editable;
"Go-Live" requires ≥1 branch node, ≥1 admin user, a role set, and a product root.

### 2.2 Organization Structure Builder
**Purpose:** define the company's structural tree, per company.
**UX flow:** define **levels** (add/rename/reorder — e.g., Region→Area→Branch→Team, or
just Branch); build the **tree** with **drag-and-drop** nodes; assign a **manager** to each
node. Some companies use `Company→Branch→Rep`, others
`Company→Region→Area→Branch→Team→Rep` — both are just different level rows.
**Data:** `erp_org_levels(company_id, name, depth, sort_order, parent_level_id,
can_hold_users, can_hold_manager)`; `erp_org_nodes(company_id, level_id, parent_node_id,
name, manager_user_id, sort_order)`. Existing `erp_regions/areas/branches/teams` map onto
nodes (compat).
**Key behaviors:** drag/drop = `sort_order` + `parent_node_id`; rename = `name`;
cycle-guarded; node delete blocked if it has users/children.

### 2.3 Product Hierarchy Builder
**Purpose:** define the product classification tree, per company/industry.
**UX flow:** define **product levels** (Category→Brand→Family→SKU→Pack — renamable);
build the tree; **assign SKUs** to leaf nodes (search/bulk).
**Data:** `erp_product_levels(company_id, name, depth, sort_order, parent_level_id)`;
`erp_product_nodes(company_id, level_id, parent_node_id, name)`;
`erp_products_catalog.node_id`. Reports/MSL/pricing roll up via `erp_product_subtree`.
**Key behaviors:** industry packs seed the levels; code walks levels (never assumes
"Brand"/"SKU" exists).

### 2.4 Role Template Builder
**Purpose:** define roles and their permissions from the UI, per company.
**UX flow:** start from a template (industry role pack) → **permission matrix** (roles ×
capabilities, grouped) → toggle → **version & publish**. Clone/rename roles; map a role to
a node level (e.g., the "Branch" level's manager role).
**Data:** `erp_roles` (catalog), `erp_role_permissions` (global defaults),
**`erp_company_role_permissions`** (the per-company effective set), **`erp_role_template_versions`**
(versioned snapshots + publish/upgrade — already exists). Permission keys come from the
existing `Permission` catalog (no new hard-coding; new packs add labeled keys).
**Key behaviors:** changes are **versioned** (diff/upgrade path exists); the frozen
authz/SoD model (e.g., settlement = cashier/accountant/admin) ships as the **default
template** but is editable per company.

### 2.5 User Assignment & Reporting Structure Management
**Purpose:** place users on org nodes and define **who reports to whom** — the source of
truth for visibility.
**UX flow:** assign users to nodes + roles; set each user's **manager** (drag a user under
another, or pick `reports_to`); **visualize** the reporting tree.
**Data:** `erp_user_branches(user_id, branch_id/node_id, role, reports_to, team_id)` (+ a
generalized `erp_user_org_assignments` if multi-node). The recursive **`erp_user_subtree`**
(frozen) turns these edges into inherited visibility — Rep→own, Supervisor→team,
Area/Regional/Director→their subtree — with the P4 fallback-safe behavior.
**Key behaviors:** re-parenting a user instantly re-scopes their manager's visibility;
cycle-guarded; bulk assign via `erp_import_jobs`.

### 2.6 Multi-UoM Configuration
**Purpose:** define units and pack/carton conversions per product.
**UX flow:** set a **base unit**; add Unit / Pack / Carton with **conversion factors** and
barcodes; mark case units. Selling/loading/pricing reference a UoM, **orthogonal** to the
hierarchy.
**Data:** `erp_product_uoms(company_id, product_id, uom, factor, is_case, barcode, sort)` —
**already supports this**; the builder is a UI over it (+ optional company UoM presets:
`erp_uom_presets`).
**Key behaviors:** exactly one base per product; factors validated > 0; barcodes unique
per company.

### 2.7 Industry Templates (FMCG / Pharmacy / Distribution / Retail)
**Purpose:** one click seeds a sensible, fully-editable starting config for org levels,
role set, product levels, and UoM presets per vertical.
**Examples (editable after applying):**
| Vertical | Org levels | Product levels | Roles (seed) | UoM presets |
|---|---|---|---|---|
| FMCG | Region→Area→Branch→Team→Rep | Category→Brand→Family→SKU | Director/Regional/Area/Branch Mgr/Supervisor/Rep/Cashier/Accountant/Warehouse/Auditor | Unit/Pack/Carton |
| Pharmacy | Branch→Team→Rep | Category→Generic→Brand→SKU | Branch Mgr/Pharmacist/Cashier/Accountant | Unit/Strip/Box |
| Distribution | Region→Branch→Rep | Supplier→Category→SKU | Regional/Branch Mgr/Rep/Warehouse/Accountant | Unit/Carton/Pallet |
| Retail | Branch→Rep | Department→Category→SKU | Store Mgr/Cashier/Accountant | Each/Pack |
**Data:** `erp_industry_templates(key, business_type, definition jsonb)` — a pack is a
JSON of (org levels, product levels, role→permissions, UoM presets) applied into the
per-company tables. Tied to `erp_companies.business_type`.

---

## 3. Onboarding experience design (the wizard)

| Step | Screen | Output | Gate |
|---|---|---|---|
| 1 Company basics | name, country, currency, **business_type** | `erp_companies` | required |
| 2 Industry template | pick FMCG/Pharmacy/Distribution/Retail (or blank) | seeds steps 3–7 | — |
| 3 Organization | levels editor + drag/drop tree + managers | `erp_org_levels/nodes` | ≥1 branch-level node |
| 4 Reporting | user→manager tree (`reports_to`) | `erp_user_branches.reports_to` | each non-root user has a manager |
| 5 Roles | permission matrix + version/publish | `erp_company_role_permissions` + version | ≥1 admin role |
| 6 Products | product levels + tree + SKU assignment | `erp_product_levels/nodes` | product root |
| 7 Units | base + pack/carton factors | `erp_product_uoms` | base per product |
| 8 Users | invite/import + assign to nodes/roles | users + assignments | ≥1 admin user |
| 9 Review & Go-Live | completeness checklist | activate company | all gates pass |

**UX patterns:** progress rail with per-step status; **template-first** (everything
pre-filled, then customize); inline validation + a "what this means" helper per step;
**save & resume** (state persisted); bulk import where lists are large; live **tree
visualizations** for org/reporting/product; non-destructive (re-runnable from Settings
after go-live).

---

## 4. Data model summary

**New (config):** `erp_org_levels`, `erp_org_nodes`, `erp_product_levels`,
`erp_product_nodes`, `erp_onboarding_state`, `erp_industry_templates`, (optional)
`erp_user_org_assignments`, `erp_uom_presets`.
**Reused (unchanged engines):** `erp_companies(business_type)`, `erp_user_branches
(reports_to/team_id/role)`, `erp_user_subtree`, `erp_roles`, `erp_role_permissions`,
`erp_company_role_permissions`, `erp_role_template_versions`, `erp_company_modules`,
`erp_products_catalog`, `erp_product_uoms`, `erp_import_jobs`.
All new tables are `company_id`-scoped under RLS (tenant-isolated, same pattern as the
frozen baseline).

## 5. Cross-cutting requirements
- **No hard-coded levels/roles** — code references levels by `id`/capability flags and
  roles by tree position + permission keys, never by name (Supervisor/Brand/SKU).
- **Versioning & audit** — role/template changes versioned (`erp_role_template_versions`);
  structural edits audited.
- **Backward-compatible migration** — seed each existing company's `erp_org_levels` from
  current Region/Area/Branch/Team and `erp_product_levels` from Category/Brand; keep
  `erp_branches/routes` as nodes; flip scoping to node/subtree behind a per-company flag
  after validating against the P1–P4 evidence.
- **Scoping inheritance** — visibility/entitlements continue to read the recursive
  `reports_to` tree (frozen P4), so the platform never re-implements authorization.

## 6. Suggested build order (phasing)
1. Org Structure Builder + Reporting (the visibility backbone; highest value).
2. Role Template Builder (reuses versions/overrides — near-ready).
3. Onboarding Wizard shell + state + Industry Templates (FMCG first).
4. Product Hierarchy Builder + Multi-UoM.
5. Backward-compat migration + per-company flag flip.

## 7. Responsibility model — Platform Owner vs Company Admin

The platform is **two-tier self-service**: the Platform Owner runs the platform; the
**Company Admin configures their own company end-to-end from the UI** — without developer
or DB intervention — but is **hard-confined to their tenant**.

| Capability | Platform Owner | Company Admin |
|---|:--:|:--:|
| Create companies | ✅ | — |
| Select industry template (initial seed) | ✅ | ✅ (re-apply within own company) |
| Enable modules / entitlements | ✅ | — |
| Subscriptions / billing | ✅ | — |
| Platform-wide settings & security | ✅ | — |
| Global RLS policies / permission **catalog** | ✅ (via migrations) | — |
| **Build/maintain organization hierarchy** | (any) | ✅ own company |
| **Add/remove/rename hierarchy levels** | (any) | ✅ own company |
| **Build/maintain product hierarchy** | (any) | ✅ own company |
| **Create/manage role templates** (assign existing permission keys to company roles) | (any) | ✅ own company |
| **Assign users to nodes / manage `reports_to`** | (any) | ✅ own company |
| **Configure UoM & conversions** | (any) | ✅ own company |

### Hard guardrails — a Company Admin can NEVER
- **Access another company** — every config table is `company_id`-scoped under RLS
  (`company_id = erp_user_company_id()`); cross-tenant reads/writes are impossible at the
  DB layer, not just hidden in the UI.
- **Modify platform-wide security / global RLS policies** — RLS policies and the global
  `erp_role_permissions` / `Permission` **catalog** are changed only by **migrations**
  (Platform-Owner/developer surface); no app endpoint mutates them.
- **Modify Platform-Owner permissions or escalate** — `erp_is_platform_owner()` is not
  grantable from the company surface; the permission **catalog is fixed** (admins assign
  existing keys to their roles, they cannot invent security-bypassing keys), so a Company
  Admin cannot grant platform-owner, disable RLS, or bypass SoD.
- **Affect other tenants** — company config (levels, nodes, `reports_to`, role overrides,
  UoM) writes only to that company's rows; the **global engines stay read-only** to them.

### How it's enforced (design)
- **New company-scoped permissions** (assignable to the Company-Admin role):
  `org.hierarchy.manage`, `product.hierarchy.manage`, `role.template.manage`,
  `user.assignment.manage`, `uom.manage`. Each gates the matching builder.
- **RLS** on every new config table = `company_id = erp_user_company_id()` (read+write),
  mirroring the frozen baseline → tenant isolation is structural.
- **Platform-only surfaces** (company create, modules, billing, global catalog, RLS) are
  gated by `erp_is_platform_owner()` and live in the Platform area — not reachable from the
  Company-Admin UI.
- **Company role editing** targets `erp_company_role_permissions` (the company's effective
  set) only — **never** global `erp_role_permissions` — so a tenant's role changes cannot
  leak to others or to the platform defaults.
- **Versioning/audit** — Company-Admin structural and role changes are versioned
  (`erp_role_template_versions`) and audited within the company.

**Net:** a Company Admin can onboard and run their entire company's org/reporting/product/
UoM/roles from the UI, while the platform's security model, other tenants, and global
policies remain untouchable by them.

---

## Status
Design package only — **nothing implemented**. The frozen authorization/RLS/hierarchy
baseline (P1–P4) is the foundation; this platform makes its inputs **UI-configurable per
company** by the **Company Admin**, within hard tenant-isolation guardrails, without code
changes.
