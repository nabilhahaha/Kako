# VANTORA Staging — FMCG Role Hardening (Merchandiser · Cash Van · Collection Officer · Credit Controller)

**Environment:** `vantora-staging` (Supabase `rsjvgehvastmawzwnqcs`) — **`kako-fmcg` untouched, nothing wiped.**
**Company:** Nile FMCG Distribution Group · **Date:** 2026-06-10.
**Scope:** refine four FMCG roles, separate cash from credit selling, keep the existing **58 users**,
re-run all role assertions, and document before/after.

> Mechanism: VANTORA resolves permissions per company. `erp_user_has_permission(company, perm)` =
> `platform_owner` OR `super_admin` OR (the user's role has a **company-scoped** grant in
> `erp_company_role_permissions` if any row exists for that role in that company, **else** the
> **global** `erp_role_permissions`). So a role can be tightened per-tenant without affecting any
> other tenant or the global defaults. All changes here are **company-scoped to Nile FMCG only**.

---

## 1. What changed (the five role gaps)

| # | Gap | Fix applied on vantora-staging |
|---|---|---|
| 1 | No dedicated **Merchandiser** | New role `merchandiser` (`erp_roles`, non-system) + company grant: `assortment.manage`, `survey.manage`, `grade.manage` (+ field-visit/customer/inventory-view). **No `sales.sell` / `sales.collect` / `sales.credit`.** 10 merch users remapped from `salesman`. |
| 2 | **Cash Van not separated from Credit Van** | New role `cash_van` — cash sell **and** collect, but **no `sales.credit`, no `credit.request.create`**. Hard DB guard `erp_demo_cash_van_credit_guard` (BEFORE INSERT on `erp_invoices`) **blocks any future-dated/credit invoice** by a cash-van user. 6 cash-van users remapped from `salesman`. **Van Sales Reps** (`salesman`) keep cash **and** gain `sales.credit` (cash/credit per company policy). |
| 3 | No **collect-only Collection Officer** | New role `collection_officer` — `sales.collect` + customer maintenance, **`sales.sell` removed**. 1 user remapped from `cashier`. |
| 4 | No **Credit Controller** approval authority | New role `credit_controller` — `credit.request.approve` (+ `credit.request.create`, `accounting.view` read-only, AR-style collect/voucher-approve). **`accounting.post` removed** (cannot post journals). 1 user remapped from `accountant`. |
| 5 | Keep 58 users, refine permissions | All **58 users retained**; only the **30** in the four refined groups were remapped. No user created or deleted. |

Roles added to `erp_roles` (company-usable, `is_system=false`): `merchandiser`, `cash_van`,
`collection_officer`, `credit_controller`. Company-scoped permission rows seeded in
`erp_company_role_permissions` for those four **plus** a `salesman` override that adds `sales.credit`.

## 2. Before → After permission matrix (effective, verified live)

Legend: **✅ = granted · — = not granted.** "Before" = the generic role each group previously
mapped to (standard grant); "After" = the refined company-scoped grant, **confirmed by calling the
real `erp_user_has_permission` under each user's identity** (§4).

| Group (users) | Role before → after | sell | collect | **credit sale** | credit.req.create | **credit.req.approve** | assortment | survey | grade | accounting.post |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Merchandiser** (10) | `salesman` → `merchandiser` | ✅→— | ✅→— | —→— | ✅→— | —→— | **—→✅** | **—→✅** | **—→✅** | —→— |
| **Cash Van** (6) | `salesman` → `cash_van` | ✅→✅ | ✅→✅ | —→— | **✅→—** | —→— | —→— | —→— | —→— | —→— |
| **Van Sales Rep** (12) | `salesman` → `salesman`* | ✅→✅ | ✅→✅ | **—→✅** | ✅→✅ | —→— | —→— | —→— | —→— | —→— |
| **Collection Officer** (1) | `cashier` → `collection_officer` | **✅→—** | ✅→✅ | —→— | —→— | —→— | —→— | —→— | —→— | —→— |
| **Credit Controller** (1) | `accountant` → `credit_controller` | —→— | ✅→✅ | —→— | **—→✅** | ✅→✅ | —→— | —→— | —→— | **✅→—** |

`*` Van Sales Rep keeps the role key `salesman` but gains a **company-scoped** `sales.credit` grant
(so cash **and** credit selling, per company policy) without affecting `salesman` in any other tenant.

**Net effect of the hardening (bold cells above):**
- Merchandiser **loses** selling/collection/credit-request, **gains** assortment + survey + grade.
- Cash Van **loses** credit-request (and credit invoices are blocked at the DB); cash sell+collect intact.
- Van Sales Rep **gains** credit selling.
- Collection Officer **loses** selling (collect-only).
- Credit Controller **gains** credit-request approval authority, **loses** journal posting.

## 3. Screens that changed, per affected role

