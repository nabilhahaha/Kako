# User Permission Overrides — Architecture & Security Design

A second capability, **distinct from the Workspace Designer**. The Workspace Designer is presentation-only and *never* grants access. **User Permission Overrides (UPO)** is the opposite kind of feature: it **does** change a user's effective permissions — granting or removing a specific permission for a specific user, on top of their role. Because it is a real authorization change, it is designed defense-in-depth and tightly bounded.

> **Hard separation (must stay separate):** Workspace Designer = *what you see*. UPO = *what you may do*. They share no tables and no resolution path. A workspace "hide" never removes a permission; a UPO "revoke" never just hides a tile.

---

## 1. Goal & examples

A Company Admin can, **for one user**:
- **Grant** a permission the user's role lacks — e.g. `customer.request` to a single salesman; `cash.handover.request` to selected users.
- **Revoke** a permission the user's role normally has — e.g. remove `returns.approve` from one supervisor.

Bounded by two platform-owner-defined gates so a Company Admin can never escalate into platform, security, RLS, or system-administration territory.

---

## 2. Architecture proposal

### 2.1 Two control sets owned by the Platform Owner

1. **Delegable allowlist (positive gate).** The explicit set of permissions a Company Admin is *allowed* to grant/revoke. Nothing outside this set is touchable. Platform-owner-managed.
2. **Non-delegable deny-list (negative gate, code constant).** A hardcoded, immutable-by-config set of permission *classes* that may **never** be delegated — even if mistakenly added to the allowlist. This is the belt to the allowlist's suspenders.

The effective delegable set is always `allowlist − denylist`. The deny-list wins unconditionally.

### 2.2 Schema changes

**Platform-owner allowlist** (global default; optional per-company narrowing):
```
erp_delegable_permissions (
  id          uuid pk,
  permission  text not null,          -- a Permission union member
  enabled     boolean not null default true,
  company_id  uuid null references erp_companies(id) on delete cascade,
                                       -- null = global default; row = per-company override
  updated_by  uuid, updated_at timestamptz not null default now(),
  unique (coalesce(company_id,'00000000-...'), permission)
)
-- Platform-owner / super-admin WRITE only (RLS).
```

**User-level permission overrides:**
```
erp_user_permission_overrides (
  id          uuid pk,
  company_id  uuid not null references erp_companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  permission  text not null,                 -- a Permission union member
  effect      text not null check (effect in ('grant','revoke')),
  reason      text,                           -- mandatory in the action layer
  granted_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id, permission)    -- one decision per (user, permission); no grant/revoke conflict possible
)
-- index (company_id, user_id)
```

The `unique (company_id, user_id, permission)` constraint makes a row a **single signed decision** — there is never a simultaneous grant *and* revoke for the same pair, so no conflict-resolution ambiguity.

