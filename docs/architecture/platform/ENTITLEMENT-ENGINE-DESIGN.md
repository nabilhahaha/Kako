# Platform Module & Feature Entitlement Engine — design

**Status:** Design (phased implementation) · **Flag:** `KAKO_ENTITLEMENTS` (default OFF)

A platform-level, metadata-driven entitlement layer that controls **what each company,
module, feature, and user can access** — Platform Owner enables modules/engines per
company; Company Admins configure features **within their allowed scope**; user
permissions enforce everywhere. Built **additively on existing infrastructure** (it
formalizes and extends what's already there) and **never changes existing auth/RLS
behavior while the flag is OFF**.

---

## 1. Principles

1. **Metadata-driven** — modules, features, entitlements, and per-user overrides are data
   (global catalog + per-company rows), not hardcoded.
2. **Additive & reuse-first** — the platform already has `erp_company_modules`
   (per-company module enablement), `erp_plan_modules`/`erp_business_type_modules`,
   `erp_role_permissions` + `erp_company_role_permissions` (RBAC), the `Module` type, and
   `hasPermission`/`can`. The engine **formalizes** these into a catalog and **wraps** the
   permission check — it does not rewrite them.
3. **No change to existing auth/RLS while OFF** — the new gate is a separate wrapper
   (`hasEntitlement`/`hasPermissionWithEntitlement`); existing `hasPermission`, auth-context
   resolution, and RLS are untouched. Any change to the auth-context resolution path
   (e.g. applying user deny-overrides at login) is a **pause-for-approval** step.
4. **Two-key access** — a user reaches a capability only when **(a)** the company is
   entitled to the module/feature **and (b)** the user's permission allows it. A Company
   Admin can never grant above the company's entitlement.
5. **Auditable & flag-gated** — every enable/disable/grant/deny is audited; `KAKO_ENTITLEMENTS`
   default OFF; no tenant enabled without approval.

---

## 2. The three tiers

```
 Platform Owner  →  enables MODULES / ENGINES / PACKS per company + subscription limits
                    (erp_company_entitlements, set only by platform owner)
        │ bounds
        ▼
 Company Admin   →  configures FEATURES already allowed for the company; alert types,
                    approval flows, thresholds; manages role permissions IN-COMPANY only
                    (erp_company_role_permissions, erp_company_entitlements feature rows
                     — capped at what the platform owner allowed)
        │ bounds
        ▼
 User            →  role-based + per-user permission overrides (view/create/edit/approve/
                    resolve/configure/export/delete) — enforced in UI, server actions, API,
                    and (where applicable) RLS
```

---

## 3. Data model

Reuse existing: `erp_company_modules`, `erp_plan_modules`, `erp_business_type_modules`,
`erp_roles`, `erp_role_permissions`, `erp_company_role_permissions`, `erp_plans`,
`erp_companies.plan_key/business_type`, `erp_audit_logs`.

New (all flag-gated, additive):

### `erp_modules` — module/engine/pack catalog (global)
`module_key`, label en/ar, `category` (`core|engine|vertical|pack`), `parent_module_key`,
`platform_flag` (e.g. `KAKO_VAN_SALES`), `manage_permission`, `sort`, `is_active`. Seeds:
sales, inventory, route_management, trade_spend, merchandising, **van_sales**,
**change_requests**, **critical_alerts**, industry packs.

### `erp_features` — features within a module (global)
`(module_key, feature_key)`, label en/ar, optional `permission`, `settings_ref`, `is_active`.

### `erp_company_entitlements` — **platform-owner-set** per-company enablement
`company_id`, `module_key`, `feature_key` (NULL = module-level), `is_enabled`,
`limit_value`/`limit_period` (subscription limits), `expires_at`, `notes`, stamps.
Unique `(company_id, module_key, coalesce(feature_key,''))`. **RLS: read = company +
platform owner; WRITE = platform owner only** for module-level rows; Company Admins may
write **feature-level** rows **only where the module is enabled** (enforced by a check).

### `erp_user_permission_overrides` — per-user grant/deny (company-scoped)
`company_id`, `user_id`, `permission`, `grant_type` (`grant|deny`), `reason`,
`effective_from/to`, `is_active`, `granted_by`. RLS: company-scoped (Company Admin manages
own users), capped at the company entitlement. **Applying these in the login resolution is
a separate, approved step (§7).**

### Audit
Reuse `erp_log_audit` with `entity='entitlement'|'permission_override'` and
`action='enable|disable|limit_set|grant|deny'`. (A dedicated `erp_entitlement_audit_log`
is optional; centralized audit is simpler and already queried by the platform audit screen.)

---

## 4. The gate (additive, flag-gated)

`src/lib/erp/entitlements.ts`:

```ts
// Company is entitled to a module/feature? (cached per request)
isEntitled(supabase, companyId, moduleKey, featureKey?) → boolean
// Permission AND entitlement. Drop-in beside hasPermission. When the flag is OFF,
// returns exactly hasPermission(ctx, perm) — zero behavior change.
hasPermissionWithEntitlement(supabase, ctx, perm) → boolean
```

A **permission→module map** (seeded, maintained alongside the permission catalog) links a
permission to the module(s) it unlocks. Unmapped permissions are never gated (safe default).
New/opt-in call sites adopt the wrapper incrementally; **existing `hasPermission` call sites
are left as-is** until explicitly migrated.

Existing engines are **referenced** (not duplicated): the entitlement for `van_sales`
mirrors `erp_van_sales_settings.is_enabled`; `critical_alerts` ↔ `KAKO_ALERTS`;
`change_requests` ↔ `KAKO_CHANGE_REQUESTS`. The engine subsumes these over time with a
fallback so nothing breaks.

---

## 5. Required UI

- **Platform Owner — Company Capability Matrix** (`/platform/companies/[id]` tab): every
  module/engine/pack × enable/disable + limits + expiry; read-only view of plan/business-type
  defaults vs overrides.
- **Company Admin — Feature Settings** (`/settings/entitlements`): toggle **only**
  allowed features; alert types, approval flows, thresholds — all capped at the company entitlement.
- **Role Permission Matrix** (`/settings/roles` enhancement): manage `erp_company_role_permissions`
  in-company; permissions above the company entitlement are disabled/hidden.
- **Read-only entitlement summary per company** (platform + company views).

---

## 6. Safeguards (enforced)

- No company accesses a module unless an `erp_company_entitlements` row enables it (or the
  legacy fallback during transition).
- No user accesses a feature unless **company entitlement AND user permission** both allow it
  (`hasPermissionWithEntitlement`).
- Company Admin cannot grant a permission/feature above the company entitlement — writes are
  validated against the entitlement and RLS restricts module-level rows to the platform owner.
- Every enable/disable/grant/deny is audited.
- All behind `KAKO_ENTITLEMENTS` (default OFF); no production tenant enabled without approval.

---

## 7. Guardrail: existing auth/RLS untouched (pause points)

Per the directive, **anything that changes existing auth/RLS behavior pauses for approval**:

- **In scope, additive, no pause:** new tables + RLS on those new tables; the `hasEntitlement`
  wrapper; new UI; seeding the module/feature catalog; subsuming engine toggles **with fallback**.
- **Pause for explicit approval:** (1) modifying `auth-context` resolution to apply
  `erp_user_permission_overrides` (esp. **deny** rules) at login — changes how every existing
  permission resolves; (2) changing any existing RLS policy or `erp_user_has_perm` to consult
  entitlements; (3) migrating existing call sites from `hasPermission` to the wrapper en masse.
  These land only after sign-off, each in its own reviewable PR.

---

## 8. Phased PR roadmap

| PR | Scope | Risk |
|---|---|---|
| **0** | *This design doc.* | — |
| **E1** | Schema + flag: `erp_modules`, `erp_features`, `erp_company_entitlements`, `erp_user_permission_overrides` (RLS, stamps); `KAKO_ENTITLEMENTS`; typed registry + parser; pure tests. | additive |
| **E2** | Seed the module/feature catalog (sales, inventory, route_management, trade_spend, merchandising, van_sales, change_requests, critical_alerts, packs) + permission→module map; tests. | additive |
| **E3** | `entitlements.ts` gate (`isEntitled`, `hasPermissionWithEntitlement`) — **flag-OFF = identical to today**; unit + integration tests. | additive |
| **E4** | Platform-Owner Company Capability Matrix UI (read + toggle module entitlements + limits); audit. | additive |
| **E5** | Company-Admin Feature Settings UI (feature rows, capped at entitlement); audit. | additive |
| **E6** | Role Permission Matrix UI (company role permissions, capped); read-only entitlement summary. | additive |
| **E7** | Subsume engine toggles (van_sales/alerts/change_requests) via entitlements **with fallback**; tests. | additive |
| **E8 (gated)** | Apply `erp_user_permission_overrides` in resolution + migrate first call sites to the wrapper. | **pause — changes existing auth; explicit approval** |
| **E9** | Pilot enablement guide + readiness. | docs |

Each additive PR: flag-gated (`KAKO_ENTITLEMENTS` OFF), CI-green, tested. No tenant enabled.

---

## 9. Open decisions

1. **Audit storage** — reuse `erp_audit_logs` (recommended) vs a dedicated
   `erp_entitlement_audit_log`.
2. **Subscription limits** — model now as `limit_value`/`limit_period` on entitlements
   (recommended) and wire enforcement later, or defer the limit model entirely to a pricing phase.
3. **E8 timing** — when to schedule the (approval-gated) auth-resolution integration of
   per-user overrides. Until then overrides are stored + shown but enforced only via the
   opt-in wrapper, not the global login resolution.