| Role | Screens **before** | Screens **after** | Change |
|---|---|---|---|
| **Merchandiser** | Field/Van Sales, **Sell**, **Collections**, Customers, Inventory | Field Visits, Customers, Inventory (view), **Assortment**, **Survey**, **Planogram/Grade**, Journey Plan | **−Sell, −Collections; +Assortment/Survey/Grade/Journey** |
| **Cash Van** | Field/Van Sales, Sell (cash+credit), Collections, Customers, Inventory | Field/Van Sales, **Sell (cash only)**, Collections, Customers, Inventory | Sell screen **credit option removed/blocked**; no new screens |
| **Van Sales Rep** | Field/Van Sales, **Sell (cash only)**, Collections, Customers, Inventory | Field/Van Sales, **Sell (cash + credit)**, Collections, Customers, Inventory | **+Credit terms on Sell** |
| **Collection Officer** | **Sell**, Collections, Customers | Collections, Customers | **−Sell (collect-only)** |
| **Credit Controller** | **Accounting (post)**, Collections, Suppliers, Reports | **Credit Approvals**, Accounting (**view-only**), Collections, Suppliers, Reports | **+Credit-request approval; −journal posting** |

Unaffected roles (admin, manager, national_sales_manager, area_manager, supervisor, branch_manager,
warehouse_keeper, accountant, cashier, it_admin, viewer) keep exactly their prior screens — see §4.4.

## 4. Re-run of all role assertions (after the change)

### 4.1 Refined-role assertions — **205 / 205 passed, 0 failed**
Every one of the 30 refined-role users was impersonated (JWT `sub` set per user) and the real
`erp_user_has_permission(company, perm)` was evaluated against the expected matrix:

| Role | Users | Assertions | Passed | Failed |
|---|--:|--:|--:|--:|
| merchandiser | 10 | 80 | 80 | 0 |
| salesman (Van Sales Rep) | 12 | 72 | 72 | 0 |
| cash_van | 6 | 42 | 42 | 0 |
| collection_officer | 1 | 6 | 6 | 0 |
| credit_controller | 1 | 5 | 5 | 0 |
| **Total** | **30** | **205** | **205** | **0** |

### 4.2 Cash-Van credit-invoice guard — **enforced at the database**
| Test (BEFORE INSERT on `erp_invoices`) | Result |
|---|---|
| Cash-van user creates a **credit** invoice (future due date) | **BLOCKED** — `Cash Van representatives cannot create credit invoices (future due date). Cash sales only.` |
| Cash-van user creates a **cash** invoice (due today) | **Allowed** (not guard-blocked) |
| Van Sales Rep creates a **credit** invoice (future due date) | **Allowed** (not guard-blocked) |

(All three executed under the real user identity and rolled back — no demo data written.)

### 4.3 Original role-access suite — still green
The 58-user provisioning suite (**120 / 120**) plus the 205 refined assertions above re-run clean.
**Combined: 325 / 325 role-access assertions pass, 0 failures.**

### 4.4 No collateral damage — unchanged roles spot-checked
| User | Role | Permission | Expected | Got |
|---|---|---|:--:|:--:|
| admin@nile-group.test | admin | sales.sell | ✅ | ✅ |
| gm@nile-group.test | manager | accounting.view | ✅ | ✅ |
| accountant@nile-group.test | accountant | accounting.post | ✅ | ✅ |
| cs.agent@nile-group.test | cashier | sales.sell | ✅ | ✅ |
| warehouse.manager@nile-group.test | warehouse_keeper | inventory.view | ✅ | ✅ |
| modern.trade.sup@nile-group.test | supervisor | reconciliation.view | ✅ | ✅ |
| auditor@nile-group.test | viewer | accounting.post | — | — |

## 5. Final refined grants (company-scoped, Nile FMCG)

| Role | Rows | Permissions |
|---|--:|---|
| **merchandiser** | 16 | assortment.manage, survey.manage, grade.manage, field.sales, field.attach_media, journey.create, customers.manage, customer.create, inventory.view, stock.view, product.search, pricing.view, day.close, reconciliation.view, target.view, report.aggregate.view |
| **cash_van** | 16 | sales.sell, sales.collect, field.sales, field.attach_media, customers.manage, customer.create, inventory.view, stock.view, stock.transfer, stock_request.create, product.search, pricing.view, day.close, reconciliation.view, target.view, report.aggregate.view |
| **salesman** (Van Sales Rep) | 18 | _cash_van set_ **+ sales.credit + credit.request.create** |
| **collection_officer** | 5 | sales.collect, customers.manage, customers.change_status, pricing.view, report.aggregate.view |
| **credit_controller** | 9 | credit.request.approve, credit.request.create, accounting.view, accounting.voucher.approve, sales.collect, suppliers.manage, customers.change_status, reports.view, report.aggregate.view |

## 6. Guarantees
- **kako-fmcg:** not touched in any way during this work.
- **No environment wiped.** All 58 demo users retained; only role mappings + company-scoped grants changed.
- **Global defaults untouched:** every change is scoped to Nile FMCG via `erp_company_role_permissions`;
  `salesman`/`cashier`/`accountant` keep their standard behavior in every other tenant.
- **Cash/credit separation is enforced twice:** by permission (`sales.credit` withheld from cash_van)
  **and** by a BEFORE-INSERT database guard (defence in depth).
