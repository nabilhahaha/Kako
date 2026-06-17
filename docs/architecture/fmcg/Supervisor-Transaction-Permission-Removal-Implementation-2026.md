# Supervisor Role Policy — Implementation Report: Transaction Permissions Removed

**Change:** the Supervisor is now an operational manager / **approver**, not a
transaction executor. Removed `sales.sell`, `sales.collect`, `sales.return`,
`sales.discount` from the global role definition **and** the pilot tenant override.

**Status: IMPLEMENTED, APPLIED, VERIFIED.** Code + test pushed to
`claude/form-builder-engine-h92fzd` (commit `5bcfbd0`); migration `0335` applied to
vantora-staging (pilot company `612af0bd-973c-4fed-8e76-80cf444ef9e0`).

---

## 1. Permission diff

```
Role: supervisor
REMOVED (4):  sales.sell   sales.collect   sales.return   sales.discount

Applied in 3 places:
  - Code default  ROLE_PERMISSIONS.supervisor      src/lib/erp/permissions.ts
  - DB global     erp_role_permissions             27 -> 23 rows
  - DB pilot      erp_company_role_permissions      36 -> 32 rows  (company 612af0bd...)

Migration: supabase/migrations/0335_supervisor_remove_txn_perms.sql  (applied to vantora-staging)
```

No other role changed. Sales Rep (salesman) and all management roles untouched.

---

## 2. Before / After role matrix (Supervisor)

| Capability | Permission | Before | After |
|---|---|---|---|
| Sell | `sales.sell` | Yes | **No** |
| Collect | `sales.collect` | Yes | **No** |
| Create Returns | `sales.return` | Yes | **No** |
| Apply Discounts | `sales.discount` | Yes | **No** |
| Approve Returns | `returns.approve` | Yes | Yes |
| Approve Day Close | `day.close.supervisor`, `day.approve_close_exception` | Yes | Yes |
| Settle / Reconcile | `day.close.settle`, `day.close.reconcile`, `reconciliation.manage` | Yes | Yes |
| Review Cash Handover | `cash.handover.confirm` | Yes | Yes |
| Approve Field Requests | `customer.request.approve` | Yes | Yes |
| Manage Customers | `customers.manage`, `customers.change_status` | Yes | Yes |
| Manage Routes / Coverage | `route.create`, `journey.create`, `customer.transfer`, `visit.approve_out_of_route` | Yes | Yes |
| Approve Stock Requests / Transfers | `stock_request.approve`, `stock.transfer.approve` | Yes | Yes |
| Monitor / Reports | `reports.view` | Yes | Yes |

Result matches the target operating model exactly: **Approve · Review · Monitor ·
Coach · Manage Customers/Routes/Requests · Returns Approvals · Day Close · Cash
Handover · Reconciliation** — and **NOT** Sell / Collect / Create-Returns / Discount.

---

## 3. Screens removed from the Supervisor menu

| Screen | Gate (now lacking) |
|---|---|
| Create / issue invoice — `/sales/invoices` | `sales.sell` |
| POS sale — `/sales/pos` | `sales.sell` |
| Collections (record **and Reverse**) — `/collections` | `sales.collect` |
| Cash Box — `/cashbox` | `sales.collect` |
| Create sales return — `/sales/returns` | `sales.return` / `sales.sell` |
| Own-cash custody view — `/field/van-sales/cash-custody` | `field.sales` / `sales.collect` |
| Bottom-nav "Sell" tab | `sales.sell` |
| Dashboard quick-actions "New Invoice" / "Collect" | `sales.sell` / `sales.collect` |

**Retained (re-confirmed):** Day-Close Approvals, Day-Close Settlement, Van
Reconciliation, Return Approvals, **Cash Handover review** (`cash.handover.confirm`),
Approvals queue, Customers, Routes/Coverage, Reports, My Returns. Only the rep's
*own-cash custody view* is gone — the handover **review/confirm** workflow remains.

---

## 4. Validation results — runtime (act-as on vantora-staging)

Resolved through `erp_user_has_perm` under each user's JWT (the real DB authz path):

| User | sell | collect | return | discount | Approval / governance perms |
|---|---|---|---|---|---|
| **supervisor@pilot.test** | No | No | No | No | ALL **True** — returns.approve, day.close.supervisor, day.close.settle, reconciliation.manage, cash.handover.confirm, customer.request.approve, customers.manage, customer.transfer, route.create, reports.view |
| **salesman@pilot.test** | **Yes** | **Yes** | (n/a) | (n/a) | unchanged |

DB integrity checks: leftover removed-perm rows in both scopes = **0**;
approval/governance perms still present in the pilot override = **14 / 14**.

> Sales-Rep returns run through the van-sales `returns.create` flow (not
> `sales.return`), so the rep is fully unaffected by this change.

---

## 5. Test results

- **New test added** (`permissions.test.ts`): "Supervisor is an approver, NOT a
  transaction executor" — asserts the four are absent **and** the governance /
  coverage perms (reports.view, customers.manage, customer.transfer, route.create,
  stock_request.approve, stock.transfer.approve, day.approve_close_exception,
  visit.approve_out_of_route) are present.
- Targeted permission/role suites: **56 passed**.
- Full suite: **1176 passed, 0 failed**, 100 skipped.

---

## 6. Confirmation — approval workflows still function correctly

Every Supervisor approval screen is gated by a **dedicated** permission, none of
which was touched (verified in source and at runtime):

| Workflow | Screen | Gate (unchanged) |
|---|---|---|
| Approve Day Close | `/field/van-sales/day-close-approvals` | `day.close.supervisor` / `day.approve_close_exception` |
| Settle / Reconcile | `/field/van-sales/day-close-settlement` | `day.close.settle` / `day.close.reconcile` |
| Review Reconciliation | `/field/van-reconciliation` | `reconciliation.view/manage/approve` |
| Approve Returns | `/field/van-sales/approvals` | `returns.approve` |
| Review Cash Handover | `/field/van-sales/cash-handovers` | `cash.handover.confirm` |
| Approve Field / Stock Requests | `/approvals/queue` | `customer.request.approve`, `stock_request.approve` |

**No approval, day-close, reconciliation, customer-governance, or route-planning
workflow was changed.** Runtime probe confirms all of these resolve **True** for the
supervisor after the change.

---

## Coverage model
- **Default:** route **reassignment** — the supervisor retains `customer.transfer`
  and `route.create`, so an absent rep's route/customers are reassigned to an active
  rep.
- **Exception only:** a time-boxed, audited **"Acting Sales Rep"** elevation, reserved
  for when no other rep is available.

## Reversibility
Fully reversible — re-add the four to `ROLE_PERMISSIONS.supervisor` and re-insert the
rows in `erp_role_permissions` / `erp_company_role_permissions`.
