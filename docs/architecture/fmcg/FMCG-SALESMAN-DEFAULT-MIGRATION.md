# FMCG Salesman role model — promoted to default + migration strategy

> **Goal:** *New FMCG tenant = correct role model from day one; no manual cleanup.*
> Implemented in migration **`0307_fmcg_salesman_role_default.sql`** (applied to
> staging). Additive, reversible, **existing tenants unchanged**.

## 1. What was promoted

The canonical Van-Sales salesman model (15 KEEP permissions) is now the **default
template**. Removed from the `salesman` **role template** (`erp_role_permissions`):
`sales.sell`, `customers.manage`, `customer.create`.

The `salesman` role is used by the FMCG business types **fmcg / general /
wholesale** (it is inherently a field-sales role — `field.sales` is its core), so
this is the FMCG default. Verified: template now has **15** salesman permissions.

## 2. How NEW companies inherit it (automatic)

At company creation, `erp_seed_company_roles()` (migration 0022) **copies**
`erp_role_permissions` → the company's own `erp_company_role_permissions`, filtered
to the business type's roles. Because the template no longer contains the three
back-office permissions, **every new fmcg/general/wholesale company is seeded with
the clean salesman model** — Van Sales as the canonical workspace
(Today → Statement → Collect → Sell → Invoice → Print), no customer master-data,
no duplicate back-office sales entry points. **No manual cleanup required.**

## 3. Why EXISTING companies stay unchanged

Seeding is a **snapshot at creation**, not a live link. The auth resolver treats a
company's own `erp_company_role_permissions` as **authoritative**; the template is
only a fallback for a company with **no** role config. Verified on staging: **all 5
existing tenants have their own config — none use the fallback** — so the template
change touches none of them. (Nile FMCG, Body for trading, the two pharmacies and
the VANTORA pilot all keep exactly what they had.)

## 4. Migrating a CHOSEN existing FMCG company (explicit opt-in)

When you decide an existing FMCG company should adopt the new default, run the
shipped Platform-Owner-only function:

```sql
select erp_apply_fmcg_salesman_default('<company_id>');   -- returns rows removed
```

It removes **only** `sales.sell`, `customers.manage`, `customer.create` from that
company's `salesman` role and **leaves every other permission and company-specific
override intact**. Reversible (re-add the rows). Guarded by `erp_is_platform_owner()`.

**Recommended rollout for existing FMCG tenants:**
1. Pick the company; snapshot its current salesman perms (for revert).
2. `select erp_apply_fmcg_salesman_default(:id);`
3. Re-validate the six field flows (§6) for a salesman in that company.
4. Repeat per company on your schedule — there is **no bulk auto-migration**.

> The pilot (VANTORA) was already migrated manually (its salesman is at 15 perms);
> running the function on it is a harmless no-op.

## 5. Future formal path — role template versioning (optional)

The platform already has a **versioning system** (migration 0226, gated by
`KAKO_ROLE_VERSIONING`): templates are versioned (Salesman v1/v2/…), each company
records its adopted version, template edits create a **new** version affecting
**new** companies only, and existing companies **upgrade explicitly** while their
overrides survive. When that flag is turned on, this same change is expressed as
**Salesman v2**, and "choose which existing companies adopt" becomes a first-class
per-company *Upgrade* action in the Platform console — superseding the manual
function in §4. Until then, §4 is the operational lever.

## 6. Validation checklist (per company after migrating)

A salesman with the 15-perm model must retain: **Van Sales (sell), Collections,
Customer Statement, Returns, Invoice Print, Receipt Print** — all gated by
`field.sales` (kept) with no `sales.sell` dependency. Back-office Quick Sale, Sales
Orders, Invoices (editor) and Customers-master must be **hidden / blocked**.

## 7. Rollback

- **Template (new companies):** re-insert the three rows into
  `erp_role_permissions` for `salesman` (snippet at the bottom of migration 0307).
- **A migrated company:** re-insert the three rows into its
  `erp_company_role_permissions`.
- **Function:** `drop function erp_apply_fmcg_salesman_default(uuid);`
No schema or code change is involved — role config only.
