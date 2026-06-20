# Role Configuration Audit & Role Workspace Designer Proposal

This document audits what a **Company Admin** can control about a role's experience today across four surfaces — menu items, request types, dashboard widgets, and quick actions — and proposes the smallest architecture to support a future **Role Workspace Designer** without duplicating or replacing the existing permission systems.

---

## 1. Executive summary

| # | Question | Company-Admin control today | Mechanism |
|---|----------|------------------------------|-----------|
| 1 | Which menu items appear for a role | Indirect / partial | Permissions + module entitlements + feature flags; the nav list itself is hardcoded |
| 2 | Which request types appear for a role | Indirect / partial (mostly no) | Per-type permission + one all-or-nothing feature flag; key request perms are Platform-Owner-only |
| 3 | Which dashboard widgets appear for a role | No | Hardcoded per page; feature-flag visibility only |
| 4 | Which quick actions appear for a role | No | Hardcoded arrays; permission/flag gated; no admin UI |

There is **no per-role workspace control surface** today. A Company Admin influences what a role sees only transitively, through three pre-existing systems: **permissions**, **feature flags**, and **module entitlements**. Visibility everywhere is decided by `permissions ∩ module-entitlement ∩ feature-flag`, evaluated against **hardcoded** item lists.

---

## 2. Surface-by-surface findings

### 2.1 Menu items — `NAV_SECTIONS` (`src/lib/erp/navigation.ts`)

- **Hardcoded:** the item list itself — every entry, route, icon, and gate is a literal in `NAV_SECTIONS` / `BOTTOM_NAV_TABS`. Adding, removing, or reordering an item is a **code change**.
- **Controlled by permissions:** each item's `perm` gate (`Permission | Permission[]`). A role sees an item only if its resolved permissions intersect.
- **Controlled by feature flags:** items with a `flag` (e.g. `platform.salesman_requests`).
- **Controlled by module entitlements:** items with a `module` gate (e.g. `warehousing`, `distribution`).
- **Company-Admin reach:** can flip feature flags (`/settings/features`) and the 8 deny-all capabilities + scope/limits in the Authz console (`/settings/authz`), which shifts a role's permission set and therefore its visible items. Cannot say "hide item X for role Y" directly.

### 2.2 Request types — hub `/field/van-sales/requests`

- **Hardcoded:** the hub composition and which permission gates each type.
- **Controlled by permissions (per type):** `stock_request.create` (Load), `cash.handover.request` (Cash handover), `day.reopen.request` (Reopen), `customer.request` (Customer). See `requests/page.tsx` lines 44–48.
- **Controlled by feature flag:** the whole hub is gated by `platform.salesman_requests` (plus `field.sales` and Van-Sales-active).
- **Company-Admin reach:** can toggle the flag (all-or-nothing) but cannot per-role choose request types — those four `*.request` / `*.create` permissions are base role permissions editable only by the Platform Owner (`/platform/roles`); they are not among the 8 deny-all capabilities a Company Admin can edit.

### 2.3 Dashboard widgets — `/dashboard`, `/pharmacy/dashboard`, `/today`

- **Hardcoded:** KPI cards, stat tiles, recent lists — literal arrays / JSX in each page. No widget registry, no IDs, no drag/drop, no per-user state.
- **Controlled by permissions:** some tiles (e.g. the electrical pack via `hasPermission(ctx,'electrical.rma')`).
- **Controlled by feature flags:** tile visibility (`stockMovementReportEnabled`, `dailySummaryEnabled`, `dayCloseApprovalEnabled`).
- **Company-Admin reach:** none beyond flipping those flags. Note: "Dashboard Assignment" was explicitly held / not built in the earlier completion audit — this confirms it.

### 2.4 Quick actions — topbar `+` menu (`layout.tsx`); `/dashboard` and `/today` quick links

- **Hardcoded:** inline arrays built server-side.
- **Controlled by permissions + feature flags + module:** each entry is gated (e.g. the `fieldRequests` `+` entry needs the flag + Van-Sales + `field.sales`).
- **Company-Admin reach:** none — no UI to add, remove, reorder, or scope quick actions.

---

## 3. The three real control systems (and their owners)

| System | Storage | Who edits | UI |
|--------|---------|-----------|----|
| Role to permission grants | `erp_role_permissions` (global) then `erp_company_role_permissions` (company override); seeded from the hardcoded `ROLE_PERMISSIONS` map | Platform Owner (full); Company Admin limited to 8 deny-all capabilities + scope + limits | `/platform/roles` (owner), `/settings/authz` (admin) |
| Feature flags (61 features) | `erp_feature_flags` (company-scoped); default = Lite preset | Company Admin | `/settings/features` |
| Module / feature entitlements | `erp_company_entitlements` | Modules: Platform Owner; features within entitled modules: Company Admin | `/platform/entitlements/<co>`, `/settings/entitlements` |

### 3.1 What is configurable today (no code change)

