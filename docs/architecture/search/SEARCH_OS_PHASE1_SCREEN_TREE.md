# VANTORA — Search OS Phase 1 Screen Tree (UX spec)

**Status:** UX spec — **review first, no implementation** until approved.
**Scope:** V1 global search per the approved plan — categorized results across the
10 entities; code/barcode/phone/VAT/CR search; deep-link navigation. **Excluded:**
semantic / embeddings / vector / Copilot.
**Discipline:** *reuse over rebuild* — **extend the existing command-palette UX**
(`components/layout/command-palette.tsx`); do **not** build a second palette and do
**not** touch the platform-owner palette (`components/shared/command-palette.tsx`).
Everything behind `KAKO_SEARCH` (default OFF).

> Barcode/phone/VAT/CR "search" here = **typed / pasted / hardware-scanner-as-
> keyboard** input. Camera/hardware barcode capture is **out of V1** (future).

---

## 0. Reuse map (what already exists vs. what's new)

| Exists on `main` (reuse) | New in Phase 1 |
|---|---|
| Command-palette UX: input, grouped categories, keyboard nav, recent list, highlight, RTL (`ar-EG`), ⌘K trigger, `router.push(href)` | A **tenant `search()` service** + `/api/search` over `erp_search_documents` |
| Topbar with palette trigger + ⌘/Ctrl-K shortcut | Wiring the in-app palette to `search()` (debounced) + **query classification** (code/barcode/phone/VAT/CR) |
| Permission/module gating (`navigation.ts`, `capabilities.ts`), RTL/i18n | Category model for the **10 business entities** + deep-link `href` per result |
| Platform-owner palette (companies/users/audit) — **untouched** | Mobile full-screen search sheet (entity results) |

---

## 1. Global search entry points

1. **Topbar search trigger (desktop)** — the existing top-bar search affordance
   ("Search… ⌘K") opens the palette in **search mode**. Always visible when
   `KAKO_SEARCH` is on and the user can see ≥1 searchable category.
2. **Keyboard shortcut** — `⌘K` (mac) / `Ctrl-K` (win/linux), reusing the existing
   listener; `Esc` closes; `/` focuses search when not in an input (optional).
3. **Mobile** — a **search icon** in the mobile top bar opens a **full-screen search
   sheet** (§6).
4. **Scoped entry (deep-link in)** — module list pages may link "Search {module}"
   that opens the palette pre-filtered to that category (`?type=customers`), reusing
   the same service.
5. **Out of scope (V1):** camera barcode scan, voice, saved searches.

---

## 2. Command palette design (the core screen)

- **Shell:** reuse the existing palette dialog (centered modal, desktop; full-screen
  sheet, mobile), RTL/LTR aware, focus-trapped, `Esc` to close.
- **Input row:** search field with placeholder (`t('search.placeholder')`,
  e.g. "Search customers, products, invoices, codes, barcodes…"), a leading search
  icon, a trailing spinner while loading, and a clear (✕) button.
- **Query handling:** debounced (~200 ms) call to `search()`; **query
  classification** runs first (digits/EAN → barcode/phone/VAT/CR exact-or-prefix
  lookup; code pattern → identifier lookup; else FTS+trigram). Min 1–2 chars for
  identifier lookups, ~2 for text.
- **Body states:**
  - **Idle (empty query):** "Recent searches" + (optional) "Jump to" navigation
    commands (reusing the existing recent list).
  - **Loading:** inline spinner + skeleton rows (no layout shift).
  - **Results:** **categorized groups** (§3–§4).
  - **No results:** "No matches for '{q}'" + hint ("try a code, barcode, or phone").
  - **No permitted categories:** a single "Search isn't available for your role"
    line (should be rare — entry point is hidden in that case).
  - **Error:** non-blocking "Search is temporarily unavailable" (the app keeps
    working; search never throws).
- **Footer:** keyboard legend (↑↓ navigate · ↵ open · Esc close) — reused.

---

## 3. Search results UX

- **Grouping:** results are **grouped by category** (entity type), each group with a
  header (icon + localized name + total count) and its **top-N** hits; groups appear
  in a configurable order (entity prior). Empty groups are omitted.
