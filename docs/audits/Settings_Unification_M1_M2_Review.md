# Settings Navigation Unification — M1 + M2 Before/After & UX Review

### One source of truth, one vocabulary (no page merges)

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Commit:** `7e277cf` · **Date:** 2026-06-18

Implements the approved **M1 (single catalog + sidebar collapse)** and **M2 (label renames)** from the Canonical Settings Taxonomy. **M3 page-merges are intentionally NOT done** — the taxonomy is unified first, page structures unchanged. UX standardization only: reuses existing components and the existing permission/flag gating; **no business-logic, permission, RLS, or workflow change.** Gate: **tsc clean · 1592 tests passed · build green.**

---

## 1. What changed

| Item | Detail |
|------|--------|
| **Single source of truth** | `navigation.ts` is now the only Settings catalog. The in-page Top Grouping AND the Settings home grid both derive from it via one server helper (`resolveSettingsNavGroups → visibleSections`). |
| **Old catalog retired** | `settings-sections.ts` is reduced to an optional description lookup (`SETTINGS_DESCRIPTIONS`) — no longer a competing taxonomy. |
| **Sidebar collapse** | The global rail shows a single **"Settings"** link instead of ~38 items. The command palette still indexes every settings page (search ≠ navigation). |
| **Canonical groups** | Organization · Finance & Compliance · People & Roles · Products & Data · Automation & Policies · Integrations · Personal. |
| **M2 renames** | Labels only, routes unchanged (see §3). |

---

## 2. Before → After

```
BEFORE                                   AFTER
Sidebar: Settings (38 items, 6 groups)   Sidebar: "Settings"  (1 link)
   +                                        └ In-page Top Grouping (one catalog):
In-page top grouping (20 items, 5           7 canonical groups, permission-aware,
   groups, different routes)                group ≠ page everywhere
= two taxonomies, ~58 listings           = one taxonomy, one vocabulary
```

### The "Approvals" path
```
BEFORE  (≈5 layers, 3 names)             AFTER  (3 layers, distinct)
Sidebar: Settings ▸ Governance ▸          Sidebar: "Settings"
         "Approval Matrix"                  └ Top: "Automation & Policies"
  └ Top: "Workflows" ▸ "Approvals"             ▸ page "Workflows"  (approval matrix)
     └ H1 "Approvals"                            └ content
```
*(The remaining page-level consolidation — Approvals/Builder/Templates as tabs of one Workflows page — is M3, deferred.)*

---

## 3. M2 renames (labels only — routes unchanged)

| Was | Now | Reason |
|-----|-----|--------|
| "Organization" (the reporting-lines page) | **Reporting Lines** | Page ≠ group "Organization" |
| "Integrations" / "Data Import & Integrations" (page) | **Connections** | Page ≠ group "Integrations" |
| group "Finance & Numbering" | **Finance & Compliance** | Broader category |
| group "Data & Fields" | folded into **Products & Data** | User-approved business-friendly name |
| group "Governance" | folded into **People & Roles** / **Automation & Policies** | Removes the abstract bucket |

ar/en parity verified; i18n key-usage and parity tests pass.

---

## 4. Canonical groups now live

| Group | Pages (interim — pre-merge) |
|-------|------------------------------|
| **Organization** | Branches · Reporting Lines · Org Structure · Regions |
| **Finance & Compliance** | Tax & Currency · Tax Registrations · Document Numbering · E-Invoicing |
| **People & Roles** | Users · Staff · Roles (Authz) · Permissions · Action Policies · Audit Log |
| **Products & Data** | Product Structure · Units of Measure · Customer Data · Custom Fields · Field Governance · MSL · Surveys · Outlet Grading · Features · Marketplace |
| **Automation & Policies** | Approvals · Workflows · Workflow Templates · Return Policy · Day-Close Policy |
| **Integrations** | Integration Hub · Connections · Onboarding · Go-Live · Data Onboarding · Import · Export · Van Sales |
| **Personal** | Copilot Analytics · Design System · My Account |

*(Personal stays in Settings for now; its relocation to the avatar menu is M4, deferred. Larger groups shrink once M3 merges land.)*

---

## 5. UX review

| Criterion | Result |
|-----------|--------|
| Duplication removed | One Settings taxonomy; the sidebar no longer re-lists pages |
| Vocabulary | "Catalog & Fields" → **Products & Data** (your preference); group ≠ page everywhere |
| Permission-aware | Reuses `visibleSections` exactly — same perms / super-admin / module / **flag** / platform-owner gating; no access change |
| Depth | Settings path 4 → 3 levels |
| Search preserved | Command palette still finds all settings pages |
| Pages untouched | No route, action, RLS, or workflow change (M3 deferred) |
| Validation | tsc clean · 1592 passed / 192 skipped · build green |

---

## 6. Capture points (preview, commit 7e277cf)

| URL | Expected |
|-----|----------|
| `…/settings` | Sidebar shows single "Settings"; grid grouped by the 7 canonical groups |
| `…/settings/branches` | Top nav: **Organization** active |
| `…/settings/organization` | Labelled **Reporting Lines** |
| `…/settings/integrations` | Labelled **Connections** |
| `…/settings/approval-matrix` | Top nav: **Automation & Policies** active (group ≠ page) |

Toggle EN/AR to confirm both tiers + the renames in RTL.

---

## 7. Status & next

- **M1 + M2 complete**, gate green, pushed on `7e277cf`.
- **M3 page-merges held** per direction (taxonomy unified first): Roles & Permissions, Workflows (Approvals/Builder/Templates), Connections, Custom Fields, Import & Export, Onboarding — each a separate approval-gated task with old-route `redirect()`s to preserve bookmarks.
- **M4** (relocate Personal to avatar menu; remove the platform-audit/copilot duplicates from Settings) — also deferred.

Review the preview; on approval, the M3 merge sequence can be scoped one page-group at a time.
