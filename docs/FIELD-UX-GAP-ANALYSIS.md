# Field-Sales UX Gap Analysis — My Day & Smart Next Customer

**Brief:** make the field experience **customer-centric and action-centric**, like the reference
screens — the rep instantly knows *who am I visiting*, *what to do next*, *fastest path to finish
the route*. Build on the **existing** Smart Next Customer + My Day. **No new Field Cockpit screen.**

**Target loop (one route-driven workflow):**
```
My Day → Next Customer → Start Visit → Sell / Collect / Return / No Sale → Next Customer → End Day
```

This is analysis only — no structural changes made yet.

---

## What the reference does well (≤2-second comprehension)

1. **One customer in focus** — a single customer card dominates; name + status are the first thing.
2. **Status as glanceable chips** — balance / overdue / credit shown as a couple of colored chips,
   not a table.
3. **Few, large actions** — 3–4 big buttons; the primary action is obvious.
4. **Near-zero chrome** — no KPI wall, no alert feed, no second list competing for attention.
5. **Forward motion is implied** — finish here → next customer; the path is linear, not a hub.

## Current VANTORA My Day composition (salesman, Smart Next ON)

| Order | Element | Role | Verdict |
| --- | --- | --- | --- |
| 1 | **MyDayHero** (Resume / Next Customer / Route completed) | primary next action | ✅ keep — this is the strength |
| 2 | **Customer Picker** (Today JP / All Customers tabs, full list) | pick any customer | ⚠️ duplicate of the route-first path; noise |
| 3 | **Van Stock** tile | utility | ⬇ demote |
| 4 | **Attention / copilot list** | aggregated alerts | ❌ dashboard noise for a rep mid-route |
| 5 | **KPI strip** (6 tiles) | day metrics | ⬇ collapse to one line |

---

## 1. Dashboard elements to remove / collapse / demote

- **Attention / copilot list (My Day) — REMOVE from the salesman workspace.** It's a manager
  signal feed; a rep on a route doesn't act on "overdue invoices count" here. Keep it for office
  roles only. *Effect: removes the biggest noise block + ~1 deferred copilot fetch.*
- **KPI strip (6 tiles) — COLLAPSE to a single progress line.** Replace the 6-tile grid with one
  compact, secondary line: e.g. `3/8 visited · 5 left · EGP 1,240 sold · EGP 800 collected`. Full
  KPIs (compliance %, etc.) move to an optional "Day summary" tucked at the very bottom or behind a
  tap. *Effect: less scroll, less cognitive load; matches the reference's near-zero KPIs.*
- **Van Stock tile — DEMOTE.** Move it out of the primary column into a small secondary action
  (e.g. a "More" row or alongside "View route"); it's a check, not a step in the route loop.

## 2. Duplicate entry points (consolidate)

- **"Next Customer" exists twice:** the **Hero** shows the #1 next customer with **Start Visit**
  inline (1 tap), AND the **Customer Picker** is a second, full list to pick from, AND
  **`/field/next`** is a third surface (top-5). → **Make the Hero the single primary path.** Demote
  the Picker to a collapsed **"Other / off-route customer"** disclosure (the unplanned escape
  hatch), and treat `/field/next` as "see more options," not a co-equal destination.
- **Route navigation exists twice:** **"Continue Route"** (`/field/journey`, full list) vs **Next
  Customer** (Smart Next). In Smart-Next mode the Hero is primary and journey is reachable via the
  small **"View route"** link — keep exactly one primary; journey stays the secondary "full route."
- **Start-Day double CTA (open day):** the day-card path still shows both "Next planned" and
  "Continue Route" when the flag is off; with the Hero this is already resolved for Smart-Next users.
  Ensure no screen shows two primary buttons.

## 3. Actions that should live on the customer screen

The visit hub (customer statement) should host the **entire** action set so the rep never bounces
back to My Day to act:

