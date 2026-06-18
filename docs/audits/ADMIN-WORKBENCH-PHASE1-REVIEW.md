# Admin Workbench — Phase 1 UX Review Package (Shell + Library + Users)

Phase 1 of the Admin UX Standardization is built on branch `claude/pilot-ux` (commit `59740a1`): the reusable **AdminWorkbench** shell, the admin **component library**, and the **Users** module re-slotted as the reference implementation. **UX standardization only** — no business-logic, permission, RLS, or workflow changes (the Users module reuses its existing server actions and data verbatim).

---

## 1. What shipped

- **`AdminWorkbench`** — the three-panel responsive shell (Left list · Center detail · Right context) with **URL-addressable** selection + tabs (`?id=…&tab=…`). On ≥xl all three panels show; below xl the right **context becomes a slide-over drawer** (Info button). Selected item is always visible.
- **Component library** (`src/components/admin/`) — generic, reused by every future module.
- **Users module** (`/settings/users`) — left: searchable user list + inline quick-create; center: selected user header (super-admin/active toggles) + tabs **Profile** / **Roles & Branches** as section cards (no long page); right: Summary + Audit deep-link + Related branches.

Requirements met: ① three panels ② selected item always visible ③ no long vertical page (tabs + section cards) ④ URL-addressable selection & tabs ⑤ tablet-friendly (drawer) ⑥ reuses existing primitives ⑦–⑩ no logic/permission/RLS/workflow change.

---

## 2. Reusable component inventory

| Component | File | Responsibility | Reused by |
|-----------|------|----------------|-----------|
| `AdminWorkbench` | `components/admin/admin-workbench.tsx` | 3-panel responsive shell + context drawer | every admin module |
| `useWorkbenchSelection` | same | URL state `?id&tab` (select / setTab) | every module |
| `EntityListPanel` | `components/admin/entity-list-panel.tsx` | search + filter slot + quick-create slot + selectable list | every module |
| `EntityHeader` | `components/admin/entity-detail.tsx` | sticky title + status badge + actions | every module |
| `EntityTabs` | same | URL-wired tab bar | every module |
| `DetailPlaceholder` | same | empty center state | every module |
| `SectionCard` | `components/admin/section-card.tsx` | titled config card (replaces long forms) | every module |
| `ContextPanel` / `ContextSection` | `components/admin/context-panel.tsx` | right-panel container + ordered sections | every module |
| `SummaryList` | same | label→value summary | every module |
| `ContextLink` | same | deep link (e.g. Audit Log) | every module |
| `RelatedChips` | same | linked-entity chips to other workbenches | every module |
| `adminWb` i18n | `i18n/messages/admin-workbench.ts` | generic ar/en labels (tabs, sections) | every module |

Plus existing primitives reused unchanged: `Card`, `Button`, `Badge`, `Input`, `Label`, `Select`, lucide icons, `toast`, `useI18n`. Authz modules additionally reuse `TriStateOverrideRow`/`ReasonModal`/`EffectivePermissionsDiff` from the overrides consoles.

---

## 3. Screenshots — capture points (live preview)

Authenticated screenshots cannot be captured from this environment. The screen is live on the **kako PR-#319 preview** → `/settings/users`. Capture these states:

1. **Default (nothing selected):** left user list + search + "New user"; center placeholder "Select an item…"; (no right panel until selection).
2. **User selected — Profile tab:** left list with the row highlighted; center header (avatar, name, email, Super-admin/Active badges, the two toggle actions); Identity + Status section cards; right Summary/Audit/Related.
3. **User selected — Roles & Branches tab:** assignments as removable chips + the assign form (branch/role/reports-to). URL shows `?id=…&tab=roles`.
4. **Quick create open:** inline create form in the left panel.
5. **Tablet width (~1024px):** two panels; the **Context** button opens the right drawer.
6. **Mobile width (~390px):** single column; list → detail; context via drawer.

(Each is a deterministic state reachable by URL, so screenshots are reproducible.)

---

## 4. Migration plan for the remaining admin modules

Each module becomes an `AdminWorkbench` configuration — **re-slot existing forms/actions, change no logic**. Pattern per module: map its list → `EntityListPanel`, split its long page into center **tabs of `SectionCard`s**, and surface Summary/Audit/Related on the right.

| Module | Today | Left list | Center tabs | Right context | Effort | Risk |
|--------|-------|-----------|-------------|---------------|--------|------|
| **Roles** | `/settings/authz`, `/permissions`, `/role-overrides` | roles | Permissions matrix · Role Overrides · Data scope · Members | Summary · Audit · Related (members) | M | Low (reuses overrides consoles) |
| **Companies** | `/platform/companies` | companies | Profile · Plan & Entitlements · Branches · Settings | Summary · Activity · Audit · Related | M | Low |
| **Branches** | `/settings/branches`, `/regions` | branches | Details · Hierarchy · Members · Config | Summary · Audit · Related (region) | S | Low |
| **Features** | `/settings/features`, `/entitlements` | features | Toggle · Templates · Per-company | Summary · Dependencies · Audit | S | Low |
| **Integrations** | `/settings/integrations`, `/integration-hub`, `…/api-keys`/`webhooks`/`sync` | connections | Config · Webhooks · Sync · Logs | Health · Last run · Audit | M | Med (more sub-routes) |
| **Settings** | `/settings/*` (finance, numbering, returns, …) | setting groups | Form sections | Audit · Related | M (breadth) | Low |

**Shared step (once):** an optional `loadEntityAudit(entity, id)` read helper so every right panel can show a live recent-activity list (currently a deep link) — read-only, reuses `erp_audit_logs`.

**Suggested order (lowest risk → highest leverage):** Branches → Features → Companies → Roles (folds in UAO + Role Overrides tabs) → Settings → Integrations. Final order is your call.

---

## 5. Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Full unit/component suite | ✅ 1592 passed / 192 skipped |
| i18n (parity + key-usage) | ✅ passed (new `adminWb` namespace, ar/en identical) |
| Production build | ✅ green (`/settings/users` compiled) |
| Business logic / actions | ✅ unchanged (same `createUser`/`assignBranch`/`removeAssignment`/`setUserFlags`) |
| Permissions / RLS / workflow | ✅ untouched |

---

## 6. Next

Approve the migration order (Section 4) and I'll migrate the next module onto the workbench — same pattern, no logic change — then iterate. Phase 1 is on the preview for your UX review now.

Commit `59740a1` on `claude/pilot-ux` (PR #319).
