# Slice S2 — Roles & Hierarchy (role layer) — Design Review

> **Design for approval — no build yet.** Adds the FMCG role levels and makes
> **Branch Manager distinct from Company Admin**. S2 is the **role layer only**
> (keys, ranks, labels, default permissions, seeding) — the **data scope** that
> makes each level "see only their region/area/branch" is **S4** (depends on
> S1 ✅ + S2). Additive; existing-tenant safety is the central design concern.

---

## 1. Goal (from locked decisions)
Roles: `Sales Director → National Sales Manager → Regional Manager → Area Manager
→ Branch Manager → Supervisor → Sales Rep`, plus **Company Admin, Finance, IT
Admin, Viewer**. **Branch Manager ≠ Company Admin** (the keystone change).

## 2. Grounding — how roles work today
- `erp_user_branches.role` is **free-text** → new keys are additive.
- **`manager` currently = ALL permissions in TWO places:**
  1. **Code:** `ROLE_PERMISSIONS.manager = ALL` (`permissions.ts`).
  2. **DB seed:** `erp_role_permissions` grants admin+manager every permission
     (0017); and per-company overrides exist.
- **Live impact data:** 3 `manager` memberships (1 company), **859 company-level
  `manager` permission-override rows**, **28 global `manager` perms**. Demoting
  `manager` is a **multi-place change with real existing-tenant impact** — it must
  be done carefully, not silently.
- `ROLE_RANK` (auth-context) drives "top role"; `BRANCH_ROLES` drives labels;
  `erp_roles` is the DB catalog (key, name_ar, rank).

## 3. The Branch-Manager decision — two safe options

**Option A — reposition `manager` → Branch Manager (demote from ALL).** *(Matches
the literal request, but changes an existing role's powers for live tenants.)*
- Risk: any existing `manager` user **loses** company-settings/billing/permissions
  access. With 859 override rows, behavior is partly company-authoritative, so the
  net effect is **mixed and hard to fully predict** per tenant.
- If chosen: keep `admin` = Company Admin (ALL); set `manager` (Branch Manager) =
  **operational set** (sales/inventory/purchasing/reports/approvals, **no**
  settings.users/branches/permissions, **no** billing). Migrate existing tenants
  carefully (don't strip a real admin who is modeled as `manager`).

**Option B — keep `manager`=ALL as "Company Admin-equivalent", add a NEW
`branch_manager` role.** *(Recommended — zero regression.)*
- New `branch_manager` key = operational branch role (no company settings). New
  tenants get it; existing `manager` users are **untouched**. The "Branch Manager
  is distinct from Admin" requirement is satisfied by the **new** role; `manager`
  is treated as a legacy alias of admin-level.
- **Recommendation: Option B** — it delivers the requirement with **no
  existing-tenant disruption** (the platform's standing guarantee). Confirm.

## 4. New role keys (additive) — proposed set + ranks + permissions
Add to `BranchRole`, `ROLE_RANK`, `BRANCH_ROLES` (labels), `ROLE_PERMISSIONS`,
`erp_roles` (DB), and `erp_role_permissions` (DB defaults):

| Role key | Label (en/ar) | Rank | Default permissions (pre-scope; scope = S4) |
|---|---|---|---|
| `sales_director` | Sales Director / مدير المبيعات | 7 | sales+customers+inventory.view+reports+approvals (no settings/billing) |
| `national_sales_manager` | National Sales Manager / مدير المبيعات الوطني | 7 | same as director |
| `regional_manager` | Regional Manager / مدير إقليمي | 6 | sales+customers+inventory.view+reports |
| `area_manager` | Area Manager / مدير منطقة | 5 | sales+customers+inventory.view+reports |
| `branch_manager` | Branch Manager / مدير الفرع | 6 | sales+inventory+purchasing+reports+approvals (**no settings/billing**) |
| `it_admin` | IT Admin / مدير تقنية المعلومات | 6 | settings.users + integrations.manage + settings.custom_fields (no sales/finance) |
| (existing) `supervisor`, `salesman`(=Sales Rep), `accountant`(=Finance), `viewer` | — | 6/2/5/0 | unchanged |

> **Naming note:** "Sales Rep" = existing `salesman`; "Finance" = existing
> `accountant`. Reuse them (relabel only) rather than add duplicates? *(Recommended
> — avoids role sprawl.)*

> All new roles get **broad-but-bounded** permissions now; the **scope** (Director
> sees company, Regional sees their regions, Area their areas, Branch their
> branch) is **S4** (RLS + a visibility resolver). Without S4 they'd all see the
> whole company — so **S2 ships the keys/labels; S4 makes them mean something.**

## 5. Seeding & business-type templates
- Add the new roles to `erp_roles` (catalog) + `erp_role_permissions` (defaults),
  additively (NOT EXISTS guards).
- Add them to `erp_business_type_roles` for FMCG types (`wholesale`, `delivery`)
  so new distribution companies get the hierarchy in their suggested roles.
- **No change to existing companies' role sets** (additive only).

## 6. Existing-tenant safety (the core concern)
- **Option B (recommended): zero impact** — `manager` untouched; new roles are
  purely additive; no existing user loses anything.
- If Option A is chosen: a **careful data migration** is required (re-grant the
  removed admin-level perms to any tenant where `manager` is actually the company
  admin), verified rolled-back-live. Higher risk.

## 7. App layer
- `permissions.ts`: add roles to `ROLE_PERMISSIONS` (+ `BranchRole` union).
- `auth-context.ts`: add to `ROLE_RANK`.
- `constants.ts`: add to `BRANCH_ROLES` labels (+ relabel salesman→"Sales Rep",
  accountant→"Finance" if approved).
- Setup-wizard FMCG role suggestions already list these names (display labels);
  align keys.
- Tests: role→permission expansion; rank ordering; new keys present; no existing
  role's permission set changed (Option B).

## 8. Verification plan (when built)
- Rolled-back live (if any DB seed): new `erp_roles`/`erp_role_permissions` rows
  present; **existing `manager`/`admin` perms unchanged** (Option B); advisor 0
  ERROR; protected verticals untouched; 0 residue.
- Unit: `permissionsForRole(new role)` correct; `ROLE_RANK` total; labels ar/en
  parity. `tsc`/build/vitest.

## 9. Decisions to confirm (S2)
1. **Option A (demote `manager`) vs Option B (new `branch_manager`, manager
   untouched)** — **Recommend B** (zero existing-tenant impact; still delivers
   "Branch Manager ≠ Admin"). ⬅ key decision.
2. **Reuse `salesman`=Sales Rep and `accountant`=Finance** (relabel only) vs add
   new keys? *(Recommended: reuse.)*
3. **Permission sets per new role** — confirm the §4 table (esp. `it_admin` scope
   and that NSM == Director permissions pre-scope).
4. **Seed into `erp_business_type_roles`** for wholesale/delivery? *(Recommended.)*
5. Reconfirm: **scope/visibility is S4** (S2 = role layer only).

*(S2 design — paused for your review + the §9 decisions, especially #1. On
approval I build the role layer → test → rolled-back live verify (if seeding) →
draft PR → review package → your approval. Then S3 — customer model.)*
