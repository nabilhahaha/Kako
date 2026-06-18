# P5-3 — Customer Workbench Shell

### CustomersWorkbench + FMCG operational layout

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Implemented · validated · pushed — *no route rewire yet (P5-4)*

The canonical 3-panel Customer Workbench assembled on the shared AdminWorkbench, with the approved FMCG operational proportions applied. Reuse-first: the center is the existing Customer 360 (P5-2b); the left/right panels and the lazy detail loader are existing primitives. No business-logic, permission, RLS, or workflow change; no route change.

---

## 1. Architecture

`CustomersWorkbench` composes the three-panel shell:

| Panel | Component | Content |
|-------|-----------|---------|
| **Left** | `EntityListPanel` | Type-ahead list over code · name · phone; URL-addressable selection (`?id=`) |
| **Center** | `Customer360` (P5-2b) | The **primary focus** — Overview · Profile · Statement · Activity · Related · Audit |
| **Right** | `ContextPanel` | Compact, summary-oriented: key figures + status badge + related chips |

The detail bundle (statement · activity · merged 360 timeline) is **lazy-loaded per selection** via `loadCustomerDetailBundleAction` — auth-gated, RLS-scoped, read-only. Selection + active tab are URL-addressable through `useWorkbenchSelection` (`?id=&tab=`).

---

## 2. FMCG operational layout

Implemented via a new **backward-compatible** `AdminWorkbench` option, `layout="wide"`. The `default` path is **byte-identical**, so every existing workbench (Companies · Users · Roles · Features · Branches) is unaffected.

| Guideline | Implementation |
|-----------|----------------|
| Customer360 is the primary focus | center uncapped (the `max-w-[860px]` cap is removed in wide); slimmer list (256px) |
| Avoid equal-width layouts | tracks `256px · minmax(0,1fr) · 300px` — center dominant, never equal |
| Statement / Activity / Profile get the majority of space | **dynamic per-tab sizing**: these data-dense facets **drop the right rail**, so the grid collapses to `256px · 1fr` and the center spans the full width |
| ContextPanel compact + summary-oriented | 300px; shown only on Overview / Related / Audit; key figures + status + chips |
| Mobile: full-width + collapsible context | unchanged AdminWorkbench behavior — below `xl` the center is full-width and context collapses to the **Info** drawer |

---

## 3. Preview captures (proportions)

```
WIDE — non-dense tab (Overview/Related/Audit)        WIDE — dense tab (Statement/Activity/Profile)
+--256px--+------ center (1fr) ------+-300px--+       +--256px--+----------- center (full 1fr) -----------+
|  list   |  Customer 360 (focus)   | context|       |  list   |  Customer 360 — statement / ledger /    |
|  search |  Overview · stats       | summary|       |  search |  aging · open invoices · timeline       |
|  > Acme |                         | status |       |  > Acme |  (right rail dropped -> max width)      |
+---------+-------------------------+--------+       +---------+-----------------------------------------+

MOBILE (< xl) — every tab                       DEFAULT layout (unchanged, e.g. Companies)
+------- Customer 360 (full width) ------+      +-280px-+---- center (<=860px) ----+-320px-+
|  [i Details]  <- context = drawer      |      | list  |  detail (capped)         |context|
|  tabs · content full-bleed             |      +-------+--------------------------+-------+
+----------------------------------------+      (byte-identical to before this change)
```

---

## 4. Reuse analysis

| Reused **verbatim** | New code |
|---------------------|----------|
| `AdminWorkbench` · `EntityListPanel` · `DetailPlaceholder` · `ContextPanel`/`ContextSection`/`SummaryList`/`RelatedChips` | `customers-workbench.tsx` shell (~180 LOC) |
| `Customer360` (P5-2b) + all its reused components/actions | `customers-workbench-actions.ts` loader action (~20 LOC) |
| `loadCustomerDetailBundle` (P5-1) | `AdminWorkbench` `layout="wide"` option (additive, ~12 LOC) |
| All permission gates (`customers.approve`, `customer.transfer`, `sales.collect`) | shared badge maps moved into the pure `customer-360-tabs` helper |

**Estimated reuse ≈ 90%.** Zero business-logic / permission / RLS / workflow change; no new permissions or actions.

---

## 5. Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | clean |
| `vitest run` | 1601 passed / 192 skipped (unchanged) |
| `next build` | compiled successfully (67s) |
| Route validation | `/customers`, `/customers/[id]`, `/[id]/360`, `/transfer` build **unchanged** (no rewire yet) |
| Existing workbenches | default `AdminWorkbench` path byte-identical → Companies/Users/Roles/Features/Branches unaffected |

---

## 6. Gap-matrix (P5-3 status)

| Capability | State |
|------------|-------|
| List + selection + search | Done — `EntityListPanel` |
| Customer 360 (6 tabs · actions · richer activity) | Done — P5-2b |
| Lazy detail bundle (statement · activity · 360 timeline) | Done — `loadCustomerDetailBundleAction` |
| Compact context (summary · status · related) | Done |
| Server search · 3 filters · pagination | **Pending P5-4** (page rewire); shell uses client type-ahead for now |
| Old-route deep links → `?id=&tab=` redirects | **Pending P5-4** |

---

## 7. Next — P5-4

Rewire `/customers/page.tsx` onto `CustomersWorkbench` (wiring server search · the 3 filters · pagination), add `[id]` and `[id]/360` redirect stubs to preserve deep links, and provide the final gap-matrix sign-off confirming no functional reduction.
