# Admin Workbench Program — Review Package

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18

This package covers the current state of the Admin Workbench post-migration sequence: (1) Navigation Tree preview validation, (2) EntityActionBar review, and the supporting CI/migration resolution. All work is **UX-standardization only** — it reuses existing components and server actions and introduces **no business-logic, permission, RLS, or workflow change**.

---

## 1. Status summary

| Item | State |
|------|-------|
| Navigation Tree (item 1) | Implemented · default-OFF · `KAKO_ADMIN_NAV_TREE` enabled on **Preview** for live review |
| EntityActionBar (item 2) | Implemented · validated (tsc · 1592 tests · build) · staged for review |
| Favorites (item 3) | **Not started** — held until EntityActionBar is reviewed |
| Quick Create (item 4) | **Not started** — held until EntityActionBar is reviewed |
| 0336 CI blocker | Resolved — fix kept canonical in PR #318 (merged); #319 rebased |

---

## 2. Navigation Tree — Preview validation & walkthrough

The tree lives at `/admin`, gated by `KAKO_ADMIN_NAV_TREE` (default OFF). It is a persistent, lazy, searchable, role-aware tree across admin entity types; selecting a node opens that entity's existing Workbench (URL-addressable). It reuses existing loaders and workbench URLs — no new data model, no logic change.

**Preview URL:** `https://kako-git-claude-pilot-ux-123456789-s-projects.vercel.app/admin`
(Sign in as platform-owner / super-admin to see all groups. Production stays OFF.)

### 2.1 Per-entity walkthrough (capture points)

| Group | Expand loads (lazy) | Click a node opens | URL |
|-------|---------------------|--------------------|-----|
| Companies | `loadCompaniesList` (platform `view_companies`) | Company360 in Companies Workbench | `/platform/companies?id=<id>` |
| Users | `erp_scoped_members` (super-admin) | Users Workbench, that user selected | `/settings/users?id=<id>` |
| Roles | company / system roles (company admin) | Roles Workbench, that role selected | `/settings/authz?id=<role>` |
| Branches | `erp_branches` (settings.branches) | Branches Workbench, that branch | `/settings/branches?id=<id>` |
| Features | the 5 capability domains (company admin) | Features Workbench, that domain | `/settings/features?id=<domain>` |

### 2.2 The five validation checks

| Check | Result |
|-------|--------|
| No duplicate navigation layers | PASS — Model B navigates away to the workbench; only the existing global sidebar (modules) sits alongside the entity tree. No tree-over-list duplication. |
| No navigation dead ends | PASS — every node links to a valid workbench URL; empty branches show "—", not a blank state. |
| Active-node highlighting | IMPLEMENTED (URL-`id` based), but **dormant in Model B** — the tree isn't on-screen beside the opened entity. It only lights up in the embedded `/admin` shell (the approved evaluate-later step). |
| Role-aware visibility | PASS — `allowedTypes` computed server-side mirroring each workbench's gate; `loadNavBranch` re-checks per type; on top of RLS. A company admin sees no Companies group. |
| Performance (large data) | PASS — branches load lazily on expand (one cached query); rendered lists capped at 300 rows with a refine-search hint (windowing-ready). |

### 2.3 Promotion

If the preview passes usability, navigation, permission, and performance review, promote by setting `KAKO_ADMIN_NAV_TREE=1` beyond Preview. **Rollback** is instant and config-only: unset/zero the flag — no code change, no migration, the route reverts to redirecting to `/settings`.

---

## 3. EntityActionBar — review package

### 3.1 What it is

`src/components/admin/entity-action-bar.tsx` — one consistent, contextual, permission-aware action area for every admin entity. Primary actions render inline; the rest collapse into an overflow menu. **The component adds no business logic of its own** — callers pass `hidden` based on existing permissions and wire `run` to **existing** actions.

```
export interface EntityAction {
  key: string; label: string; icon?: ReactNode;
  run: () => void;       // wired to an EXISTING action
  hidden?: boolean;      // permission-aware: omit when not allowed
  disabled?: boolean;
  destructive?: boolean;
  overflow?: boolean;    // inline (default) vs. overflow menu
}
```

### 3.2 Reference wiring — Users Workbench

The Users module is the reference integration. It replaces the bespoke header buttons with an `EntityActionBar` that reuses the existing `setUserFlags` action (via `toggleFlag`):

- **Set / Revoke Super Admin** — `run: toggleFlag({ is_super_admin: !... })`; `hidden` when acting on self.
- **Activate / Deactivate** — `run: toggleFlag({ is_active: !... })`; `hidden` on self; `destructive` + `overflow` when deactivating.

No new action, no permission/RLS/workflow change — identical behavior, standardized presentation.

### 3.3 Example actions: in-scope (reuse) vs. out-of-scope (would need new actions)

The roadmap examples were illustrative. Under the **reuse-only** constraint, only actions that already exist can be wired now:

| Entity | Example action | Existing action? | Status |
|--------|----------------|------------------|--------|
| Users | Set/Revoke Super Admin | `setUserFlags` | Wired (reference) |
| Users | Activate / Deactivate | `setUserFlags` | Wired (reference) |
| Users | New User | `createUser` | Already in list panel (Quick Create item) |
| Users | Assign Role | `assignBranch` | Exists in Roles/Branches tab |
| Users | Reset Password | platform/companies only | **Out of scope** here — no Users-context action |
| Companies | Activate / Suspend / Renew / Change Plan | existing company actions | Wire in Companies bar (next, on approval) |
| Roles | New Role | `createRole` | Exists |
| Roles | Clone / Archive | — | **Out of scope** — no such action exists; would be new business logic |

Items marked out of scope are **not** implemented, to honor "reuse existing actions; no business-logic change." They are noted for a future, separately-approved workstream if desired.

### 3.4 Validation

`tsc --noEmit` clean · full suite **1592 passed / 192 skipped** · `next build` green.

---

## 4. CI / migration resolution (0336)

The `Integration tests (DB)` job was red due to a **pre-existing** blocker in `0336_treasury_perm_and_settlement_sod.sql`: it hardcodes the pilot company UUID and inserted into `erp_company_role_permissions`, which fails the `company_id` FK on a fresh CI database (no seeded companies). This is unrelated to the EntityActionBar change (frontend-only).

**Resolution (per direction):** the fix stays **canonical in PR #318** — a defensive `where exists (select 1 from erp_companies where id = …)` guard that is a no-op where the company exists (staging/prod) and skips cleanly on an unseeded CI DB. It was **not** duplicated into #319.

- PR #318 merged to main (squash `f8ef648`); its CI was fully green.
- #319 rebased onto the new main — clean, 42 commits replayed, zero conflicts.
- #319 re-runs CI with the guard now beneath the Admin Workbench work; integration tests expected green.

#319 remains focused on Admin Workbench, Navigation Tree, and EntityActionBar only.

---

## 5. Next steps

1. Complete the **Navigation Tree** live preview review → promote the flag beyond Preview if it passes.
2. Review **EntityActionBar** (this package) → on approval, extend it to the Companies / Roles / Branches bars using only existing actions.
3. Then proceed to **Favorites**, then **Quick Create** — held until EntityActionBar is reviewed.
4. Provide an **Admin Center UX review package** before evaluating the embedded `/admin` shell.
5. Industry-Pack hierarchy remains a separate design-first workstream.
