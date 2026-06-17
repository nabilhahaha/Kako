# Sales Rep Navigation Simplification Review

Goal: the Sales Rep menu contains only functions a rep performs during daily field
execution. **Mechanism: UI-only visibility via the `salesman` nav profile
(`applyNavProfile` allowlist). Nothing is deleted; permissions, URLs, and server
actions are unchanged** — hidden screens remain reachable for the roles that own
them and by direct URL.

---

## 1. Current menu inventory (rendered, before)

**Primary:** My Day (`/today`) · Sell/POS (`/sales/pos`) · Collections (`/collections`) ·
Customers (`/customers`) · Van Stock (`/field/stock`)

**More (21):** Attention (`/attention`), Coaching (`/coaching`), Route Execution
(`/field/route`), Notifications (`/notifications`), Rep App (`/rep`), Rep Settlement/
Accounting (`/sales/settlement`), Sales Orders (`/sales/orders`), Invoices
(`/sales/invoices`), Cash Box/Treasury (`/cashbox`), Visit Planning (`/sales/journey`),
Rep Journey (`/field/journey`), Field Offline (`/field/offline`), My Returns
(`/field/van-sales/my-returns`), Customer Statements (`/field/van-sales/statement`),
Daily Summary (`/field/van-sales/summary`), Cash Custody (`/field/van-sales/cash-custody`),
Field Requests (`/field/van-sales/requests`), Load Request (`/inventory/requests`),
Near Expiry (`/inventory/expiry`), Vehicle Reconciliation (`/field/van-reconciliation`),
Van Transfer (`/inventory/van-transfer`).

## 2. Proposed simplified Sales Rep menu (rendered, after — shipped)

**Primary (4):** My Day (`/today`) · Customers (`/customers`) · Collections
(`/collections`) · Van Stock (`/field/stock`)  — *Sell/POS removed (selling runs from My Day).*

**More (9):** Sales Order/Invoice (`/sales/invoices`) · Field Requests
(`/field/van-sales/requests`) · Returns (`/field/van-sales/my-returns`) · Customer
Profile/Statements (`/field/van-sales/statement`) · My Daily Summary
(`/field/van-sales/summary`) · My Cash Custody (`/field/van-sales/cash-custody`) ·
Load Request (`/inventory/requests`) · Offline (`/field/offline`) · Notifications.

Maps to the requested target: **My Day · Customers · New Visit · Sales Order/Invoice ·
Collections · Inventory/Van Stock · Returns · Customer Profile · End Day** (New Visit and
End Day live inside **My Day**; Customer Profile = Customer Statements).

## 3. Impact analysis

| Requested removal | Mechanism | Effect |
|---|---|---|
| Sales (POS) — in My Day | Drop `/sales/pos` from profile primary | Rep sells from My Day's van-sell; no duplicate POS tab |
| Collections Reverse | **Permission** (reversal) — not granted to salesman | Already unavailable; no nav change |
| Customer Edit | **Permission** `customer.edit` — not held by salesman | Already unavailable |
| Customer Deactivate / Stop | **Permission** `customers.change_status` — not held | Already unavailable |
| Attention Center | Drop `/attention` from allowlist | Hidden from rep menu |
| Route Execution | Drop `/field/route` | Hidden |
| Sales Rep App | Drop `/rep` | Hidden |
| Sales Rep Accounting | Drop `/sales/settlement` | Hidden |
| Collection section under Invoices | Standalone `/collections` kept (policy); Sales Orders `/sales/orders` dropped | Collections stays primary; duplicate orders entry removed |
| Shift Management / Cash Box / Treasury | Drop `/cashbox` | Hidden (Treasury is a cashier function) |
| Visit Planning | Drop `/sales/journey` | Hidden |
| Sales Rep Journey | Drop `/field/journey` | Hidden |
| Vehicle Reconciliation | Drop `/field/van-reconciliation` | Hidden (supervisor/warehouse function) |

Also simplified out (back-office/non-daily): Coaching, Near Expiry, Van Transfer.
**No permission, flag, schema, server action, or workflow changed.** 694 tests pass.

## 4. Dependencies before removal (checked — none blocking)

- **Selling** still works: van-sell is embedded in **My Day** (`/field/van-sales/sell`
  via the visit flow), so removing the POS tab doesn't remove the ability to sell.
- **End Day** lives in **My Day**; removing rep-accounting/settlement from the menu does
  not affect day-close (`day.close.submit`).
- **Collections** retained for policy; the reverse/void action is permission-gated and
  not granted to the rep — so hiding back-office finance is safe.
- The hidden screens are **owned by other roles** (Treasury→cashier, Vehicle
  Reconciliation→supervisor/warehouse, Route/Visit Planning→supervisor) and stay visible
  for those roles — the profile change is salesman-scoped (`profileRoleFor`).
- Driver role reuses the salesman profile → automatically simplified too.

## 5. Screens "removed" from the rep menu — reachability after (NONE are deleted)

All remain functional. They are only hidden from the rep's menu:

| Screen | Still reachable via |
|---|---|
| Sell / POS (`/sales/pos`) | My Day van-sell flow; direct URL |
| Sales Orders (`/sales/orders`) | Sales Order/Invoice (`/sales/invoices`) kept; direct URL |
| Rep Accounting/Settlement (`/sales/settlement`) | Direct URL; back-office/supervisor reporting |
| Cash Box / Treasury (`/cashbox`) | Cashier/Accountant role menu; direct URL |
| Attention (`/attention`) | Direct URL; supervisor/manager menu |
| Route Execution (`/field/route`) | Direct URL; My Day handles the rep's route |
| Rep App (`/rep`) | Direct URL (legacy entry; My Day is the workspace) |
| Visit Planning (`/sales/journey`), Rep Journey (`/field/journey`) | Direct URL; planning is supervisor-side |
| Vehicle Reconciliation (`/field/van-reconciliation`) | Supervisor/warehouse role menu; direct URL |
| Near Expiry, Van Transfer, Coaching | Direct URL; owning roles |

**No screen becomes orphaned** — every hidden item keeps its route + permission and is
reachable for its owning role. Reversible by editing the `salesman` profile allowlist.

---

## Status
- Shipped (UI-only nav profile) — pilot freeze respected (no functionality/permission/
  schema/workflow change). Deployed on the vantora-staging-connected preview.
- Action-level restrictions (Customer Edit, Deactivate, Collections Reverse) require no
  change — the salesman role never held those permissions.
