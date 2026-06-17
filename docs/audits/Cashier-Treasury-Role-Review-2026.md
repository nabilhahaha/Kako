# FMCG Cashier / Treasury — Role & Permission Review (Pre-Change Analysis)

**Methodology:** Feature Inventory -> UI Coverage Audit -> Role Coverage Audit ->
Dependency Validation -> Permission Validation. **Analysis only — NO permission,
role, gate, route, or workflow change made.** Recommendations are listed for
approval at the end.

**Standing context (confirmed before analysis):**
Branch `claude/fmcg-sell-collect-loop` (PR #311, canonical pilot) · Deployment
`kako-git-claude-fmcg-sell-collect-loop-...vercel.app` · Vercel preview · Database
**vantora-staging** (`rsjvgehvastmawzwnqcs`). Evidence: code on this branch + live
`erp_user_has_perm` probes acting as each real pilot account.

---

## 0. Effective cross-role ownership matrix (live, vantora-staging)

| Role | collect | accept handover | view cash | **settle** (day.close.settle) | reconcile stage | recon.manage | recon.approve | acct.post (reverse) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| salesman | Y | n | n | n | n | n | n | n |
| **cashier** | Y | **Y** | **Y** | **Y** | n | n | n | n |
| supervisor | n | Y | Y | **Y** | Y | Y | n | n |
| accountant | Y | Y | Y | **Y** | n | n | n | Y |
| admin | Y | Y | Y | Y | Y | Y | Y | Y |

(`collect` = sales.collect; `accept handover` = cash.handover.confirm; `view cash`
= cash.view_outstanding; `reconcile stage` = day.close.reconcile.)

---

## 1. Feature Inventory — what the Cashier/Treasury role is for

The cashier is the **office/treasury cash custodian**. Its permissions cluster into:

1. **Cash acceptance** — confirm cash handovers from field reps (`cash.handover.confirm`).
2. **Cash settlement** — act on the Financial Settlement stage of day close (`day.close.settle`).
3. **Treasury visibility** — view outstanding cash / custody balances (`cash.view_outstanding`); operate the Cash Box (`/cashbox`).
4. **Counter transactions** — record collections (`sales.collect`) and POS sales (`sales.sell`); view customer balances (`customers.view_balance`).
5. **Documents** — print/share/export (`documents.*`).
6. **Multi-vertical POS** — restaurant/pharmacy/laundry/market/fashion cashier surfaces.

The cashier does **not** hold reconciliation (`reconciliation.manage/approve`,
`day.close.reconcile`) and does **not** hold `accounting.post` — so it cannot
reverse collections or post journals.

---

## 2. UI Coverage Audit — treasury screens the cashier reaches

| Screen | Gate | Cashier |
|---|---|---|
| Cash Box / Treasury — `/cashbox` | `sales.collect` | Reachable |
| Collections — `/collections` (record) | `sales.collect` | Reachable (record); **Reverse hidden** (`accounting.post`) |
| Cash Handovers — `/field/van-sales/cash-handovers` | `cash.handover.confirm` | Reachable |
| Day-Close Settlement — `/field/van-sales/day-close-settlement` | `day.close.settle` / `day.close.reconcile` | Reachable (settle stage) |
| Cash Custody — `/field/van-sales/cash-custody` | `field.sales` / `sales.collect` | Reachable |
| Van Reconciliation — `/field/van-reconciliation` | `reconciliation.view/manage/approve` | **Not reachable** (correct — supervisor owns reconciliation) |

> **Nav note:** there is **no `cashier` navigation profile** (`profileRoleFor`
> returns null for cashier), so the cashier sees the **full, un-curated** sidebar
> for everything its permissions unlock — same "long menu" pattern flagged for the
> supervisor. A future cashier nav profile could focus it on Treasury/Cash.

---

## 3. Role Coverage Audit — can the cashier run the treasury workflow end-to-end?

Day-close cash chain: rep submits -> supervisor approves -> stock/cash reconcile ->
**financial settlement** -> closed.

| Step | Permission | Cashier |
|---|---|---|
| Accept rep cash handover | `cash.handover.confirm` | Yes |
| View outstanding / custody | `cash.view_outstanding` | Yes |
| Operate cash box | `/cashbox` (`sales.collect`) | Yes |
| Settle the day (financial stage) | `day.close.settle` | Yes |
| Reconcile stock/cash | `reconciliation.manage` / `day.close.reconcile` | **No (by design — supervisor)** |

**Verdict:** the cashier can complete its treasury workflow (accept -> hold ->
settle). Reconciliation is intentionally a different owner (supervisor), giving a
clean accept/settle vs. reconcile split.

---

## 4. Dependency Validation

- **Settlement depends on the upstream chain** (supervisor approval + reconcile must
  precede financial settlement). The cashier settles the financial stage; this is
  independent of *who* reconciles. So adjusting settlement ownership (below) does not
  break the chain as long as at least one settle-capable role remains.
- **`/cashbox` depends on `sales.collect`** — an over-broad dependency (see C-1): the
  field Sales Rep also holds `sales.collect`, so the Treasury Cash Box page is
  reachable by a rep via direct URL (nav-hidden, not authz-blocked).
- **No data/schema dependency** on any proposed change — these are permission/gate
  policy questions, not structural.

---

## 5. Permission Validation — focus-area findings

### Cash Settlement Ownership  ·  **C-2 (SoD)**
`day.close.settle` is held by **cashier, supervisor, accountant, admin** — four
roles. Critically, the **supervisor both APPROVES the day close (`day.close.supervisor`)
and can SETTLE the cash (`day.close.settle`)** — the same person approves and settles.
This is the F-SUP-1 flag from the supervisor review, now confirmed at the treasury
layer.
**Recommendation:** define settlement owner = **Cashier/Treasury + Finance(accountant)
+ Admin**, and **remove `day.close.settle` from the supervisor** so the approver is
not also the settler. (Cashier remains a settler — settlement is a treasury job.)

### Cash Acceptance  ·  **C-3 (OK)**
`cash.handover.confirm` held by cashier/supervisor/accountant/admin; the **rep cannot
accept its own handover** (salesman = false). Correct SoD. No change.

### Reconciliation Ownership  ·  **C-4 (Confirm)**
`reconciliation.manage` = supervisor + admin; `reconciliation.approve` = admin;
`day.close.reconcile` = supervisor + admin. **Cashier is excluded from reconciliation
entirely** — a clean split (cashier settles, supervisor reconciles). No change
recommended, but **confirm** this is the intended ownership (some treasuries want to
own cash reconciliation themselves).

### Treasury Permissions / Exposure  ·  **C-1 (Treasury exposure)**
**`/cashbox` (Cash Box / Treasury) is gated only by `sales.collect`** — which the
**Sales Rep holds**. The rep is hidden from it in the nav profile, but can reach the
office Cash Box page by direct URL (hidden, not blocked).
**Recommendation:** gate `/cashbox` on a **treasury** permission (e.g.
`cash.view_outstanding` or a dedicated treasury key) instead of `sales.collect`, so
field reps are authorization-blocked, not merely nav-hidden.

### Reverse / Posting  ·  **C-5 (OK)**
`accounting.post` (reverse authority) = **accountant + admin only**; cashier and
supervisor cannot reverse. Consistent with the just-shipped Collection-Reverse fix.
No change.

---

## Summary verdict

| Dimension | Result |
|---|---|
| Feature inventory | Coherent treasury/cash-custodian role |
| UI coverage | Treasury screens reachable; no `cashier` nav profile (broad menu) |
| Role coverage | Accept -> hold -> settle fully covered; reconcile intentionally excluded |
| Dependency validation | Settlement chain intact; `/cashbox` over-broad dependency (C-1) |
| Permission validation | C-1 treasury exposure · C-2 settlement-ownership SoD · C-3/C-4/C-5 mostly clean |

**The cashier/treasury role is functionally sound.** Two governance items warrant a
decision: **C-1** (rep can reach the Cash Box by URL) and **C-2** (settlement owned by
too many roles; supervisor approves *and* settles).

---

## Recommendations (for approval — NOT applied)

1. **C-2 — finalize settlement ownership (SoD):** remove `day.close.settle` from the
   **supervisor**; keep it on **cashier + accountant + admin**. This separates "approve
   the close" from "settle the cash". *(Permission change — code default + pilot
   company override, same pattern as the supervisor removal.)*
2. **C-1 — close treasury exposure:** re-gate `/cashbox` on a treasury permission
   (`cash.view_outstanding` or a dedicated treasury key) instead of `sales.collect`,
   so the Sales Rep is authorization-blocked from the Cash Box, not just nav-hidden.
3. **C-4 — confirm** reconciliation ownership stays supervisor-owned (cashier excluded),
   or move cash reconciliation to treasury if that matches your operating model.
4. **(Optional, UI)** add a **cashier nav profile** (Treasury/Cash-focused Primary +
   curated More), mirroring the salesman profile, to declutter the cashier menu.

## Status
- **Analysis only.** No permission/gate/route/workflow change made. All evidence from
  branch `claude/fmcg-sell-collect-loop` + live probes on vantora-staging.
