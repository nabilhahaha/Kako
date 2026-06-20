# Role Permission Overrides (Bulk Role Overrides) — Architecture Design & Reuse Audit

Design-only proposal for the next authorization enhancement after User Access Overrides (UAO). Lets Company Admins grant/revoke **delegable operational** permissions for an entire **role** at once, layered beneath the existing per-user overrides. **No build** — this is the design + reuse audit for approval.

> Reuses the UAO engine, allowlist, deny-list, RLS, audit, entitlement, and pure logic. **No new permission engine. No duplicate tables** — the existing `erp_temporary_access_grants` engine is extended.

---

## 1. Architecture design

### Resolution order (new role layer inserted)
```
Base role permissions (erp_company_role_permissions / global defaults)
  → ROLE permission overrides   (NEW — per role_key, grant/revoke, delegable-bounded)
  → USER access overrides       (existing UAO — per user_id, grant/revoke)
  = Effective permissions
```
**User-level always wins** because it is applied *last*. Worked example:
- Role override: `Salesman + customer.request` → all salesmen gain it.
- User override: `Ahmed − customer.request` → applied after → Ahmed loses it.
- Result: every salesman has `customer.request` **except Ahmed**. ✓

Each layer is grant/revoke and is re-validated against the delegable operational set on every resolve, so a stored override outside the set is ignored.

### Engine
One engine row type per subject, distinguished by `kind`:
- `kind='temporary'` — legacy timed user grants (unchanged).
- `kind='override'` — permanent **user** overrides (UAO, unchanged).
- `kind='role_override'` — permanent **role** overrides (NEW) — keyed by `role_key`, `user_id` NULL.

### Gating (same model as UAO)
`KAKO_ROLE_PERMISSION_OVERRIDES` (global flag, default OFF) **AND** per-company entitlement `platform.role_permission_overrides`. Independent of UAO's flag/entitlement so it rolls out separately. Global kill-switch + per-company disable preserved.

---

## 2. Reuse analysis

| Component | Reuse? | Notes |
|-----------|--------|-------|
| Engine table `erp_temporary_access_grants` | ✅ Reuse (extend) | Add `role_key` + `kind='role_override'`; widen `user_id` to nullable. No new table. |
| Delegable allowlist `erp_delegable_permissions` | ✅ Reuse as-is | Same allowlist governs both layers. |
| Deny-list `erp_is_delegable_permission()` | ✅ Reuse as-is | Same 4-layer immutable deny-list. |
| RLS policies (admin-gated write, tenant read) | ✅ Reuse as-is | `WITH CHECK` already keys on `company_id`, `erp_is_company_admin`, and `erp_is_delegable_permission(grant_key, company_id)` — all role-agnostic. |
| Pure `applyAccessOverrides()` | ✅ Reuse as-is | Works on any `(base, overrides[])`; called once for the role layer, once for the user layer. |
| `effectivePermissionsDiff()` | ✅ Extend | Add a role layer so the diff shows base → role → user → effective. |
| Audit (`erp_log_audit`) | ✅ Reuse | New entity `role_permission_override`. |
| Grouping helper `groupOperationalPermissions()` | ✅ Extend | Add an **Inventory** group. |
| Entitlement engine `erp_company_entitlements` | ✅ Reuse | New `feature_key='platform.role_permission_overrides'`. |
| Feature-flag pattern | ✅ Reuse | New `KAKO_ROLE_PERMISSION_OVERRIDES`. |
| Server-action pattern (admin guard + reason + audit) | ✅ Reuse | New role-scoped actions mirror the user-scoped ones. |
| Console UI shell, tri-state selector, reason modal, diff panel, clone | ✅ Reuse | New page composes the same components. |

**New, minimal:** a `role_key` column + one `kind` value, a role-resolution block in `getUserContext`, role-scoped server actions, and a role-overrides page. Everything security-critical is reused.

**Option A (recommended) — extend the engine** (above): maximal reuse, one engine, consistent with how `kind='override'` was added. Trade-off: `user_id` becomes nullable (widening; existing rows unaffected).
**Option B — dedicated `erp_role_permission_overrides` table:** cleaner role/user separation but a second table; still reuses allowlist/deny-list/RLS-pattern/pure-logic/audit. Rejected per the "no duplicate tables if reusable" guideline.

