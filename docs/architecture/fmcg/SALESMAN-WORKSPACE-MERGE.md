# Merge "Today" + "Salesman App" → One Salesman Workspace (Design Review)

**Status:** Design review only. **No implementation.** Reuse-first, flag-gated, reversible.
**Goal:** One salesman workspace · one customer journey · one operational workflow · no duplicate entry points.

---

## 1. Current overlap analysis (grounded)

There are **two competing "day home" surfaces** for the salesman, and they link to
each other in a circle:

| Surface | File | Role | Contains |
|---|---|---|---|
| **Today** | `src/app/(app)/today/page.tsx` (`/today`) | Field "home" for reps + field managers | *Start Journey* CTA → `/field/journey`; coverage / overdue / attention stats; attention list; **quick-nav that links OUT to `/field/van-sales`, `/customers`, `/sales/invoices`, `/attention`, `/inventory`** |
| **Salesman App** ("My Day" hub) | `src/app/(app)/field/van-sales/page.tsx` (`/field/van-sales`) | The van-sales operational shell | Day status (not_started / open / closed); **Start Day → links BACK to `/today`**; *End Day & Settle* → `/field/van-reconciliation`; operational tiles (Customer picker, Journey, Route, Sell, Return, Collect, Van Stock, Reconcile, Merchandising, Offline); reopen inbox; readiness |

**The concrete problems:**

1. **Two homes, circular links.** `/today` → (quick-nav) → `/field/van-sales`; `/field/van-sales` → (Start Day) → `/today`. The rep bounces between two "start of day" screens and never has a single obvious home.
2. **Duplicate / divergent destinations for the same task:**
   - *Customers:* `/today` quick-nav → **`/customers`** (the back-office master) — but the operational pick is **`/field/van-sales/customers`** (the Today JP / All-Customers picker). Two different "Customers".
   - *Inventory:* `/today` quick-nav → **`/inventory`** (warehouse view) vs. the bottom-nav + hub → **`/field/stock`** (van stock). Two different "Inventory".
   - *Selling / invoices:* `/today` quick-nav → **`/sales/invoices`** (the generic back-office editor the FMCG salesman role was deliberately cleaned away from) vs. the canonical **`/field/van-sales/sell`**.
3. **Route entry is split.** "Start Journey" lives on `/today`; the visit-driven route + the operational tiles live on `/field/van-sales`. The single Route → Visit → Sell loop is reached from two places.
4. **Bottom nav reinforces the split.** The salesman's tabs are Home (`/dashboard`), **Today** (`/today`), Sell, Inventory — so "Today" is the advertised home, yet the actual operational workspace is the *other* hub.

Net: the operational path you defined — **Customer → Statement → Collect → Sell →
Return → Print → End Day** — exists, but its front door is duplicated and its
quick-links point at back-office screens.

---

## 2. What should remain

- **The operational spine + deep routes** (unchanged): the visit-driven route, the
  customer picker (Today JP / All Customers), the customer statement = visit
  context, and Collect / Sell / Return / Print, plus End Day & Settle, van
  reconciliation, and the governed reopen workflow. These are correct and stay.
- **The day lifecycle** (`erp_work_sessions`: not_started → open → closed, the
  day-close guard, reopen) — the single source of "where am I in the day".
- **The genuinely useful "Today" signals** — coverage %, overdue, attention /
  next-best-action. These are valuable; they should **move into** the one
  workspace as a compact header, not justify a second home.
- **A lighter `/today` for non-salesman field roles** (admin / manager /
  supervisor also land on `/today`). The merge must stay **role-aware** so they
  are not forced into a van workspace.

---

## 3. What should be merged

**Collapse the two homes into one.** Per your direction, **`/today` becomes the
primary salesman workspace** and **absorbs** the Van-Sales "My Day" hub for a van
salesman:

- `/today` (for a van salesman) renders the **day status + single primary CTA**
  (Start Day → Continue Route → End Day & Settle), the **route-first entry**, the
  **operational tiles** (Customer, Van Stock, Returns…), the **reopen** state, and
  the **signals** header — i.e. exactly what `/field/van-sales` shows today, plus
  the Today stats.
