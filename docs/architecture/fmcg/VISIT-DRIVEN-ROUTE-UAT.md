# Visit-Driven Route (Phase 1) — UAT scenario

> Validates the full **route-driven** salesman day from first customer to
> end-of-day settlement. Flag `platform.visit_driven_route` is **ON** for the pilot
> (`612af0bd…`). Login `salesman@pilot.test` / `test.123` (mobile / narrow window).
> All transactional behaviour is unchanged — this validates the **navigation loop**
> and the **Complete-Visit guard**.

## Pre-conditions
- Day not yet started (or start it from **Today**).
- A planned route with stops (the pilot's branch customers; use the **★ Demo**
  customers to also exercise credit states).
- Flags ON for the tenant: `platform.multi_uom`, `platform.collect_in_sell`,
  `platform.visit_driven_route`; Van Sales active.

## Scenario A — one full visit (the loop)

| # | Step | Expected |
|---|------|----------|
| 1 | **Today** → Start day | Day status = **open** |
| 2 | Hub (`/field/van-sales`) → **Route** (Journey) | Stop list; each stop now shows **Open visit** (primary) + **Check in** (secondary) |
| 3 | Tap **Open visit** on Stop 1 | GPS **check-in** runs (stop marked visited) **and** lands on the **visit context** (statement) for that customer |
| 4 | Visit context | **Route banner**: "Stop 1 of N · Next: <name>"; statement summary + aging + open invoices + ledger; actions **Collect · Sell · Return · Print** |
| 5 | **Statement** review | Credit status, available credit, overdue, open invoices correct |
| 6 | **Collect** → settle a receipt | Collection posts; balance drops; back on the visit context |
| 7 | **Sell** → UoM → Payment → **Issue** (confirmation modal) → **Print Invoice / Receipt** | Invoice issued; status correct; prints correct |
| 8 | **Return** (optional) → reason → submit | Credit note issued + linked |
| 9 | **Complete Visit** | Returns to the **route** with the **next stop highlighted** (`?focus=<nextId>`) |
| 10 | Repeat 3–9 for the next stops | Coverage KPI rises per completed/checked-in stop |
| 11 | When the route is done → **End Day & settle van** (hub CTA) → **van reconciliation** | Reconciliation variance shown; day closes; settlement consistent |

**Pass:** the rep moves **Route → Customer → Statement → Collect → Sell → Return →
Print → Complete Visit → Next** without ever returning to a back-office menu or
re-selecting the customer.

## Scenario B — Complete-Visit guard (the new safeguard)

| # | Step | Expected |
|---|------|----------|
| 1 | On a visit context, tap **Sell** → add a product → **do NOT issue** → press **Back** to the statement | Sale left unfinished |
| 2 | Tap **Complete Visit** | **Blocked** — a dialog appears: "Unfinished work — you have an unfinished **sale**. Complete or discard it." with **Keep working** / **Discard & complete visit** |
| 3 | Tap **Keep working** | Dialog closes; stays on the visit context (rep can finish the sale) |
| 4 | Finish the sale (Issue) → tap **Complete Visit** | Proceeds straight to the route (flag cleared on issue) |
| 5 | Repeat with **Collect** and **Return** started-but-not-finished | Same guard fires; "Discard & complete visit" explicitly clears it and completes |

**Pass:** Complete Visit **never silently closes** a visit while a sale /
collection / return is open; the rep must finish it or **explicitly discard**.

## Scenario C — flag OFF regression (no change when disabled)

1. (Admin) Company Settings → Features → turn **Visit-Driven Route** OFF (or test
   another tenant).
2. Route stops show only **Check in / Photo / Call** (no Open visit); the statement
   shows **no** route banner / Complete Visit. Everything behaves exactly as before.

**Pass:** with the flag OFF the route + statement are identical to today (no
regression).

## Scenario D — edge cases

- **Already-visited stop** → **Open visit** opens the context directly (no second
  check-in).
- **Off-route / walk-in** → Hub **Customer** tile → pick → same visit context (no
  route banner, no check-in) — the escape hatch.
- **Offline** → Open visit queues the check-in and stays on the route (the
  statement needs a connection); no crash.
- **Blocked customer** (★ Demo · Over / Overdue / Cash) → inside the visit, credit
  block + **Collect Now** behave as before; full-cash sale still issues.

## Acceptance
All of Scenario A completes as a single visit-driven loop; Scenario B's guard
blocks accidental completion and requires complete-or-discard; Scenario C confirms
the flag fully gates the behaviour; Scenario D edge cases behave gracefully. No
transaction, schema, or engine change — rollback is the flag OFF.
