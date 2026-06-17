# Supervisor Role Policy — Impact Assessment: Removing Transaction Permissions

**Decision under review:** remove `sales.sell`, `sales.collect`, `sales.return`,
`sales.discount` from the **Supervisor** role so the supervisor becomes a pure
operational manager/approver, not a transaction executor.

**Status: ANALYSIS ONLY. No permission, role, migration, or code change has been
made.** Evidence is from the FMCG code line (`claude/fmcg-sell-collect-loop`, where
the Collections / van-sales surfaces live) and the live pilot tenant on
vantora-staging (`supervisor@pilot.test`, 36-permission company override).

---

## Headline confirmation (the question you asked)

> *Confirm whether any pilot workflow depends on supervisor sales, collection,
> return, or discount capabilities.*

**No pilot review/approval/oversight workflow depends on these four permissions.**
Every Supervisor approval screen is gated by a **dedicated** permission, verified in
source:

| Supervisor workflow | Screen | Gate (NOT one of the four) |
|---|---|---|
| Approve Day Close | `/field/van-sales/day-close-approvals` | `day.close.supervisor` / `day.approve_close_exception` (stage perms) |
| Settle / Reconcile day | `/field/van-sales/day-close-settlement` | `day.close.settle` / `day.close.reconcile` |
| Review Reconciliation | `/field/van-reconciliation` | `reconciliation.view/manage/approve` |
| Approve Returns | `/field/van-sales/approvals` | `returns.approve` |
| Review Cash Handover | `/field/van-sales/cash-handovers` | `cash.handover.confirm` |
| Approve Field Requests | `/approvals/queue` | `customer.request.approve` |
| Approve Stock Requests / Transfers | `/approvals/queue` | `stock_request.approve`, `stock.transfer.approve` |
| Manage Customers | `/customers` | `customers.manage`, `customers.change_status`, `customer.transfer` |
| Manage Routes / Coverage | `/territory`, routes | `route.create`, `journey.create`, `visit.approve_out_of_route` |
| Monitor / Reports | `/reports`, `/supervisor` | `reports.view` |

**The entire Supervisor PRIMARY navigation** (Approvals · Team · Coverage · Van
Reconciliation · Reports) is **fully intact** after removal — none of those five
entries is gated by the four transaction permissions.

The **only** capability lost is **direct transaction execution** (sell / collect /
return / discount) — which is exactly the intent. This also resolves the
**F-SUP-1 / F-SUP-2** segregation-of-duties flags raised in the prior Supervisor
review, and is consistent with the Collection-Reverse decision (reverse authority →
Finance + Admin only; supervisor should not reverse).

---

## 1. Workflows currently using these permissions

Exact gating points found in source (non-test):

**`sales.sell`**
- Create / issue invoice — `/sales/invoices` (page + `actions.ts`), `/sales/pos` (`actions.ts`)
- Complete a sales return — `/sales/returns/actions.ts` (accepts `sales.return` **OR** `sales.sell`)
- Bottom-nav "Sell" tab (`/sales/invoices`, module `sales`)
- Dashboard quick-action "New Invoice"
- Invoice/Order entity export (`entities.ts`)
- Contacts quick-add gate; other verticals (pharmacy POS, wholesale) — not FMCG-rep relevant

**`sales.collect`**
- Record collection — `/collections` (page + `recordCollection`)
- **Reverse collection** — `/collections` (`reverseCollection`)  ← ties to the open Collection-Reverse fix
- Cash Box — `/cashbox` (page + actions)
- Cash Custody view — `/field/van-sales/cash-custody` (accepts `field.sales` **OR** `sales.collect`)
- Collect from statement / van-sell — `/field/van-sales/statement/[id]`, `/field/van-sales/sell` (`canCollect`)
- Collect on invoice — `/sales/invoices/actions.ts` (record payment)
- Customer profile "Collect" — `/customers/[id]` (`canCollect`)
- Dashboard quick-action "Collect"; nav items Collections / Cash Box / Cash Custody

**`sales.return`**
- Create / complete sales return — `/sales/returns` (`actions.ts`), nav `Sales Returns` (`/sales/returns`)
- Pharmacy returns (non-FMCG)
- *Note:* approving van-sales returns uses **`returns.approve`**, not `sales.return` — unaffected.

**`sales.discount`**
- Apply line discount in van-sell (`/field/van-sales/sell` `canDiscount`) and POS

---

## 2. Screens that become inaccessible to the Supervisor

Only screens gated **solely** by the four perms, with **no** alternative permission
the supervisor holds, are lost. All are transaction screens (appropriate to drop):

| Screen | Sole gate | Supervisor after removal |
|---|---|---|
| `/sales/invoices` (create/issue invoice) | `sales.sell` | **Lost** → redirect to /dashboard |
| `/sales/pos` (POS sale) | `sales.sell` | **Lost** (actions blocked) |
| `/collections` (record + reverse) | `sales.collect` | **Lost** (nav item disappears) |
| `/cashbox` (cash box) | `sales.collect` | **Lost** |
| `/sales/returns` (create/complete return) | `sales.return`/`sales.sell` | **Lost** (create) — *approvals unaffected* |
| `/field/van-sales/cash-custody` (own-cash view) | `field.sales`/`sales.collect` | **Lost** (supervisor has no `field.sales`) |
| Bottom-nav "Sell" tab | `sales.sell` | Disappears |
| Dashboard quick-actions "New Invoice" / "Collect" | `sales.sell` / `sales.collect` | Disappear |

