# Navigation Redundancy Audit — Part 2: Canonical Settings Taxonomy

### One source of truth, one vocabulary

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Findings & recommended taxonomy — *no implementation. For review before any change.*

Continues the Navigation Redundancy Audit. Goal: **a concept appears once in the hierarchy**, with a single canonical Settings taxonomy and a unified vocabulary across Module Rail → Settings Groups → Pages → In-page Tabs.

---

## 1. Findings — the two catalogs, measured

| | Catalog A | Catalog B |
|---|---|---|
| Source | `nav.sections.settings` (sidebar) | `SETTINGS_SECTIONS` (in-page top grouping) |
| Pages | **38** settings pages (+ account/design/platform) | **20** |
| Groups | 6 (Organization · Data & Fields · Finance · Integrations · Governance · Personal) | 5 (Organization · People & Roles · Products & Modules · Workflows · Integrations & Data) |
| Completeness | **Superset / live** | Partial subset |
| Route drift | uses `/settings/integrations` | uses `/settings/integrations/connections`, `/settings/integrations/sync` (different routes) |

**Conclusion:** the two catalogs disagree on membership, grouping, *and* routes. B is cleaner in philosophy but incomplete and partly points elsewhere. Neither is canonical today — that is the defect.

### Source-of-truth decision
- **Mechanism (where nav lives):** the **in-page Top Grouping** becomes the single Settings navigator (per the Navigation Standard). The sidebar's 38-item Settings block collapses to a **single "Settings" link**.
- **Data (what it contains):** a **single canonical catalog** drives it — rebuilt from **A's complete page set**, organized with **B's top-grouping philosophy**, renamed/merged per §3. One catalog feeds both the sidebar link and the in-page groups. No second taxonomy can exist.

---

## 2. Recommended canonical taxonomy (6 groups)

Group names are **categories** — none equals a page it contains (kills the stutter). `*` = consolidation (R2, page-merge, separate approval).

### 1) Organization
- Branches & Company — `/settings/branches`
- Reporting Lines — `/settings/organization` *(renamed from "Organization")*
- Org Structure — `/settings/organization-structure`
- Regions — `/settings/regions`

### 2) Finance & Compliance
- Tax & Currency — `/settings/finance`
- Tax Registrations — `/settings/tax-registrations`
- Document Numbering — `/settings/numbering`
- E-Invoicing — `/settings/einvoice`

### 3) People & Roles
- Users — `/settings/users`
- Staff — `/settings/staff`
- **Roles & Permissions*** — merge `/settings/authz` + `/settings/permissions` + `/settings/action-policies` → tabs *Roles · Permissions · Action Policies*
- Audit Log — `/settings/audit-log`

### 4) Catalog & Fields
- Product Structure — `/settings/product-structure`
- Units of Measure — `/settings/uom`
- **Custom Fields*** — merge `/settings/custom-fields` + `/settings/field-governance` + `/settings/customer-data` → tabs *Fields · Governance · Customer Data*
- MSL Matrix — `/settings/msl`
- Surveys — `/settings/surveys`
- Outlet Grading — `/settings/outlet-grades`
- Marketplace — `/settings/marketplace`

### 5) Automation & Policies *(group name ≠ "Workflows")*
- **Workflows*** — merge `/settings/approval-matrix` + `/settings/workflows` + `/settings/workflows/templates` → tabs *Approvals · Builder · Templates*
- Return Policy — `/settings/returns`
- Day-Close Policy — `/settings/day-close`

