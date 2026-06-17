# VANTORA — Cloning the Reference Tenant (demos & future pilots)

The reference tenant (**Nile FMCG Distribution Group**) is the canonical starting
point for demos, training environments, and new distributor pilots. This guide
covers recreating it, deriving a customized clone, and tearing it down — safely.

> **Always use a dedicated demo/staging Supabase project** — never production.
> Set `KAKO_VAN_SALES=1` in that environment.

---

## 1. Recreate the reference tenant as-is (demo / training)

```bash
export DB="<your demo/staging connection string>"
psql "$DB" -f supabase/pilot/reference-company.sql
psql "$DB" -f supabase/pilot/reference-activity-and-validate.sql   # optional: seed activity + validate
```
- **Idempotent:** if the company already exists, the seed is a no-op.
- **Repeatable from scratch:** the seed purges its own prior demo identities
  (`@nile-group.test`), so a `drop public → re-bootstrap → re-seed` cycle needs
  no manual cleanup.
- **Login:** users are seeded in `auth.users` with the emails in
  [`REFERENCE-COMPANY.md` §2](./REFERENCE-COMPANY.md#2-role-matrix).

## 2. Clone into a NEW, customized tenant

The reference seed is a single readable transaction — copy it and adjust.
Recommended steps:

1. **Copy** `supabase/pilot/reference-company.sql` →
   `supabase/pilot/<your-tenant>.sql`.
2. **Rename the company** (the idempotency guard keys on the company name) and its
   email domain (e.g. `@acme-demo.test`). Update the hygiene `DELETE … LIKE` line
   to match the new domain.
3. **Adjust master data** to the customer: branches/codes, warehouses + vans,
   products (codes, prices, `tax_rate`, brands), suppliers, price lists/rules,
   routes, customers (credit limits, payment terms, GPS). Keep the column lists —
   they match the live schema.
4. **Keep the role mapping** (org title → enforced `BranchRole`) unless the
   customer's org differs; titles/departments are organizational and don't grant
   permissions.
5. **Validate**: copy `reference-activity-and-validate.sql`, point it at the new
   company name + emails, and run it — expect `all … role/permission assertions
   passed`.

> Because document numbers are **tenant-scoped** (migration 0268), a clone may
> reuse branch codes (`CAI`, `ALX`, …) that already exist in other tenants on the
> same database without colliding.

## 3. Production pilot (real users, not seeded logins)

For a real pilot, don't seed `auth.users`. Instead:
1. Provision the company + master data (remove the `auth.users` insert block, or
   provision master data through the app/imports).
2. **Invite the real users** via Settings → Users with the roles in the role
   matrix.
3. Run the [Pilot Launch Checklist](./PILOT-LAUNCH-PACKAGE.md#2-one-click-pilot-setup-checklist)
   and one on-device supervised dry-run.

## 4. Pre-clone / pre-pilot checklist

- [ ] Dedicated demo/staging project; `KAKO_VAN_SALES=1`.
- [ ] Unique company **name** (idempotency key) and **email domain**.
- [ ] Every pilot SKU `sell_price > 0` + `tax_rate`; one base UoM.
- [ ] Each rep has an assigned, stocked van; customers approved + on-branch.
- [ ] Readiness Diagnostic = READY; one supervised dry-run passed.

## 5. Teardown (demo/staging only)

```sql
-- Cascades remove branches, warehouses, products, customers, and all activity.
DELETE FROM erp_companies WHERE name = 'Nile FMCG Distribution Group';
-- Optional: clear seeded demo logins.
DELETE FROM auth.users WHERE email LIKE '%@nile-group.test';
```
**Never** run teardown on production. To pause (not delete) a live tenant, flip
`KAKO_VAN_SALES` off or set the per-company toggle off — see the
[Rollback Guide](./PILOT-LAUNCH-PACKAGE.md#7-pilot-rollback-guide).
