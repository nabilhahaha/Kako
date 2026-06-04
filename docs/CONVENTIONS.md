# Kako — Conventions

Keep new code consistent with these so the platform stays maintainable.

## Database
- Table/function names are prefixed `erp_`; tables are snake_case and singular-ish
  (`erp_clinic_visits`, `erp_restaurant_orders`).
- **Every tenant table** gets: `company_id` (NOT NULL, FK), RLS tenant policy,
  `erp_set_company_id` BEFORE INSERT trigger, `erp_set_updated_at` trigger,
  and `created_at`/`updated_at`.
- Migrations are immutable and ordered: `NNNN_short_name.sql`, idempotent where
  possible (`CREATE … IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DROP POLICY IF
  EXISTS` before create). Wiring inserts should backfill existing tenants.
- SECURITY DEFINER functions: always `SET search_path = public, pg_temp`, check
  the caller (`erp_is_super_admin()` / company match), and `REVOKE … FROM public;
  GRANT EXECUTE … TO authenticated`.

## Server actions
- File: `actions.ts`, top line `'use server'`.
- Return `ActionResult<T>` (`{ ok, error?, data? }`) — never throw to the client.
- Guard first: `requirePermission` / `requireAnyPermission`, then check
  `ctx.companyId`. Translate DB errors with `friendlyDbError`.
- `revalidatePath` the affected routes after a mutation.

## UI
- Pages are Server Components; interactive parts are colocated `*-manager.tsx` /
  `*-editor.tsx` client components.
- Use the `ui/` primitives (Button, Card, Input, Badge…). Money via
  `formatCurrency`, dates via `formatDate`. RTL: Arabic labels, `dir="ltr"` on
  numeric/phone/code fields.
- Lists get a search + empty state; destructive actions confirm.

## Permissions & modules
- Add a permission to the `Permission` union + `PERMISSION_LABELS`, grant it in
  the migration (global + per-company backfill).
- Gate nav items by `perm` (and `module` for a whole section). Re-check in the
  page/action — nav visibility is not security.

## Tests
- Pure logic gets a `*.test.ts` next to it (Vitest). Prefer testing
  calculations, permission resolution, and formatters.

## Roadmap to "high level" (tracked debt)
1. **Consolidate verticals** — one parameterized order/ticket engine + shared
   "priced catalogue" + shared dashboard/day-closing/UI kit (today: ~4 near-
   duplicate editors, 3 service managers).
2. **One accounting helper** + per-company **account map** (no literal account
   codes in functions); make multi-step actions atomic.
3. **More tests** — RLS/posting integration tests; raise coverage before refactor.
4. **Module registry** — declare each vertical (module, permission, nav, business
   types, tables) in one typed place.
5. **Security pass** — audit SECURITY DEFINER fns, the admin-create-user edge
   function, and RLS coverage.