### 6) Integrations
- **Connections*** — merge `/settings/integration-hub` + `/settings/integrations` (+ B's connections/sync) → tabs *Hub · Connections · Sync*
- **Import & Export*** — merge `/settings/import` + `/settings/export` + `/settings/data-onboarding`
- **Onboarding*** — merge `/settings/onboarding` + `/settings/go-live`
- Van Sales Settings — `/settings/van-sales`

### Relocated / removed (not Settings groups)
| Page | Action | Why |
|---|---|---|
| My Account `/account` | **Move** to the user/avatar menu | Personal, not org config |
| Design System `/design` | **Move** to avatar menu (super-admin) | Dev tool, not settings |
| Copilot Analytics `/platform/copilot-analytics` | **Remove** from Settings | Lives under Platform → Analytics |
| Audit Log `/platform/audit` (in settings) | **Remove** the settings duplicate | Tenant "Audit Log" stays; platform copy is in Platform → Team |

**Result:** 38 → **6 groups**, ~24 distinct pages after merges, **zero group-equals-page collisions**, "Personal" removed as a settings group.

---

## 3. Renamed / merged / removed — summary

| Action | Items |
|--------|-------|
| **Rename** | `Organization` page → **Reporting Lines**; group `Workflows` → **Automation & Policies**; merged integrations page → **Connections** |
| **Merge (R2)** | Roles & Permissions (authz+permissions+action-policies); Custom Fields (custom-fields+field-governance+customer-data); Workflows (approval-matrix+workflows+templates); Connections (integration-hub+integrations+connections+sync); Import & Export (import+export+data-onboarding); Onboarding (onboarding+go-live) |
| **Move out of Settings** | My Account, Design System → avatar menu |
| **Remove from Settings** | Copilot Analytics, the platform Audit duplicate |

---

## 4. Duplicated concepts across the four altitudes

The unified vocabulary rule: **operational vs configuration must use different names**, and a label never repeats within one path (Rail → Group → Page → Tab).

| Concept | Module Rail (operational) | Settings Group | Settings Page | In-page Tab | Fix |
|---|---|---|---|---|---|
| **Approvals** | "Approvals" (`/approvals/queue`) | Automation & Policies | Workflows | "Approvals" tab | Queue stays **"Approvals"** (do the work); config is the **Workflows → Approvals tab** (set the rules). Distinct altitudes, distinct framing |
| **Workflows** | module label "Workflow & Approvals" | ~~"Workflows"~~ → **Automation & Policies** | Workflows | Builder | Group renamed so group ≠ page |
| **Integrations** | capability module "Integrations" | Integrations | ~~"Integrations"~~ → **Connections** | Connections | Page renamed so group ≠ page; module = capability (different altitude) |
| **Organization** | — | Organization | ~~"Organization"~~ → **Reporting Lines** | — | Page renamed; group keeps the category |
| **Audit Log** | Platform → Team (owner) | People & Roles | Audit Log (tenant) | — | Keep one per audience; remove the in-settings platform duplicate |
| **Returns** | Sales "Returns" (operational) | Automation & Policies | Return **Policy** | — | Operational = "Returns"; config = "Return **Policy**" |

### Unified vocabulary principles (proposed Constitution additions)
- **VP1 — Operational ≠ Configuration.** The thing is a noun ("Approvals", "Returns"); its configuration is "…Policy/Rules" or lives inside a config page. Never the same word at both altitudes.
- **VP2 — A group is named for its category, never for a page it contains.**
- **VP3 — No label repeats within one path** (Rail → Group → Page → Tab).
- **VP4 — One catalog is the single source of truth;** the sidebar entry and the in-page grouping both render from it.

---

## 5. Before / After structure

### Settings overall
```
BEFORE                                   AFTER
Sidebar: Settings (38 items, 6 groups)   Sidebar: "Settings"  (1 link)
   +                                        └ Top grouping (single source):
In-page: Top grouping (20 items, 5          6 groups, ~24 pages, merges as tabs
   groups, different routes)                0 group=page collisions
= two taxonomies, ~58 listings           = one taxonomy
```

### The "Approvals" path
```
BEFORE  (≈5 layers, 3 names)             AFTER  (3 layers, distinct names)
Sidebar: Settings ▸ Governance ▸          Sidebar: "Settings"
         "Approval Matrix"                  └ Top: "Automation & Policies"
  └ Top: "Workflows" ▸ "Approvals"             ▸ page "Workflows"
     └ H1 "Approvals"                            ▸ tab "Approvals"
        └ RelatedNav back/links                    └ content
```

---

## 6. Migration impact

| Step | Scope | Effort | Risk | Constraints |
|------|-------|--------|------|-------------|
| **M1 — One catalog + collapse sidebar** (R1) | `navigation.ts` (38 settings items → 1 link), expand `settings-sections.ts` to the complete canonical 6-group set, i18n labels | **M** | **Low** | Pure navigation/data; reuse existing `canSee…` visibility predicates; no permission/RLS/workflow change |
| **M2 — Renames** (Reporting Lines, Automation & Policies, Connections) | labels only | **S** | Low | Label/i18n only; routes unchanged |
| **M3 — Page merges → tabs** (R2: Roles & Permissions, Custom Fields, Workflows, Connections, Import/Export, Onboarding) | routing + components | **M–H each** | **Med** | Preserve every action, permission, RLS check; **add redirects** old route → new tab URL so bookmarks/links survive; sequence one merge per approved task |
| **M4 — Relocate Personal / remove dups** | move account+design to avatar menu; drop copilot-analytics + platform-audit from settings | **S** | Low | No logic change |

**Sequencing:** M1 + M2 first (safe, removes the duplication and the stutter at the structural level). M3 merges are each a separate, approval-gated task with route redirects. M4 alongside M1.

**Bookmark safety:** any merged route (e.g. `/settings/approval-matrix`) must `redirect()` to its new tab URL (e.g. `/settings/workflows?tab=approvals`) — no dead links.

---

## 7. Decision requested

Please review and confirm:
1. **Source of truth** = in-page Top Grouping, fed by one canonical catalog (sidebar → single link). *(yes/adjust)*
2. **The 6 canonical groups + names** in §2. *(approve/edit names)*
3. **The merges** in §3 — approve as a set to sequence, or pick a subset.
4. **The vocabulary principles** VP1–VP4 — adopt into the Navigation Constitution.

No implementation until the taxonomy is approved.
