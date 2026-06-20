# Roles & Permissions on the Admin Workbench — Review Package

Review of the migrated Roles & Permissions screen (`/settings/authz`, commit `f901149`) before applying the pattern to Companies. UX standardization only — all logic, actions, permissions, RLS, and gating are unchanged. Live on the **kako PR-#319 preview**.

---

## 1. Review package — what to validate

| Area | What it is now | Expected |
|------|----------------|----------|
| **Role selection** | Left panel: searchable roles list; selecting sets `?id=<role>` and loads the center | Selected role always visible; URL shareable |
| **Permissions Matrix** | `CapabilityMatrix` scoped to the selected role (single column) | Toggle the 8 deny-all capabilities for that role; same `setCompanyCapability` |
| **Role Overrides** | `RoleOverridesConsole` in `lockedRoleKey` mode (no duplicate role list) | Grant/revoke/clone/reset operational perms for the role; inert if feature off |
| **User Access Overrides** | `AccessOverridesConsole` with the user list filtered to the role's members | Per-user overrides for members of this role; inert if feature off |
| **Members** | Read-only list of the role's members | Names + roles |
| **Data Scope** | Existing `ScopePanel` (preserved) | Unchanged behavior |
| **Approval Limits** | Existing `LimitsPanel` (preserved) | Unchanged behavior |
| **Section Access** | Existing `SectionAccessPanel` (preserved) | Unchanged behavior |

Gating note: on the **reference tenant**, UAO is live and Role Overrides is inert (not yet entitled); on other tenants both are inert. The matrix/scope/limits/sections always work.

---

## 2. Capture points (live preview)

Authenticated screenshots can't be captured from the sandbox; capture these reproducible states at `…vercel.app/settings/authz`:

1. **Role list + nothing selected** — left roles list + "Select a role…" placeholder.
2. **Role selected — Permissions Matrix** (`?id=salesman&tab=matrix`) — single-role capability toggles; header shows member count badge; right panel Summary/Audit/Related.
3. **Role Overrides tab** (`&tab=roleov`) — grouped tri-state editor for the role (Requests/Sales/Collections/Operations/Inventory), or the inert "Feature not enabled" card on a non-entitled tenant.
4. **User Access Overrides tab** (`&tab=uao`) — the member-filtered user list + per-user editor (live on the reference tenant).
5. **Members tab** (`&tab=members`) — the role's members.
6. **Data Scope / Approval Limits / Section Access tabs** (`&tab=scope|limits|sections`) — the preserved panels.
7. **Tablet (~1024px)** — two panels; the **Context** button opens the right drawer.
8. **Mobile (~390px)** — single column; list → role → tabs; context via drawer.

---

## 3. Preview navigation guide

1. Open `/settings/authz` as a Company Admin / Platform Owner.
2. Pick a role on the left (try **Salesman**) → center loads, URL becomes `?id=salesman&tab=matrix`.
3. Click across the tab bar: Permissions Matrix → Role Overrides → User Access Overrides → Members → Data Scope → Approval Limits → Section Access. Each updates `&tab=`.
4. Toggle a capability in **Permissions Matrix** (saves immediately; toast).
5. In **User Access Overrides** (reference tenant), pick a member, set Grant/Revoke, enter a reason → save; watch the effective diff.
6. Resize the window to confirm the tablet drawer and mobile single-column behavior.
7. Refresh on any tab — selection + tab persist via the URL.

---

## 4. Known UX limitations (current)

1. **Embedded sub-consoles keep their own inner chrome.** The Role Overrides and UAO consoles were built as standalone pages; embedded, the UAO console still shows its own search/user-list inside the tab (now filtered to the role), and both render their own safety banner — slightly redundant against the workbench frame.
2. **Scope / Limits / Section Access are not single-role-scoped.** These preserved panels still show their full (all-roles/all-assignments) UI inside the tab, so the "selected role" context doesn't narrow them yet. Functionally complete, visually inconsistent with the matrix.
3. **Right-panel Audit is a deep link, not a live feed.** No per-role recent-activity list yet (we deferred `loadEntityAudit`); "View in Audit Log" opens the global log.
4. **No keyboard list navigation / virtualization.** The role list is small so it's fine, but Users/Companies lists will want ↑/↓ + type-ahead and virtualization.
5. **Two override consoles have separate "Reset/Clone" affordances** that don't yet match a single workbench action grammar (e.g., a unified header action menu).
6. **Members tab is read-only** (by design for now) — no inline "manage user" jump beyond the Related chips.
7. **Quick-create is absent for Roles** (roles are system/templated), which is correct here but means the EntityListPanel's quick-create slot is unused.

None of these affect behavior, permissions, or data — they're polish items.

---

## 5. Recommended improvements before reusing the pattern for Companies

Apply these to the shared library first so Companies (and later modules) inherit them:

1. **Add an `embedded` prop to sub-consoles** (`RoleOverridesConsole`, `AccessOverridesConsole`) that hides their internal banner/secondary chrome when rendered inside a workbench tab — removes the redundancy in #1.
2. **Build the real `AuditList` / `ActivityFeed`** backed by a small read-only `loadEntityAudit(entity, id)` helper, and drop it into the right panel — turns the Audit deep link into a live per-entity feed (reused by every module).
3. **Add keyboard nav + optional virtualization to `EntityListPanel`** (↑/↓/Enter, type-ahead) before the larger Companies/Users lists.
4. **Standardize a header action menu** (`EntityHeader` overflow) so Reset/Clone/primary actions share one grammar across modules.
5. **Decide scope/limits/sections scoping** — either narrow them to the selected role (more work, more consistent) or move them to a clearly-labeled "Advanced (all roles)" group. Recommend: narrow Scope/Limits to the selected role when we touch them next; leave Section Access global (it's entity-keyed, not role-keyed).
6. **Generalize the tab set as config** — Companies tabs (Profile/Plans/Entitlements/Branches) should be declared as a data array consumed by a shared `WorkbenchTabs` renderer, so each module is a thin config.

Items 1–3 are small and high-leverage; I'd do them as a brief "library hardening" pass, then Companies rides on the improved shell.

---

## 6. Recommendation

The Roles workbench meets the Phase-2 goals (selected item always visible, no long page, URL-addressable, tablet-friendly, full authz model in one place, zero logic change). The limitations are polish, not correctness. Suggested path: **approve Roles**, let me do a short **library-hardening pass (improvements 1–3)**, then build **Companies** on the hardened shell.

Commit `f901149` on `claude/pilot-ux` (PR #319) · live at `/settings/authz` on the preview.