---

## 3. Schema proposal — migration `0347` (additive, non-breaking)

```sql
-- Role-level overrides on the SAME engine.
ALTER TABLE erp_temporary_access_grants
  ADD COLUMN IF NOT EXISTS role_key text;            -- set for kind='role_override'
ALTER TABLE erp_temporary_access_grants ALTER COLUMN user_id DROP NOT NULL;  -- widening

-- Extend the kind CHECK to include 'role_override'
--   kind IN ('temporary','override','role_override')
-- Shape guards:
--   role rows  → role_key NOT NULL AND user_id IS NULL
--   user rows  → user_id  NOT NULL
ALTER TABLE erp_temporary_access_grants ADD CONSTRAINT erp_tag_subject_chk CHECK (
  (kind = 'role_override' AND role_key IS NOT NULL AND user_id IS NULL)
  OR (kind <> 'role_override' AND user_id IS NOT NULL)
);
-- Mandatory reason already enforced for overrides; extend to role_override.
-- At most one role override per (company, role, permission):
CREATE UNIQUE INDEX uq_role_override_key
  ON erp_temporary_access_grants (company_id, role_key, grant_key)
  WHERE kind = 'role_override';
CREATE INDEX idx_role_override ON erp_temporary_access_grants (company_id, role_key, kind);

-- Entitlement: new feature_key 'platform.role_permission_overrides' (reuses erp_company_entitlements).
```
RLS, the allowlist, and `erp_is_delegable_permission` are **unchanged** — they already enforce admin + delegability on writes regardless of subject.

> **Allowlist note (decision point):** the examples (`expenses.create`, `pos.refund`, `inventory.adjust`, …) are **not** in today's 6-permission operational seed. They are not deny-listed, so they are *permissible*, but delegating them requires a Platform Owner to add them to `erp_delegable_permissions`. The feature reuses the allowlist; **which** permissions are delegable stays a deny-list-bounded platform decision, not part of this engine change.

---

## 4. Resolver update — `getUserContext`

Insert a **role-override block between base role resolution and the user-override Block 2**:

```
permissions = base role permissions (+ fashion umbrella)

# NEW — Role Permission Overrides (flag + entitlement gated)
if roleOverridesActive(company):
    rows = role_override rows where role_key IN (user's roles)   # active, not expired
    permissions = applyAccessOverrides(permissions, rows)        # delegable-revalidated

# existing — User Access Overrides (Block 2), applied AFTER → user wins
if userOverridesActive(company):
    rows = override rows where user_id = user
    permissions = applyAccessOverrides(permissions, rows)

ctx.permissions = permissions
```
`applyAccessOverrides` is reused verbatim for both layers. One extra indexed read by `(company_id, role_key, kind)` when the role layer is active.

---

## 5. Security proof

- **Containment:** both layers iterate only over delegable-operational permissions → `effective ⊆ base ∪ (allowlist − deny-list)`. No layer can introduce a forbidden permission.
- **Deny-list (4 layers, unchanged):** `platform.*`, `security.*`, `rls.*`, `treasury.*`, `super.admin`, `integrations.manage`, `accounting.post`, `settings.users` are rejected at UI, action, RLS `WITH CHECK`, and `erp_is_delegable_permission` — for role rows exactly as for user rows.
- **Admin-gated writes:** RLS `WITH CHECK` requires company-admin / owner / super-admin; role rows additionally require delegability. No new RLS surface.
- **Precedence safety:** user layer applied last → deterministic "user wins"; both are monotonic set ops (add grants, remove revokes).
- **Tenant isolation:** writes stamp `company_id`; reads tenant-scoped — unchanged by `0347`.
- **Audit:** every role action logged (actor, company, role, permission, grant/revoke, reason, ts); mandatory reason at action + DB CHECK.
- **No requested-exclusions:** no approval / treasury / posting / security / platform / RLS / super-admin permissions — enforced by the reused deny-list.

---

## 6. Admin UI mockups

**Settings → Roles & Permissions → Role Overrides**