- Feature flags — enable/disable 61 features via individual toggles or Lite/Standard/Enterprise templates (Company Admin).
- Feature-level entitlements — within modules already entitled to the company (Company Admin).
- The 8 deny-all capabilities + scope + limits per role (Company Admin, via the Authz console).

### 3.2 What requires code changes

- The nav item list, dashboard widget composition, and quick-action arrays (all hardcoded).
- Adding a new request type to the hub.
- Any reorder / show-hide of an individual surface item per role.

### 3.3 What is controlled by permissions

- Menu-item visibility (`perm` gates), request-type visibility (`*.request` / `*.create`), some dashboard tiles, and quick-action gating.

### 3.4 What is controlled by feature flags

- The Requests hub (`platform.salesman_requests`), several dashboard tiles, and module-gated nav sections.

### 3.5 What is hardcoded

- All item lists themselves: `NAV_SECTIONS`, dashboard widgets, quick-action arrays, and the hub composition.

**Bottom line:** a Company Admin can only move two of the three dials (flags, and a narrow slice of permissions) — never the item lists, and never a true per-role "show this / hide that, in this order."

---

## 4. Proposed architecture — Role Workspace Designer (smallest viable)

**Design principle — additive overlay, never a new authority.** The Designer is a presentation / curation layer that can only **hide and reorder items a role is already entitled to see**. It can never reveal anything the permission / flag / entitlement gates forbid. This is what keeps it from duplicating or replacing the permission system: it is strictly intersect-and-subtract on top of the existing gates, and the frozen rule **"hiding is not deauthorizing"** holds — server routes keep enforcing permissions regardless of the overlay.

### 4.1 Four pieces (three reuse existing patterns; only one is genuinely new)

**1. A surface registry (the only new structure, and it is just a catalog).** Give every workspace item a stable ID and consolidate today's scattered definitions into one declarative catalog, carrying the gate metadata that already exists:

- Nav: `NAV_SECTIONS` already has items plus `perm` / `module` / `flag` — just add stable `id`s.
- Dashboard widgets and quick actions: currently anonymous inline arrays — extract into a small registry beside the nav, each with an `id` plus its existing gate.
- Request types: already enumerated by permission in the hub — register the four IDs.

No new permission concepts — it reuses `Permission`, `module`, and the feature catalog.

**2. One company-scoped override table** (mirrors the proven `erp_company_role_permissions` / `erp_feature_flags` pattern):

```
erp_role_workspace(
  company_id, role_key, surface,   -- 'nav' | 'widget' | 'quick_action' | 'request_type'
  item_id, visible boolean, sort_order int,
  updated_by, updated_at,
  unique(company_id, role_key, surface, item_id)
)
```

- No row = code default (visible, natural order) — fully backward compatible.
- RLS: copy the `erp_feature_flags` policy verbatim: `erp_is_platform_owner() OR erp_is_super_admin() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))`.

**3. A resolution overlay** (one pure function, applied last):

```
resolveSurface(items, ctx, flags, overrides):
  entitled = items.filter(gate)        // EXISTING logic — unchanged, authoritative
  return entitled
    .filter(i => overrides[i.id]?.visible !== false)   // subtract only
    .sort(byOverrideThenDefault)                       // reorder only
```

Plugs into the existing nav / dashboard / quick-action builders. Cannot add items, so the security surface is provably unchanged.

**4. One admin page `/settings/workspace`** (reuses the Authz console shell). Pick a role, see its entitled surfaces grouped (Menu / Widgets / Quick actions / Request types), toggle visibility and drag to reorder. Reuses the role-picker, the server-action shape, and the existing audit-log helper.

### 4.2 Why this is the smallest non-duplicating option

- **Reuses:** the company-scoped-override pattern, `NAV_SECTIONS` / feature-catalog metadata, the RLS policy shape, the Authz UI shell, and audit logging. The only net-new artifacts are one table, one function, one page, and stable IDs.
- **Does not replace permissions:** the overlay is non-authoritative and intersected with the existing gates; permissions / flags / entitlements remain the single source of truth for "may access."
- **Does not duplicate flags / entitlements:** it operates on presentation order / visibility within entitlement — a dimension none of the three current systems own.

### 4.3 Suggested phasing (each independently shippable, low blast radius)

- **Phase 0 (no DB):** add stable IDs and extract widgets / quick actions into the registry. Pure refactor, no behavior change.
- **Phase 1:** table + overlay for nav only (lowest risk, highest visible value).
- **Phase 2:** extend the overlay to dashboard widgets, quick actions, and request types.
- **Phase 3:** the `/settings/workspace` admin UI.

### 4.4 Two guardrails to honor the frozen baselines

1. **Visibility is cosmetic, not security** — every hidden route must still enforce its permission server-side (already true). The Designer must never be used as an access control.
2. **Keep it subtractive** — the schema deliberately has no grant / add path, so it can never become a shadow permission system.

---

## 5. Status

This is an audit and proposal only — no code or schema was changed to produce it. The only code change in the related work session was the previously approved nav relabel that surfaces the Field Requests hub as a first-class "الطلبات" sidebar entry.
