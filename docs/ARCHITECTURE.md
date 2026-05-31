# VANTORA Business OS — Architecture

> One platform, many businesses. A multi-tenant SaaS "Business OS" that adapts
> per business type through **dynamic configuration on a shared core** — never
> per-industry forks. Built on Next.js 15 (App Router) + Supabase (Postgres 17,
> RLS everywhere).

This is the canonical architecture reference. Companion docs:
`OWNER_GUIDE.md` (operations), `ROADMAP.md` (what's next), `MAINTENANCE.md`
(run/monitor/rollback), `ENTITY-FRAMEWORK.md`, `INTEGRATION.md`, `MODULES.md`,
`BACKUPS.md`, `STAGING.md`, `CONVENTIONS.md`.

Status legend: ✅ built · 🟡 foundation · 🔜 planned.

---

## 1. High-level system architecture

```
                 ┌──────────────────────────────────────────────┐
   Browser ──────►  Next.js 15 App Router (Vercel)               │
   (RTL/LTR)     │   • Server Components + Server Actions         │
                 │   • Route groups: (app) (auth) (print) (legal) │
                 │   • /setup /onboarding /platform               │
                 └───────────────┬───────────────┬───────────────┘
                                 │ @supabase/ssr  │ Server Actions / Route Handlers
                                 ▼                ▼
                 ┌──────────────────────────────────────────────┐
                 │  Supabase (Postgres 17)                        │
                 │   • RLS on every table (tenant isolation)      │
                 │   • SECURITY DEFINER RPCs (guarded writes)     │
                 │   • Edge Functions (service-role ops)          │
                 │   • Auth (email/password)                      │
                 └──────────────────────────────────────────────┘
   Observability: Sentry (env-gated)   Backups: pg_dump + Supabase PITR
```

- **Rendering:** React Server Components by default; client components only where
  interactivity is needed. Mutations go through **Server Actions** (and a few
  **Route Handlers**, e.g. `/api/export`).
- **Tenancy boundary:** enforced in the database (RLS), not just the app. The app
  is a convenience layer; Postgres is the source of truth for who-sees-what.
- **Two actor planes:**
  1. **Tenant plane** — companies → branches → users with company roles.
  2. **Vendor/platform plane** — the Platform Owner + internal staff who operate
     the SaaS itself (see §8). The two never mix: platform staff belong to no
     tenant company.
- **i18n:** custom lightweight `t()` with full **ar/en** parity (enforced by a
  test), RTL/LTR toggle, cookie-backed locale.
- **Config over forks:** business types select modules/roles/dashboards from a
  shared core via DB config; there is no per-industry codebase.

---

## 2. Module map

Route groups under `src/app/`:

| Group / path | Purpose |
|---|---|
| `(app)/` | Authenticated product shell (sidebar, topbar, command palette). |
| `(app)/platform/` | Vendor panel: companies, **staff** (`/platform/staff`), audit, drugs. |
| `(app)/settings/` | Org, users/staff, permissions, marketplace, **import**, **export**, integrations, e-invoice. |
| `(auth)/`, `auth/`, `login`, `forgot-password`, `reset-password` | Auth flows. |
| `(print)/print/...` | Print views (invoices, prescriptions, medical record). |
| `(legal)/`, `privacy`, `terms` | Legal/marketing. |
| `/`, `promo/[type]` | Unified landing + login modal. |
| `/onboarding`, `/setup` | Self-serve company creation + Smart Setup Wizard. |

Feature **modules** (gated by plan ∩ business type): sales, inventory,
purchasing, accounting, plus verticals — clinic, pharmacy, restaurant, salon,
laundry, supermarket, wholesale, distribution, hotel. Finer item gates: pos,
sales_orders, returns, warehousing. See `MODULES.md`.

Cross-cutting **engines** (entity-based, build-once-reuse-everywhere):
- **Entity Framework** (`src/lib/erp/entities.ts`) — registry of every business
  object; see `ENTITY-FRAMEWORK.md`.
- **Import Engine** (`/settings/import`) — Excel/CSV/JSON → any entity, with
  mapping templates. See `INTEGRATION.md`.
- **Export Engine** (`/api/export`) — any entity → CSV/Excel/JSON.
- **Platform Staff** (`/platform/staff`) — vendor internal-staff management (§8).

---

## 3. Database architecture

Postgres 17 on Supabase. **85 migrations** (`supabase/migrations/0001…0085`),
all additive and idempotent (`create … if not exists`, `drop policy if exists`).
~80 `erp_*` tables grouped by domain:

| Domain | Representative tables |
|---|---|
| Tenancy & identity | `erp_companies`, `erp_branches`, `erp_user_branches`, `erp_profiles` |
| Plans / modules / config | `erp_plans`, `erp_plan_modules`, `erp_company_modules`, `erp_business_type_modules`, `erp_business_type_roles` |
| Roles / permissions | `erp_roles`, `erp_role_permissions`, `erp_company_roles`, `erp_company_role_permissions` |
| Catalog & partners | `erp_products_catalog`, `erp_customers`, `erp_suppliers` |
| Sales / purchasing / returns | `erp_invoices`, `erp_sales_orders`, `erp_purchase_orders`, returns |
| Inventory / warehousing | stock, transfers, counts, requests, expiry |
| Accounting | chart of accounts, journals, vouchers (auto-posting triggers) |
| Distribution / field | routes, journeys, rep targets, settlements |
| Verticals | clinic, pharmacy, restaurant, salon, laundry, hotel, supermarket |
| E-invoicing (ETA) | `erp_eta_*` (inert until configured) |
| **Entity framework** | `erp_entity_notes`, `erp_entity_attachments`, `erp_audit_logs` |
| **Integration** | `erp_import_jobs`, `erp_import_mappings` |
| **Platform staff** | `erp_platform_staff`, `erp_platform_role_permissions`, `erp_platform_staff_permissions` |

**Standard entity fields** (the entity contract): every registry entity carries
`company_id`, `branch_id` (where applicable), `created_by`, `created_at`,
`updated_by`, `updated_at`, `status`, `external_id` — added nullable for zero
breakage. See `ENTITY-FRAMEWORK.md` §1a.

**Write paths.** Most writes go directly through RLS-scoped tables. Sensitive or
cross-cutting writes go through **SECURITY DEFINER RPCs** (e.g.
`erp_apply_setup_modules`, `erp_set_default_mapping`, `erp_admin_set_password`)
so the privileged step is centralized, gated, and auditable. Migrations and
service-role edge functions bypass RLS by design.

---

## 4. Security model

Defense in depth, with the database as the final authority.

1. **Authentication** — Supabase Auth (email/password). `auth.uid()` is the
   identity used by every policy and helper.
2. **Tenant isolation (the core invariant)** — every tenant table is
   `company_id`-scoped (directly or via `branch_id`) and RLS-enforced. One
   company can never read or write another's rows. See §6.
3. **Privilege classes** (mutually checked, never self-grantable):
   - `is_platform_owner` (vendor apex), `is_super_admin` (global staff override),
     tenant branch roles, and the **platform-staff** tier (§8).
   - The `erp_guard_profile_privileges` trigger blocks anyone who is not already
     a super admin from changing `is_super_admin` / `is_platform_owner` /
     `is_active` on a profile → **no self-escalation, no creating Owners**.
4. **SECURITY DEFINER hygiene** — every definer function pins
   `search_path = public, pg_temp` and **revokes `anon`/`public` EXECUTE**
   (granting only `authenticated` where it's an RPC). Verified via the Supabase
   security advisor (target: 0 ERROR; no `anon`-executable app functions).
5. **No infrastructure secrets in the application database.** DB credentials, the
   `service_role` key, and infra secrets live only in Vercel/Supabase env +
   provider dashboards. The app exposes no surface that returns them; the
   service-role key is used only inside edge functions, never shipped to a
   client, and no in-app role (including platform staff) can reach it.
6. **Transport/app hardening** — security headers (HSTS, X-Content-Type-Options,
   X-Frame-Options, Referrer-Policy, Permissions-Policy) in `next.config.mjs`;
   Sentry PII scrubbing; server-side permission checks on every gated page/action
   (not just hidden nav).

---

## 5. Permission model

Three layers on the **tenant** plane, plus a parallel **platform** tier.

**Tenant permissions** (`src/lib/erp/permissions.ts`): dotted keys (e.g.
`sales.sell`, `inventory.view`, `clinic.doctor`, `integrations.manage`). A user's
effective permissions are the union across their branch roles (all permissions
for a super admin).

1. **Global catalog** — `erp_roles` + `erp_role_permissions` (defaults).
2. **Business-type templates** — `erp_business_type_roles` seed a new company with
   the roles its industry needs.
3. **Per-company overrides** — `erp_company_roles` + `erp_company_role_permissions`
   let the owner tailor each company independently.

**Platform permissions** (`src/lib/erp/platform-permissions.ts`) — the vendor
tier (§8): granular keys `view_companies`, `create_companies`, `manage_billing`,
`export_data`, `manage_users`, `access_support_tickets`, `access_audit_logs`;
internal roles `admin / sales / support / implementation / finance`. The Owner
holds all implicitly. Defaults live in `erp_platform_role_permissions` (owner-
editable); per-employee `grant`/`deny` overrides in
`erp_platform_staff_permissions`. Effective = `role defaults ∪ grants − denies`.

---

## 6. RLS strategy

- **Every table has RLS enabled.** No table is left open; reference/lookup tables
  use an explicit "any authenticated user may read" policy.
- **Helper functions, not inline SQL.** Policies call stable SECURITY DEFINER
  helpers so logic is centralized and indexable:
  `erp_user_company_id()`, `erp_user_branch_ids()`, `erp_is_super_admin()`,
  `erp_is_platform_owner()`, `erp_is_company_admin(company)`, and (platform tier)
  `erp_is_platform_staff()`, `erp_platform_has(perm)`.
- **Read vs write are separable.** Where a table needs different audiences for
  read and write, policies are split by command (`for select` / `for insert` /
  `for update` / `for delete`) rather than one `for all`. This is how the
  platform-staff access (migration `0084`) grants `view_companies` **read** to
  `erp_companies` without granting writes; `create_companies` adds a separate
  `insert` policy and `manage_billing` a separate `update` policy.
- **Additive widening.** New audiences are added as **separate permissive
  policies** (Postgres OR's them); existing policies are never narrowed, so a
  migration can't accidentally remove access an actor already had.
- **Owner/service bypass.** Migrations and edge functions run with the service
  role (RLS-bypassing) for legitimate cross-tenant operations; everything they do
  is still funneled through guarded functions and logged.
- **Caveat — column scope.** RLS can gate a row but not specific columns of an
  `UPDATE`. Where that matters (e.g. `manage_billing` updating only billing
  fields) the **server action** restricts the columns and the change is audited.

Verification practice: every migration is dry-run on a fresh **staging** DB in
CI, then applied to production and re-verified by **RLS impersonation** (set
`role authenticated` + `request.jwt.claims`, exercise each persona, roll back).

---

## 7. Audit architecture

- **Single sink:** `erp_audit_logs` (`actor_id`, `actor_email`, `company_id`,
  `action`, `entity`, `entity_id`, `details` jsonb, `created_at`).
- **Forge-proof writes:** rows are written only via `erp_log_audit(...)`
  (SECURITY DEFINER), which stamps `actor_id = auth.uid()` itself — the caller
  cannot spoof the actor. There is no direct INSERT policy.
- **Two capture paths:**
  1. **App-level** — server actions call `logAudit(...)` for business events
     (company created, subscription renewed, password reset, …).
  2. **DB-level triggers** — the platform-staff tables fire AFTER triggers that
     log every staff/role/override change, so **all permission changes are
     audited regardless of code path**.
- **Read access:** Platform Owner + global super admin, plus internal staff with
  `access_audit_logs` (migration `0084`). Records answer *who* did *what*,
  *when*, and on *which company*.

---

## 8. Platform ownership & internal staff (✅ Phases 1–2)

The vendor plane. See `OWNER_GUIDE.md` for operations.

- **Platform Owner** (`erp_profiles.is_platform_owner`) — ultimate control;
  implicitly every platform permission; the only actor who can grant ownership,
  edit role→permission maps, and run owner-only tenant controls.
- **Internal staff** (`erp_platform_staff`, vendor-wide, **no `company_id`**) —
  employees with a role + granular permissions (§5). Managed by the Owner or a
  `manage_users` employee.
- **Escalation guards** (triggers): a non-owner cannot assign a role or grant an
  override conferring a permission they lack; ownership is unreachable through
  staff management (it's the guarded profile flag).
- **Offboarding:** `is_active=false` (+`disabled_at/by`) instantly revokes
  platform access; the `admin-set-user-active` edge function bans the auth login
  and revokes sessions. **Customer/tenant data is never touched.** Reversible.
- **Wired gates:** `/platform/companies` → `view_companies`; create company →
  `create_companies`; subscription/lifecycle → `manage_billing`; `/platform/audit`
  → `access_audit_logs`; `/platform/staff` → `manage_users`. Deeper tenant
  controls (branch/admin provisioning, password reset, modules, permissions)
  remain **owner-only**.

---

## 9. Accounting (how money flows)

Sales/clinic/POS revenue auto-posts to the double-entry ledger via DB triggers
(unified revenue posting), against a seeded Egyptian chart of accounts. Customer
credit limits and aging are enforced/derived in-DB.

---

## 10. Operations

- **Environments:** production + a Supabase staging branch; CI bootstraps the
  full migration chain from zero on staging for every PR.
- **Deploys:** Vercel builds the production branch; migrations are applied to the
  live DB through the reviewed process (see `MAINTENANCE.md`).
- **Observability:** Sentry (env-gated; no-op without DSN), environment + release
  tagging, PII scrubbing.
- **Backups:** `pg_dump` workflow + Supabase PITR; runbooks in `BACKUPS.md`.

See `ROADMAP.md` for what's built vs planned.
