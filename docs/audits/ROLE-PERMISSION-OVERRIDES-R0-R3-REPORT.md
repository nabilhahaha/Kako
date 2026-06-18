# Role Permission Overrides — R0–R3 Implementation, Validation & Security Report

Role Permission Overrides (Bulk Role Overrides) built R0–R3 on branch `claude/pilot-ux` (commit `36c2c1b`). **Default OFF**, gated by flag `KAKO_ROLE_PERMISSION_OVERRIDES` **AND** per-company entitlement `platform.role_permission_overrides`. Reuses the UAO engine — **no new engine, no duplicate tables**. Operational allowlist **unchanged** (seed not expanded).

---

## 1. Implementation report

**R0 — migration `0347` (additive, non-breaking):** extends `erp_temporary_access_grants` with `role_key` + `kind='role_override'`; widens `user_id` to nullable; shape CHECK (`role_override` ⇒ `role_key` set, `user_id` NULL; else `user_id` set); reason CHECK extended to `role_override`; partial unique index `uq_role_override_key (company,role,permission)`; RLS insert/update now delegability-check role rows too.

**R1 — resolver + pure logic:** new **Block 1.5** in `getUserContext` applies a role's overrides (matching the user's roles) **before** the user-override Block 2 → user-level always wins. `effectivePermissionsDiffLayered(base, roleOv, userOv)` (base → role → user). Added the **Inventory** UI group. Flag `KAKO_ROLE_PERMISSION_OVERRIDES`.

**R2 — server actions:** `setRolePermissionOverride` / `clear` / `reset` / `clone` — admin-gated, delegable-only, mandatory reason, "cannot grant a permission you don't hold" guard, full audit. Reuses the allowlist, deny-list, and the (generalized) entitlement helper.

**R3 — admin UI:** `/settings/role-overrides` — role list + search, grouped tri-state (Requests/Sales/Collections/Operations/**Inventory**/Other), mandatory-reason modal, locked non-delegable rows, clone-to-roles, reset, effective diff; ar/en i18n. Inert "not enabled" state while default-OFF.

Files: `0347_role_permission_overrides.sql`, `role-overrides-server.ts`, `role-overrides/actions.ts`, `role-overrides/page.tsx`, `role-overrides-console.tsx`, `i18n/messages/role-overrides.ts`, `security.ts` (grouping + layered diff), `auth-context.ts` (Block 1.5).

---

## 2. Validation report

Validated on a real Postgres (full `0001–0347` chain).

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| Unit tests (role-governance, incl. layered diff + grouping) | ✅ 30 passed |
| Full unit/component suite | ✅ 1592 passed / 192 skipped |
| Integration tests (role overrides + UAO, **executed on real DB**) | ✅ 10 passed |
| Production build | ✅ green (`/settings/role-overrides` compiled) |
| Role override row shape (role_key set, user_id NULL) | ✅ |
| Mandatory reason (DB CHECK) on role rows | ✅ rejected without reason |
| One override per (company, role, permission) | ✅ duplicate rejected |
| **User override wins over role override** (Ahmed example) | ✅ normal salesman = 1, Ahmed = 0 |
| Non-delegable role write (`accounting.post`) | ✅ rejected by RLS |
| Non-admin (salesman) role write | ✅ rejected by RLS |
| Role-override audit row | ✅ written (role, permission, reason) |

---

## 3. Security review report

- **Containment:** both layers iterate only over delegable-operational permissions → `effective ⊆ base ∪ (allowlist − deny-list)`. No layer can introduce a forbidden permission.
- **Deny-list (unchanged, 4 layers):** `platform.*`/`security.*`/`rls.*`/`treasury.*`/`super.admin`/`integrations.manage`/`accounting.post`/`settings.users` blocked for role rows too — proven (`accounting.post` role write → `42501`). The `0347` RLS update closed the gap so role rows are delegability-checked (the `0346` policy only checked `kind='override'`).
- **Admin-gated writes:** RLS `WITH CHECK` requires company-admin/owner/super-admin; salesman role write rejected (`42501`).
- **Precedence safety:** user layer applied last → deterministic "user wins"; both layers are monotonic set ops.
- **Tenant isolation:** reads tenant-scoped, writes stamp `company_id` — unchanged by `0347`.
- **Mandatory reason + audit:** enforced at action + DB CHECK; every action audited (`entity='role_permission_override'`).
- **No excluded classes:** allowlist unchanged → only the 6 operational permissions are delegable; no approval/treasury/posting/security/platform/RLS/super-admin.
- **Default-OFF:** flag AND entitlement both required; global kill-switch + per-company disable retained.

---

## 4. Role override examples

| Role | Permission | Effect | Result |
|------|-----------|--------|--------|
| Salesman | `customer.request` | grant | every salesman can raise customer requests |
| Salesman | `cash.handover.request` | grant | every salesman can request cash handover |
| Supervisor | `day.reopen.request` | grant | every supervisor can request day reopen |
| Cashier | `returns.create` | revoke | no cashier can create returns (overrides role baseline) |

> The examples `expenses.create`, `pos.refund`, `inventory.adjust` are **not** in the current allowlist (seed unchanged this pass) — delegating them is a separate, deny-list-bounded Platform-Owner decision.

---

## 5. Effective permissions examples (Ahmed — user wins)

```
Role override:  Salesman + customer.request
User override:  Ahmed   − customer.request

Salesman "Sara":  base(sales.sell) → +role(customer.request) → (no user ov) = { sales.sell, customer.request }
Salesman "Ahmed": base(sales.sell) → +role(customer.request) → −user(customer.request) = { sales.sell }
```
Result: **all salesmen get `customer.request` except Ahmed** — verified in the resolver and on the live engine query.

---

## 6. Status & next gate

R0–R3 complete, default-OFF, no tenant entitled for role overrides. Guardrails intact. Ready for the **security-review gate (R-SR)** before any tenant activation — the deny/escalation/precedence/RLS proofs above are the evidence base for that review.

Commit `36c2c1b` on `claude/pilot-ux` (PR #319) · migration `0347`.
