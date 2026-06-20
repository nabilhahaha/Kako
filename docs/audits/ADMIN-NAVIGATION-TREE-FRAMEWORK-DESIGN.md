# Admin Navigation Tree & Favorites Framework — Design & Evaluation

A navigation/administration **UX** initiative (no business logic): turn the isolated admin pages into one connected management system — **Navigation Tree + Workbench + Favorites + Quick Create**. Design and evaluation only; **no implementation**. Intended as the next UX program **after** the Admin Workbench migration is complete.

> Recommendation up front: **yes** — this should become the standard administration navigation model for Platform Owner and Company Admin, built on the existing Admin Workbench shell. It is additive and reuses everything already shipped.

---

## 1. Architecture proposal

A single **Admin Shell** with three regions, where the left list panel becomes a **multi-entity Navigation Tree**:

```
┌ NAV TREE (left) ─────┬ WORKBENCH (center) ─────┬ CONTEXT (right) ─┐
│ ⭐ Favorites          │ Selected entity:        │ Summary          │
│ ▼ Companies  [+]      │   header + tabs +       │ Activity         │
│ ▼ Users      [+]      │   section cards         │ Audit            │
│ ▼ Roles      [+]      │ (the existing per-type  │ Related objects  │
│ ▼ Branches   [+]      │  Workbench detail)      │                  │
│ ▼ Features            │                         │                  │
│ ▼ Plans / Packs / …   │                         │                  │
└──────────────────────┴─────────────────────────┴──────────────────┘
```

