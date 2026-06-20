# Admin Workbench — Hardening Report, Component Inventory & Companies Migration

Covers the library-hardening pass and the Companies workbench migration (commits `2393ccb`, `d2c98cd`). UX standardization only — no business-logic, permission, RLS, workflow, or authorization changes. Validated: tsc clean · full suite 1592 passed · i18n parity ok · production build green.

---

## 1. Hardening report

Three improvements landed on the shared library so every workbench inherits them:

| # | Improvement | What changed | Result |
|---|-------------|--------------|--------|
| 1 | **Embedded mode for sub-consoles** | `RoleOverridesConsole` (when `lockedRoleKey`) and `AccessOverridesConsole` (new `embedded` prop) drop their redundant safety banner inside a workbench tab. | No duplicate chrome in the Roles → Role Overrides / User Access Overrides tabs. |
| 2 | **Live ActivityFeed** | New reusable `ActivityFeed` + read-only `loadEntityAudit(entityId, entities[])` server action (tenant-scoped, admin-gated `settings.users`, filters `erp_audit_logs`). Wired into the Users and Roles right panels. | The right-panel Audit is now a live per-entity feed (last 12), not a static deep link. Every future workbench gets it for free. |
| 3 | **EntityListPanel upgrades** | Keyboard navigation (↑/↓/Enter) with active-row highlight + scroll-into-view; type-ahead search; virtualization-readiness (fixed-height rows, capped render window of 200 + "refine search" hint). | Faster navigation; ready for the large Users/Companies lists; windowing can be dropped in without structural change. |

No behavior, permission, or data path changed — these are presentation/interaction only.

---

## 2. Updated reusable component inventory (`src/components/admin/`)

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `AdminWorkbench` + `useWorkbenchSelection` | 3-panel responsive shell; URL state `?id&tab`; right context → drawer below xl | stable |
| `EntityListPanel` | type-ahead search + filters slot + quick-create slot + **keyboard nav** + **virtualization-ready** list | hardened |
| `EntityHeader` / `EntityTabs` / `DetailPlaceholder` | center header (title/status/actions), URL-wired tabs, empty state | stable |
| `SectionCard` | titled config card (replaces long forms) | stable |
| `ContextPanel` / `ContextSection` / `SummaryList` / `ContextLink` / `RelatedChips` | right-panel container + ordered sections + summary/links/related | stable |
| `ActivityFeed` (+ `loadEntityAudit` action) | **live per-entity audit feed**, read-only, admin-gated | new |
| `adminWb` i18n (ar/en) | generic workbench labels | extended |

Module-side reuse (no duplication): `CapabilityMatrix`, `ScopePanel`, `LimitsPanel`, `SectionAccessPanel`, `RoleOverridesConsole` (with `lockedRoleKey`/embedded), `AccessOverridesConsole` (with `embedded`/filtered members), and the existing platform/company actions.

**Modules on the workbench now:** Users (Phase 1), Roles & Permissions (Phase 2), **Companies** (this pass).

---

## 3. Companies workbench (delivered)

`/platform/companies` is now a workbench (platform-owner gated, `view_companies`):
- **Left:** companies list (search, quick-create via `createCompany`).
- **Center tabs (selected company):**
  - **Profile** — identity (`updateCompany`), Active toggle (`setCompanyActive`), subscription end (`setSubscriptionEnd`).
  - **Plans** — plan selector (`setCompanyPlan`) + plan limits.
  - **Entitlements** — module toggles (`setCompanyModule`) with plan-lock indication.
  - **Branches** — branch list + add (`addBranch`).
- **Right:** summary (plan/branches/active) + live `ActivityFeed`.
- Per-company data loaded read-only via a platform-gated action; selection + tab URL-addressable; tablet drawer.

All tabs reuse the existing actions verbatim — no logic change. The detailed `/platform/companies/[id]` view remains intact for the deeper tabs (users/roles/permissions/packs/integrations/audit).

### Known limitations (consistent with Roles)
- Entitlements tab is a flat module toggle grid (mirrors the existing module logic); the richer "packs"/plan-pack UI stays on the `[id]` detail for now.
- Profile tab covers the common fields; advanced company settings (integrations, self-users, trial presets) remain on the `[id]` detail.
- Companies list loads up to 500 (virtualization-ready); server-side paging can be reintroduced if a tenant has more.

---

## 4. Companies migration plan (status + remaining)

| Tab | Reused | Status |
|-----|--------|--------|
| Profile | `updateCompany`, `setCompanyActive`, `setSubscriptionEnd` | ✅ done |
| Plans | `setCompanyPlan` + plans/limits | ✅ done |
| Entitlements | `setCompanyModule` + plan-lock map | ✅ done (flat grid) |
| Branches | `addBranch` + branch list | ✅ done |
| (Advanced) Users/Roles/Permissions/Packs/Integrations/Audit | existing `[id]` detail | preserved on the detail page; can be folded into workbench tabs in a follow-up |

**Recommended follow-ups (optional, non-blocking):** fold the `[id]` advanced tabs into the workbench by extracting the `[id]` data load into a shared loader and embedding `CompanyDetail` per tab; reintroduce server-side paging if company counts grow.

---

## 5. Remaining migration order (per your priority)

Companies done → next: **Features & Applications** → **Branches** → **Settings** → **Integrations**. Each is the same pattern: list + tabs-of-section-cards + context, reusing existing actions, no logic change. Branches may largely reuse the Companies "Branches" tab components.

---

## 6. Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Full suite | ✅ 1592 passed / 192 skipped |
| i18n parity + key-usage | ✅ passed |
| Production build | ✅ green (`/platform/companies` compiled) |
| Logic / permissions / RLS / workflow | ✅ unchanged |

Commits `2393ccb` (hardening) + `d2c98cd` (Companies) on `claude/pilot-ux` (PR #319) · live on the preview.
