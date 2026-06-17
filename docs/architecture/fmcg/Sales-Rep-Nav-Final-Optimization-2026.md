# FMCG Sales Rep Navigation — Final Optimization (Pre-Freeze)

Final UI-only simplification via the **Salesman Navigation Profile** (`applyNavProfile`
allowlist). **No functionality, permission, route, API, workflow, database object, or
server action was deleted** — hidden items keep their route + permission and remain
reachable for their owning roles and by direct URL. Principle applied: *if a task is
completed through My Day, it is not a separate nav item.*

---

## Final Sales Rep menu structure

**Primary (4):** My Day (`/today`) · Customers (`/customers`) · Collections
(`/collections`) · Van Stock (`/field/stock`)

**More (7):**
- Returns (`/field/van-sales/my-returns`)
- Customer Statements / Profile (`/field/van-sales/statement`)
- Daily Summary (`/field/van-sales/summary`)
- My Cash Custody (`/field/van-sales/cash-custody`)
- Load Request — van sales only (`/inventory/requests`)
- Notifications (`/notifications`)
- **Field Requests** (`/field/van-sales/requests`) — **retained** (see note)

> **Why Field Requests stays although it wasn't in the keep-list:** My Day exposes
> **no** path to request-creation (New Customer / Data Change / GPS / Credit / Route
> Transfer / Reactivate / Close). Hiding the entry would **orphan** that workflow
> (verify #5/#6). It is the only navigational entry to it. Recommendation below offers a
> way to remove it cleanly if desired.

**My Cash Custody** is kept as requested — the rep sees current cash under custody,
collection entries, and movement (`loadMyCashCustody`, the rep's **own** cash; it is
*not* Treasury and carries no settlement/adjustment power).

---

## Before vs After

| Area | Before (previous trim) | After (final) |
|---|---|---|
| Primary | My Day · Customers · Collections · Van Stock | **unchanged** |
| More | Sales Order/Invoice, Field Requests, Returns, Statements, Daily Summary, Cash Custody, Load Request, Offline, Notifications (9) | Returns, Statements, Daily Summary, Cash Custody, Load Request, Notifications, Field Requests (7) |
| Removed this pass | — | **Sales Order/Invoice** (`/sales/invoices`), **Offline** (`/field/offline`) |

Already hidden in the prior pass (still hidden): Sell/POS, Sales Orders, Route Execution,
Attention Center, Rep App, Rep Accounting/Settlement, Cash Box/Treasury, Visit Planning,
Rep Journey, Vehicle Reconciliation, Coaching, Near Expiry, Van Transfer.

---

## Restricted (must NOT access) — confirmed permission-gated, not nav-gated

The salesman role does **not** hold these permissions, so these are blocked at the
authorization layer (not merely hidden):

| Restricted | Gate (salesman lacks it) |
|---|---|
| Treasury / Cash Box | nav hidden + no treasury permission |
| Cash Settlement **Approval** | `day.close.settle` — not held |
| Cash / Stock **Reconciliation** | `reconciliation.manage` / `.approve` — not held (only `reconciliation.view`) |
| Financial Adjustments / Accounting | `accounting.*` — not held |
| Collection Reversal / Void | reversal permission — not held |

(My Cash Custody is read-only visibility of the rep's own cash — no adjustment power.)

---

## Verification (1–7)

1. **New Visit from My Day** — ✅ Smart Next Customer / visit flow in `/today` → `/field/journey`.
2. **Sales execution from My Day** — ✅ van-sell runs from the My Day visit flow (no standalone POS needed).
3. **End Day from My Day** — ✅ `End Day` action in My Day (`endDaySettle`, `/field/journey?endday=1`); `day.close.submit`.
4. **Next Customer after sale/collect/return/visit** — ✅ Smart Next Customer (`platform.smart_next_customer` on; `loadNextCandidates`) drives the next stop.
5. **No orphan screens** — ✅ with Field Requests retained, every workflow has a nav path; hidden screens remain reachable by URL/owning role.
6. **No hidden dependency on removed entries** — ✅ nav items carry no runtime dependency; removing `/sales/invoices` + `/field/offline` from the allowlist doesn't affect their pages, which still exist and resolve.
7. **Full day within the simplified nav** — ✅ My Day (visit → sell → collect → return → End Day) + More (returns history, statements, summary, custody, load request, field requests, notifications). 694 tests pass.

---

## Remaining duplicate navigation items

**None in the rep menu.** Selling/invoicing/journey/route now have a single home (My Day);
the duplicate standalone entries are hidden. The only deliberate "extra" vs your keep-list
is **Field Requests**, retained purely to avoid orphaning request-creation.

---

## Recommendation for further simplification before rollout

1. **Field Requests:** to reach your exact 6-item More, add a **"Requests" entry inside My
   Day** (e.g., a card/action on `/today` or the customer profile), then drop
   `/field/van-sales/requests` from the allowlist. That removal would no longer orphan the
   workflow. *(This is a small My Day UI addition — beyond nav-only, so deferred for your
   approval.)*
2. **Daily Summary** could move into My Day (read-only day stats) and be dropped from More
   for an even leaner menu — same pattern as #1.
3. **Load Request:** keep (reps genuinely request van stock) unless your distributor loads
   vans centrally, in which case hide it (one-line allowlist removal).
4. Otherwise the structure is at the practical minimum: **4 primary + 6–7 More**, focused
   on customer visits, selling, collections, stock, and day execution.

---

## Status
- Shipped (UI-only nav profile); pilot freeze respected. Deployed on the
  vantora-staging-connected preview. Reversible via the `salesman` profile allowlist.
