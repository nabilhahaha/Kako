# Visit-Driven Route — design proposal (no implementation)

> Make **Route Execution the primary operational workflow**: a route stop flows
> straight through the sale, not just compliance. The visit lifecycle:
>
> **Route Stop → Check-in → Customer Statement → Collect → Sell → Return → Print →
> Complete Visit → Next Customer.**
>
> Design-first. Reuse-only (no new module/engine). Additive, reversible, flag-safe.

---

## 1. Current workflow

```
Route (/field/journey)                 Visit context (built F1/F2)
  stop list                            /field/van-sales/statement/[id]
  per stop: Check-in (GPS) · Photo ·     Statement + aging + open invoices + ledger
            Call · blocked-reason         + Collect · Sell · Return · Print
        │                                        ▲
        └── dead-ends at "Checked in"             │ reached only via the Customer tile
                                                  │ (NOT from the route)
```

- A stop's actions stop at **Check-in / Photo / Call**. There is **no path** from a
  checked-in stop into Statement / Collect / Sell / Return.
- The **visit context** exists and is complete — but the route doesn't open it; the
  rep returns to the hub and **re-enters the customer**.
- Result: **route = compliance**, **visit = selling** — two modules, one broken
  seam. Compliance KPIs (coverage, GPS, blocked reasons, offline queue) are solid;
  they're just disconnected from the money.

## 2. Proposed workflow

A single **visit session** loop. The route is the spine; each stop opens the visit
context; "Complete Visit" closes it and advances.

```
            ┌─────────────────────── Route (spine) ───────────────────────┐
            │  Stop 1 ✓   Stop 2 ✓   ▶ Stop 3   Stop 4 …   (coverage 50%)  │
            └───────────────┬──────────────────────────────────────────────┘
                            │ tap stop  →  CHECK-IN (GPS, compliance)  → opens ↓
        ┌───────────────────────────── Visit Context ─────────────────────────────┐
        │  ◀ Stop 3 / 12 · Next: El Salam Market            [credit status badge]   │
        │  Customer Statement  (summary · aging · open invoices · ledger)          │
        │  Actions:  Collect · Sell · Return · Print                               │
        │                                                                          │
        │  [ Complete Visit ]   (and/or "No order" reason)                         │
        └───────────────────────────────────┬──────────────────────────────────────┘
                                             │  → marks stop visited → Next Customer
                                             └──────────────► back to Route (Stop 4 ▶)
```

**Visit state model (reuses the existing `visited`/check-in record):**

| State | Meaning | Set by |
|-------|---------|--------|
| `planned` | on the route, not started | route plan |
| `in_progress` | checked-in, visit context open | **Check-in** (existing GPS RPC) |
| `completed` | visit finished | **Complete Visit** (= the existing "visited" mark) |
| `blocked` | couldn't visit | existing blocked-reason flow |

- **Check-in = start visit.** One tap on a stop runs the existing GPS check-in
  **and** lands on the visit context — compliance captured as a side-effect.
- **Inside the visit:** Statement first (context), then Collect / Sell / Return /
  Print — all already scoped to the customer (no re-selection).
- **Complete Visit** marks the stop `completed` (the existing visited set / KPI)
  and, optionally, records an **outcome** (sold / collected / no-order reason).
  Then **Next Customer** returns to the route with the next unvisited stop active.
- **Off-route / walk-in** customers use the **Customer tile** → the same visit
  context (no route check-in) — the escape hatch (also closes parked F3).

## 3. Reused components (what already exists vs what's new)

**Reused (the bulk — no change to logic):**

| Need | Reused asset |
|------|--------------|
| Route stop list, sequence, coverage KPI | `field/journey/journey-screen.tsx` |
| GPS **check-in** + blocked reason + offline queue | `checkInVisit` + journey check-in flow |
| **Visit context** (Statement + Collect/Sell/Return/Print) | `/field/van-sales/statement/[id]` + `CustomerStatementView` (F1/F2) |
| Statement data (summary/aging/open invoices/ledger, reconciling) | `loadCustomerStatement` |
| Collect / Sell / Return scoped to a customer | existing screens (`?customer=`) |
| Invoice / receipt / statement print | existing `/print/*` templates |
| Customer pick (off-route) | `/field/van-sales/customers` (F1) |

