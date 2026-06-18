# Admin Navigation Tree — Preview Validation & Walkthrough

Pre-preview validation of the Navigation Tree (`/admin`, default-OFF `KAKO_ADMIN_NAV_TREE`), with the per-entity walkthrough and the five validation checks you asked for. Branch `claude/pilot-ux` (commits `4a39b4b`, +perf cap). **Stays OFF until you complete preview review.**

---

## 0. Two honest constraints (need your one ops step)

- **Enabling on preview:** the tree is gated by `KAKO_ADMIN_NAV_TREE`. I can't set Vercel env vars from here, and you've (correctly) ruled out committing `.env.production`. **Action needed:** set `KAKO_ADMIN_NAV_TREE=1` on the **Preview** scope of the `kako` Vercel project (the same way `KAKO_USER_ACCESS_OVERRIDES` was set). Production stays OFF.
- **Screenshots:** I cannot capture authenticated screenshots from this sandbox. Below is a **URL-reproducible walkthrough + capture points** you (or I, once the flag is on) can shoot on the preview at `…/admin`.

---

## 1. Per-entity walkthrough (at `/admin`)

| Group | Expand loads (lazy) | Click a node opens | URL |
|-------|---------------------|--------------------|-----|
| **Companies** | `loadCompaniesList` (platform `view_companies`) | Company360 in the Companies Workbench | `/platform/companies?id=<id>` |
| **Users** | `erp_scoped_members` (super-admin) | Users Workbench, that user selected | `/settings/users?id=<id>` |
| **Roles** | company roles / system roles (company admin) | Roles Workbench, that role selected | `/settings/authz?id=<role>` |
| **Branches** | `erp_branches` (settings.branches) | Branches Workbench, that branch | `/settings/branches?id=<id>` |
| **Features** | the 5 capability domains (company admin) | Features Workbench, that domain | `/settings/features?id=<domain>` |

Each group header has a **`+`** (quick-create entry → the workbench; full inline create is item 4). Search filters loaded nodes.

**Capture points:** (1) tree collapsed; (2) Companies expanded with entities; (3) click a company → Company360; (4) Roles/Branches/Features expanded; (5) search filtering; (6) hover → `+` appears.

---

## 2. The five validation checks

### ✅ No duplicate navigation layers — PASS (with a note)
In Model B the tree and a workbench's own list are **never shown together**: clicking a node leaves `/admin` and opens the workbench (which then shows its own list). So there is no tree-over-list duplication. *Note:* on `/admin` you do see the **global app sidebar** (module nav) **+** the entity tree — two different navs (modules vs. entities), the same pattern every page already has (sidebar + contextual list). The global sidebar is collapsible. No new duplication is introduced.

### ✅ No navigation dead ends — PASS
Every node links to a valid workbench URL; every group `+` links to a real create surface; back is browser-back or returning to `/admin`. No terminal/blank states (empty branches show "—", not a dead end).

### ⚠️ Active-node highlighting — IMPLEMENTED, dormant in Model B
The highlight logic is correct (URL-`id` based). **But** because the launcher navigates *away* to the workbench, the tree isn't on screen next to the opened entity, so the highlight isn't observed in normal use. It becomes meaningful only when the tree is **persistent beside the detail** — i.e., the **embedded `/admin` shell (Model A)**, which is your approved evaluate-later step. **Recommendation:** keep Model B now; active highlighting lights up when we adopt the embedded shell. (If you'd like it sooner, the small change is to make `/admin` itself host the detail via `?type&id` — that *is* Model A.)

### ✅ Role-aware visibility — PASS (code-verified)
`allowedTypes` is computed server-side mirroring each workbench's gate, and `loadNavBranch` re-checks per type:
- Companies → `view_companies` (platform owner)
- Users → super-admin only
- Roles / Features → company admin (+ company)
- Branches → `settings.branches` (or super-admin)
A company admin will **not** see Companies; a non-platform user won't see tenant companies; users with no permission see an empty/!visible group. Defense in depth on top of RLS.

### ✅ Performance with large datasets — PASS (hardened)
Branches are **lazy** (load only on expand, one query, cached per session). Rendered node lists are now **capped at 300** with fixed-height rows and a "refine search" hint (windowing-ready) — so a tenant with thousands of users/companies won't render an unbounded list. Recommended follow-up if needed: server-side search for the very largest branches (drop-in, same loader).

---

## 3. Summary

| Check | Result |
|-------|--------|
| Duplicate navigation layers | ✅ None (Model B; global sidebar is the existing pattern) |
| Navigation dead ends | ✅ None |
| Active-node highlighting | ⚠️ Implemented; visible only in the embedded shell (Model A) |
| Role-aware visibility | ✅ Correct (per-gate + per-type re-check + RLS) |
| Performance (large data) | ✅ Lazy + capped/windowing-ready |

Validation: tsc clean · suite 1592 passed · build green (`/admin`).

---

## 4. To proceed

1. Set `KAKO_ADMIN_NAV_TREE=1` on the **Preview** scope only; review `…/admin` against the walkthrough/capture points above. (I'll incorporate any findings.)
2. On your approval, I proceed to **EntityActionBar** (Companies: New/Activate/Suspend/Renew/Change Plan; Users: New/Reset Password/Assign Role/Deactivate; Roles: New/Clone/Archive) — reusing existing actions, permission-aware, no logic/permission/RLS/workflow change.
3. Then **Favorites** → **Quick Create** → an **Admin Center UX review package** before evaluating the embedded `/admin` shell.

The flag stays **OFF** until your preview review is complete.

Commits `4a39b4b` (tree) + perf cap on `claude/pilot-ux` (PR #319).
