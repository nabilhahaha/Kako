# User Access Overrides — Extension Spec (design-only)

Per the approved decisions, this extends the **existing** `erp_temporary_access_grants` engine into one **User Access Overrides** path. It is **fully backward compatible** — existing temporary grants keep working exactly as today; **permanent grant/revoke** is an additional capability on the same engine. Writes are protected in depth: **UI → Server Action → RLS `WITH CHECK` → Audit**. No tenant-isolation changes; no RLS model changes outside this one override path.

> **Status: design only — nothing built.** This is the spec to approve before implementation.

---

## 1. Locked decisions (inputs)

1. **Generalize** the existing access-grants mechanism — single User Access Overrides path.
2. **No breaking migration.** Existing temporary grants work unchanged. New columns are additive/defaulted; widened constraints only.
3. **Admin-gated writes** require **Company Admin / Platform Owner / Super Admin**, enforced at **both** the server action **and** the database (`RLS WITH CHECK`). **Reads stay tenant-scoped** as today.
4. **Operational-only**, default-OFF behind a per-company entitlement.

---

## 2. Backward-compatibility contract (non-negotiable)

| Guarantee | How |
|-----------|-----|
| Existing temporary grants behave identically | The current temp-access resolver block is **untouched**; it still reads the same rows under the same `KAKO_TEMP_ACCESS_ENFORCEMENT` flag. |
| No row migration / no data rewrite | New columns are added with safe defaults; existing rows get `effect='grant'`, `kind='temporary'` implicitly. |
| No `NOT NULL` break | `effective_from/effective_to` are **widened** to nullable (null = permanent). Widening never breaks existing inserts that still supply them. |
| Existing writers keep working | Today's only writers (integration tests + the `service_role` sweep) bypass RLS, so tightening write RLS does not affect them. |
| Existing tests pass unchanged | The temp-access + expiry-sweep suites touch only legacy columns/behavior. |

---

## 3. Schema changes (additive, non-breaking)

```sql
-- Extend the SAME table. All three columns are additive with defaults.
ALTER TABLE erp_temporary_access_grants
  ADD COLUMN IF NOT EXISTS effect text NOT NULL DEFAULT 'grant'
      CHECK (effect IN ('grant','revoke')),
  ADD COLUMN IF NOT EXISTS kind   text NOT NULL DEFAULT 'temporary'
      CHECK (kind IN ('temporary','override'));   -- 'temporary' = legacy; 'override' = new admin path

-- Permanent overrides: a null window means "no time bound".
ALTER TABLE erp_temporary_access_grants ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE erp_temporary_access_grants ALTER COLUMN effective_to   DROP NOT NULL;

-- Reason becomes mandatory for the NEW path only (enforced in the action + a partial check),
-- never retroactively on legacy rows:
--   CHECK (kind <> 'override' OR reason IS NOT NULL)   -- add NOT VALID, then VALIDATE to avoid locking
```

**Why `kind`:** it cleanly separates the legacy temporary-access semantics (no allowlist, time-bounded, flag-gated) from the new admin override semantics (delegability-gated, optionally permanent, entitlement-gated) **on the same engine**, so neither path can alter the other's behavior.

### 3.1 Delegability control (new, small)

```sql
-- Platform-owner-managed allowlist (global default + optional per-company narrowing).
CREATE TABLE IF NOT EXISTS erp_delegable_permissions (
  id uuid pk default gen_random_uuid(),
  permission text NOT NULL,
  company_id uuid NULL REFERENCES erp_companies(id) ON DELETE CASCADE,  -- null = global
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid), permission)
);
-- RLS: platform-owner / super-admin WRITE only; tenant read.
-- Seeded with the operational set:
--   customer.request, stock_request.create, cash.handover.request,
--   day.reopen.request, returns.create, sales.discount
```

The **immutable deny-list** lives in code (`NON_DELEGABLE_PERMISSIONS`) **and** is mirrored to the DB as a guard function so it is enforced server-side too:

```sql
-- DB-layer belt: true only if perm is delegable for this company AND not deny-listed.
CREATE FUNCTION erp_is_delegable_permission(p_perm text, p_company uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM erp_delegable_permissions d
    WHERE d.permission = p_perm AND d.enabled
      AND (d.company_id IS NULL OR d.company_id = p_company)
  )
  AND p_perm NOT IN ( /* platform.*, security.*, rls.*, super.admin,
                        integrations.manage, accounting.post, treasury.*,
                        settings.users, + the override-management permission */ );
$$;
```

---

## 4. Security model — defense in depth (UI → Action → RLS → Audit)

1. **UI** — the override editor is rendered only for Company Admin / owner / super-admin and only when the company holds the entitlement; non-delegable permissions are not offered (locked).
2. **Server action** — `requireCompanyAdmin`; permission must pass `isDelegable(perm) = allowlist ∧ ¬NON_DELEGABLE`; **mandatory reason**; "admin must currently hold the permission" guard for grants; writes `kind='override'`.
3. **RLS `WITH CHECK` (database layer)** — split the single policy so **reads stay tenant-scoped** but **writes require admin/owner/super-admin** and (for `kind='override'`) a delegable permission:

