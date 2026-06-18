# Role Workspace Designer v2 — Two-Level (Role + User) Architecture Update

This updates the approved Role Workspace Designer (RWD) to support **two layers** of presentation curation inside a company:

1. **Role-level default workspace** — the baseline for everyone in a role.
2. **User-level override** — per-user customization on top of the role default, inside the same company.

The governing principle is unchanged and absolute: **RWD is a presentation overlay. It never grants access.** Every layer can only hide, show, or reorder items the user is *already entitled to* via permissions, feature flags, module entitlements, and company entitlements. A new platform-owner control decides **which companies may use the user-level layer at all**.

---

## 1. What changes vs v1

| Aspect | v1 (approved) | v2 (this update) |
|--------|---------------|------------------|
| Layers | Role default only | Role default **+** user override |
| Tables | `erp_role_workspace` | `erp_role_workspace` **+ new** `erp_user_workspace` |
| Resolution | base → role → final | base → role → **user** → final |
| Platform-owner control | (none needed) | **gate: which companies may use user-level overrides** |
| Admin actions | edit role defaults | edit role defaults · edit user overrides · **reset user to role default** |

Everything else (the surface registry, the subtractive overlay model, the security model, the "no row = today's behavior" invariant) carries forward unchanged.

---

## 2. Schema decision — extend or new table?

**Decision: create a separate `erp_user_workspace` table. Do not overload `erp_role_workspace`.**

Reasons:
- **Different scope key.** Role rows are keyed by `role_key`; user rows by `user_id`. Cramming both into one table forces a nullable `role_key` *or* `user_id` with sentinel semantics ("this row is a role row vs a user row"), which is error-prone in queries and RLS and invites accidental cross-contamination.
- **Different lifecycle.** "Reset user to role default" must delete *only* that user's rows; a separate table makes this a clean `delete where user_id = ?` with zero risk to role defaults.
- **Different RLS surface & entitlement gate.** User-level writes are additionally gated by the platform-owner company entitlement; isolating them in their own table keeps that policy crisp.
- **Different cardinality / indexing.** User rows scale with users×items; role rows with roles×items. Separate tables get separate, well-targeted indexes.
- **Precedent.** The authz layer already splits role-scoped vs user-scoped concerns (`erp_company_role_permissions` vs `erp_role_scope` / `erp_role_limits`). This mirrors that proven shape.

### 2.1 Required schema changes

**Existing (v1), unchanged:**
```
erp_role_workspace (
  id, company_id, role_key, surface, item_id,
  visible boolean not null default true,
  sort_order integer,
  updated_by, updated_at,
  unique (company_id, role_key, surface, item_id)
)
```

**New — user-level overrides:**
```
erp_user_workspace (
  id          uuid pk default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  surface     text not null,          -- 'nav' | 'widget' | 'quick_action' | 'request_type'
  item_id     text not null,          -- references a registry id
  visible     boolean,                -- null = inherit role/code default
  sort_order  integer,                -- null = inherit role/code default
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id, surface, item_id)
)
-- index (company_id, user_id, surface)
```

Note: in `erp_user_workspace`, `visible` is **nullable** on purpose — a user row exists to override *something*; `null` means "inherit the layer below" (so a user can override order without pinning visibility, or vice-versa).

**New — platform-owner gate (no new table; reuse the entitlements engine):**
- Add a company entitlement feature key **`platform.user_workspace_overrides`** in `erp_company_entitlements`.
- This table is already **platform-owner-writable only** — exactly the semantics required ("Platform Owner controls which companies are allowed to use user-level overrides"). No new control plane is introduced.

### 2.2 RLS

`erp_user_workspace` write policy — same shape as `erp_feature_flags`, **plus** the entitlement check:
```
policy erp_user_workspace_rw on erp_user_workspace for all
  using (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (
      company_id = erp_user_company_id()
      AND erp_is_company_admin(company_id)
    )
  )
  with check ( ...same... );
```
The **entitlement gate** (`platform.user_workspace_overrides`) is enforced in the server action *and* can be added to `with check` via an `EXISTS` on `erp_company_entitlements` for defense-in-depth. Reads remain company-scoped by RLS. (Whether end users can read their own override rows is a UI choice; the resolver runs server-side with the tenant context, so no client read is required.)

---

## 3. Resolution algorithm

The resolver gains one layer. The **hard gate is always base entitlement**; the role and user layers only choose visibility/order *within* that entitled set.