**Not lost (independent gates, re-confirmed):** Day-Close Approvals, Day-Close
Settlement, Van Reconciliation, Return Approvals, Cash Handover review, Approvals
queue, Customers, Routes/Coverage, Reports, My Returns (`returns.create`).

> **"Review Cash Handover" is safe:** it is the `/field/van-sales/cash-handovers`
> screen gated by `cash.handover.confirm` (held). Only the rep's *own-cash* custody
> view (`cash-custody`) is lost — not the handover **review/confirm** workflow.

---

## 3. Dependencies: route coverage, emergency sales, temporary rep replacement

This is the **only** operational dependency on the four permissions.

- **Route coverage / temporary rep replacement:** today, a supervisor covering an
  absent rep's route can sell, collect, return, and discount directly because the
  role carries these perms. After removal, the supervisor **cannot transact** on a
  route — they can only approve/monitor.
- **Emergency sales:** any "supervisor steps in to close a sale/collect cash" path
  would be blocked at the action layer (server returns unauthorized), not just hidden.
- **No data/integrity dependency:** removal does not affect existing
  collections/invoices/returns already posted, nor any approval workflow. It is a
  *capability* change, not a schema/data change.

So the trade-off is purely operational: **stronger segregation of duties** vs. **loss
of the supervisor-as-relief-rep fallback.**

---

## 4. Recommended replacement workflow for route coverage

Keep the supervisor a pure approver and handle coverage explicitly, using mechanisms
already in the platform (no new build required for the primary option):

1. **Reassign the route to an active rep (preferred, zero new perms).** The supervisor
   **retains** `customer.transfer`, `route.create`, and `journey.create`, so they can
   reassign the absent rep's customers/route to another available rep for the day. This
   is the cleanest FMCG pattern and keeps execution with a rep.

2. **Time-boxed "Acting Sales Rep" assignment (when no other rep is available).** Grant
   the supervisor's user a temporary **`salesman` branch assignment** (`erp_user_branches`)
   for the coverage window, then revoke it. Because a user can hold multiple branch
   roles and `profileRoleFor` resolves the active context, the supervisor gains the rep
   toolset only while covering — without permanently baking transaction power into the
   Supervisor role. (The platform already has delegation/backup-approver and
   impersonation/role-assignment scaffolding — `role-governance`, `user.transfer`,
   `0322_return_approval_delegation` — to support a governed, audited elevation.)

3. **Policy guardrail:** make any acting-rep elevation **audited and time-boxed** (start/
   end), so an approver who also executed during coverage is traceable — preserving SoD
   intent even during the exception.

> Recommendation: adopt **#1 as the default** and **#2 as the documented exception**.
> Do **not** restore the four perms to the Supervisor role permanently.

---

## 5. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaks a Supervisor approval/oversight workflow | **None** | — | Verified: all approval screens use dedicated perms |
| Supervisor cannot cover an absent rep's route | Medium | Medium | Replacement #1 (reassign) / #2 (acting-rep, time-boxed) |
| Emergency sale/collection blocked when no rep present | Low | Medium | Acting-rep elevation (audited), or another branch rep |
| Pilot data / in-flight transactions affected | **None** | — | Capability change only; no schema/data touch |
| Confusion from disappearing nav items (Collections, Cash Box) | Low | Low | Pilot comms; items are correctly out-of-role |
| Removal applied at wrong layer (no effect) | Medium | Low | Remove at the **company override** (`erp_company_role_permissions`) for the pilot tenant **and** the code default `ROLE_PERMISSIONS.supervisor`; the pilot's 36-perm set is a company override, so a code-only change would not take effect on vantora-staging |

**Net risk: LOW.** The change is a pure SoD improvement with one operational
trade-off (route coverage) that has a ready, governed replacement. It is a
**policy/security** change (qualifies under the pilot freeze) and is fully reversible.

---

## Where/how the removal must be applied (when approved)

The pilot supervisor's four perms live in the **company override**
(`erp_company_role_permissions`, tenant `612af0bd…`), *not* only the global default.
A complete removal therefore requires **both**:
1. Code default — drop the four from `ROLE_PERMISSIONS.supervisor` in `permissions.ts`
   (+ update tests) — affects new/global tenants.
2. Pilot tenant — delete the four rows from `erp_company_role_permissions` for
   `role_key='supervisor'` on `612af0bd…` (migration or data fix) — affects the live pilot.

Removing only the code default would leave the live pilot supervisor unchanged.

---

## Recommendation

**Proceed with the removal** — it matches the target operating model, strengthens
segregation of duties, resolves F-SUP-1/F-SUP-2, and breaks **no** approval workflow.
Pair it with route-coverage replacement #1 (reassign) as default and #2 (audited,
time-boxed acting-rep) as the exception. **Awaiting your go-ahead before changing
anything** (per "do not remove the permissions yet").
