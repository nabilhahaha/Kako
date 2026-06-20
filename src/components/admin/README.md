# Admin container decision rule

Part of the VANTORA Navigation Standard ("One rail, then rise"). This codifies
**which container an admin/platform surface should use** so new surfaces are
consistent by default. Adopted via the platform-wide navigation audit (P3).

## The rule

Pick the container by the **shape of the surface**, not by which area it lives in:

| Surface shape | Container | Examples |
|---|---|---|
| **Entity collection** — a set of records you browse, select, and inspect (list → detail → facets) | **`AdminWorkbench`** (3-panel: `EntityListPanel` · `EntityHeader`/`EntityTabs` · `ContextPanel`), actions via `EntityActionBar`, audit via `ActivityFeed` | Companies, Users, Roles, Branches, Plans, Platform Staff |
| **Hub / dashboard** — KPIs, charts, or a grid of links; no single selected record | **`ModulePage`** + `StatCard`s / cards, sections via `TopGroupingNav` | Platform Overview, Analytics, Activity, Copilot Analytics, Settings home, Features |
| **Single configuration page** | `PageHeader` + `SectionCard`s | individual settings pages |

### Record facets vs. module sections
- **Record facets** (tabs of one selected entity) → `EntityTabs` (which wraps `TopGroupingNav`).
- **In-module section grouping** (peer areas of a module) → `TopGroupingNav` directly, hosted by `ModulePage`.
- Never stack two persistent vertical rails (Article II). A collection's list is the **master pane of content**, not a second chrome rail.

## Why this matters

The audit found admin primitives concentrated in Settings workbenches while most
`/platform/*` pages were bespoke. The rule legitimizes the **dashboard** pages
(Analytics/Activity/Copilot stay `ModulePage`) and targets only the **entity**
pages (Plans/Roles/Staff) for alignment to `AdminWorkbench` — so "consistency"
means *the right container for the shape*, not "everything becomes a workbench".

## When adding a new admin surface

1. Is it a **collection of records**? → `AdminWorkbench` (+ `EntityActionBar`, `ActivityFeed`).
2. Is it a **dashboard/hub**? → `ModulePage` (+ `StatCard`/cards, optional `TopGroupingNav`).
3. Does a record have **facets**? → `EntityTabs`.
4. Reuse existing server actions and gates — UX standardization only.

## Component map (`src/components/admin/`)

`admin-workbench` · `entity-list-panel` · `entity-detail` (`EntityHeader`/`EntityTabs`/`DetailPlaceholder`) · `entity-action-bar` · `top-grouping-nav` · `context-panel` · `module-page` · `settings-group-nav` · `section-card` · `activity-feed` · `audit-feed-actions`.
