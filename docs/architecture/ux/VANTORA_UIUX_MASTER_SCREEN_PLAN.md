# VANTORA — UI/UX Master Screen Plan

**Status:** Planning document only — **no code, no implementation.** A reuse-first
UI/UX blueprint every new foundation module (Finance, Inventory, Purchasing, Sales,
CRM, Trade Spend) follows so the platform stays visually + behaviorally consistent.
**Discipline:** *reuse existing components; one pattern per concern; RTL/LTR + i18n
first-class; permission-gated; never a blank screen.*

> **Existing UI kit on `main` (reuse, don't rebuild):**
> - **Layout:** `layout/sidebar`, `layout/topbar`, `layout/bottom-nav` (mobile
>   tabs), `layout/command-palette` (⌘K, Search-enabled), `language-toggle`,
>   `theme-toggle`, `notifications-bell`.
> - **Shared:** `page-header`, `back-link`, `list-toolbar`, `pagination`,
>   `empty-state`, `getting-started`, `page-skeleton`, `stat-card`, `form-section`,
>   `attachments`, `highlighted-text`, `product-combobox`, `order-editor-kit`.
> - **Primitives (`components/ui`):** `button`, `card`, `input`, `select`, `label`,
>   `badge`, `field-error`, `skeleton`, `tooltip`; dialogs: `confirm-dialog`,
>   `prompt-dialog`.
> - **Nav source of truth:** `lib/erp/navigation.ts` (modules → sections → items,
>   each permission/module-gated). **RTL:** driven by `locale === 'ar'` + logical
>   CSS (`ms/me`, `text-start/end`); `dir="ltr"` for codes/numbers/dates.
>
> **Standardize (kit gaps, reuse-extend later — not new look):** a **Tabs**
> primitive (today ad-hoc button-rows), a **DataTable** wrapper (today per-page),
> **Breadcrumb** (today `back-link`), a **Sheet/Drawer** (mobile full-screen), and an
> **error-state** variant of `empty-state`.

---

## 1. Main navigation structure
- **Desktop:** `sidebar` — grouped sections from `navigation.ts` (e.g. Sales,
  Inventory, Purchasing, Finance, CRM, Settings), each item **permission/module-
  gated**; collapsible; active-route highlight; RTL-mirrored.
- **Top bar:** global **Search trigger (⌘K)** + **language toggle** + **theme
  toggle** + **notifications bell** + user/company menu. Page context via
  `page-header` below it.
- **Mobile:** `bottom-nav` (primary tabs) + a top search icon + a "more" sheet for
  secondary sections. Sidebar collapses to a drawer.
- **Command palette (⌘K):** cross-module **records search** (Search OS) + page
  quick-jump — the fastest path to anything.

## 2. Module screen hierarchy
Consistent route shape per module: **List → Detail (tabs) → Form**, plus a **360/hub**
for relationship entities (customers) and **Settings** sub-area for configuration.
```
/{module}                 → list (toolbar + table + pagination)
/{module}/[id]            → detail (page-header + tabs + back-link)
/{module}/[id]/edit (or modal/form-section) → create/edit
/settings/{module}/*      → configuration (rules, lists, periods, etc.)
```
Every screen: `page-header` (title + description + primary action), permission gate,
and consistent breadcrumb/back-link.

## 3. Dashboard layout
- **KPI band:** `stat-card` grid (responsive 2/3/4-up), role-relevant metrics.
- **Widgets:** lists/charts (recent docs, approvals due, near-expiry, AR aging) as
  cards; each links to its module list (deep-link).
- **Role-based:** dashboard composition follows permissions/role (rep vs admin vs
  finance vs platform-owner). **Empty → `getting-started`**; **loading →
  `page-skeleton`**.

## 4. List / detail / form patterns
- **List:** `page-header` + `list-toolbar` (search, filter chips, sort, bulk
  actions, primary "New") + table + `pagination`. Row click → detail.
- **Detail:** `page-header` (title, status `badge`, key actions) + **tabs**
  (Overview / related lists / activity / documents) + `back-link`. Read-only when
  the record's lifecycle says so (e.g. posted/approved).
- **Form:** `form-section` groups + `input`/`select`/combobox + `field-error`
  inline validation + **sticky action bar** (Save/Cancel) + unsaved-changes guard.
  Same create/edit component.

## 5. Mobile-first screens
- `bottom-nav` primary tabs; **full-screen sheets** for create/search/filter;
  touch-target sizing; single-column stacked cards replacing wide tables; numeric
  `inputmode` for codes/quantities; sticky action bars; offline-friendly. Field
  flows (visit-to-order, van sale, collections) are **designed mobile-first**.

## 6. Table and filter layout
- `list-toolbar` = search box + **filter chips/segmented control** + sort +
  column/density + bulk-action bar (appears on selection). RTL-aware alignment;
  numbers/codes `dir="ltr"`. Server-side pagination via `pagination`. States:
  empty (`empty-state`), loading (skeleton rows), error (error-state) — **never a
  blank table**. Standardize a **DataTable** wrapper so all module lists match.

## 7. Approval screens
- Reuse the **Workflow Platform** approval surfaces: an **approvals inbox** (list of
  pending tasks, filterable, SLA/urgency badges) + a **decision view** (record
  context + approve/reject + comment) — consistent list/detail patterns. Per-record
  approval actions surface inline on detail headers where relevant. Maker-checker is
  visual (who created vs who approves).

## 8. Search placement
- **Topbar ⌘K** (primary, global, categorized records + pages) — Search OS.
- **Per-module scoped search** in `list-toolbar` (filters that list) and a
  "search this module" deep-link into the palette (`?type=`).
- **Mobile:** top-bar search icon → full-screen search sheet. Identifier search
  (code/barcode/phone/VAT/serial) is format-agnostic.

## 9. Arabic / English RTL/LTR behavior
- **Direction driven by `locale === 'ar'`** at the layout root; all components use
  **logical CSS** (`ms-`/`me-`, `text-start`/`text-end`, `ps-`/`pe-`) so they mirror
  automatically. **`dir="ltr"` islands** for codes, numbers, dates, currency, phone,
  and Latin identifiers within RTL text. Bidi-safe truncation. Both languages are
  **first-class** (every string in ar+en; parity-tested). Icons that imply direction
  (chevrons/back) flip with locale.

## 10. Empty / loading / error states
- **Empty:** `empty-state` (icon + message + primary CTA) or `getting-started` for
  first-run; **never a bare blank**.
- **Loading:** `page-skeleton` for pages, `skeleton` rows for tables/cards; inline
  spinners for async actions.
- **Error:** a standardized **error-state** (retry + non-blocking) variant of
  `empty-state`; server actions degrade gracefully (e.g. Search "temporarily
  unavailable"); toasts for action failures. Every list/detail defines all three.

## 11. Role-based screen visibility
- **Nav-level:** `navigation.ts` already hides sections/items by permission +
  module + business type (`visibleSections`).
- **Page-level:** server guard (`hasPermission`) → render or a **noAccess** card
  (the established pattern, e.g. workflows page).
- **Element-level:** buttons/tabs/columns conditionally rendered by capability
  (e.g. `accounting.post` shows "Post"; `sales.discount` shows discount field).
  Defense-in-depth with RLS — UI hiding is convenience, RLS is the guarantee.

## 12. Consistent buttons, spacing, cards, tabs, breadcrumbs
- **Buttons:** `button` variants (default/outline/ghost/destructive) + sizes (sm/md)
  — one vocabulary; primary action right (LTR)/left (RTL); icon+label.
- **Spacing:** the existing Tailwind scale + card padding (`p-4`/`p-6`); consistent
  `space-y` rhythm; `gap` grids.
- **Cards:** `card`/`CardContent` for every panel; status via `badge`.
- **Tabs:** standardize the current button-row tab pattern into a shared **Tabs**
  component (used by workflow builder, detail screens) — same look everywhere.
- **Breadcrumbs:** standardize `back-link` into a **Breadcrumb** (module → list →
  record) for deep screens; keep `back-link` for simple back.
- A short **design-token / pattern checklist** every foundation module's screens are
  reviewed against (header, toolbar, table states, form sections, tabs, RTL,
  permission gating, empty/loading/error).

---

## Component reuse map (summary)

| Need | Reuse | Standardize/extend |
|---|---|---|
| Shell/nav | sidebar, topbar, bottom-nav, command-palette | — |
| Page frame | page-header, back-link | Breadcrumb |
| Lists | list-toolbar, pagination, empty-state, page-skeleton | DataTable wrapper |
| Forms | form-section, input/select/label, field-error | sticky action bar |
| Detail tabs | (ad-hoc today) | Tabs primitive |
| Dashboard | stat-card, getting-started | widget cards |
| Dialogs | confirm-dialog, prompt-dialog | Sheet/Drawer (mobile) |
| Status/actions | badge, button, tooltip | — |
| Approvals | Workflow task UI | approvals-inbox pattern |
| Search | command-palette (Search OS) | per-module scoped entry |

> **Every new foundation module (Finance/Inventory/Purchasing/Sales/CRM/Trade
> Spend) is built from this kit + these patterns** — no bespoke shells, no new look.

---

## Open questions for review
1. Build the **Tabs** + **DataTable** + **Breadcrumb** + **Sheet** primitives as a
   small upfront "UI foundation" pass (recommended) vs. per-module as needed?
2. **Dashboard composition:** fixed role dashboards vs. a light widget registry?
3. **Approvals inbox** location: a dedicated `/approvals` hub vs. per-module + a
   global bell?
4. **Density** default (comfortable vs compact) for data-heavy finance/inventory
   tables?
5. Confirm the **error-state** standardization (extend `empty-state`).

*Planning document only — no code or implementation. Reuse-first. Stop for review.*
