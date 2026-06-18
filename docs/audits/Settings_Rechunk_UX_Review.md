# Settings Re-chunk — Before / After & UX Review

### First implementation of the VANTORA Navigation Standard ("One rail, then rise")

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Commit:** `1457877` · **Date:** 2026-06-18

This documents the first approved implementation phase of the Navigation Constitution: the two platform primitives (`ModulePage`, `TopGroupingNav`) and the Settings hub re-chunk (≈21 flat pages → 5 top groups). **UX standardization only — reuses existing components and actions; no business-logic, permission, RLS, or workflow change.** Validation gate: **tsc clean · 1592 tests passed · build green.**

---

## 1. What shipped

| Item | File | Note |
|------|------|------|
| **TopGroupingNav** primitive | `src/components/admin/top-grouping-nav.tsx` | Horizontal grouping (link + button modes); overflow menu for the 8–12 rule |
| **ModulePage** primitive | `src/components/admin/module-page.tsx` | Page shell: title/actions + top-grouping nav slot + content. **No side-rail slot** by construction |
| **EntityTabs → delegates** | `src/components/admin/entity-detail.tsx` | Record facets now use the same primitive (API unchanged) |
| **Settings re-chunk** | `settings-sections.ts`, `settings-group-nav.tsx`, `settings/layout.tsx` | 5 top groups + active group's pages; old `SettingsNav` side rail removed |
| **i18n** | `settings-home.ts` | 5 group labels, ar/en parity |

---

## 2. Before → After

### BEFORE — persistent side rail (the layer the standard removes)

```
┌─ L0 Platform bar ───────────────────────────────────────────┐
├──────────────┬──────────────────────────────────────────────┤
│ L1 Module    │ ┌─ Settings side rail (230px) ─┐  Content     │
│ rail         │ │ search                       │              │
│              │ │ COMPANY                      │  (selected   │
│              │ │  Branches · Finance          │   settings   │
│              │ │  Tax · Numbering             │   page)      │
│              │ │ PEOPLE                       │              │
│              │ │  Users · Staff · Perms       │   <- width   │
│              │ │ ORG · PRODUCTS · WORKFLOWS   │      squeezed │
│              │ │  ...18+ flat items, scrolls  │              │
│              │ └──────────────────────────────┘              │
└──────────────┴──────────────────────────────────────────────┘
   two rails -> ~470px chrome, 4-deep path
```

### AFTER — "One rail, then rise" (two-tier top grouping, no side rail)

```
┌─ L0 Platform bar ───────────────────────────────────────────┐
├──────────────┬──────────────────────────────────────────────┤
│ L1 Module    │ [ Organization | People & Roles | Products & │
│ rail         │   Modules | Workflows | Integrations & Data ]│  tier 1: groups
│              │ [ Branches · Finance · Tax · Numbering ·     │
│              │   Org Structure · Reporting · Regions ]      │  tier 2: active group's pages
│              │ ──────────────────────────────────────────   │
│              │  Content (full remaining width)              │
└──────────────┴──────────────────────────────────────────────┘
   one rail -> ~240px chrome, 3-deep path, content gets the width back
```

---

## 3. The re-chunk (≈21 pages → 5 groups, ≤7 each)

| Group | Pages | Count |
|-------|-------|-------|
| **Organization** | Branches · Finance · Tax Registrations · Numbering · Org Structure · Reporting · Regions | 7 |
| **People & Roles** | Users · Staff · Permissions | 3 |
| **Products & Modules** | Product Structure · Units of Measure · Features · Marketplace | 4 |
| **Workflows** | Approvals · Workflows · Workflow Templates | 3 |
| **Integrations & Data** | Integration Hub · Import · Connections · Scheduled Sync | 4 |

Every group is within the ≤7 top-grouping threshold; the cardinality rule (Article III) is satisfied without an overflow menu in the common case.

---

## 4. UX review

| Criterion | Result |
|-----------|--------|
| **Width reclaimed** | ~230px returned to content (one rail eliminated) |
| **Depth** | 4 → 3 levels (Platform → Module → Top Grouping → Content) |
| **Re-chunk** | ≈21 flat items → 5 groups (≤7 each) |
| **Permission-aware** | Unchanged — `visibleSettingsGroups(allowedSettingsHrefs(ctx))` computed server-side; empty groups drop out; a user who can't see a group never sees its tab |
| **Active state** | Tier-1 group highlights when it contains the current route; tier-2 highlights the exact page; deep routes (`/settings/workflows/templates`) match via prefix |
| **Pages unchanged** | Every settings page renders verbatim in content — zero logic/permission/RLS/workflow change |
| **Responsive** | Both tiers are horizontally scrollable (tablet/mobile per the standard); tier-1 folds to a "More" menu past 7 |
| **Reuse** | `EntityTabs` now delegates to `TopGroupingNav`, so record facets and module sections share one primitive; `ModulePage` exposes no side-rail prop |

**Governance win:** because `ModulePage` exposes no secondary-rail slot, a future module physically cannot reintroduce the removed layer — the standard is enforced by the type signature, not a guideline. This is the mechanism that makes the Constitution mandatory-by-default for all future modules.

---

## 5. Live capture points (preview)

Once the `kako` preview is Ready on `1457877`, capture these to compare before/after (toggle EN/AR to verify RTL parity of both tiers):

| URL | Expected |
|-----|----------|
| `…/settings` | Groups row only; home grid below |
| `…/settings/branches` | **Organization** active + pages row |
| `…/settings/users` | **People & Roles** active |
| `…/settings/workflows/templates` | **Workflows** active, deep route highlighted |

---

## 6. Scope & status

- Scoped strictly to the three approved items (ModulePage, TopGroupingNav, Settings re-chunk). No other module touched.
- Validation: tsc clean · suite 1592 passed / 192 skipped · build green.
- The Navigation Standard is now mandatory-by-default for future modules via the `ModulePage` shell.

**Next (on approval):** apply the standard to a future module (CRM is the natural first), and/or fold the Settings re-chunk into the broader Admin Center UX review package before the embedded `/admin` shell evaluation.
