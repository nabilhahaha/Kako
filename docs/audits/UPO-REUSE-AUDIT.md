# UPO Reuse Audit — Existing Per-User Grant Mechanism

Before any new User Permission Overrides (UPO) build, this audits the per-user grant mechanism already in the resolver: **`erp_temporary_access_grants`** ("temporary access grants" / role-governance Step 2). Findings first, then the A/B/C classification.

---

## 1. The eight questions, answered

| # | Question | Answer |
|---|----------|--------|
| 1 | What does it do? | At permission-resolution time, **unions** a user's *active, non-expired, in-window* grants into their effective permissions. **Grant-only** (additive). Comment in code: *"No deny rules, no RLS/visibility/approval changes."* |
| 2 | Which tables? | **`erp_temporary_access_grants`** (single table). |
| 3 | Which permissions can be granted per user? | **Any** key — `grant_key` accepts *any* permission **or** any role key (roles are expanded to their permissions). **There is no allowlist and no deny-list.** |
| 4 | Grant **and** revoke? | **Grant only.** No revoke / no deny semantics exist. |
| 5 | Already audited? | **Partially.** The expiry *sweep* writes `erp_log_audit('access.expiry_sweep', …)`; application of a grant emits a structured log (`log.info('temp_access.applied', …)`). The table has `reason` + `granted_by` columns, but **grant creation is not audited because there is no creation path in the app.** |
| 6 | Protected by RLS? | **Yes, tenant-scoped** — `USING/WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())`. Note: this is **company-level, not admin-level** — RLS alone would let *any* company member write; today nothing does. |
| 7 | Can a Company Admin use it indirectly? | **No.** There is **no admin UI and no server action** that writes grants. The only writers are integration tests and the service-role expiry sweep. So it is currently inert from an admin's perspective (and the enforcement flag is **default-OFF**). |
| 8 | Extend, or build new? | **Extend.** The engine (per-user union in the resolver), the table spine, the RLS shape, the default-off flag, the role/permission partitioning, and the audit-sweep pattern are all directly reusable. See §6. |

---

## 2. Current schema

```sql
-- 0227_role_governance.sql  (+ 0237 adds expired_at)
CREATE TABLE erp_temporary_access_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  grant_key      text NOT NULL,         -- a role OR permission key (no allowlist)
  effective_from timestamptz NOT NULL,  -- REQUIRED (temporary by design)
  effective_to   timestamptz NOT NULL,  -- REQUIRED
  reason         text,                  -- present, nullable, UNUSED by any UI
  granted_by     uuid,                  -- present, UNUSED by any UI
  created_at     timestamptz NOT NULL DEFAULT now(),
  expired_at     timestamptz            -- 0237: stamped by the sweep
);
CREATE INDEX idx_temp_access_company ON erp_temporary_access_grants (company_id, user_id);
CREATE INDEX idx_temp_access_window  ON erp_temporary_access_grants (effective_to);
-- RLS: FOR ALL  USING/CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())

-- 0237: service-role-only sweep stamps lapsed grants + audits.
CREATE FUNCTION erp_sweep_expired_access() ...   -- REVOKE from authenticated; GRANT to service_role
```

---

## 3. Current resolution order

In `resolveUserContext` (`src/lib/erp/auth-context.ts`):

```
1. base = role permissions      (company role overrides → else global defaults)
2. applyFashionUmbrella(base)
3. IF (not superAdmin AND companyId AND TEMP_ACCESS_ENFORCEMENT_ENABLED()):   ← default OFF
      grants = erp_temporary_access_grants
               where company_id, user_id, expired_at IS NULL,
                     effective_from <= now <= effective_to
      { perms, roleKeys } = partitionGrantKeys(grants.grant_key, ALL_PERMISSIONS)
      expand roleKeys → permissions (company config authoritative, else global)
      permissions = UNION(permissions, perms ∪ expandedRolePerms)        ← GRANT ONLY
4. modules = plan ∩ company modules
5. ctx = { permissions, modules, … }
```

The enforcement is gated by env flag **`KAKO_TEMP_ACCESS_ENFORCEMENT`** (default OFF). When off, the whole block is skipped.

---

## 4. Current security model

