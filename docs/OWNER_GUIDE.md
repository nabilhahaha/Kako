# VANTORA Business OS — Platform Owner Guide

Operational guide for the **Platform Owner** and internal staff who run the SaaS.
For architecture see `ARCHITECTURE.md`; for run/monitor/rollback see
`MAINTENANCE.md`; for the product decision rule see `PRODUCT_PRINCIPLES.md`
(Core Platform → Reusable Module → Customer-Specific — build once, reuse
everywhere, sell many times).

---

## 1. Platform owner operations

The **Platform Owner** (`erp_profiles.is_platform_owner = true`) is the vendor
apex and holds **every** platform permission implicitly. The owner alone can:

- Grant/revoke platform ownership and global super-admin (DB-guarded — see §4).
- Edit the role→permission defaults (`erp_platform_role_permissions`).
- Run **owner-only tenant controls**: add branches, onboard tenant admins, reset
  tenant user passwords, toggle company modules, manage company roles/permissions,
  allow/forbid a tenant managing its own users.

The vendor panel lives under **`/platform`**:

| Page | Gate | Purpose |
|---|---|---|
| `/platform` | owner | Overview. |
| `/platform/companies` | `view_companies` | Tenants list; create/edit, subscription, plan, suspend/activate. |
| `/platform/companies/[id]` | `view_companies` | One tenant: branches, admins, modules, roles/permissions. |
| `/platform/staff` | `manage_users` | Internal staff management (§2). |
| `/platform/audit` | `access_audit_logs` | Who did what, when, on which company. |
| `/platform/drugs` | owner | Egyptian drug reference import. |

Internal staff (non-owner) see only the platform pages their permissions allow;
they belong to **no tenant company** and never see tenant-operational modules.

---

## 2. Staff management

At **Settings → `/platform/staff`** (Owner or a `manage_users` employee):

- **Invite an employee** *(Owner only)* — enter email, full name, a temporary
  password, role, optional job title. This creates the auth account and the staff
  record. Share the temporary password over a secure channel; the employee
  should change it on first login.
- **Change role** — pick a new role from the dropdown. A non-owner `manage_users`
  employee can only assign roles whose permissions they themselves hold (enforced
  by a DB trigger).
- **Permission overrides** — per employee, set any permission to **Grant**
  (add on top of the role), **Deny** (remove from the role), or **Default**
  (follow the role). Effective = `role defaults ∪ grants − denies`.
- **Offboard / Reactivate** — see §4.

Every change here is **audit-logged automatically** (DB triggers) — visible in
`/platform/audit`.

---

## 3. Roles and permissions

**Internal roles** and their default permissions (owner-editable in
`erp_platform_role_permissions`; the Owner is implicitly all):

| Permission | Owner | Admin | Sales | Support | Implementation | Finance |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| View companies | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create companies | ✓ | ✓ | ✓ | | ✓ | |
| Manage billing | ✓ | ✓ | | | | ✓ |
| Export data | ✓ | ✓ | | | ✓ | ✓ |
| Manage users | ✓ | ✓ | | | | |
| Access support tickets | ✓ | ✓ | | ✓ | ✓ | |
| Access audit logs | ✓ | ✓ | | | | ✓ |

**Rules enforced in the database (not just the UI):**
- `manage_users` **cannot create Owners** — ownership is the guarded
  `is_platform_owner` profile flag; there is no "owner" staff role.
- `manage_users` **cannot grant a permission they don't have** (role assignment
  and grant-overrides are both bounded by the actor's own permissions).
- Editing the role→permission **defaults** is **Owner-only**.

---

## 4. Offboarding process

Offboarding **disables access without deleting anything**. Customer/tenant data
is never touched, and the action is fully reversible.

1. `/platform/staff` → the employee → **Offboard** (confirm).
2. The platform sets `is_active = false` (+ `disabled_at`, `disabled_by`). This
   **immediately** revokes all platform access on their next request
   (`erp_is_platform_staff()` / `erp_platform_has()` return false).
3. The `admin-set-user-active` edge function **bans the auth login** and revokes
   sessions (new tokens blocked; existing access tokens expire within the short
   JWT TTL).
