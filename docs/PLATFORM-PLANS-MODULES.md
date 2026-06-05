# Platform → Plans & Modules editor

Promotes subscription **plans**, plan **module entitlements**, and **business-type
templates** from migration-only data to first-class, owner-managed platform
features. Route: `/platform/plans` (owner-only).

## What it manages
- **Plans** (`erp_plans`): create · edit (names, limits, trial) · clone · archive
  (`is_active`) · reorder (`rank`). Limits: `max_users`, `max_branches`,
  `max_products`, `storage_limit_mb` (added in migration 0150; NULL = unlimited).
- **Plan entitlements** (`erp_plan_modules`): per-plan module checkboxes, grouped
  Core vs Industry verticals, with a **live impact preview**.
- **Business-type templates** (`erp_business_type_modules`): the default modules a
  new company of each business type is seeded with.

## Impact preview (the safety feature)
Before saving a plan's modules, the editor shows exactly which tenant companies
gain or lose which **effective** modules. Pure logic in `src/lib/erp/plan-admin.ts`
(`planModuleImpact`), mirroring the runtime rule from `auth-context.ts`:

```
effective(company) = enabledCompanyModules ∩ (planModules ∪ non-plan-gated modules)
```

A company is only "affected" if it actually has a changed module enabled, so
flipping a module nobody uses is correctly shown as a no-op.

## Architecture & layers
| Layer | File |
|-------|------|
| Pure logic + validation + impact | `src/lib/erp/plan-admin.ts` (+ `.test.ts`, 14 tests) |
| Server actions (owner-gated, audited) | `src/app/(app)/platform/plans/actions.ts` |
| Server page (loads plans/modules/companies) | `src/app/(app)/platform/plans/page.tsx` |
| Client UI (list/edit/impact/templates) | `src/app/(app)/platform/plans/plans-manager.tsx` |
| i18n | `src/lib/i18n/messages/platform.ts` (`platform.plans.*`) |
| Nav | `navigation.ts` provider → Catalog group |

## Security
- **RLS** (pre-existing, verified): `erp_plans` / `erp_plan_modules` /
  `erp_business_type_modules` allow INSERT/UPDATE/DELETE only for
  `erp_is_platform_owner()`; SELECT for any authenticated user.
- **Server actions** additionally guard `ctx.isPlatformOwner` for a friendly
  message, and **audit every write** via `erp_log_audit` (entities: `plan`,
  `plan_modules`, `business_type_module`).

## Migrations
- `0150_plan_storage_limit.sql` — adds `erp_plans.storage_limit_mb` (additive,
  nullable). Rollback: `ALTER TABLE erp_plans DROP COLUMN storage_limit_mb;`

## Known follow-ups (next increments)
- Module **catalog** view (dependencies, status) — currently code-defined
  (`ALL_MODULES` / `MODULE_DEPENDENCIES`); a read-only catalog tab can surface it.
- **Industry-pack templates** as first-class editable records (today in
  `licensing-catalog.ts`).
- Plan **pricing** integration (today in `erp_billing_plan_prices`, edited via the
  Billing area).
- Latent gap: `pos` is plan-gateable (`ALL_MODULES`) but listed in **no** plan, so
  it is effectively always off for tenants — decide whether `pos` should be a
  plan module or removed from `ALL_MODULES`.
