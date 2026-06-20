# Visual Territory Planning — Enterprise Scale Review & UX Recommendations

**Scope:** Review the Visual Territory Planning (VTP) experience for large FMCG
organizations (dozens to 100+ routes) and recommend UX **before** implementation.
**Branch / PR:** `claude/pilot-ux` · PR #319
**Date:** 2026-06-19
**Status:** Review + design recommendations — **no code changes**.

---

## 1. Method & Current State

Grounded in the shipped code: `src/lib/tis/plan-edit.ts`, `scenario.ts`, and the
canvas `src/app/(app)/distribution/planning-board/planning-canvas.tsx`.

**The edit engine is already enterprise-ready** (pure, immutable, instant metrics):

| Move | Engine op | Status |
| :--- | :--- | :--- |
| Customer between **days** (same route) | `reassignDay` (sets `dayOfWeek`) | Op exists |
| Customer between **routes** | `moveCustomer` (sets `routeId`) | Op exists |
| Customer between **salesmen** | `reassignSalesman` (sets `salesmanId`) | Op exists |

`ScenarioAssignment` carries `routeId` · `salesmanId` · `dayOfWeek`; `applyScenario`
materializes route + salesman; metrics recompute instantly. **The gap is entirely
in the presentation layer**, not the engine.

**The canvas does not scale:**

- **Route View (Board):** renders **every route as a column** with up to `120`
  cards each. At 50–100 routes this is hundreds of columns and a horizontal-scroll
  wall; the browser renders thousands of DOM nodes at once.
- **Day View (Calendar):** 7 day columns, each listing **all customers across all
  routes** for that day (capped at `80`). You cannot tell which route a card
  belongs to, and the cap **silently hides** the rest.
- **No Salesman View** at all (despite `reassignSalesman` existing).
- **No scope selectors** — region / route / salesman. The whole tenant loads and
  renders simultaneously.
- **Hard caps** (`slice(0,120)` / `slice(0,80)`) drop rows with only a "+N more"
  note — at scale, customers effectively disappear from the plan.
- **Colour palette** is 12 entries; beyond 12 routes colours repeat, so colour
  alone can't identify a route.

---

## 2. Scenario-by-Scenario Assessment

### 2.1 Move a customer between **days** within the same route
- **Engine:** `reassignDay` — ready.
- **Today:** only the global Calendar supports it, mixing every route's customers
  into each day column. A manager cannot see *one route's week* to rebalance it.
- **Recommendation:** a **route-scoped Day View** — when one route is in scope,
  show that route's Sun–Thu columns (its weekly schedule) for clean intra-route
  day moves; show per-day workload so the manager balances the week.

### 2.2 Move a customer between **routes**
- **Engine:** `moveCustomer` — ready.
- **Today:** Route board works, but only usable at small scale; at 50+ routes the
  source and target columns are rarely on-screen together.
- **Recommendation:** scope to a **working set of routes** (e.g. 4–8 selected, or
  one region) so source/target are adjacent; virtualize columns; keep an
  "Unassigned" column always pinned.

### 2.3 Move a customer between **salesmen**
- **Engine:** `reassignSalesman` — ready.
- **Today:** **no UI exists.**
- **Recommendation:** a new **Salesman View** — columns = salesmen (within scope),
  drag a customer card between them → `reassignSalesman`; per-salesman workload /
  value / customer count in the column header (the real balancing signal).

### 2.4 Companies with 20 / 50 / 100+ routes

| Routes | Today | Target behaviour |
| :--- | :--- | :--- |
| **≤ 8** | Works | Show all; no scoping required. |
| **~20** | Sluggish, wide scroll | Scope **recommended**; virtualized board; region/route filter. |
| **~50** | Effectively unusable | Scope **required** (default to a region or salesman); only scoped routes render. |
| **100+** | Breaks (DOM + payload) | **Server-side scoped loading** — never load all customers; a "select routes to plan" gate; load the scope index (route/region/salesman + counts) first, then only the chosen subset. |

---

## 3. UX Recommendations

### 3.1 A persistent Scope Bar (the core fix)
A scope bar above the canvas, always visible:

```
[ Region ▾ ]  [ Salesman ▾ ]  [ Routes: ▾ 6 selected ]   Showing 6 of 84 routes · 312 customers   [ Clear ]
```

- **Region** narrows the route list; **Salesman** narrows to that rep's routes /
  customers; **Routes** is a multi-select (chips) for an explicit working set.
- **Smart default at scale:** when a tenant exceeds a threshold (e.g. > 12 routes),
  **do not load everything** — default to the manager's region (or first N routes)
  and show a clear "working set" summary with a one-click way to widen.
- Scope is **shared studio state** — it filters Route, Day, and Salesman views and
  the centre map together, so the manager always works on one coherent subset.

### 3.2 One "View by" switch, three lenses
`View by: ( Route · Day · Salesman )` over the **same scoped working set**:

- **Route View** — columns = routes in scope; drag = move between routes.
- **Day View** — route-scoped week (Sun–Thu columns) for intra-route day moves;
  per-day workload shown.
- **Salesman View** — columns = salesmen in scope; drag = reassign salesman.

Each column header shows **count · workload · value**, because at scale the manager
balances by load/value, not by eyeballing card piles.

### 3.3 Performance pattern
- **Virtualize** columns and cards (render only what's visible) — or paginate
  columns with explicit "next routes" rather than silent `slice` caps.
- **Replace hard caps** with virtualization + honest counts (never hide customers).
- **Server-side scoped loaders** for large tenants: a cheap *scope index*
  (routes / regions / salesmen + counts) loads first; the heavy customer payload
  loads only for the selected scope. This keeps 100+-route tenants responsive and
  bounds the client payload.
- **Labels over colour** beyond 12 routes (colour repeats); show route/salesman
  name on every column and card chip.

### 3.4 Keep Simple Mode
- Small tenants see no scope friction (auto "all").
- The guided order (Import → Audit → Optimize → Plan → Export) is unchanged; the
  scope bar is additive and collapses to a single "All routes" pill when small.
- **Still read-only + export** — no Apply (RO-4 / VTP-4 stay paused).

---

## 4. Proposed Phased Implementation (pending approval)

| Phase | Scope |
| :--- | :--- |
| **VTP-S1** | Scope Bar (region / salesman / route multi-select) + shared scope state + "working set" summary; canvas renders only scoped routes; smart default at > 12 routes. |
| **VTP-S2** | Salesman View (columns = salesmen, drag → `reassignSalesman`) + route-scoped Day View (one route's week) + per-column count/workload/value headers. |
| **VTP-S3** | Performance: virtualize columns/cards, remove silent caps; server-side scoped loaders + scope index for 100+-route tenants. |

Each phase: `tsc` + `vitest` + `next build` + completion review with the Jeddah
demo (and a synthetic large-tenant fixture for 20 / 50 / 100-route validation).

---

## 5. Recommendation

The engine already supports all three moves; the work is **presentation + scoping**.
Recommend building **VTP-S1 → VTP-S3** as composition over the shipped scenario
engine, keeping Simple Mode and read-only/export. VTP-S1 (scope) and VTP-S2
(Salesman + route-scoped Day) deliver the enterprise usability the review calls for;
VTP-S3 hardens performance for the largest tenants. Awaiting approval (and any
preference on the default scope at scale: by **region**, by **salesman**, or an
explicit **route pick**).
