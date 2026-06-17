# FMCG Supervisor — Role & Navigation Review (Pre-Change Analysis)

**Methodology:** Feature Inventory → UI Coverage Audit → Role Coverage Audit →
Dependency Validation → Permission Validation. **This is an analysis pass only —
NO visibility, permission, route, flag, schema, or workflow change has been made.**
Recommendations are listed at the end for approval before any implementation.

**Evidence source:** vantora-staging (`rsjvgehvastmawzwnqcs`), pilot tenant, live
account `supervisor@pilot.test`. Permission set read directly from
`erp_company_role_permissions` / `erp_role_permissions` (the same resolution
`erp_user_has_perm` uses). Navigation reconstructed from `visibleSections()` →
`applyNavProfile(..., ['supervisor'])` — the exact pipeline the sidebar and the
mobile "More" drawer render.

---

## 0. Live permission set (36 — confirmed on vantora-staging)

| # | Permission | Group | Nature |
|---|---|---|---|
| 1 | `day.close.supervisor` | Day-close | Approve/own the supervisor stage |
| 2 | `day.approve_close_exception` | Day-close | Approve close with exceptions |
| 3 | `day.close.settle` | Day-close | **Cash settlement** (overlaps cashier) |
| 4 | `day.close.reconcile` | Day-close | Stock/cash reconciliation step |
| 5 | `day.close.reopen` | Day-close | Reopen a closed day |
| 6 | `day.reopen.approve` | Day-close | Approve a reopen request |
| 7 | `reconciliation.manage` | Reconciliation | Run/adjust reconciliation |
| 8 | `reconciliation.view` | Reconciliation | View reconciliation |
| 9 | `returns.approve` | Returns | Approve returns |
| 10 | `returns.reject` | Returns | Reject returns |
| 11 | `returns.create` | Returns | Create returns |
| 12 | `returns.view_all` | Returns | View all returns |
| 13 | `stock_request.approve` | Stock | Approve load/stock requests |
| 14 | `stock_request.adjust` | Stock | Adjust a stock request |
| 15 | `stock.transfer.approve` | Stock | Approve stock transfers |
| 16 | `stock.view` | Stock | View stock |
| 17 | `inventory.view` | Stock | View inventory |
| 18 | `customer.request.approve` | Customers | Approve field requests |
| 19 | `customer.transfer` | Customers | Transfer customer between routes/reps |
| 20 | `customers.change_status` | Customers | Activate/suspend customers |
| 21 | `customers.manage` | Customers | Manage customer master |
| 22 | `customers.view_balance` | Customers | View balances |
| 23 | `customers.view_credit` | Customers | View credit |
| 24 | `cash.handover.confirm` | Cash | Confirm cash handover from rep |
| 25 | `cash.view_outstanding` | Cash | View outstanding cash |
| 26 | `sales.sell` | Sales | **Sell** (overlaps rep) |
| 27 | `sales.collect` | Sales | Collect payment |
| 28 | `sales.return` | Sales | Process a sale return |
| 29 | `sales.discount` | Sales | Apply discount |
| 30 | `route.create` | Planning | Create routes |
| 31 | `journey.create` | Planning | Create journey plans |
| 32 | `visit.approve_out_of_route` | Planning | Approve off-route visits |
| 33 | `reports.view` | Reporting | View reports |
| 34 | `documents.export` | Documents | Export documents |
| 35 | `documents.print` | Documents | Print documents |
| 36 | `documents.share` | Documents | Share documents |

> The supervisor does **not** hold: any `accounting.*`, treasury/cash-box mutation,
> `day.close.try_close` (V1-revoked for everyone), collection reversal/void,
> product master edit, or platform-owner/super-admin rights. So the role is an
> **operational verifier/approver**, not a back-office finance role.

---

## 1. Feature Inventory — what the supervisor role is *for*

The supervisor is the FMCG **branch operations approver and coach**. The 36
permissions cluster into five jobs:

1. **Day-close oversight** — own the supervisor approval stage, approve close
   exceptions, run reconciliation, settle cash, reopen/approve-reopen.
2. **Returns governance** — approve/reject/create/view returns across the branch.
3. **Stock governance** — approve load requests and transfers, adjust requests,
   view stock/inventory.
4. **Customer & field-request governance** — approve field requests, transfer
   customers, change status, manage master, view balance/credit.
5. **Cash handover & coverage** — confirm rep cash handover, view outstanding,
   plan routes/journeys, approve off-route visits, view reports.

This is internally coherent: a supervisor signs off the rep's day, the rep's
money, the rep's stock, and the rep's customers, and plans coverage.

---

