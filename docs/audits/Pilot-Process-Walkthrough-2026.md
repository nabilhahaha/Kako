# Pilot Process Walkthrough & Operational Validation

**Purpose:** validate the FMCG van-sales pilot **operationally** — the end-to-end
"day-in-the-life" flow — against the now-**frozen** role / authorization / treasury
model. This is process validation (no code/permission/DB changes; baseline frozen).

**Frozen baseline under test:** Role model · Authorization model · Treasury model ·
`main` stabilized · CI green. Authority facts below are from the **live**
`erp_user_has_perm` matrix on vantora-staging (`612af0bd…`).

---

## A. Operational actors (frozen authority, one line each)

| Actor | Operates | Frozen authority (holds) | Deliberately cannot |
|---|---|---|---|
| **Sales Rep** (salesman/driver) | The van + customer visits | sell, collect, (van) returns, start/submit day | reverse, cash box, settle, approve, accept own cash |
| **Supervisor** | Oversight & approvals | approve returns/requests, day-close supervisor stage, **reconcile**, accept cash handover, manage customers/routes | **sell, collect, settle**, operate cash box |
| **Branch Manager** | Branch operations | broad ops + approvals + reconcile | **settle**, cash box |
| **Cashier / Treasury** | The office cash | accept cash handover, **settle**, **cash box**, counter sell/collect | reverse, reconcile, approvals |
| **Accountant / Finance** | The books | **reverse collection**, settle, cash box, accept cash, reports | sell, reconcile, approvals |
| **Warehouse Keeper** | Stock/loads | approve stock requests, stock reconcile | sell, collect, cash |
| **Auditor** | Read-only assurance | audit trail + reports | everything else |
| **Admin** | Override | everything | — |

---

## B. The operating cycle (end-to-end)

Each step: **actor → action → screen → frozen permission → expected outcome**.

| # | Step | Actor | Screen / route | Permission (frozen) | Expected outcome |
|---|---|---|---|---|---|
| 1 | Approve & load van stock | Warehouse/Supervisor | `/inventory/requests`, `/approvals/queue` | `stock_request.approve` | Van loaded; rep stock set |
| 2 | Start day | Rep | `/today` | `field.sales` / `day.close` | Day opened |
| 3 | Pick customer → view statement/balance | Rep | `/today` → `/field/van-sales/statement/[id]` | `field.sales` (+ `customers.view_balance` for balance) | Customer context + AR shown |
| 4 | **Sell** off the van | Rep | `/field/van-sales/sell` | `sales.sell` | Invoice issued atomically (`erp_van_sell`) |
| 5 | **Collect** payment | Rep | sell/collect flow, `/collections` | `sales.collect` | Collection posted; AR reduced |
| 6 | **Return** goods | Rep | `/field/van-sales/return` | `returns.create` | Return submitted for approval |
| 7 | Next customer (smart) | Rep | `/today` | `field.sales` | Next stop |
| 8 | **End day** (submit) | Rep | `/today` (End Day) | `day.close.submit` | Day-close chain started |
| 9 | Approve returns | Supervisor | `/field/van-sales/approvals` | `returns.approve` | Returns approved/rejected |
| 10 | Approve field/customer requests | Supervisor | `/approvals/queue` | `customer.request.approve` | Requests actioned |
| 11 | Day-close **supervisor** stage | Supervisor | `/field/van-sales/day-close-approvals` | `day.close.supervisor` | Stage approved |
| 12 | **Reconcile** stock/cash | Supervisor | `/field/van-reconciliation` | `day.close.reconcile` / `reconciliation.manage` | Variances reconciled |
| 13 | Rep hands cash to office | Rep → Cashier | cash handover | rep `cash.handover.request`; **cashier `cash.handover.confirm`** | Cash accepted by treasury |
| 14 | **Settle** the day's cash | **Cashier** | `/field/van-sales/day-close-settlement` | `day.close.settle` | Financial settlement done |
| 15 | Operate **cash box** | Cashier | `/cashbox` | **`treasury.manage`** | Shift open/close, expenses |
| 16 | Financial review / **reverse** (exception) | **Accountant** | `/collections` (Reverse) | `accounting.post` | Erroneous collection reversed |
| 17 | Day closed; carry-forward | system | — | — | Unpaid AR carries to next day |
| 18 | Read-only assurance | Auditor | `/audit`, `/reports` | `audit.view`, `reports.view` | Full trail visible, no mutation |

