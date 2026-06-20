# Admin Navigation Tree — Design & Implementation (Phase 1)

The Navigation Tree (item 1 of the post-migration sequence) is **designed and implemented**, additive and **flag-gated (default OFF)**. Navigation/productivity only — reuses existing loaders and every workbench; **no business-logic, permission, RLS, or workflow change**. Branch `claude/pilot-ux`, commit `4a39b4b`.

---

## 1. What shipped

- **`/admin` — Admin Center** (default-OFF behind `KAKO_ADMIN_NAV_TREE`; not linked in nav until enabled; admin/platform gated): left = persistent Navigation Tree, center = "select an item" prompt (the embedded-detail `/admin` shell is the later evaluate-step).
- **`AdminNavTree`** (`src/app/(app)/admin/admin-nav-tree.tsx`) — a persistent, **lazy**, **searchable**, **role-aware** tree across admin entity types: **Companies · Users · Roles · Branches · Features**. Branches load on first expand; selecting a node **opens that entity's existing Workbench** via its URL (`?id=…`). Active node highlighted from the URL. Per-group **quick-create** affordance (links to the workbench now; full inline create lands with item 4).
- **`loadNavBranch(type)`** (`nav-tree-actions.ts`) — read-only lazy branch loader, **admin/platform-gated per type**, reusing `loadCompaniesList` / `erp_scoped_members` / `erp_roles` / `erp_branches`. No new tables.

---

## 2. Architecture (as implemented)

- **Model B (incremental), additive:** the tree is a unified launcher at `/admin`; selecting a node navigates to the type's existing workbench (`/platform/companies?id=…`, `/settings/users?id=…`, `/settings/authz?id=…`, `/settings/branches?id=…`, `/settings/features?id=…`). Every workbench is reused unchanged via its URL grammar.
- **Lazy:** top-level groups render instantly; a group's entities load only on first expand (one query), then cache in component state.
- **Role-aware:** the page computes `allowedTypes` mirroring each workbench's own gate (Companies → `view_companies`; Users → super-admin; Roles/Features → company admin; Branches → `settings.branches`), and `loadNavBranch` re-checks per type (defense in depth, on top of RLS).
- **URL-addressable & shareable** — consistent with the rest of the workbench program.

---

## 3. Reuse audit

| Need | Reused | New |
|------|--------|-----|
| List rows, search, icons, cards | existing primitives | tree wrapper |
| Per-type entity data | `loadCompaniesList`, `erp_scoped_members`, `erp_roles`/`erp_company_roles`, `erp_branches` | one thin `loadNavBranch` switch |
| Open an entity | existing workbench URLs (`?id`) | href builders |
| Gating | platform/permission helpers | per-type re-check |

No new data model, no schema, no new actions beyond one read-only loader. ~90% reuse.

---

## 4. Navigation model & behavior

- Groups: Companies · Users · Roles · Branches · Features (visible per audience).
- Expand → lazy load → list entities (searchable across loaded nodes).
- Click entity → opens its Workbench (preselected); active node highlighted.
- Group **`+`** → quick-create entry point (workbench for now; inline create = item 4).
- Favorites section (item 3) and a contextual EntityActionBar (item 2) attach next.

---

## 5. Responsive / performance

- Sticky on desktop; the existing collapsible/drawer patterns apply on tablet/mobile.
- **Lazy by design** — no eager full load; large branches (Companies/Users) reuse the virtualization-ready list approach; per-session caching; client-side navigation keeps it snappy.

---

## 6. Capture points (when `KAKO_ADMIN_NAV_TREE=1` on the preview, at `/admin`)

1. Tree groups collapsed; search box on top.
2. Expand **Companies** → entities load lazily; click one → opens `/platform/companies?id=…` (Company360).
3. Expand **Roles** / **Branches** / **Features** → entities → open the respective workbench.
4. Type in search → filters loaded nodes.
5. Hover a group → the `+` quick-create appears.
6. Active node highlighted when returning to `/admin?...` (URL-driven).

(Default-OFF, so nothing changes for anyone until the flag is set.)

---

## 7. Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Full suite | ✅ 1592 passed / 192 skipped |
| i18n parity + key-usage | ✅ passed |
| Production build | ✅ green (`/admin` 4 kB) |
| Logic / permissions / RLS / workflow | ✅ unchanged |

---

## 8. Next (per the approved sequence)

The tree is the keystone; the remaining items attach to it:
2. **EntityActionBar** — contextual, permission-aware action area (reuse existing actions).
3. **Favorites** — `erp_admin_favorites` (user-scoped, additive) + pin/unpin; surfaces at the top of the tree.
4. **Quick Create** — inline create from the tree/action bar.
→ then **evaluate the embedded `/admin` shell** (center renders the detail in place — Model A).

On your approval of this Navigation Tree, I'll proceed to **EntityActionBar**. The feature stays default-OFF until you choose to enable it on the preview.

Commit `4a39b4b` on `claude/pilot-ux` (PR #319).
