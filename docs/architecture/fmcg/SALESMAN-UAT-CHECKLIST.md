# FMCG Salesman — Daily Workflow UAT Checklist (cleaned role model)

> Validates the complete day of a real FMCG salesman on the **cleaned 15-permission
> role** (no `sales.sell`, no `customers.manage`, no `customer.create`). No new
> features — this pass is to **refine** the experience before building more.

## Setup
- **Login:** `salesman@pilot.test` / `test.123` (mobile or narrow window — field UI).
- **Demo customers:** `★ Demo · Good / Near / Over / Overdue / Cash Only` (credit
  states) + `PILOT-C01…C05`.
- **Workspace:** bottom-nav for this rep = **Home · Today · Sell · Inventory · More**
  (no Customers tab — by design). Hub = `/field/van-sales` ("My Day").

## A. Daily workflow checklist (11 areas)

| # | Area | Where | Steps | Expected / Pass |
|---|------|-------|-------|-----------------|
| 1 | **Today** | bottom-nav **Today** (`/today`) | Open Today; start the day | Day status flips to **open**; today's planned visits/route shown |
| 2 | **Route execution** | Hub → **Journey** (`/field/journey`) / **Route** (`/field/route`) | Open a visit; GPS check-in; attach a photo; move to next | Visit check-in records GPS + media; sequence advances; End-Day button visible |
| 3 | **Customer list** | Today/Journey visit list · Sell/Collect customer picker | Find a customer on the route; search in the Sell picker | Customers reachable in route + pickers. *(See Finding F3 — no standalone customer list.)* |
| 4 | **Customer Statement** | Van-Sell → pick customer → **Statement** banner link (`/field/van-sales/statement/[id]`) | Open statement for `★ Demo · Overdue` | Summary (limit/balance/available/overdue) + aging buckets + open invoices + running ledger; **Collect Now** + **Print/PDF** present |
| 5 | **Collect Now** | Statement / credit card → **Collect Now** (`/field/van-sales/collect?customer=`) | From a blocked customer, tap Collect Now; settle | Outstanding invoices auto-load; settle one receipt; balance drops; collection receipt |
| 6 | **Van Sale** | bottom-nav **Sell** (`/field/van-sales/sell`) | Customer → add products (pick **UoM**) → Review → Payment | Credit status card shows; UoM picker under product; live totals; Payment step with cash/credit/partial/mixed |
| 7 | **Invoice Issue** | Sell → **Issue Invoice** → confirmation modal → **Confirm & Issue** | Issue a mixed-tender sale | Confirmation modal lists customer, lines, UoM, totals, payment; on confirm → status **Paid / Partially paid / Credit** correct; blocked customer's credit sale is prevented |
| 8 | **Invoice Print** | Done screen → **Print Invoice** (`/print/invoices`) | Print the issued invoice | Customer, number/date, lines with **UoM**, qty, unit price, discount, **VAT**, net, **paid, remaining, status** |
| 9 | **Receipt Print** | Done screen → **Print Receipt** (`/print/receipt`) | Print the collection voucher | **Collected** = amount paid, **Remaining** correct, method, signatures (the earlier 0.00 bug is fixed) |
| 10 | **Returns** | Hub → **Return** (`/field/van-sales/return`) | Customer → items → reason → submit | Return accepted to van; **credit note** issued + linked; print credit note |
| 11 | **Day Close / Settlement** | Hub CTA **End Day** → `/field/van-reconciliation`; Journey **End Day** (`day.close`) | Reconcile van cash/stock; close the work session | Reconciliation variance shown; day closes; settlement consistent |

## B. Negative checks (the cleanup must hold)

| Check | Expected |
|-------|----------|
| Sidebar **Sales** section (Quick Sale / Sales Orders / Invoices) | **Not visible** |
| **Customers** master-data section + Customers bottom-tab | **Not visible** |
| Open `/sales/invoices` directly | **Redirects to dashboard** (page guard) |
| Open `/sales/pos`, `/sales/orders` | Not in nav; gated by `sales.sell` |
| Collections menu (`/collections`) | Visible (rep keeps `sales.collect`) — acceptable |

## C. Findings — UX friction / duplication / confusion (to refine, not build now)

| ID | Finding | Severity | Recommendation |
|----|---------|----------|----------------|
| **F1** | **No Statement entry on the My-Day hub.** Statement is only reachable from inside Van-Sell (the customer banner). The canonical *Customer → Statement → Collect → Sell* path isn't surfaced where the day starts. | **High** | Add a **customer-first entry**: a customer card/drilldown (or a Statement tile) on the hub so the rep picks a customer once → sees Statement, then Collect/Sell from there. |
| **F2** | **Action-first vs customer-first.** Sell, Collect and Return each **re-pick the customer** separately. For a visit, the rep selects the same customer up to 3×. | **High** | A single **visit/customer context** (pick once → Statement · Collect · Sell · Return tabs) removes the repeated selection — the biggest workflow friction. |
| **F3** | **No standalone customer list for the rep** (by design after removing `customers.manage`). Customers are reachable only via Today/route + in-flow pickers. | **Medium** | Confirm route-driven access is enough; if reps need off-route lookup, add a **read-only field customer list** (no master-data edit) gated by `field.sales`. |
| **F4** | **Two "End Day" concepts:** the hub CTA goes to **van-reconciliation** (settlement); the Journey screen has its own **End Day** (work-session `day.close`). Labels overlap. | **Medium** | Clarify wording — e.g. "**Settle & reconcile van**" vs "**Close visits / End route**" — and chain them (reconcile → close) so it's one obvious finish. |
| **F5** | **Hub tile overload (10 tiles)**, incl. a **"Coming soon" dead tile** (Confirm Load) and **two route tiles** (Journey + Route). | **Medium** | Hide the coming-soon tile; merge Journey/Route; **permission-filter** tiles so a rep sees only what they can act on. Order tiles to the daily flow. |
| **F6** | **Inventory bottom-tab points to generic `/inventory`** (warehouse stock view), not the rep's **van stock** — potentially confusing for a field rep. | **Low** | Point the rep's Inventory tab to **van stock** (`/field/stock`) or relabel. |
| **F7** | **Collections appears in two places** — the hub **Collect** tile and the sidebar **Collections** menu (kept via `sales.collect`). Both valid, mildly redundant. | **Low** | Acceptable; optionally suppress the sidebar Collections link for field-primary roles later (nav rule). |

## D. Acceptance

UAT passes when: every row in **§A** behaves as expected for the cleaned-role
salesman; every **§B** negative check holds; and the **§C** findings are triaged
(High first: F1/F2 — the customer-first context) for the **refinement** pass before
any new functionality. The end-to-end day — **Today → Route → (Customer) Statement
→ Collect → Sell → Invoice → Print → Returns → Day Close/Settlement** — completes
within the Van Sales workspace with no back-office detours.