## 2. UI Coverage Audit — is every job reachable in the menu?

**Rendered Primary (5)** via the `supervisor` nav profile:

| Label | Route | Covers job |
|---|---|---|
| Approvals | `/approvals/queue` | Returns / requests / day-close approvals hub (job 2,4) |
| Team | `/supervisor` | Team oversight / coaching home (job 5) |
| Coverage | `/territory` | Route/territory coverage (job 5) |
| Van Reconciliation | `/field/van-reconciliation` | Reconciliation + cash/stock settle (job 1,3) |
| Reports | `/reports` | Reporting (job 5) |

**Rendered "More"** — built by a **`hide` denylist** (NOT an allowlist), so the
supervisor keeps almost the entire permitted tree. Only six hrefs are hidden:
`/sales/pos`, `/sales/invoices`, `/products`, `/inventory`, `/inventory/low-stock`,
`/warehouses`. Everything else the 36 permissions unlock falls into More. Observed
More (≈30+ items) includes: Dashboard, Manager/Attention Center, Van Stock,
Notifications, Rep Settlement, Sales Orders, Collections, Cash Box, My Returns,
Sales Returns, Return Approvals, Day-Close Approvals, Day-Close Settlement,
Statement Hub, Daily Summary, Cash Custody, Return Report, Day-Close Report,
Override History, Sales Report, Customers, Customer Transfer, Routes, Van
Accounting, Field Sync, Perfect-Store Scores, Territory Intel, Suggested Load,
Distribution Report, Journey Compliance, Visit Outcomes, …

**Coverage verdict:** ✅ Every one of the five jobs has at least one nav entry
(most have several). **No job is orphaned.** The gap is the *opposite* of the
salesman's: not "missing entries" but a **long, unfocused More** — the denylist
approach surfaces back-office and rep-personal screens (Dashboard, Cash Box, Van
Stock, Rep Settlement) that a supervisor rarely operates directly.

> **Mobile note:** the supervisor lacks `field.sales`, so `isVanSalesman = false`
> → the bottom bar is the **non-unified** layout (Approvals tab is promoted high
> via `day.approve_close_exception`). This is correct: the supervisor is not a van
> operator. No change needed.

---

## 3. Role Coverage Audit — does the role cover the workflow it owns?

Validated against the live day-close → settle → reconcile workflow (the same
10/10 runtime path used in the Pilot Validation):

| Workflow step | Permission held? | Reachable in UI? |
|---|---|---|
| Approve supervisor close stage | `day.close.supervisor` ✅ | Approvals / Day-Close Approvals ✅ |
| Approve close with exception | `day.approve_close_exception` ✅ | Approvals ✅ |
| Settle cash | `day.close.settle` ✅ | Van Reconciliation / Day-Close Settlement ✅ |
| Reconcile stock/cash | `day.close.reconcile` + `reconciliation.manage` ✅ | Van Reconciliation ✅ |
| Reopen / approve reopen | `day.close.reopen` + `day.reopen.approve` ✅ | Day-Close (override history) ✅ |
| Approve returns | `returns.approve`/`reject` ✅ | Return Approvals ✅ |
| Approve field requests | `customer.request.approve` ✅ | Approvals ✅ |
| Approve stock requests/transfers | `stock_request.approve`, `stock.transfer.approve` ✅ | Approvals / Routes ✅ |
| Confirm cash handover | `cash.handover.confirm` ✅ | Cash Custody / Van Accounting ✅ |
| Plan routes / journeys | `route.create`, `journey.create` ✅ | Routes / Coverage ✅ |

**Verdict:** ✅ The supervisor can complete every approval/oversight workflow it
owns, end-to-end, from the rendered menu. No permission-without-UI and no
UI-without-permission dead ends were found in the owned workflow set.

---

## 4. Dependency Validation — what breaks if we later simplify More?

Because today's profile is a **denylist**, simplifying would mean either (a)
extending the denylist, or (b) switching to an **allowlist** (the salesman
pattern). Dependencies to respect *before* any such change:

- **Approvals hub is the spine.** `/approvals/queue` aggregates returns, field
  requests, stock requests, and day-close exceptions. As long as it stays
  primary, hiding the individual *Return Approvals / Day-Close Approvals* deep
  links from More would **not** orphan those workflows (they remain reachable via
  the hub + permission + URL). Must verify each approval type actually surfaces in
  the hub before hiding its standalone entry.
- **Van Reconciliation is the settle/reconcile home.** Keep it primary; it is the
  single nav path to `day.close.settle` + `reconciliation.manage`. Hiding the More
  duplicates (Day-Close Settlement, Override History) is safe only if Van
  Reconciliation exposes them.
