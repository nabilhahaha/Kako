# Route Execution → Visit Context — workflow review (no implementation)

> Should **Route Execution become the primary entry into the customer visit
> context**, so picking the next stop naturally opens the **Statement hub** with
> Collect / Sell / Return / Print? **Recommendation: yes** — and it's pure
> navigation wiring (no new module/engine). This is a review only.

## 1. Current state — why it feels module-driven

| Piece | What it does today | Connects to selling? |
|-------|--------------------|----------------------|
| **Route Execution** (`/field/journey`) | Ordered stop list, **GPS check-in**, coverage KPI, photo, call, blocked-visit reason | **No.** A stop's only actions are Check-in · Photo · Call. |
| **Visit context** (`/field/van-sales/statement/[id]`, built F1/F2) | Statement summary + aging + open invoices + ledger, with **Collect · Sell · Return · Print** scoped to the customer | Yes — but reached only via the **Customer** tile, **not** from the route. |

So the day splits into two disconnected halves: **route = compliance** (check-in)
and **visit = selling** (the statement hub). After check-in, nothing carries the
rep into Statement/Collect/Sell; they must go **back to the hub** and re-enter the
customer. That's the "separate module" feeling you described.

## 2. The visit-driven model (target)

```
Today → Route → [ tap next stop ] → Visit Context (Statement hub)
                                       │
                                       ├─ Collect · Sell · Return · Print
                                       │
                                       └─ Done → Next customer ──┐
                                                                 │
        ◀────────────────────────────────────────────────────────┘
                         (back to Route, next stop)
```

One continuous loop: **Route → Customer Visit → Statement → Collect → Sell →
Return → Print → Next Customer**. The route becomes the *spine*; the visit context
is where the work happens; "Next" closes the loop.

## 3. Recommendation

**Make Route Execution the primary entry into the visit context** — keep the
**Customer** tile as the *off-route / ad-hoc* entry. Both open the **same** visit
context, so there's still one hub, reached two ways (planned vs walk-in).

Concretely (all reuse — the destinations already exist):

1. **Each route stop → "Open visit"** deep-links to
   `/field/van-sales/statement/[customer_id]` (the visit context). **Check-in
   (GPS) becomes the act of starting the visit** — one tap records compliance *and*
   lands on the statement hub, instead of a dead-end "Checked in" state.
2. **Visit context → "Next customer"** returns to `/field/journey` and surfaces
   the next unvisited stop (highlight, don't force order — FMCG routes flex).
3. **Route banner on the visit context** when arrived from the route ("Stop 3 / 12
   · Next: …"), so the rep keeps route awareness without leaving the visit.
4. **Compliance stays intact:** the existing GPS check-in / coverage KPI / blocked
   reason all still fire — they just become a *side-effect of starting the visit*,
   not a separate chore.

## 4. Why this is low-risk (reuse, no new module)

- The **visit context** is already built (statement + Collect/Sell/Return/Print).
- **Sell / Collect / Return** already accept `?customer=`; the statement is `/[id]`.
- **Route/journey** already has the stop list + check-in + GPS.
- The change is **navigation wiring** + a slim route banner + a "Next" link — no
  new engine, no transaction change, additive and reversible.

## 5. Open design questions (decide before building)

| Question | Options | Lean |
|----------|---------|------|
| Check-in vs open visit | (a) one tap = check-in **and** open visit; (b) check-in first, then a separate "Open visit" | **(a)** — minimal friction; compliance captured implicitly |
| Off-route / walk-in customers | Customer tile opens the visit context **without** a route check-in (a "drop-in visit") | Keep the Customer tile for this; route is primary, tile is the escape hatch |
| "Next customer" behaviour | (a) auto-advance to next sequence; (b) return to route, highlight next | **(b)** — routes aren't strictly sequential |
| Mandatory check-in to sell? | Enforce GPS check-in before Sell, or advisory | Advisory for the pilot; revisit if compliance must gate selling |

## 6. Side benefit — resolves the parked F3

A route-primary model **plus** the Customer tile together cover **on-route**
(planned visits) and **off-route** (ad-hoc lookup) customer access — which is
exactly the gap F3 raised (no standalone customer list). So adopting this also
closes F3 without a separate customer-list screen.

## 7. Suggested phasing (when approved — design only)

- **Phase 1 (small, reuse-only):** route stop → "Open visit" deep-link into the
  visit context; visit context → "Next customer" back to the route. This alone
  delivers the visit-driven loop.
- **Phase 2 (polish):** one-tap check-in+open; route banner (Stop x/y · Next) on
  the visit context; auto-highlight the next stop; an optional per-visit summary
  (what was sold/collected this stop).

**Bottom line:** Route Execution **should** be the primary entry into the customer
visit context. It needs no new module — only wiring the route's stops into the
existing Statement hub and a "Next customer" return — turning today's two modules
(compliance + selling) into one **visit-driven** loop:
**Route → Customer → Statement → Collect → Sell → Return → Print → Next.**