---

## C. Segregation-of-duties handoffs — the deliberate stop points (LIVE-validated)

The frozen model forces clean operational handoffs. Each was confirmed on the live
matrix (allowed ●, blocked ·):

| Handoff (operational hand-over) | Who is blocked | Who must take it | Live check |
|---|---|---|---|
| Rep finishes the day → **cash settlement** | Rep ·, Supervisor ·, Branch Mgr · | **Cashier / Accountant / Admin** ● | settle: rep/sup/bm = · ; cashier/acct/admin = ● |
| Rep needs a **collection reversed** | Rep ·, Supervisor ·, Cashier · | **Accountant / Admin** ● | accounting.post: only acct/admin = ● |
| Rep hands over cash → **acceptance** | Rep cannot accept own · | **Cashier / Supervisor / Accountant** ● | cash.handover.confirm: rep = · |
| Anyone wants the **Cash Box** | Rep ·, Supervisor · | **Cashier / Accountant / Admin** ● | treasury.manage: rep/sup = · |
| Day close: **approve vs settle** split | Supervisor settles · | Supervisor approves+reconciles ●; Cashier settles ● | supervisor: supervise/reconcile = ● , settle = · |

**Result:** every operational handoff the frozen SoD creates has a clearly-authorized
receiver — no step is orphaned, and no single role can both execute and self-approve
the cash cycle.

---

## D. Per-role manual UI validation checklist (for pilot testers)

Run as each pilot account; tick expected ✓ / blocked ⛔.

**Sales Rep (`salesman@pilot.test`)** — ✓ start day · ✓ sell · ✓ collect · ✓ create return ·
✓ submit End Day · ⛔ Reverse button hidden in Collections · ⛔ `/cashbox` (direct URL → unauthorized) ·
⛔ settlement/approvals not visible.

**Supervisor (`supervisor@pilot.test`)** — ✓ approve returns · ✓ approve requests · ✓ day-close
supervisor stage · ✓ reconciliation · ✓ accept cash handover · ⛔ no Sell/Collect · ⛔ `/cashbox`
unauthorized · ⛔ cannot settle.

**Cashier (`cashier@pilot.test`)** — ✓ accept cash handover · ✓ settle day · ✓ `/cashbox` shift +
expenses · ⛔ Reverse hidden · ⛔ no reconciliation/approvals.

**Accountant (`accountant@pilot.test`)** — ✓ Reverse a collection (reason required) · ✓ settle ·
✓ `/cashbox` · ✓ reports · ⛔ no Sell · ⛔ no reconciliation.

**Branch Manager (`branchmgr@pilot.test`)** — ✓ approvals + reconcile + manage · ⛔ cannot settle ·
⛔ `/cashbox` unauthorized.

**Auditor (`auditor@pilot.test`)** — ✓ audit trail · ✓ reports · ⛔ everything else.

**Admin (`admin@pilot.test`)** — ✓ all (override path).

---

## E. Operational readiness notes

- **Workflow logic unchanged by the freeze** — only *who* may act on each stage changed
  (settlement/treasury/reverse ownership). The day-close chain RPCs
  (`erp_submit_day_close` → supervisor → reconcile → settle) are the same validated
  path; the frozen model just routes each stage to the correct role.
- **Documented (accepted) gaps:** V2 / V3 enforcement gaps remain documented, post-pilot
  (unchanged by this walkthrough).
- **Carry-forward** of unpaid AR across the day-close boundary behaves as previously
  validated (outstanding rolls to the next day).
- **CI/infra note (non-baseline):** the e2e webServer fix is on `main`; the pilot branch
  still has the old config — sync when the freeze lifts (no operational impact on the
  pilot tenant).

---

## Next step (operational validation execution)
This walkthrough is the script. Recommended execution: **drive the cycle (steps 1–18)
on the live preview as each role**, capturing pass/fail per the §D checklist. I can (a)
run a **live RPC-level end-to-end** of the day-close cash cycle (steps 8–17) as fresh
runtime evidence under the frozen model, and/or (b) walk a specific flow with you
step-by-step. Tell me which flow to validate first.
