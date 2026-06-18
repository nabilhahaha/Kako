# Permission Override — Practical Demonstration (pre-P5)

### Roles · User Access Overrides · resolution order · UI path · live grant/revoke

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Documentation & demonstration only — *no implementation.*

A hands-on walkthrough of the permission engine, the actual UI navigation path, and worked grant/revoke examples **within the current bounded allowlist**. This is the recorded pre-P5 gate (roadmap backlog item 4).

---

## 1. Role permissions (the baseline)

- **Source of truth:** a user's role(s) → permissions, resolved in `getUserContext`:
  - If the company has its own role config (`erp_company_roles`): use `erp_company_role_permissions` (company-authoritative).
  - Otherwise: global defaults (`erp_role_permissions`).
  - `permissions` = union across the user's roles.
- **Example — Salesman baseline** (typical): `sales.sell · sales.collect · inventory.view · field.sales · customer.request · returns.create · stock_request.create · …` — and **NOT** `returns.approve`, **NOT** `customers.view_balance`.
- **Enforced by:** `hasPermission(ctx, perm)` → `isSuperAdmin || isPlatformOwner || ctx.permissions.includes(perm)`.
- **Where to see/edit:** **Settings → People & Roles → Roles & Permissions** (`/settings/authz`, *Roles* tab) — the capability matrix per role.

---

## 2. User Access Overrides (per-user, on top of the role)

- **What:** a Company Admin grants or revokes a **single operational permission** for **one user**, on top of their role — bounded to the delegable allowlist.
- **Bounded allowlist** (`DELEGABLE_OPERATIONAL_PERMISSIONS`, the ONLY perms that can be overridden):
  `customer.request · stock_request.create · cash.handover.request · day.reopen.request · returns.create · sales.discount`
- **Immutable deny-list** (can NEVER be delegated, even if mis-added): `platform.* · security.* · rls.* · treasury.* · super.admin · integrations.manage · accounting.post · settings.users`.
- **Storage:** `erp_temporary_access_grants` with `kind='override'` (user_id, grant_key, `effect` grant|revoke, optional effective window; NULL window = permanent).
- **Gated by:** flag `KAKO_USER_ACCESS_OVERRIDES` **AND** per-company entitlement (`erp_company_entitlements`, `feature_key='platform.user_access_overrides'`). *(Both are currently ON in this environment — UAO was activated platform-wide and all companies entitled.)*
- **Safeguards:** every write is `requireCompanyAdmin()`-gated, a **reason is mandatory** (`reason_required` otherwise), and **every mutation is audited**.

---

## 3. Effective permission resolution order (who wins)

From `getUserContext` (auth-context.ts):

```
0. Super-admin                → ALL_PERMISSIONS (skips everything)
1. Base role permissions      → company-scoped or global; union of roles
1.5 Fashion umbrella          (fashion.manage → granular fashion.*)
2. Temporary grants           kind='temporary'     [KAKO_TEMP_ACCESS_ENFORCEMENT]  grant-only
2.5 Role overrides            kind='role_override' [KAKO_ROLE_PERMISSION_OVERRIDES + entitlement]
3. User Access Overrides      kind='override'      [KAKO_USER_ACCESS_OVERRIDES + entitlement]  ← LAST
```

- Steps 2.5 & 3 are bounded to the delegable allowlist; grants add, revokes remove.
- **User-level wins** — step 3 is applied last, so a user override beats the role and any role override.

---

## 4. Actual UI navigation path

Access Overrides is **not** a separate menu item — it lives inside the Roles & Permissions workbench (consolidated in M3-D):

```
Sidebar: Settings  (single link)
   └ Top grouping: People & Roles
       └ Roles & Permissions            → /settings/authz
           └ (RolesWorkbench) select a role, e.g. "Salesman"
               └ User Access Overrides view  (visible when UAO is enabled/entitled)
                   • search/select a user in that role
                   • see role baseline (✓ has / ✗ lacks) + the delegable operational rows
                   • Grant / Revoke per delegable permission (reason required)
                   • Clone one user's overrides to multiple users (one reason)
```

The console component is `AccessOverridesConsole` (embedded by `RolesWorkbench`); role-level overrides use `RoleOverridesConsole` in the same workbench.

**Capture points (preview, latest):** `…/settings/authz` → Roles tab → Salesman → User Access Overrides; toggle a grant and observe the effective-permission diff.

---

## 5. Live examples — grant / revoke within the allowlist

> Setup: Company Admin, UAO enabled + company entitled (current state). Role = **Salesman**.

### Example A — GRANT an extra operational permission to User A
- **Goal:** give *User A* `sales.discount` beyond the Salesman baseline (delegable ✓).
- **Steps:** Roles & Permissions → Salesman → User Access Overrides → find **User A** → **Grant** `sales.discount` → enter reason ("peak-season desk approver") → save.
- **Result:** `setUserAccessOverride(userId, 'sales.discount', 'grant', reason)` writes a `kind='override'` row; audited.
- **Effect (next request):** resolution step 3 adds `sales.discount` → `hasPermission(User A, 'sales.discount') === true`, while other Salesmen remain unchanged.

### Example B — REVOKE a baseline operational permission from User B
- **Goal:** remove `returns.create` from *User B* (it's in the Salesman baseline; delegable ✓ so it can be revoked).
- **Steps:** same path → **User B** → **Revoke** `returns.create` → reason ("under review") → save.
- **Result:** `setUserAccessOverride(userId, 'returns.create', 'revoke', reason)`.
- **Effect:** resolution step 3 removes `returns.create` → `hasPermission(User B, 'returns.create') === false`; User B differs from the rest of the role.

### Example C — Clear / reset
- **Clear one:** remove a single override → `clearUserAccessOverride(...)` → user reverts to role baseline for that permission.
- **Reset user:** `resetUserAccessOverrides(userId, reason)` → drops all overrides for the user.

### Example D — What is BLOCKED (by design)
- Attempting to grant `returns.approve` or `customers.view_balance` per-user: **not offered** — they are **not** in the delegable allowlist, so the console never lists them and the server (`isDelegableOperationalPermission`) would reject them. (Expanding this is roadmap item R-PM-3, security-review-gated.)
- Attempting anything on the deny-list (`treasury.* / settings.users / accounting.post / …`): permanently impossible (code + DB belt).

---

## 6. End-to-end verification (how to prove it live)

1. **Baseline:** sign in as User A (Salesman) → confirm an action requiring `sales.discount` is unavailable.
2. **Grant** (as admin, Example A) with a reason.
3. **Re-check:** User A's next request re-runs `getUserContext` → step 3 adds the grant → the action is now available **only for User A**.
4. **Audit:** the grant appears in the audit log with actor, target, permission, effect, and reason.
5. **Revoke/clear** → behaviour reverts; audited again.

---

## 7. Summary

| Aspect | State |
|--------|-------|
| Role permissions | ✅ company-scoped/global, enforced via `hasPermission` |
| User Access Overrides | ✅ per-user grant/revoke, **bounded** to 6 delegable operational perms, reason-required, audited |
| Resolution order | ✅ base → temp → role-override → **user-override (wins)** |
| UI path | Settings → People & Roles → **Roles & Permissions** → role → **User Access Overrides** |
| Live grant/revoke | ✅ within allowlist (Examples A–C); blocked outside it (Example D) |

**Demonstration only — no code changed.** On your review/approval, the next workstream is **P5 Customer Workbench**. CRM Evolution remains deferred.
