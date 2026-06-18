# Settings Navigation Unification — M1 + M2 Final UX Review Package

### Single-source Settings navigation — validation, before/after, and parity proof

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Code commit:** `7e277cf` · **Date:** 2026-06-18

Final package for the approved **M1 (single catalog + sidebar collapse)** and **M2 (label renames)**. **No M3 page-merges, no route changes.** Constraints honoured: no business-logic, permission, RLS, workflow, or route change. Priority respected: **navigation consistency > taxonomy clarity > page consolidation.**

---

## 1. Final validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Test suite (vitest) | ✅ **1592 passed**, 192 skipped |
| Production build (`next build`) | ✅ green |
| i18n key-usage + ar/en parity | ✅ pass (part of suite) |

---

## 2. Confirmation — visibility, flags, platform-owner, permissions are IDENTICAL

This is mechanically proven, not asserted. The Settings catalog is rendered by `visibleSections(...)`, which was **not modified**. M1/M2 changed only each settings item's `group` value and two `label` strings.

**Gate-diff proof** — extracted every settings entry's `href` + gate fields (`perm`, `superAdminOnly`, `module`, `flag`, `showForPlatformOwner`, `platformOwnerOnly`) from BEFORE (`8d27a93`, pre-M1) and AFTER (`7e277cf`), stripped `label`/`group`, sorted, and diffed:

```
=== DIFF of gate fields (BEFORE vs AFTER) ===
>>> IDENTICAL: no gate/href added, removed, or changed.
=== page count: before 42  ·  after 42 ===
```

Therefore:
- **Visibility** — same `visibleSections` engine, same inputs → identical per-user result.
- **Flags** — `flag: 'van_sales'` (and all flag handling) unchanged; the in-page nav resolves the *same* `navFlags` the sidebar uses (`enabledNavFlags()` + tenant feature flags).
- **Platform-owner rules** — `showForPlatformOwner` / `platformOwnerOnly` unchanged; platform-owner branch of `visibleSections` untouched.
- **Permissions** — every `perm` / `superAdminOnly` byte-identical; no route changed, so RLS/server gates are reached exactly as before.

**Net:** the change is presentational/structural only. No user gains or loses access to any page.

---

## 3. Before → After (structure)

```
BEFORE                                   AFTER
Sidebar: Settings (38 items, 6 groups)   Sidebar: "Settings"  (1 link)
   +                                        └ In-page Top Grouping (one catalog):
In-page top grouping (20 items, 5           7 canonical groups, permission-aware,
   groups, different routes)                group ≠ page everywhere
= two taxonomies                         = one taxonomy, one vocabulary
```

The single catalog (`navigation.ts`) now feeds **both** the in-page Top Grouping and the Settings home grid via one server helper (`resolveSettingsNavGroups`). The sidebar collapses to a single link; the command palette still indexes every settings page (search ≠ nav).

---

## 4. Canonical groups & approved naming

| Group | Notes |
|-------|-------|
| **Organization** | incl. **Reporting Lines** (renamed from "Organization") |
| **Finance & Compliance** | renamed from "Finance & Numbering" |
| **People & Roles** | folds the old "Governance" access pages |
| **Products & Data** | your approved name (was "Catalog & Fields") |
| **Automation & Policies** | group ≠ page "Workflows" (resolves the stutter at the group level) |
| **Integrations** | incl. **Connections** (renamed from "Integrations"/"Data Import & Integrations") |
| **Personal** | interim; relocation is M4 (deferred) |

Unified vocabulary principles VP1–VP4 are in force (operational ≠ configuration; group ≠ page; no label repeats in a path; one catalog).

---

## 5. Before/After screenshots — capture points

Authenticated screenshots can't be captured from the build sandbox; these are the exact shots to take on the live preview (`kako`, commit `7e277cf`). Toggle EN/AR to verify both tiers + renames in RTL.

| URL | BEFORE | AFTER |
|-----|--------|-------|
| `…/settings` | sidebar lists ~38 settings items | **sidebar: single "Settings"**; grid grouped by 7 canonical groups |
| `…/settings/branches` | sidebar "Organization" subsection | top nav: **Organization** active |
| `…/settings/organization` | "Organization" | labelled **Reporting Lines** |
| `…/settings/integrations` | "Data Import & Integrations" | labelled **Connections** |
| `…/settings/approval-matrix` | sidebar "Governance" | top nav **Automation & Policies** active (group ≠ page) |

---

## 6. UX review

| Criterion | Result |
|-----------|--------|
| Navigation consistency (top priority) | ✅ One Settings navigator; sidebar no longer re-lists pages; consistent with the Top Grouping standard |
| Duplication / the "Approvals → Routes" stutter | ✅ Removed at the catalog + group level (page-tab stutter is M3, deferred) |
| Taxonomy clarity | ✅ 7 canonical groups, group ≠ page, approved names |
| Width / depth | ✅ ~230px reclaimed; Settings path 4 → 3 levels |
| Permission/flags/platform-owner | ✅ Identical (§2 proof) |
| Search | ✅ Command palette unaffected |
| Routes / pages | ✅ Unchanged |

---

## 7. Status & what's next (your call)

- **M1 + M2: complete, validated, green.** Awaiting your live preview sign-off.
- **M3 page-merges: NOT started** (held by direction). Candidates, each a separate approval-gated task **with old-route `redirect()`s** to preserve bookmarks:
  1. Roles & Permissions (authz + permissions + action-policies)
  2. Workflows (approval-matrix + workflows + templates) — removes the page-level "Approvals/Routes" stutter
  3. Connections (integration-hub + integrations + sync)
  4. Custom Fields (custom-fields + field-governance + customer-data)
  5. Import & Export (import + export + data-onboarding)
  6. Onboarding (onboarding + go-live)
- **M4** (relocate Personal; remove platform-audit/copilot duplicates) — deferred.

After your live review, you choose which (if any) M3 items proceed, individually.