- **No runtime/data dependency on nav entries.** As with the salesman, nav items
  carry no server-side dependency; hiding a More entry never disables its page,
  action, or permission. (Confirmed by the same mechanism audited for DF-003.)
- **Rep-personal screens in More** (Van Stock, Cash Custody, My Returns, Daily
  Summary) are the *rep's* tools. A supervisor sees them because they share
  permissions, but they are not supervisor jobs — candidates to hide, with **no**
  dependency risk (owned by the salesman profile/role).
- **Driver/salesman profile is unaffected** — `profileRoleFor` is role-scoped; a
  supervisor change cannot alter the frozen, pilot-ready rep nav.

**Verdict:** ✅ A future allowlist/denylist tightening is dependency-safe provided
Approvals + Van Reconciliation + Reports stay primary and each hidden deep-link's
workflow remains reachable via the hub. **Nothing changed in this pass.**

---

## 5. Permission Validation — over/under-grant flags for the role-permission audit

Cross-checking the 36 permissions against the supervisor's *intended* job surfaces
**three overlap flags** to carry into the upcoming full role-permission audit
(item 4 on your list). **None is changed here — flagged only.**

| Flag | Permission(s) | Observation | Severity |
|---|---|---|---|
| **F-SUP-1** | `day.close.settle` | Supervisor can **settle cash**, which also belongs to the **cashier/treasury** role. This is an intentional small-branch overlap (supervisor can close the rep's day end-to-end) but creates a **segregation-of-duties** question: the same person can approve the close *and* settle the cash. Decide per pilot policy. | **Review** |
| **F-SUP-2** | `sales.sell`, `sales.collect`, `sales.return`, `sales.discount` | Supervisor can **sell/collect/discount** like a rep. Useful for covering a route, but means a supervisor is also a seller. Confirm this is desired vs. oversight-only. | **Review** |
| **F-SUP-3** | `customers.manage`, `customers.change_status`, `customer.transfer` | Strong customer-master authority. Appropriate for a supervisor governing the branch's customer book; flagged only to confirm against the role matrix. | **Confirm** |

**No under-grant found:** every workflow the supervisor must run is permissioned.
**No dangerous grant found:** no accounting mutation, no treasury mutation, no
`day.close.try_close` (V1-revoked), no collection reversal, no super-admin.

> **SoD note for the role-permission audit:** F-SUP-1 is the same `day.close.settle`
> overlap previously flagged between supervisor and cashier. The cashier review
> (next queued role) should resolve which role *owns* settlement so the matrix is
> unambiguous before the audit signs off.

---

## Summary verdict

| Dimension | Result |
|---|---|
| Feature inventory | ✅ Coherent operational-approver role (5 job clusters) |
| UI coverage | ✅ All jobs reachable; ⚠️ More is long/unfocused (denylist) |
| Role coverage | ✅ Owns full day-close/returns/stock/customer approval workflow |
| Dependency validation | ✅ Future simplification is dependency-safe (hub stays primary) |
| Permission validation | ✅ No under/dangerous grant; ⚠️ 3 overlap flags (F-SUP-1/2/3) |

**The supervisor role is functionally sound and pilot-safe as-is.** The only
*usability* observation is the long denylist-driven More menu; the only
*governance* observations are the three overlap flags for the role-permission
audit.

---

## Recommendations (for approval — NOT applied)

1. **(Usability, optional) Tighten the supervisor More to an allowlist**, mirroring
   the salesman pattern, focused on the supervisor's real jobs: Day-Close
   Approvals, Return Approvals, Override History, Day-Close/Return/Sales/Distribution
   reports, Customers, Customer Transfer, Routes, Cash Custody (handover), Territory
   Intel, Journey Compliance, Visit Outcomes. This hides rep-personal and pure
   back-office screens without touching permissions. *UI-only, reversible, but a
   nav change — deferred to your approval given the pilot freeze.*
2. **(Governance) Resolve F-SUP-1 in the role-permission audit** — decide whether
   `day.close.settle` is supervisor-owned, cashier-owned, or deliberately shared,
   and document the SoD stance.
3. **(Governance) Confirm F-SUP-2** — keep supervisor selling rights (route
   coverage) or restrict to oversight-only.
4. **(No action) F-SUP-3** — confirm customer-master authority against the matrix;
   expected to stand.

## Status
- **Analysis only.** No visibility, permission, route, flag, schema, or workflow
  change made. Pilot freeze respected. Evidence captured live on vantora-staging.
- Next queued: Cashier/Treasury review (same methodology) — will resolve the
  F-SUP-1 settlement-ownership question — then the full role-permission audit.