- **Add "No Sale" / "Couldn't sell" (with reason).** The target loop includes *No Sale*; today the
  visit hub has Collect / Sell / Return + Complete Visit but **no No-Sale path**. Add a No-Sale
  action that captures a reason (reuse the existing day-close skip-reason vocabulary) and then
  completes the visit → next customer. *This is the most important missing action.*
- **Add "Navigate" on the visit screen.** Useful before arrival; currently only on the Hero / Smart
  Next.
- **Keep status first (already good):** balance · overdue · credit chips at the top of the visit —
  this is the reference's "customer status at a glance." Keep Level-2 (aging, invoices, ledger)
  collapsed.

## 4. Route-first workflow improvements

- **Make the loop unbroken and consistent.** Sell "done" now points to **Next Customer** (good).
  Align **Collect** and **Return** "done" steps the same way: after the action, the primary path is
  **back to the visit → Complete Visit → Next Customer**, not "New collection/return." (New-X stays
  secondary, mirroring sell.)
- **Auto-advance on Complete Visit** (already → `/field/next?done=`). Keep, but make the **#1 next
  customer the prominent primary** on that screen (Start Visit one tap); the other four are
  "alternatives," visually secondary.
- **Show route progress in the Hero.** A thin "Stop 4 of 8 · 4 left" line so the rep always feels
  the path length and that End Day is near. Surfaces "fastest path to finish."
- **End Day only when truly done.** Hero already swaps to **End Day & Settle** at route completion —
  keep it as the single completion CTA.

## 5. Reduce taps & screen transitions

| Flow | Today | Target |
| --- | --- | --- |
| My Day → start next visit | Hero **Start Visit** = 1 tap ✅ (but tapping "Next Customer"→list→Start = 2) | Hero Start Visit is THE path; list is "more" |
| Visit → Sell/Collect/Return | full-page navigation each way (`?customer=`) | acceptable now; **opportunity:** open as in-visit sheets to cut 2 transitions/action (larger change — flag later) |
| Action done → next | Sell ✅ Next Customer; Collect/Return → New-X | unify to **Complete Visit → Next Customer** |
| Complete Visit → next visit | `/field/next` list → Start Visit = 2 taps | prominent #1 → 1 tap |
| Picking the wrong-screen customer | scan full Picker list | Picker collapsed; route is the default |

**Net:** removing the attention feed, collapsing KPIs, demoting/collapsing the Picker, and unifying
the done-steps cuts both *visual* load and *taps* per customer, and removes the "which of these do I
tap?" hesitation.

---

## Answering the three questions (after the changes)

- **"Who am I visiting?"** — Hero shows the next customer's name + status chips; the visit hub leads
  with name + balance/overdue/credit. ✅ already strong; protect it by removing competing blocks.
- **"What should I do next?"** — exactly one primary CTA per state (Start Visit / an action /
  Complete Visit / End Day). Achieved by removing the Picker/attention/KPI competition.
- **"Fastest path to finish the route?"** — route progress line + unbroken Complete→Next loop + End
  Day surfacing.

## Recommended implementation order (for approval — nothing changed yet)

All additive, flag-gated under the **existing `platform.smart_next_customer`**, reversible:

1. **Trim My Day noise** — remove the attention/copilot block from the salesman workspace; collapse
   the 6 KPI tiles to one progress line; demote Van Stock. *(Low risk, biggest perceived win.)*
2. **Demote the Customer Picker** to a collapsed "Other / off-route customer" disclosure under the
   Hero (route-first by default). *(Removes the main duplicate entry point.)*
3. **Add "No Sale" (with reason)** to the visit hub → Complete Visit → Next Customer. *(Completes
   the target loop.)*
4. **Unify Collect/Return done-steps** to "Complete visit / Next customer" primary, New-X secondary.
5. **Add a route-progress line** to the Hero ("Stop 4 of 8 · 4 left").
6. *(Later, separate flag)* in-visit Sell/Collect/Return sheets to cut full-page transitions.

**No separate Field Cockpit screen** is introduced — every change refines the existing My Day → Next
Customer → Start Visit → action → Next Customer → End Day flow.
