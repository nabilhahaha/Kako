# Kako — Architecture

Kako is a multi-tenant ERP that adapts to the tenant's **business type** (clinic,
restaurant/café, hotel, salon, pharmacy, laundry, supermarket, wholesale,
distribution, …). One codebase, one database; each company sees only the modules
its plan + business type unlock, and only its own data.

## Stack
- **Next.js (App Router, RSC)** under `src/app`. Server Components fetch data;
  mutations are **Server Actions** (`'use server'`).
- **Supabase** (Postgres + Auth) via `@supabase/ssr`. Security lives in the DB.
- **Tailwind** + a small UI kit in `src/components/ui`.

## Multi-tenancy (the core invariant)
Every tenant table follows the **same pattern**:
- `company_id UUID NOT NULL REFERENCES erp_companies(id)`.
- **RLS** policy: `USING (erp_is_platform_owner() OR company_id = erp_user_company_id())`
  with the same `WITH CHECK`.
- A `BEFORE INSERT` trigger `erp_set_company_id()` stamps `company_id` from the
  caller, and `erp_set_updated_at()` maintains `updated_at`.

`erp_user_company_id()`, `erp_is_super_admin()`, `erp_is_platform_owner()` are
SECURITY DEFINER helpers used by policies. **Never** filter tenancy in app code
only — RLS is the backstop.

## Access control
Three layers, resolved in `getUserContext()` (`src/lib/erp/auth-context.ts`):
- **Permissions** — granular keys (`src/lib/erp/permissions.ts`). A user's
  effective permissions = union of their roles, resolved per company
  (`erp_company_role_permissions`, falling back to global `erp_role_permissions`).
- **Modules** — coarse features unlocked by the plan ∩ the company/business-type
  (`erp_plan_modules`, `erp_business_type_modules`, `erp_company_modules`).
- **Navigation** (`src/lib/erp/navigation.ts`) filters sections by module +
  permission. Pages/actions re-check with `requirePermission` /
  `requireAnyPermission` (`src/lib/erp/guards.ts`).

## Anatomy of a vertical
Each business vertical is added the same way:
1. **Migration** — its tables (multi-tenant pattern above), a `*.manage`/action
   permission, and wiring rows into `erp_role_permissions`,
   `erp_business_type_modules`, `erp_plan_modules`, `erp_company_modules`,
   `erp_company_role_permissions` (backfilled for existing tenants).
2. **permissions.ts / navigation.ts** — the permission + a nav section gated by
   the new module.
3. **`src/app/(app)/<vertical>/`** — `layout.tsx` (guard), pages (RSC), and
   colocated client managers/editors; `actions.ts` (server actions returning
   `ActionResult`).
4. **Checkout → accounting** — money-collecting actions post a balanced journal
   entry (Debit Cash/Bank, Credit Revenue) via a SECURITY DEFINER function, or
   reuse the invoice engine (`createInvoice → issueInvoice → recordPayment`)
   when stock must be deducted (retail/distribution).
5. **Print** — printable docs live under `src/app/(print)/print/<vertical>/`.

## Accounting
- Sales/services post to `erp_journal_entries` + `erp_journal_lines`.
- Standard accounts (system chart): Cash `1100`, Bank `1120`, Sales Revenue
  `4100`, Service Revenue `4200`.
- Retail/distribution deduct stock through `erp_issue_invoice`; service verticals
  post revenue directly (no stock movement).

> Known debt (see CONVENTIONS → roadmap): account codes are referenced literally
> in several posting functions and should move to a per-company **account map**;
> the per-vertical posting functions should consolidate into one helper.

## Layout
```
src/app/(app)/<vertical>/      tenant pages + server actions per vertical
src/app/(print)/print/<...>/   printable documents
src/lib/erp/                   domain: auth-context, permissions, navigation,
                               guards, sales-calc, plans, constants, audit
src/components/ui/             shared UI primitives
supabase/migrations/           ordered SQL migrations (NNNN_name.sql)
```

## Testing
- `npm test` runs Vitest unit tests (`src/**/*.test.ts`) for pure logic
  (sales math, permissions, formatting). CI runs typecheck → test → build.
- DB-level behavior (RLS, posting) is verified against a Supabase branch.
