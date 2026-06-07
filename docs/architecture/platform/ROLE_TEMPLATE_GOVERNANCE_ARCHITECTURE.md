# VANTORA — Role Template Governance & Company Role Overrides (Architecture & Backlog)

**Status:** Architecture & backlog capture only — **no code, no migrations, no
implementation.**
**Classification:** Platform Foundation Capability · **Priority: High.**
**Sequencing:** after current core foundations; pairs naturally with the Data
Portability work as a tenant-trust prerequisite for broad onboarding.
**Discipline:** reuse-over-rebuild · additive · flag-gated · **multi-tenant safety is
the headline invariant** · generic, no per-role hardcoding.

> **Objective:** platform-maintained role *templates*, while each company customizes
> roles locally **without affecting other tenants**, with versioning, user-level
> exceptions, fine-grained scope, and a full audit trail.

---

## Reuse baseline (already on `main`)
The permission model is largely **already present** — this capability *extends* it, it
does not rebuild it:

| Concern | Existing table(s) | Role here |
|---|---|---|
| Global role catalog (templates) | `erp_roles`, `erp_role_permissions`, `erp_role_scope`, `erp_role_limits` | **Platform templates** |
| Platform-staff perms | `erp_platform_role_permissions`, `erp_platform_staff_permissions` | Platform Owner authoring |
| Per-company enabled roles | `erp_company_roles` | **Company copies** |
| Per-company permission overrides | `erp_company_role_permissions` | **Local customization** |
| Field-level governance | `erp_field_templates`, `erp_field_config` (+ versions) | **Field scope (future-ready, pattern exists)** |
| Business-type defaults | `erp_business_type_roles` | Template seeding by industry |
| Audit | `erp_audit_logs` | **Audit trail** |

**The gaps to add (additive):** template **versioning**, **user-level overrides**, an
explicit **scope dimension** (module/screen/action/field) on permissions, and **audit
hooks** on role/permission writes.

---

## 1. Platform Role Templates
- Platform Owner creates/maintains **global** templates in `erp_roles` +
  `erp_role_permissions` (e.g. Accountant, Senior Accountant, Sales Rep, Supervisor,
  Manager, Company Admin).
- Authored only by platform owner (gated by `erp_is_platform_owner()` / platform-staff
  perms). Industry packs seed defaults via `erp_business_type_roles`.

## 2. Company Role Copies
- On company provisioning (or template adoption), each company gets **its own copy**
  into `erp_company_roles` + `erp_company_role_permissions`.
- Company Admin edits permissions **locally**; writes are RLS-scoped to `company_id`,
  so **changes affect only that company** (existing tenant-isolation guarantee).

## 3. Role Versioning *(primary additive gap)*
- Add a **template version** (e.g. `erp_role_templates(role_key, version, snapshot,
  published_at)` mirroring the proven `erp_field_config_versions` pattern) and record
  the **adopted version** on each company copy (`erp_company_roles.template_version`).
- **Platform template updates never auto-modify existing company roles** — companies
  stay on their adopted version (requirement #3 + #7). Company Admin may **opt-in** to
  adopt a newer version (an explicit, audited migrate action that diffs old→new).

## 4. User-Level Overrides *(additive gap)*
- New `erp_user_permission_overrides(company_id, user_id, permission, scope, effect)`
  where `effect ∈ (grant, deny)`. Effective permission =
  **company role perms ⊕ user overrides** (deny wins).
- Example: the Accountant role can view banks, but a specific accountant user is
  **denied** `bank.view` via a `deny` override — without changing the role for others.

## 5. Permission Scope
- A `scope` dimension on permissions: **module → screen → action → field**.
- Module/screen/action are enforced today via permission keys; **field-level** reuses
  the existing `erp_field_templates` / `erp_field_config` machinery (future-ready —
  the pattern already exists, wire it into the effective-permission resolver later).

## 6. Audit Trail
- Every role/template/permission/override change logged in **`erp_audit_logs`**
  (actor, company, before/after, scope, timestamp). Reuses existing audit infra; add
  triggers/hooks on the role-permission writes. Answers **who changed what, when**.

## 7. Multi-Tenant Safety *(headline invariant)*
- **No platform-level change may silently alter an existing tenant's effective
  permissions.** Guaranteed by: (a) company copies are independent rows; (b) version
  pinning (§3); (c) RLS scoping all company/user tables to `company_id`; (d) adoption
  of a new template version is always an **explicit, audited** company action.
- A regression guard (integration test) asserts that publishing a new template version
  leaves existing `erp_company_role_permissions` byte-identical.

---

## Effective-permission resolution (design intent)
A single, generic resolver computes a user's effective permissions:
```
effective(user) =
   company_role_permissions(company, user.roles @ adopted_version)
   ⊕ user_permission_overrides(company, user)     // deny wins over grant
   ∩ scope(module/screen/action/field)
```
No per-role hardcoding; new roles/modules/industry packs plug in as data.

## Dependencies & integration
Reuses: `erp_roles`/`erp_role_permissions` (templates), `erp_company_role*` (copies),
field-config versioning pattern (for versioning + field scope), `erp_audit_logs`
(audit), RLS (tenant isolation), platform-owner gating. **No second permission system.**

## Backlog placement
**Platform Foundation Capability**, flag-gated rollout
(`KAKO_ROLE_TEMPLATES`, `KAKO_USER_PERM_OVERRIDES`), after core foundations. Phased:
(1) versioning + adoption; (2) user overrides + deny-wins resolver; (3) explicit scope
incl. field-level; (4) audit hooks + multi-tenant regression guard.

## Open questions (for the future architecture-review pass)
1. Version snapshot granularity (whole-role vs per-permission diffs) and storage.
2. Adoption UX: full replace vs three-way merge when a company has local edits.
3. Deny-vs-grant precedence edge cases across role + user override + scope.
4. Field-level enforcement point (resolver vs RLS vs UI) and performance.
5. Migration of today's company role rows onto explicit version pins (backfill plan).

*Architecture & backlog capture only — no code, migrations, or implementation. A full
architecture-review pass precedes any build, after the core foundations.*