```sql
-- READ: unchanged, tenant-scoped.
CREATE POLICY uao_select ON erp_temporary_access_grants FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- WRITE: admin-gated + delegability-gated for the override path.
CREATE POLICY uao_write ON erp_temporary_access_grants FOR INSERT
  WITH CHECK (
    (erp_is_platform_owner() OR erp_is_super_admin()
       OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
    AND (kind <> 'override' OR erp_is_delegable_permission(permission, company_id))
  );
-- (mirror UPDATE/DELETE with USING + WITH CHECK; service_role sweep bypasses RLS, legacy unaffected)
```

4. **Audit** — every write emits `logAudit('grant'|'revoke', 'user_access_override', …, { reason, permission, targetUser })`; reset emits `uao.reset`; allowlist + entitlement changes audited via existing trails.

**Proof of containment:** an override can only add/remove a permission for which `erp_is_delegable_permission` is true → which excludes the deny-list by construction → so platform/security/rls/system/treasury permissions can **never** be written or take effect, at the action layer *and* the DB layer. Tenant isolation is unchanged (reads still company-scoped; no policy touched outside this table's write path).

---

## 5. Resolution order (one engine, two blocks)

```
base = role permissions (company overrides → global defaults) ; applyFashionUmbrella

# BLOCK 1 — legacy temporary access. UNCHANGED. Flag-gated (default OFF).
if TEMP_ACCESS_ENFORCEMENT_ENABLED():
    union active rows where kind='temporary' (in-window, not expired)   # exactly as today

# BLOCK 2 — NEW user access overrides. Entitlement-gated (default OFF).
if overridesEntitled(company, 'platform.user_access_overrides'):
    delegable = allowlist(company) − NON_DELEGABLE
    rows = active rows where kind='override'
           (expired_at IS NULL AND (effective_from IS NULL OR effective_from<=now)
                               AND (effective_to   IS NULL OR now<=effective_to))
    grants  = rows.effect='grant'  ∧ permission ∈ delegable
    revokes = rows.effect='revoke' ∧ permission ∈ delegable
    permissions = (permissions ∪ grants) − revokes      # re-validated against delegable every resolve

ctx.permissions = permissions
```

Blocks are independent and independently gated, so enabling overrides never changes temporary-access behavior and vice-versa. Downstream (`hasPermission`, module entitlements, feature flags, RLS) consume `ctx.permissions` exactly as today.

---

## 6. Audit logging

| Event | Fields |
|-------|--------|
| `uao.grant` / `uao.revoke` | actor, company, target user, permission, **reason**, prior state, ts |
| `uao.reset` | actor, company, target user, cleared permissions, ts |
| `uao.allowlist.change` | platform-owner, permission, enabled→, scope (global/company) |
| `uao.entitlement.toggle` | platform-owner, company, on/off |
| `uao.override.ignored` (signal) | at resolve, when a stored override drops out of `delegable` |

Mandatory reason on grant/revoke. Queryable per company / per user / per permission. Plus an **effective-permissions diff** view: *role baseline → +grants / −revokes → effective.*

---

## 7. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing temp grants | **High if mishandled** | `kind` separation + additive/widened schema + legacy block untouched + existing suites must stay green (gate). |
| Privilege escalation via deny-list gap | **High** | Deny-list enforced at **four** layers incl. DB function; test asserts forbidden classes never delegable. |
| Write RLS change scope creep | Med | Change confined to this one table's write policies; reads unchanged; service-role paths unaffected. |
| Allowlist drift | Med | Platform-owner-only; minimal seed; resolve-time re-validation. |
| Auth hot-path perf | Low | One extra indexed read by `(company_id,user_id)`, cached per request. |
| Confusion with Workspace hide/show | Med | Separate feature/UI; copy: overrides change *what you can do*. |

No frozen baseline touched: authorization is extended additively and gated; RLS model unchanged outside this write path; treasury/posting deny-listed.

---

## 8. Rollout phases (still design-only)

| Phase | Scope | Risk | Effort |
|-------|-------|------|--------|
| **E0** | Additive migration: `effect`, `kind`, nullable window, partial reason check; backward-compat tests | Low | ~1 d |
| **E1** | `erp_delegable_permissions` + `NON_DELEGABLE` + `erp_is_delegable_permission()` + RLS split (read tenant / write admin+delegable) + DB guard | Med | ~2–3 d |
| **E2** | Resolver Block 2 (entitlement-gated, default OFF) + re-validation + tests | Med | ~1–1.5 d |
| **E3** | Server actions (grant/revoke/reset, mandatory reason, guards, audit) | Med | ~1.5–2 d |
| **E4** | Admin UI (per-user delegable list, reason) + effective-permissions diff | Med–High | ~2–3 d |
| **E-SR** | Security-review gate (deny/escalation tests, RLS verification, backward-compat sign-off) | — | ~1–2 d |

**Total ~9–13 engineer-days incl. review.** Default-OFF throughout → zero pilot blast radius until a Platform Owner enables `platform.user_access_overrides` for a specific company after the review gate.

---

## 9. Recommendation

Approve this spec and build **E0→E3 default-OFF** (safe to land in the pilot window, no tenant affected), then **E4 + E-SR** before enabling for any tenant. Keep scope frozen to the operational seed; approval-type and any expansion stay out of this pass.

**Confirm to proceed and I'll implement E0 first** (the additive, backward-compatible migration + tests), validate typecheck/suite/build, and report before touching the resolver.