```
resolveSurface(items, ctx, flags, entitlements, roleOv, userOv):

  # Layer 0 — AUTHORITATIVE. Unchanged from today.
  entitled = items.filter(i => gatePasses(i.gate, ctx, flags, entitlements))

  # Per-layer visibility/order are chosen with precedence user > role > codeDefault,
  # but every item must survive Layer 0 first.
  userAllowed = entitlements.has('platform.user_workspace_overrides')

  result = []
  for i in entitled:
      rOv = roleOv.get(i.id)              # may be undefined
      uOv = userAllowed ? userOv.get(i.id) : undefined

      visible = firstDefined(uOv?.visible, rOv?.visible, /*code default*/ true)
      if (!visible) continue              # hidden by role or user — but only WITHIN entitled

      order = firstDefined(uOv?.sort_order, rOv?.sort_order, i.defaultOrder)
      result.push({ item: i, order })

  return result.sortBy(r => r.order).map(r => r.item)
```

Key properties:
- **`entitled` is computed exactly as today** (`gatePasses` = the existing permission ∩ module ∩ company-entitlement ∩ flag check). Layers 1–2 never touch it.
- **User wins ties, role is the fallback, code default is the floor** — this is precisely "user override applied *after* role default."
- **User layer is bypassed entirely** when the company lacks `platform.user_workspace_overrides` → such tenants behave exactly like v1.
- A user override **can re-reveal** an item the role default hid *iff that item is base-entitled* (`uOv.visible = true` beats `rOv.visible = false`, but both are inside `entitled`). It can **never** reveal a non-entitled item, because the loop only iterates `entitled`.

> This "value overlay bounded by entitlement" is deliberately more flexible than a strict subtract-only cascade (it lets an admin re-enable a decluttered item for a power user) while remaining provably incapable of granting access. If you prefer the stricter "user can only further hide" semantics, it is a one-line change (`visible = rOv?.visible === false ? false : firstDefined(uOv?.visible, true)`); see §7 Risk for the trade-off. **Recommended: the value-overlay above.**

### 3.1 Multi-role users
A user holding several roles gets the **union** of their roles' entitled items (unchanged). For the role layer's visibility/order on a shared item, apply the **highest-ranked role's** override (deterministic tie-break by existing `ROLE_RANK`); the user layer then overrides that. This rule is defined once in the resolver.

---

## 4. Admin UI design

One page, **`/settings/workspace`**, Company-Admin-gated, with a **scope switch**:

```
[ Role defaults ]   [ User overrides ]        ← top scope switch
```

### 4.1 Role defaults (as in v1)
Role picker → surface tabs (Menu · Dashboard · Quick actions · Request types) → per-item visibility toggle + drag-reorder. Item states: ✓ Visible · ✗ Hidden · 🔒 Not available (locked, role not entitled).

### 4.2 User overrides (new — only rendered if the company is entitled)
- **User picker** (search within company members), optionally filtered by role.
- For the selected user, each surface lists every item with **three pieces of context** so the admin understands inheritance:

| Column | Meaning |
|--------|---------|
| Entitled? | base permission/flag/entitlement — if ✗, row is 🔒 locked |
| Role default | what the user's role default currently does (Visible / Hidden) |
| User setting | ● Inherit (default) · ✓ Show · ✗ Hide — the override the admin sets |

- **"Reset to role default"** button (per surface or whole user) → deletes the user's rows → the user falls back to the role default (and code default). One click, fully reversible.
- If the company is **not** entitled to user overrides, the "User overrides" switch is hidden entirely with an inline note: *"User-level workspace overrides are not enabled for this company."*

### 4.3 Platform Owner control
In **`/platform/entitlements/<companyId>`**, a single toggle **"Allow user-level workspace overrides"** writes the `platform.user_workspace_overrides` entitlement. Off by default. This is the only switch that decides whether §4.2 exists for a tenant.

---

## 5. Security proof

**Claim:** With both layers active, RWD still cannot grant access; permissions, flags, module entitlements, and company entitlements remain authoritative.

1. **No grant columns exist.** Neither `erp_role_workspace` nor `erp_user_workspace` has any column that can express a permission, role, route, flag, or entitlement. Both hold only `visible` (bool) and `sort_order` (int). The schema is structurally incapable of granting.
2. **The resolver is gate-first and entitlement-bounded.** `result ⊆ entitled` by construction: the loop iterates `entitled` only, and the layers can merely drop (`continue`) or reorder. Adding the user layer changed *which entitled items are shown/ordered*, not *the entitled set*. Formally: `resolve(...) ⊆ entitled = {i : gatePasses(i)}` regardless of role/user override contents.
3. **The user layer is itself gated.** It is applied only when `platform.user_workspace_overrides` is present — a **platform-owner-only** entitlement. A Company Admin cannot self-grant the user layer; absent the entitlement, user rows are ignored even if present.
4. **Re-reveal is safe.** A user override of `visible=true` can only resurface an item that is *already in `entitled`*. It cannot manufacture entitlement. The 🔒 state in the UI disables the toggle for non-entitled items, so the admin has no control that maps to a grant.
5. **Server enforcement unchanged.** Every route/action keeps its own server-side permission check. Hiding (at either layer) is cosmetic; a hidden-but-entitled route stays reachable and enforced. RWD is never consulted as an access-control decision.
6. **RLS confines writes by tenant.** Role and user overrides can only be written by the company's own admin (or platform owner/super admin), scoped to `company_id`. No cross-tenant authoring.
7. **Reset is non-privileged.** "Reset to role default" only deletes rows; it can never elevate.

