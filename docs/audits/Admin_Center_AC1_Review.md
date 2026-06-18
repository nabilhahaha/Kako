# Admin Center Alignment — AC-1 Validation & Before/After Review

### ModulePage shell standardization (dashboard/log pages)

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Commit:** `8b4c020` · **Date:** 2026-06-18

AC-1 standardizes the page shell on the six platform **dashboard / log** surfaces by replacing the ad-hoc `<div> + PageHeader` with the shared **`ModulePage`** container (per the P3 rule: dashboards/hubs → ModulePage). Presentational only — no business-logic, permission, RLS, workflow, or route change. Content components render verbatim.

---

## 1. Scope (6 pages)

| Page | Route | Content (reused verbatim) |
|------|-------|---------------------------|
| Overview | `/platform` | attention summary, KPIs, company cards (+ "Manage Companies" action) |
| Analytics | `/platform/analytics` | StatCards, growth charts, ranked bars (+ Range selector action) |
| Activity | `/platform/activity` | day-grouped ActivityFeed |
| Copilot Analytics | `/platform/copilot-analytics` | StatCards + ranked confusion cards |
| Audit | `/platform/audit` | filtered forensic AuditLog table |
| Drugs | `/platform/drugs` | DrugImporter (reference data) |

---

## 2. Before → After (shell only)

```
BEFORE                                  AFTER
<div>                                   <ModulePage title subtitle actions>
  <PageHeader title desc action/>          …content verbatim…
  …content…                             </ModulePage>
</div>
```

- **Overview** & **Analytics**: the header `action` (Manage Companies / Range selector) maps to `ModulePage actions` — preserved.
- **Activity / Audit / Copilot / Drugs**: title + subtitle move into the shell; content reused verbatim.
- **Not-authorized guards** also wrapped in `ModulePage` (consistent shell on the gated state).
- **Visual delta:** the page title now uses the standard `text-xl font-semibold` shell instead of the old `text-2xl font-bold` — the intended consistency change. No functional change.

---

## 3. Validation results

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Test suite | ✅ **1596 passed** / 192 skipped |
| Production build | ✅ all 6 routes compile (`/platform`, `/analytics`, `/activity`, `/copilot-analytics`, `/audit`, `/drugs`) |
| Routes | ✅ unchanged (no redirects) |
| Gates | ✅ unchanged — each page keeps its `isPlatformOwner` / `platformPerm` guard (now rendered inside `ModulePage`); the platform-governance invariants in `navigation-routes.test.ts` still pass (no `/platform/*` leak to tenants) |

---

## 4. Capture points (preview `8b4c020`)

Sign in as platform-owner; shoot each to compare the unified header/spacing (authenticated screenshots can't be captured from the build sandbox):

```
…/platform                      …/platform/analytics
…/platform/activity             …/platform/copilot-analytics
…/platform/audit                …/platform/drugs
```

---

## 5. Status & next

- **AC-1 complete, validated, pushed** (`8b4c020`).
- **Next:** AC-2 (entity workbench migration) — the heavier restructure of bespoke managers (`PlansManager` / `RolesManager` / `StaffManager` / Entitlements) into the 3-panel `AdminWorkbench`, **one page per commit with validation after each**, starting with **Plans**.
- Constraints unchanged: no business-logic / permission / RLS / workflow / route change; reuse existing managers/actions/data first.

Holding at this checkpoint for your before/after review of the 6 shells; on your go I proceed with **AC-2 #1 Plans**.