**Platform-owner per-company enablement** (reuse the entitlements engine, like RWD's user layer):
- Company entitlement feature key **`platform.user_permission_overrides`** in `erp_company_entitlements` (platform-owner-write-only). UPO is inert for any company without it.

### 2.3 The non-delegable deny-list (code constant)

A test-enforced constant — `NON_DELEGABLE_PERMISSIONS` — covering the four forbidden classes in requirement 5. Conceptually:

| Class | Examples (never delegable) |
|-------|----------------------------|
| Platform Owner | every `platform.*` owner-scoped capability; anything gated by `erp_is_platform_owner()` / super-admin |
| Security | `settings.users` (role assignment), the authz-console capabilities, **the UPO delegation-management permission itself**, custom-field/governance security toggles |
| RLS-related | any permission whose effect is tenant isolation / cross-company visibility |
| System administration | super-admin, `integrations.manage` (connector credentials / data egress), company-wide security settings |
| Frozen-baseline (recommended add) | `accounting.post` and treasury posting permissions — excluded by default to protect the posting/treasury baseline |

The deny-list is enforced at **four** layers (see §4). Adding a deny-listed permission to the allowlist is itself rejected.

---

## 3. Resolution order

UPO plugs into the existing permission resolver (`resolveUserContext` in `auth-context.ts`), **after** role resolution and **before** `ctx.permissions` is frozen:

```
# Existing, unchanged: role → company role overrides → base permission set
base = resolveRolePermissions(user, company)          # today's logic

# NEW: apply user overrides, re-validated against the gates at resolution time
delegable = allowlist(company) MINUS NON_DELEGABLE     # recomputed every resolve

grants  = overrides.where(effect='grant'  AND permission ∈ delegable)
revokes = overrides.where(effect='revoke' AND permission ∈ delegable)

effective = (base UNION grants.permissions) MINUS revokes.permissions

ctx.permissions = effective
```

Order, stated plainly: **role permissions → user grants (add) → user revokes (remove) → effective set.** Then everything downstream is unchanged — `hasPermission(ctx, …)`, module entitlements, feature flags, and RLS all consume `ctx.permissions` exactly as today.

Three critical properties:
- **Re-validation at resolution.** Grants/revokes are filtered by `delegable` *every time* permissions are resolved. If the platform owner later removes a permission from the allowlist (or it hits the deny-list), any stored grant for it **stops taking effect immediately** — stored rows are never trusted blindly.
- **Defense in depth with entitlements/flags.** A granted permission still only *shows* a feature if that feature's module entitlement and feature flag also pass — UPO grants a permission, not an entitlement or a flag.
- **RLS unchanged.** UPO changes which `Permission` strings a user holds; it does **not** alter any RLS policy, `erp_is_*` function, or tenant scoping. Cross-tenant isolation is untouched.

### 3.1 Combined picture with the Workspace Designer
```
UPO:    role perms → +grants → −revokes            ⇒  effective PERMISSIONS
Gates:  effective perms ∩ module ∩ flag ∩ entitlement ⇒ ENTITLED items
RWD:    role-default overlay → user overlay         ⇒  VISIBLE items
```
UPO decides *entitlement*; RWD only curates *visibility* within it. They compose cleanly and never substitute for each other.

---

## 4. Security model

UPO is a real authorization change, so the guards are layered and redundant.

1. **Positive gate (allowlist).** Only permissions the Platform Owner marked delegable can be written or take effect.
2. **Negative gate (deny-list).** A code constant rejects the forbidden classes unconditionally — enforced at: (a) the allowlist-edit action (can't even mark them delegable), (b) the Company-Admin grant action, (c) a DB `CHECK`/trigger on `erp_user_permission_overrides`, and (d) the resolution filter. Four independent layers; any one suffices.
3. **Platform-owner enablement.** UPO is inert unless the company holds `platform.user_permission_overrides` (owner-write-only entitlement).
4. **No self-escalation of the power itself.** The UPO delegation-management permission is on the deny-list, so a Company Admin can never grant themselves or anyone else the ability to widen delegation.
5. **"Cannot grant what you do not hold" (defense in depth).** The grant action additionally requires the acting admin to currently hold the permission being granted (mirrors the platform-staff escalation guarantee). For an `admin` role (which holds all) this rarely binds, but it blocks a future narrowed admin from minting permissions above itself.
6. **RLS confinement.** `erp_user_permission_overrides` is writable only by the company's own admin / platform owner / super admin, scoped to `company_id`; the allowlist is owner-write-only.
7. **Mandatory reason + full audit** (see §5) on every grant/revoke.
8. **Frozen baselines respected.** The authorization model is *extended additively*, not replaced; role permissions remain the default; treasury/posting permissions are deny-listed by default; no RLS, hierarchy, or posting logic changes.

### 4.1 Security proof sketch
- **Bound:** `effective ⊆ base ∪ delegable`, and `delegable ∩ NON_DELEGABLE = ∅` by construction. Therefore no override can ever introduce a platform/security/RLS/system-admin permission. ∎
- **Monotonic safety of revoke:** removing a permission cannot grant access. ∎
- **No power amplification:** the delegation-management permission ∈ deny-list ⇒ a Company Admin cannot expand the delegable set. Only the Platform Owner can, via owner-only tables. ∎
- **Liveness of withdrawal:** because resolution recomputes `delegable` each time, revoking delegability at the platform level instantly neutralizes outstanding grants without a data migration. ∎

---

## 5. Audit logging design

Every mutation is audited via the existing audit trail (same pipeline as `setCompanyCapability` / billing):

| Event | Logged fields |
|-------|---------------|
| `upo.grant` | actor, company, target user, permission, **reason**, prior state, timestamp |
| `upo.revoke` | actor, company, target user, permission, **reason**, prior state, timestamp |
| `upo.reset` | actor, company, target user, permissions cleared (list), timestamp |
| `upo.allowlist.change` | platform-owner actor, permission, enabled→, company scope (global/per-company) |
| `upo.entitlement.toggle` | platform-owner actor, company, on/off (via entitlements audit) |
| `upo.override.ignored` (security signal) | at resolution, when a stored override is dropped because it left the delegable set — surfaced to the platform audit/anomaly view |

`reason` is **mandatory** in the action layer for grant/revoke. Audit is queryable per company, per target user, and per permission, so "who gave Salesman A `customer.request`, when, and why" is always answerable. Reports: an "effective permissions diff" per user (role baseline vs effective) for compliance review.

---

## 6. Risk assessment

UPO is **higher-risk than the Workspace Designer** because it modifies real authorization. Treated accordingly.

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Privilege escalation via incomplete deny-list** | **High** | Deny-list is a test-enforced code constant covering platform/security/RLS/system-admin + the delegation permission itself; four enforcement layers; conservative default allowlist (operational request perms only); mandatory security review before GA. |
| **Allowlist drift / over-broad delegation** | Med–High | Platform-owner-only; global default is minimal; per-company narrowing; resolution re-validates each grant; `upo.allowlist.change` audited. |
| **Bypassing approval workflows** (e.g. granting an approval permission directly) | Med | Approval-type permissions delegable only if the Platform Owner opts them in; recommend keeping `*.approve` perms allowlisted case-by-case; audit + effective-permissions diff for review. |
| **Treasury/posting exposure** | Med | `accounting.post` + treasury posting perms deny-listed by default; require an explicit, separately-reviewed decision to ever delegate. |
| **Confusion with Workspace hide/show** | Med | Separate tables, separate UI section, explicit copy: "Permission overrides change what a user *can do*; Workspace overrides change what they *see*." |
| **Auditability gaps** | Med | Mandatory reason; full event set incl. resolution-time ignores; per-user effective diff. |
| **Stale grants after role/permission model changes** | Low–Med | Resolution recomputes against current allowlist/deny-list each time; no trust in stored rows. |
| **Performance** (extra read in the hot auth path) | Low | One indexed read by `(company_id,user_id)`; cached in the request-scoped context alongside existing permission resolution. |
| **RLS / isolation regression** | Low (by design) | UPO never touches RLS or `erp_is_*`; changes only the `Permission` string set; schema-health + RLS tests guard. |

---

## 7. Rollout recommendation

**Separate initiative from the Workspace Designer; post-pilot; Priority High; sequenced *after* the Workspace Designer role-level lands; gated behind a mandatory security review.**

Rationale:
- It is **security-sensitive** — it should not be rushed into the pilot window. Pilot continues on the fixed role model.
- It **benefits from RWD's groundwork** (the surface registry, the per-company override pattern, the entitlement-gating pattern, the Authz console UI shell) — building it after RWD reduces net effort and keeps patterns consistent.
- It needs a **dedicated security sign-off** (deny-list completeness, escalation tests) that the presentation-only RWD does not.

### Phases

| Phase | Scope | Complexity | Risk | Depends on | Effort |
|-------|-------|-----------|------|-----------|--------|
| **U0** | Delegability metadata on the `Permission` catalog + `NON_DELEGABLE_PERMISSIONS` constant + tests asserting forbidden classes are never delegable | Low–Med | Low | — | ~2–3 d |
| **U1** | `erp_delegable_permissions` + platform-owner allowlist UI (`/platform/...`) + RLS | Med | Med | U0 | ~3–4 d |
| **U2** | `erp_user_permission_overrides` + `platform.user_permission_overrides` entitlement + resolver integration (default-off) + DB CHECK/trigger + escalation guard + audit | Med–High | **High** | U1 | ~4–6 d |
| **U3** | Company-Admin UI: per-user grant/revoke with mandatory reason, locked non-delegable rows, "reset overrides", effective-permissions diff | Med–High | Med | U2 | ~5–7 d |
| **U-SR** | **Security review gate** (deny-list completeness, escalation/abuse tests, audit verification) before GA | — | — | U2–U3 | ~1–2 d |

**Total: ~15–22 engineer-days**, plus the security-review gate.

### Sequence vs the Workspace Designer
- **Post-pilot Phase 1:** Workspace Designer role-level (presentation; low risk).
- **Post-pilot Phase 2:** **User Permission Overrides (this doc)** + Workspace Designer user-level — the two "per-user" capabilities, delivered together, each behind its own platform-owner entitlement and (for UPO) a security review.

**One-line recommendation:** approve the design; build it **after** the Workspace Designer role-level, as a **post-pilot Phase 2** initiative, **default-off** per company, bounded by a **platform-owner allowlist + immutable deny-list**, and **shipped only through a security-review gate**. No build yet.