- **Result row anatomy:**
  - entity **icon** (per category),
  - **title** with match **highlight** (reuse the existing highlight component) —
    name / document number,
  - **subtitle** — secondary context (customer name, code, status),
  - **metadata** (right/inline, RTL-aware) — identifier/amount/date as relevant
    (e.g., invoice amount + date; customer phone/code),
  - **category badge** when results are shown ungrouped (e.g., flat "top results"),
  - keyboard focus ring; whole row is the click/Enter target.
- **Ranking within/across groups:** exact identifier (code/barcode/phone/VAT/CR) >
  prefix > lexical; recency + entity prior as tie-breakers (per the plan).
  Identifier hits surface at the top (scan-a-barcode → that product first).
- **Selecting a result → deep-link:** click or `↵` calls `router.push(result.href)`
  and records the recent entry; the destination page re-checks permission/RLS.
- **"See all in {category}":** a trailing row per group → opens that category's
  scoped results (palette filtered `?type=…`, or the module list pre-queried).

---

## 4. Category navigation

- **Categories (V1):** Customers · Products · Suppliers · Orders · Invoices ·
  Returns · Visits · Workflows · Attachments · Users — each rendered as a group, in
  entity-prior order, only if the user may view it (§5) and it has hits.
- **Scope filter:** filter chips / a segmented control at the top of results
  ("All · Customers · Products · …", only permitted+non-empty categories) → sets
  `?type=` and re-queries that single category (top-N → full list).
- **"See all" / scoped view:** expands one category to a longer, paginated result
  list (same row UX), still inside the palette or handed to the module list.
- **Counts:** each category header shows its match count so the user can judge where
  to look.

---

## 5. Permissions behavior

- **Category visibility = permission:** a category only appears if the user holds its
  reused permission/module gate (`customers.view`, `suppliers.view`,
  `workflow.manage`, or the entity's module capability). No permitted categories →
  the search entry point is hidden.
- **Defense in depth (from the plan):** index RLS (tenant) + per-result
  `permission_key` filter in `search()` + **source-table RLS re-check on the
  destination page**. A result can never expose a record the user couldn't open.
- **Tenant/branch:** results are company-scoped (+ branch-scoped for branch roles);
  no cross-tenant results. The **platform-owner** cross-tenant palette stays a
  separate surface, unchanged.
- **Attachments** inherit the parent entity's permission (only shown if the user can
  view the parent).

---

## 6. Mobile & desktop behavior

- **Desktop:** ⌘K/Ctrl-K opens a centered modal palette; mouse + full keyboard nav
  (↑↓/↵/Esc); hover states; results grouped with "see all". Width capped; scrolls
  within the dialog.
- **Mobile:** a top-bar **search icon** opens a **full-screen sheet**: large input
  (auto-focus, brings up the on-screen keyboard; `inputmode` tuned so identifier
  queries get a numeric keypad), touch-sized result rows, sticky category headers,
  momentum scroll; tapping a result navigates and closes the sheet; back/✕ closes.
- **Shared:** RTL (Arabic) and LTR both first-class — icon/metadata alignment flips;
  Arabic + English queries both supported (unaccent + trigram). Identifier inputs
  (barcode/phone/VAT/CR) are formatting-agnostic on both.
- **Performance feel:** debounce + spinner; typeahead target p95 < 150 ms keeps it
  responsive on mobile networks; cached recent list shows instantly on open.

---

## 7. Screens / components (implementation mapping — for the build phase)

- **Extend:** `components/layout/command-palette.tsx` (in-app palette) → search mode
  + categorized entity results; `components/layout/topbar.tsx` → search trigger
  (desktop) + mobile search icon.
- **New:** `search()` server action + `/api/search`; a small client hook (debounce +
  classify + fetch); result row + category-group components (or extend existing
  palette item renderer); i18n `search.*` keys (ar/en).
- **Untouched:** `components/shared/command-palette.tsx` (platform-owner search) and
  all module list pages (no redesign).
- **Flag:** entire surface behind `KAKO_SEARCH` (OFF) — palette behaves exactly as
  today when the flag is off.

---

## 8. Explicitly out of V1

Semantic/NL search, embeddings, vector, Copilot, camera/hardware barcode capture,
saved searches/filters history, search analytics dashboards (the `search.performed`
event is P3, not a screen).

*UX spec only — no implementation. Awaiting screen-tree approval before building
Phase 1.*