```
┌─ Role Overrides ─────────────────────────────  [Company: Nile FMCG] ─┐
│ ⓘ Role overrides apply to EVERY user in a role. User-level overrides │
│   still win. Every change is logged.                                 │
│                                                                      │
│ ┌─ Role ───────────┐  ┌─ Operational permissions · Salesman ───────┐ │
│ │ ● Salesman       │  │ REQUESTS                                    │ │
│ │ ○ Cashier        │  │  customer.request      (Default/Grant/Revoke)│ │
│ │ ○ Supervisor     │  │  day.reopen.request    (Default▾)           │ │
│ │ ○ Pharmacist     │  │ SALES                                       │ │
│ │ ○ Driver         │  │  sales.discount        (Grant ▾)            │ │
│ │ ○ (custom roles) │  │ COLLECTIONS                                 │ │
│ └──────────────────┘  │  cash.handover.request (Grant ▾)            │ │
│                       │ OPERATIONS  returns.create (Default▾)       │ │
│  [ Clone role → … ]   │ INVENTORY   inventory.adjust (Default▾)     │ │
│  [ Reset role ]       │ 🔒 accounting.post  Not delegable           │ │
│                       └─────────────────────────────────────────────┘ │
│ ▸ Effective diff (Salesman) — base → role → user → effective         │
└──────────────────────────────────────────────────────────────────────┘
```
- **Groups:** Requests · Sales · Collections · Operations · **Inventory** · Other operational permissions.
- **Per permission:** tri-state Default / Grant / Revoke + mandatory-reason modal (reused).
- **Bulk:** the selected role *is* the bulk unit — applying a permission affects all users in that role (all Salesmen / Supervisors / Cashiers / Pharmacists / Drivers / any custom role).
- **Clone:** copy one role's overrides onto another role. **Reset:** clear a role's overrides back to default.
- **Effective diff:** four columns — Role baseline → +/− Role overrides → +/− User overrides → Effective — showing both layers and where user-level wins.

---

## 7. Implementation effort

| Phase | Scope | Reuse | Effort |
|-------|-------|-------|--------|
| R0 | Migration `0347` (role_key, nullable user_id, kind, CHECKs, unique index, entitlement key) + backward-compat tests | engine | ~1 d |
| R1 | Resolver role-override block + extend `effectivePermissionsDiff` (base→role→user) + unit tests | pure logic | ~1 d |
| R2 | Role-scoped server actions (grant/revoke/reset/clone, reason, audit) | UAO actions | ~1–1.5 d |
| R3 | Admin UI (role selector, grouped tri-state incl. Inventory, reason modal, clone, reset, 4-column diff) | UAO console | ~2–2.5 d |
| R-SR | Security review (deny/escalation/precedence tests, RLS, backward-compat) | — | ~1 d |

**Total ≈ 6–7 engineer-days** (reuse-heavy; no new engine). Default-OFF throughout → zero blast radius until entitled + flagged.

---

## 8. Rollout recommendation

Mirror the validated UAO path:
1. **Build R0–R3 default-OFF** (flag `KAKO_ROLE_PERMISSION_OVERRIDES` off; no company entitled).
2. **R-SR security-review gate** (precedence + deny-list + RLS proofs on the live schema).
3. **Reference-tenant validation** (grant/revoke/clone/reset/audit/diff on a real role; verify user-wins precedence) — DB-level evidence, transient artifacts cleaned up.
4. **Platform-wide** — flag ON + entitle companies (flag AND entitlement), with the global kill-switch and per-company disable retained.
5. **Allowlist expansion** (separate, deny-list-bounded Platform-Owner decision) for any new operational permissions the examples imply (`expenses.create`, `pos.refund`, `inventory.adjust`, …) — reviewed independently of the engine change.

**Recommendation:** approve the design and build **R0 first** (additive migration + backward-compat tests), then proceed through R-SR before any tenant activation. Keep the operational seed governed solely by the allowlist; never add approval/treasury/security/platform/RLS/system permissions.

---

## Guardrails preserved
Default OFF · entitlement-gated · global kill-switch · per-company disable · delegable allowlist · immutable deny-list · admin-gated RLS · mandatory reason · full audit · effective-permissions diff (now two layers). No new permission engine; no duplicate tables.

*Design & reuse audit only — no code, no migration, no production change.*
