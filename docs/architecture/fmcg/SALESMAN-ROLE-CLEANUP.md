# FMCG Pilot — Salesman role cleanup (applied)

> Applied to the **pilot company only** (`612af0bd-973c-4fed-8e76-80cf444ef9e0`,
> role `salesman`) via `erp_company_role_permissions`. Role-default templates
> (`erp_role_permissions`) and all other tenants are **untouched**. Reversible.

## What was changed
Removed 3 permissions from the pilot salesman (company-override is authoritative
for this tenant, so the removal takes effect immediately):

| Removed | Purpose it gated |
|---------|------------------|
| `sales.sell` | Back-office selling: Quick Sale, Sales Orders (+ generic Sell tab) |
| `customers.manage` | Customer master-data create/edit (+ Customers tab) |
| `customer.create` | Master-data customer creation |

**Resulting set — 15 KEEP (verified):** `field.sales`, `sales.collect`,
`day.close`, `reconciliation.view`, `stock_request.create`, `stock.transfer`,
`stock.view`, `inventory.view`, `product.search`, `pricing.view`, `target.view`,
`report.aggregate.view`, `field.attach_media`, `change_requests.create`,
`credit.request.create`.

## Validation (salesman, 15 perms)
All requested field flows continue to work — each is gated by `field.sales`
(retained) and none depends on `sales.sell`:

| Flow | Gate | Result |
|------|------|--------|
| Van Sales (sell) | `/field/van-sales/sell` → `field.sales`; RPC `erp_van_sell` / `erp_van_sell_with_payment` (no `sales.sell`) | ✅ works |
| Collections | `/field/van-sales/collect` → `field.sales`; settle uses `sales.collect` | ✅ works |
| Customer Statement | `/field/van-sales/statement/[id]` → `field.sales` | ✅ works |
| Returns | `/field/van-sales/return` → `field.sales` | ✅ works |
| Invoice Print | `/print/invoices/[id]` → auth only (no perm gate) | ✅ works |
| Receipt Print | `/print/receipt/[id]` → auth only | ✅ works |

**Menus now hidden for the rep (by perm):** Quick Sale (`sales.sell`), Sales Orders
(`sales.sell`), Customers master-data (`customers.manage`), Sales Returns
(`sales.return` — not granted).

## Known residual (needs the nav-rule cleanup, not a perm change)
Two back-office menu items are gated `… OR sales.collect`, which the rep correctly
keeps for collections, so they remain **visible**:
- **Invoices** `/sales/invoices` — `perm: ['sales.sell','sales.collect']`
- **Collections** `/collections` — `perm: 'sales.collect'`

To hide the generic **invoice editor** from field reps, change its nav rule to
require `sales.sell` only (a pure collector shouldn't create invoices) and/or add a
page guard; to hide the back-office **Collections** link for field-primary roles,
use a nav suppression (e.g. an `fmcg.field_primary` rule). **These touch the shared
`navigation.ts`, so they affect all tenants' nav rules — broader than "pilot only"
— and are left for a separate, approved navigation-cleanup step.**

## Revert (pilot-scoped, exact)
```sql
insert into erp_company_role_permissions (company_id, role_key, permission) values
  ('612af0bd-973c-4fed-8e76-80cf444ef9e0','salesman','sales.sell'),
  ('612af0bd-973c-4fed-8e76-80cf444ef9e0','salesman','customers.manage'),
  ('612af0bd-973c-4fed-8e76-80cf444ef9e0','salesman','customer.create')
on conflict do nothing;
```
No code or schema change was involved — staging role config only.