**Corollary:** dropping both tables returns the platform to today's behavior with zero security delta — the two-level overlay adds presentation flexibility and **no authority**.

---

## 6. Audit logging

- **Every write** to `erp_role_workspace` and `erp_user_workspace` goes through a server action that stamps `updated_by` / `updated_at` and emits an audit entry (actor, company, scope = role_key or user_id, surface, item_id, old→new visible/order), mirroring `setFeatureFlag` / `setCompanyCapability`.
- **Reset** logs a single `workspace.user.reset` event (actor, target user, surface or "all", count of rows cleared).
- **Platform-owner entitlement toggle** (`platform.user_workspace_overrides`) is audited through the existing entitlements audit trail.
- Audit entries are queryable per company and per target user, so "who changed Salesman B's workspace and when" is answerable.

---

## 7. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Scale / row growth** (users × items) | Med | Overrides are sparse (only set items get rows); `unique`/index on `(company_id, user_id, surface)`; null = inherit so no row for defaults. Typical tenant writes a handful of rows per user. |
| **Resolution performance** (extra layer per render) | Low–Med | Two indexed reads per page (role overlay by `company_id,role_key`; user overlay by `company_id,user_id`), both tiny; resolver is O(n) over an already-small surface; cache per request in the auth/layout context. |
| **Admin confusion** (inherit vs show vs hide tri-state) | Med | The three-column UI (Entitled / Role default / User setting) makes inheritance explicit; "Reset to role default" is one click; copy explains hiding ≠ securing. |
| **Mistaken use as access control** | Med (governance) | Locked 🔒 state + explicit non-goal banner; documentation states server enforcement is authoritative; security review sign-off before GA. |
| **Re-reveal semantics surprise** (user override re-shows a role-hidden item) | Low | Documented behavior; bounded by entitlement so never a security issue; strict "hide-only" mode available as a config if a tenant prefers it. |
| **Multi-role tie-breaks** | Low | Deterministic `ROLE_RANK` rule defined once in the resolver, unit-tested. |
| **Migration safety** | Low | Idempotent `create table if not exists` + additive only; "no row = today"; default-off feature flag (`platform.workspace_designer`) wrapping the resolver wiring; schema-health test covers the new FK indexes + RLS-initplan wrap. |
| **Backward compatibility** | Low | Tenants without the platform-owner entitlement never touch the user layer; tenants without any rows render exactly as today. |

No risk touches the frozen baselines (authorization, RLS, hierarchy, treasury, posting) — by construction the overlay is read-side and non-authoritative.

---

## 8. Recommended rollout phases

Phases 0–3 are unchanged from the approved v1 plan (role-level). The user-level layer is **additive Phase 4–5**, sequenced *after* the role layer is proven in production.

| Phase | Scope | Complexity | Risk | Depends on | Effort |
|-------|-------|-----------|------|-----------|--------|
| **0** | Registry + stable IDs (no DB, zero behavior change) | Low | Very low | — | ~2–3 d |
| **1** | Role overlay for nav + `erp_role_workspace` + RLS | Med | Low–Med | 0 | ~3–5 d |
| **2** | Role overlay → widgets / quick actions / request types | Med | Low | 1 | ~3–4 d |
| **3** | Role admin UI `/settings/workspace` | Med–High | Med | 2 | ~5–7 d |
| **4** | **User overlay engine** — `erp_user_workspace` + `platform.user_workspace_overrides` entitlement + resolver extension (layer 2) | Med | Med | 3 | ~3–5 d |
| **5** | **User-override admin UI** (user picker, tri-state, reset) + platform-owner entitlement toggle | Med–High | Med | 4 | ~5–7 d |

**Total (both levels): ~21–31 engineer-days.** Role level alone (0–3) remains ~13–19 d; the user level adds ~8–12 d.

### Recommendation
- Keep the **roadmap status unchanged**: the whole RWD remains **Priority High, first enhancement block after pilot stabilization**, *not* built during the pilot.
- Within that block, ship **role level (0–3) first**, validate with real tenants, then ship **user level (4–5)**. The user layer is strictly additive and default-off (gated by a platform-owner entitlement), so it can land later in the same post-pilot block without reopening role-level work.
- Hold the platform-owner entitlement **off by default** at GA; enable per company only when a tenant explicitly needs per-user curation.

**One-line answer:** Two-level design accepted in principle — **separate `erp_user_workspace` table**, **base → role → user → final** resolution bounded by entitlement, **platform-owner entitlement** gating the user layer, delivered as **Phases 4–5 after the role-level phases**, all still inside the post-pilot Phase-1 enhancement block. No build yet.