- **RLS:** tenant-scoped (platform owner OR same company). Reads/writes are company-isolated.
- **Enforcement flag:** global env kill-switch, default OFF.
- **Effective-dated:** grants only apply inside `[effective_from, effective_to]` and auto-expire (the sweep stamps `expired_at`); time is the safety bound.
- **Grant-only:** cannot remove a permission; cannot deny.
- **Super admins** bypass (already hold everything).
- **No delegability control:** `grant_key` is unconstrained — any permission/role can be placed in a row. There is **no allowlist, no deny-list, no "operational-only" boundary.**
- **No write surface:** because nothing in the app writes grants, the unconstrained `grant_key` is not currently exploitable — but it is a latent gap the moment any UI is added.

---

## 5. Current limitations (vs UPO Phase A requirements)

| UPO Phase A needs | Today | Gap |
|-------------------|-------|-----|
| Per-user **revoke** | grant-only | **Missing** — needs an `effect` (grant/revoke) concept |
| **Permanent** override | requires effective_from/to | Needs nullable window (null = permanent) |
| **Delegable allowlist** (platform-owner) | none | **Missing** — core security add |
| **Immutable deny-list** (platform/security/rls/treasury/system) | none | **Missing** — core security add |
| **Company-Admin write** via UI | no UI; RLS is tenant-level not admin-level | Needs admin-gated server actions (+ tighten to admin) |
| **Mandatory reason** | column exists, nullable, unused | Enforce in action layer |
| **Audit on grant/revoke** | sweep audited; creation not | Wire `logAudit('grant'/'revoke', …)` (labels already exist) |
| **Per-company default-OFF entitlement** | global env flag only | Add `platform.user_permission_overrides` entitlement check |
| **Effective-permissions diff** | none | New read view |

What is **already there and reusable:** the resolver union (the hard part), the table spine (`company_id, user_id, grant_key, reason, granted_by, expired_at`), the tenant RLS shape, the default-off flag pattern, `partitionGrantKeys`, and the `erp_log_audit` sweep pattern.

---

## 6. Classification

**B — Small extension.** (Not A; not C.)

- **Not A (reuse as-is):** it is grant-only, has no delegability allowlist/deny-list, and has no admin write surface — so it cannot satisfy UPO Phase A unchanged.
- **Not C (major new feature):** the engine, table, RLS, flag, partitioning, and audit pattern already exist and run in production-shaped code. No new resolution architecture is needed.
- **B — Small extension:** add to the **existing** mechanism: (1) an `effect` column for **revoke**, (2) a **nullable** effective window (permanent overrides), (3) a **delegability allowlist + immutable deny-list** enforced at write *and* resolution, (4) **admin-gated server actions + UI** (and tighten the write path to company-admin), (5) the **per-company entitlement** gate, (6) **mandatory reason + grant/revoke audit**, (7) an **effective-permissions diff** view. Roughly **~70% reuse**; the genuinely new work is the revoke semantics and the allowlist/deny-list security layer.

---

## 7. Recommendation

**Extend the existing `erp_temporary_access_grants` mechanism into a generalized "user access overrides" capability — do NOT build a parallel `erp_user_permission_overrides` from scratch.** Rationale: it avoids duplicating the resolver/RLS/audit/flag machinery you already trust, and it consolidates "temporary grant" and "permanent grant/revoke" into one audited per-user override path.

The extension keeps every UPO Phase A guarantee:
- Operational-only (allowlist − immutable deny-list) — the **one critical security addition** the current mechanism lacks.
- Default-OFF (existing flag + new per-company entitlement) — zero pilot blast radius.
- No RLS / tenant-isolation change (resolver stays in-memory set math).
- Mandatory reason + audit (columns + labels already exist).

Two open design points to confirm **before** I draft the extension spec:
1. **One table or sibling?** Generalize `erp_temporary_access_grants` (add `effect`, nullable window) vs. a small dedicated `erp_user_permission_overrides`. Reuse-first favors generalizing the one table; a sibling is cleaner if you want temporary-grants and permanent-overrides kept visibly separate. *(My lean: generalize the one table.)*
2. **Tighten the existing RLS** from tenant-level to admin-level on the write path (recommended, since a real UI will now write to it)?

Reuse audit complete. **No new UPO architecture drafted.** On your call for points 1–2, I'll produce the extension spec (still design-only) rather than a from-scratch UPO.