- **Retire `/field/van-sales` as a separate destination:** redirect it to
  `/today` (keep the route alive so existing links/bookmarks don't 404).
- **Remove the circular link:** "Start Day" no longer points to `/today` (it *is*
  `/today`); it just opens the day in place.
- **De-duplicate the quick-nav destinations** so each operational task has ONE
  home: Customers → the **picker** (`/field/van-sales/customers`), not `/customers`
  master; Inventory → **van stock** (`/field/stock`), not `/inventory`; drop
  `/sales/invoices` from the salesman's field home (already role-gated away).

What is **not** merged: the back-office screens themselves (`/customers`,
`/sales/invoices`, `/inventory`) remain for the roles that own them — they simply
stop being surfaced as the salesman's field shortcuts.

---

## 4. Navigation impact

| Element | Today | After merge |
|---|---|---|
| Bottom-nav **Today** tab → `/today` | a stats home that links out to the real hub | **the** salesman workspace (route + tiles + day + signals) |
| `/field/van-sales` | second day-home | **redirects to `/today`** (alias; no 404) |
| Van-Sales hub **Start Day** → `/today` | circular | gone — opens the day in place |
| `/today` quick-nav **Customers** → `/customers` | back-office master | **`/field/van-sales/customers`** (picker) |
| `/today` quick-nav **Inventory** → `/inventory` | warehouse | **`/field/stock`** (van stock) |
| `/today` quick-nav **Invoices** → `/sales/invoices` | back-office editor | **removed** for the field salesman |
| Bottom-nav **Sell** / **Inventory** | `/field/van-sales/sell` · `/field/stock` | unchanged (step shortcuts into the one workspace) |
| **Home** `/dashboard` tab | generic dashboard | (optional) for a pure van salesman this is redundant with the workspace — candidate to drop from the salesman's bottom nav so Today is unambiguously home |

Result: **one** Customers, **one** Inventory, **one** Sell, **one** day home — no
duplicate path to the same operational task.

---

## 5. Migration strategy

Reuse-first, flag-gated, pilot-first, reversible — the same playbook as the
visit-driven route and day-reopen work:

1. **Flag:** `platform.unified_salesman_workspace` (default OFF). When ON for a
   company AND the user is a van salesman (`field.sales` + Van Sales active),
   `/today` composes the unified workspace; otherwise the current `/today` and
   `/field/van-sales` are untouched.
2. **Compose, don't rebuild:** `/today` reuses the existing pieces — the hub's
   `STEPS` spine + day-status (`loadVanDayState`), the visit-driven route entry,
   the reopen gate, and the existing Today signal widgets. No new engine.
3. **Alias the old hub:** `/field/van-sales` → redirect to `/today` (flag-gated),
   so every existing link, bookmark, and the "Start Day" target resolve to the one
   workspace.
4. **Fix the quick-nav destinations** (Customers/Inventory/Invoices) behind the
   same flag.
5. **Validate on the pilot**, then **promote to the FMCG default** (same
   mechanism as the reopen design's Appendix B: business-type default-on at
   company creation; existing companies via an opt-in migrator; non-FMCG
   verticals unaffected).
6. **Rollback:** flip the flag OFF → both surfaces revert exactly as today; the
   redirect and quick-nav changes are all flag-gated and additive.

Non-salesman field roles keep the lighter `/today`; the unified composition only
applies to van salesmen, so managers/supervisors are unaffected.

---

## 6. Recommended final salesman experience

**One workspace at `/today`:**

```
┌── Today (the only home) ─────────────────────────────┐
│  Day status: ● Open    [ End Day & Settle ]          │  ← single day CTA
│  Coverage 72% · Overdue 3 · Attention 5              │  ← compact signals
│                                                      │
│  ▶ Continue route — next: Customer 7/18              │  ← route-first primary
│                                                      │
│  Quick:  [Customer] [Van Stock] [Returns]            │  ← off-plan / secondary
│  (Reopen request banner if the day is closed)        │
└──────────────────────────────────────────────────────┘
```

- **Route-first:** the visit-driven route is the spine. "Continue route" → next
  stop → **customer visit context** (Statement → Collect / Sell / Return / Print →
  Complete Visit → Next). Off-plan selling uses the **Customer** tile (Today JP /
  All Customers picker).
- **One day CTA** that reflects state: *Start Day* → *Continue Route* → *End Day &
  Settle*; reopen request surfaces when closed.
- **Signals** (coverage / overdue / attention) as a header, not a second screen.
- **Bottom nav:** Today (home/workspace) · Sell · Inventory (van stock) ·
  Approvals (supervisors only) · More. No duplicate entry points.

**Outcome:** one salesman workspace, one customer journey, one operational
workflow, zero duplicate entry points — and it slots directly onto the unified
FMCG lifecycle already documented (Open Day → … → End Day → Settlement → …).

---

## 7. Open question for sign-off

Confirm the **identity decision**: make **`/today` the canonical workspace** and
**redirect `/field/van-sales` into it** (my recommendation, matching "Today
becomes the primary salesman workspace"). The alternative — keep `/field/van-sales`
as the implementation and point the "Today" tab at it — reaches the same single
workspace but keeps the `/field/van-sales` URL as the identity. I recommend the
former. On your go-ahead I'll implement behind `platform.unified_salesman_workspace`,
pilot-first.