4. **Reactivate** reverses both steps.

What offboarding does **not** do: delete the employee record, touch any tenant
company's data, or remove audit history. To fully remove an account, do so
deliberately via the provider after offboarding.

---

## 5. Mapping templates (import)

A **mapping template** saves a column→field mapping so repeat imports are
one-click. At **Settings → Data Import**, on the Mapping step:

- **Save as template** — name it; optionally **Share with company** (visible to
  all colleagues vs. personal to you).
- **Apply** — pick a saved template to map the uploaded file's columns.
- **Set/Unset default** — the company default for an entity is **auto-applied**
  on upload. Only one default per (company, entity); setting a new one clears the
  previous (also makes it shared).
- **Clone** — duplicate a template to tweak a variant.
- **Share / Unshare** — toggle company-wide visibility.
- **Delete** — remove your own template.

Stored in `erp_import_mappings`, company-scoped (RLS). Setting a default goes
through a guarded RPC so it can clear a colleague's prior default safely.

---

## 6. Import / export operations

**Import** (`Settings → Data Import`, requires `integrations.manage`):
`Select entity → Upload → Map → Validate & Preview → Import → History`.
- Sources: **Excel `.xlsx`**, **CSV**, **JSON** (Excel parsed server-side).
- Validation classifies rows **error / warning / info**. Import proceeds **with
  warnings** but **never** imports error rows.
- Modes: **insert / update / upsert / skip** (matched by the entity's unique key,
  default `external_id`).
- Every imported record is stamped (`import_job_id`, `external_id`,
  `created_by`/`updated_by`, timestamps). Jobs + an error report are saved in
  **Import History** (`erp_import_jobs`).
- Importable today: customers, products, suppliers, branches. New entities
  inherit import by registering in the Entity Registry — no new screens.

**Export** (`Settings → Data Export`, requires `integrations.manage` + the
entity's own permission):
- Pick an entity → optional filters (search, status, row cap) → **CSV / Excel
  (.xlsx) / JSON** → download. A live **count preview** uses the same rules.
- Company-scoped by RLS; columns mirror the import field map, so exports
  **round-trip** back through the Import Engine.

---

## 7. Backup and recovery procedures

Full runbook in `BACKUPS.md`. Summary:

- **Managed (recommended primary):** enable **Supabase PITR / managed backups**
  on the project — point-in-time restore is the first line of defense.
- **Logical backups:** the `backup.yml` GitHub Action runs `pg_dump` on a
  schedule → S3 (or artifact), optionally GPG-encrypted. `scripts/backup.sh` /
  `scripts/restore.sh` for manual use.
- **Required secrets** (Actions): `PRODUCTION_DATABASE_URL`, optional
  `BACKUP_S3_*`, `BACKUP_GPG_PUBLIC_KEY`.
- **Recovery:** prefer PITR for production incidents. For logical restore, restore
  the latest dump into a fresh database, verify row counts + RLS, then cut over.
  **Always restore to a scratch DB first and verify** before touching production.

---

## 8. Production deployment workflow

Production deploys from the branch Vercel is configured to build
(`claude/company-roles-permissions`, the effective main). Standard flow:

1. **Develop** on the work branch; keep `tsc`, unit tests, and `next build`
   green locally.
2. **Open a PR** → CI runs: Typecheck & build, Integration tests (DB), Playwright
   smoke, **Apply migrations to STAGING** (a from-zero dry run), Vercel preview.
   Production migrations are a **separate manual/guarded** job.
3. **Migrations** (if any): after CI is green, apply to the **live DB** through
   the reviewed process — confirm prerequisites → apply → verify schema → run the
   **security advisor** → **RLS-impersonation** verification → report. (See
   `MAINTENANCE.md` §4.)
4. **Merge** the PR once CI is green → Vercel builds the production branch.
5. **Verify** the production deployment reaches READY and re-check the advisor.

Guardrails: migrations are **additive/idempotent**; never narrow an existing RLS
policy; never put secrets in the DB; tag model identity stays out of commits.
