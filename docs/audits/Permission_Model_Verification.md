# Permission Model Verification — Audit Report

### Role permissions · user overrides · menu/action overrides · resolution order

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Audit only — *no implementation.*

Grounded in a direct read of the codebase (tables, server actions, UI screens, and the `getUserContext` resolution logic). Each capability is classified **Implemented / Partially Implemented / Backend Only / UI Missing / Not Implemented**.

---

## Status summary

| # | Capability | Status |
|---|-----------|--------|
| 1 | Role-based permissions | ✅ **Implemented** |
| 2 | User-level permission overrides (UAO) | ✅ **Implemented** (bounded to a 6-permission allowlist) |
| 3 | User-specific menu visibility overrides | ❌ **Not Implemented** |
| 4 | User-specific action overrides | 🟡 **Partially Implemented** (per-company only, not per-user) |
| 5 | Effective permission resolution order | ✅ **Implemented** |

---

## 1. Role-based permissions — Implemented

- **Tables:** `erp_role_permissions` (global defaults, migration 0017) · `erp_company_role_permissions` (per-company overrides, 0021) · `erp_company_roles` (enable/disable roles per company).
- **Difference:** company-scoped overrides the global default, so a tenant's role can differ from the platform default.
- **Resolution** (`src/lib/erp/auth-context.ts` ~112–159): if the company has `erp_company_roles`, the company's `erp_company_role_permissions` is authoritative; otherwise fall back to global `erp_role_permissions`. `permissions` = union across the user's roles.
- **Enforcement:** `hasPermission(ctx, perm)` (`src/lib/erp/permissions.ts`) → `isSuperAdmin || isPlatformOwner || ctx.permissions.includes(perm)`.
- **UI:** `/settings/authz` → **Roles** tab (RolesWorkbench): capability matrix + members; platform-owner edits role↔permission maps (RLS-enforced).

## 2. User-level permission overrides (UAO) — Implemented (bounded)

- **Tables:** `erp_temporary_access_grants` with `kind='override'` (user_id, grant_key, effect grant|revoke, effective window; NULL window = permanent), migration 0346 · `erp_delegable_permissions` (allowlist).
- **Server:** `src/lib/erp/access-overrides-server.ts` (loaders) · `src/app/(app)/settings/access-overrides/actions.ts` (setUserAccessOverride / clear / reset / clone). Reason mandatory + audited.
- **Enforcement** (`getUserContext` ~245–290): flag `KAKO_USER_ACCESS_OVERRIDES` **AND** per-company entitlement (`erp_company_entitlements` `feature_key='platform.user_access_overrides'`); then `applyAccessOverrides(permissions, …)` adds grants / removes revokes.
- **UI:** `/settings/access-overrides` console (search user → grant/revoke on delegable ops; shows role baseline ✓/✗ + diff; clone to many) + a tab embedded in the authz workbench.
- **Boundary (critical):** only the **delegable operational allowlist** can be overridden —
  `customer.request · stock_request.create · cash.handover.request · day.reopen.request · returns.create · sales.discount`.
  An immutable **deny-list** (platform.* / security.* / rls.* / treasury.* / accounting.post / integrations.manage / settings.users / super.admin) can never be delegated.

## 3. User-specific menu visibility overrides — Not Implemented

- Nav visibility is derived **only** from permission (`perm`), module, feature-flag, and rank (`navigation.ts`).
- `nav-profiles.ts` provides **role-wide** curated views (Primary vs More) — a *relevance* layer, **not** access control and **not** per-user.
- There is **no mechanism** for an admin to show/hide a specific nav item for a specific user. No table, no API, no UI.

## 4. User-specific action overrides — Partially Implemented (company-scoped)

- **Table:** `erp_action_policies` keyed by **`company_id`** (+ action_key), migration 0272 — NOT `user_id`.
- **Catalog:** `critical-actions-catalog.ts` (22+ critical actions: requiredPermission, risk, reasonRequired, approvalRequired, reversalPolicy…). Resolver `action-policy.ts` returns the most-recent effective company policy over the catalog default.
- **UI:** `/settings/authz` → **Action Policies** tab (per-company: risk / reason / approval / reversal / notify / escalation, effective-dated).
- **Gap:** action governance is **per-company**, applied uniformly to everyone holding the permission. There is **no per-user** action grant/deny (per-user differentiation only happens via UAO permission overrides, within the allowlist).

## 5. Effective permission resolution order — Implemented

`getUserContext` (`auth-context.ts` ~112–290):

```
0. Super-admin            → ALL_PERMISSIONS (skips all lower layers)
1. Base role perms        → company-scoped (erp_company_role_permissions) if the
                            company has role config, else global (erp_role_permissions);
                            union across the user's roles
1.5 Fashion umbrella      (fashion.manage → granular fashion.*)
2. Temp grants            kind='temporary'     [KAKO_TEMP_ACCESS_ENFORCEMENT]  grant-only
2.5 Role overrides        kind='role_override' [KAKO_ROLE_PERMISSION_OVERRIDES + entitlement]
3. User overrides         kind='override'      [KAKO_USER_ACCESS_OVERRIDES + entitlement]  ← LAST
```

- **User-level wins** (applied last). Grants add; revokes remove. Steps 2.5 & 3 are bounded to the delegable allowlist.
- All three override layers are flag-gated (default OFF) and the override layers additionally require per-company entitlement.

---

## Concrete test case — your example

> Role = Salesman · User A: **Return Approval** (`returns.approve`) · User B: **Customer Balance** (`customers.view_balance`)

**The per-user override mechanism exists, is enforced (resolution step 3), and has a UI — but it is bounded to the 6-permission operational allowlist, and neither example is in it:**

| Permission | In delegable allowlist? | Per-user grant possible today? |
|---|---|---|
| `returns.approve` | ❌ No (privileged approval perm) | **No** |
| `customers.view_balance` | ❌ No | **No** |
| `returns.create` | ✅ Yes | Yes (enforced) |
| `sales.discount` | ✅ Yes | Yes (enforced) |

So your exact A/B example is **not configurable today** — by design (you previously directed *"do not expand the allowlist,"* and an immutable deny-list bounds delegation). Granting those two would require a **separately-approved allowlist expansion**, which is a deliberate security decision, not a bug.

---

## What would be needed (for a future, separately-approved decision — not now)

| To enable | Change |
|---|---|
| Per-user `returns.approve` / `customers.view_balance` | Expand `DELEGABLE_OPERATIONAL_PERMISSIONS` (governance review; some are intentionally privileged) |
| Per-user **menu** visibility | New capability — table + resolver in nav + UI (does not exist today) |
| Per-user **action** overrides | Extend `erp_action_policies` (or a new table) with a user scope + resolver + UI |

---

## Files reference

- Resolution/enforcement: `src/lib/erp/auth-context.ts`, `src/lib/erp/permissions.ts`
- Roles: `supabase/migrations/0017_*`, `0021_*`; UI `settings/authz/roles-workbench.tsx`
- UAO: `supabase/migrations/0346_*`, `access-overrides-server.ts`, `settings/access-overrides/*`
- Role overrides: `0347_*`, `role-overrides-server.ts`, `settings/role-overrides/*`
- Governance/allowlist: `src/lib/role-governance/index.ts`, `security.ts`
- Nav: `src/lib/erp/navigation.ts`, `nav-profiles.ts`
- Action policies: `0272_action_policies.sql`, `action-policy.ts`, `critical-actions-catalog.ts`

**Audit only — nothing implemented.**