- **One URL grammar:** `…/admin?type=<entity>&id=<id>&tab=<tab>` (extends today's `?id&tab`). Selecting any node sets `type+id`; the center renders that type's existing Workbench detail.
- **The Workbench stays the center.** The tree only *replaces the per-page left list* with a unified, cross-entity tree. The center/right are unchanged components.
- **Two delivery models:**
  - **Model B (incremental):** a shared `AdminNavTree` rail rendered on each existing workbench page; selecting a node of another type navigates to that type's page with the id preselected. Low risk; ships per-page.
  - **Model A (end-state):** one consolidated `/admin` shell that routes the center by `type` — the fully "connected" feel. Recommended target, reached via B.

---

## 2. UX proposal

- **Hierarchical, expandable groups** per entity type (Companies, Users, Roles, Branches, Features, Plans, Packs, Integrations, Settings). Each group header shows a count and a **`+ New`** quick-create.
- **Selecting a node opens that entity's Workbench** in the center (Company → Company Workbench, User → User Workbench, Role → Roles Workbench, …).
- **Favorites** pinned at the very top (cross-entity): a flat list of starred entities for one-click jump.
- **Global type-ahead** at the top filters across the whole tree (reuses the search story); arrow-key navigation across nodes.
- **Breadcrumb** in the center header reflects `Type › Entity › Tab`.
- Consistent chrome, density, RTL — identical to the current workbench.

---

## 3. Reuse audit

| Need | Reuse (already shipped) | New |
|------|--------------------------|-----|
| 3-panel shell + responsive drawer | `AdminWorkbench` | — |
| URL selection/tab state | `useWorkbenchSelection` (extend with `type`) | small extension |
| List rows + search + keyboard nav + virtualization-ready | `EntityListPanel` | wrap into tree groups |
| Center detail per type | Users/Roles/Companies/Branches/Features workbenches | a `type → Workbench` registry |
| Right context | `ContextPanel`, `SummaryList`, `ActivityFeed`, `RelatedChips` | — |
| Quick-create | existing create actions/forms (createCompany, createUser, upsertBranch, …) | tree-level launcher |
| Audit feed | `loadEntityAudit` / `ActivityFeed` | — |
| Per-entity loaders | existing `load*` server fns | a lazy per-branch loader |
| Favorites | — | `erp_admin_favorites` table + pin/unpin actions (additive, RLS user-scoped) |

≈ 85% reuse. The only genuinely new pieces are the **NavTree** component, a **type→workbench registry**, and a small **favorites** table/actions.

---

## 4. Navigation model

- **Groups (top-level nodes):** Companies · Users · Roles · Branches · Features · Plans · Industry Packs · Integrations · Settings. Visibility per audience: Platform Owner sees platform groups (Companies/Plans/Packs); Company Admin sees tenant groups (Users/Roles/Branches/Features/Settings).
- **Lazy expansion:** children load on first expand (not upfront) via the existing per-type loaders; cached per session.
- **Depth:** mostly two levels (Group → Entity). A few are three (Features: Group → Domain → Feature; Companies later: Company → tab). Settings stays Group → setting-area.
- **Selection → center:** a registry maps `type` to its Workbench detail; the tree never renders detail itself.
- **Deep-linkable & shareable** via the `type/id/tab` URL.

---

## 5. Favorites design

- **Storage (additive):** `erp_admin_favorites(id, user_id, company_id, entity_type, entity_id, label, sort, created_at)` — RLS **user-scoped** (a user sees only their own pins). No business logic; pure personalization.
- **Pin/unpin:** a star on any entity header / tree node; `pinFavorite` / `unpinFavorite` server actions (admin-gated, user-scoped).
- **Display:** a `⭐ Favorites` section at the top of the tree, cross-entity, ordered by `sort` (drag-to-reorder optional later).
- **Scope:** Platform Owner and Company Admin each get their own favorites; labels are denormalized so a deleted entity degrades gracefully.

---

## 6. Quick-create design

- Each group header carries **`+ New <Entity>`**; clicking opens an **inline create** (popover/modal) reusing the existing create action + minimal fields (e.g., New Company = name; New User = name+email; New Branch = code+name; New Role = key+name).
- On success: the new entity is **inserted into the tree and auto-selected**, opening its Workbench — no page navigation.
- Reuses existing validation/permissions/RLS; quick-create is a thin launcher over current actions.

---

## 7. Mobile & tablet behavior

- **≥ xl:** tree (left) + workbench (center) + context (right).
- **md–lg (tablet):** tree + workbench; context → drawer (existing behavior). Tree can collapse to icons or a narrow rail.
- **< md (mobile):** tree is a **full-screen overlay/drawer** (hamburger); selecting a node closes it and shows the workbench full-width; context via a second drawer; a back affordance returns to the tree.
- Favorites surface first on mobile for fast access. Large touch targets; the existing keyboard nav stays for desktop.

---

## 8. Performance impact

- **Lazy, not eager:** top-level groups render instantly (static); children load on expand — no large upfront query. Companies/Users (potentially many) are **virtualization-ready** already (`EntityListPanel` capped window) and should use windowing in the tree.
- **Caching:** per-session cache of expanded branches; `router`-level `?type/id` keeps navigation client-side (no full reloads).
- **Global search:** server-backed for large sets (reuse a scoped search RPC) rather than loading everything; debounced.
- **Favorites:** a single small indexed query per session.
- Net: lighter than today's per-page full loads, because branches load on demand. Risk is unbounded eager loading — avoided by the lazy model.

---

## 9. Applicability review (per entity type)

| Type | Fit | Notes |
|------|-----|-------|
| **Companies** | ✅ strong | Platform Owner primary; opens Company Workbench |
| **Users** | ✅ strong | large list → lazy + virtualized |
| **Roles** | ✅ strong | small, fully static |
| **Branches** | ✅ strong | scoped to company |
| **Features** | ✅ good | 3-level (Group→Domain→Feature) |
| **Plans** | ✅ good | platform; small |
| **Industry Packs** | ⚠️ pending | depends on the separate Pack-hierarchy workstream; slot reserved |
| **Integrations** | ✅ good | connections as nodes |
| **Settings** | ✅ good | setting-areas as nodes (leaf → form) |

All nine fit the model; Industry Packs becomes first-class once that hierarchy lands.

---

## 10. Rollout recommendation

1. **Finish the Admin Workbench migration** (Companies gap-close → Settings → Integrations) so every type has a Workbench detail to open.
2. **Build `AdminNavTree` (Model B)** as a shared left rail behind a flag (default OFF) on the existing workbench pages — incremental, low risk.
3. **Add Favorites** (`erp_admin_favorites` + pin/unpin) — additive, user-scoped, flag-gated.
4. **Consolidate into the `/admin` shell (Model A)** once B is proven — the fully connected experience.
5. **Default-OFF → pilot (reference tenant + platform owner) → standard** for Platform Owner and Company Admin.

**Verdict:** adopt the Navigation Tree + Favorites + Quick-Create as the **standard admin navigation model**, built additively on the Admin Workbench. It is a UX/navigation project (one small additive favorites table is the only backend touch) with no business-logic, permission, RLS, or workflow change to existing features.

*Design & evaluation only — no implementation. To be scheduled after the Admin Workbench migration program completes.*