**New (small, additive — UI/navigation only):**

- **"Open visit"** action on each route stop → deep-link to the visit context
  (check-in first when not yet visited).
- **Route banner** on the visit context (`Stop x / y · Next: …`) — shown only when
  arrived from the route (e.g. `?from=route`), so the desktop/customer entry is
  unaffected.
- **"Complete Visit" + "Next Customer"** control on the visit context → mark
  visited (existing) + return to the route, next stop active.
- **Visit-session position** carried in the URL (`?from=route&seq=N`) — **no new
  table**; the route screen already knows the stop order.
- *(Phase 2, optional)* **visit outcome** capture (sold / collected / no-order) — if
  an `erp_visits`/work-session record exists, attach it there; otherwise defer.

## 4. Risks

| Risk | Mitigation |
|------|------------|
| **Offline** — check-in is offline-queued, but the statement/visit context needs data | Keep check-in offline-capable (unchanged); the visit context degrades gracefully (today van-sell/collect are online-first). Phase-2 can cache the day's statements at load. Don't block check-in on the visit context. |
| **Compliance gating** — should selling require check-in? | Phase 1 **advisory** (check-in opens the visit, but a walk-in can sell without a route stop). Make "check-in before sell" a later policy toggle if needed. |
| **GPS denied / far from customer** | Reuse the existing blocked-reason / distance handling; "Open visit" still works (compliance recorded as out-of-geofence per current rules). |
| **Partial / resumed visits** | `in_progress` is just "checked-in, not completed". Re-tapping the stop reopens the same visit context; nothing is lost (documents already persist independently). |
| **Double-counting visits / KPI integrity** | "Complete Visit" reuses the **existing** visited set / coverage logic — no new counter, so KPIs stay correct. |
| **Don't break non-van field reps** | The route screen is shared. Gate "Open visit" / banner behind **Van Sales active** (`isVanSalesActive`) so merchandising-only routes are unchanged. |
| **Per-stop data load** | The statement is one indexed read per customer; opened on demand (when the rep enters the visit), not pre-loaded for all stops. |
| **Navigation depth / back button** | Define back semantics: visit context Back → route; "Next" → route with next stop; avoid deep stacks (replace, not push, on Next). |
| **Approvals/blocked customers mid-visit** | The credit block + Collect-Now already handle blocked customers inside the context — no new path. |

## 5. Migration path

Additive, reversible, **flag-gated** so it can ship dark and be validated on the
pilot before becoming default.

- **Flag:** `platform.visit_driven_route` (default OFF). When OFF, the route and
  visit context behave exactly as today (no regression).

**Phase 1 — the loop (small, reuse-only):**
1. Add **"Open visit"** to each route stop (check-in → visit context, `?from=route&seq=N`).
2. Add the **route banner** + **"Complete Visit / Next Customer"** on the visit
   context when `from=route`.
3. Behind the flag; gated by Van Sales active. Existing screens untouched when off.
4. **Validate** on the pilot: run a full route — Stop → Check-in → Statement →
   Collect → Sell → Return → Print → Complete → Next — confirm coverage KPI, GPS,
   and the documents (invoice/collection/return + prints) are all correct and the
   statement reconciles.

**Phase 2 — polish:**
- One-tap check-in+open; auto-highlight next stop; per-visit **outcome** (sold /
  collected / no-order) and a slim end-of-visit summary; optional "check-in before
  sell" policy.

**Rollout:**
- Enable `platform.visit_driven_route` for the **pilot** first; gather feedback;
  then promote to the **FMCG default** the same way the salesman role model was
  promoted (template/flag), with existing tenants opting in explicitly.

**Rollback:** flag OFF → instant revert to today's route + separate visit context.
No schema change in Phase 1; no transaction logic touched.

---

**Conclusion:** This closes the last major UX gap by turning the route from a
**compliance** screen into the **primary operational workflow** — a visit-driven
loop built almost entirely from components that already exist
(route + check-in + the Statement visit context + Collect/Sell/Return/Print). The
new surface area is small and UI-only; the risk is contained by a flag and Van-Sales
gating; and the migration is a clean, reversible, pilot-first rollout.
