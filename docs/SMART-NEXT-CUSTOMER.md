# Smart Next Customer & Navigation Flow

**Objective:** cut navigation time/clicks during route execution **without route chaos** —
suggest the next customer route-first, with one-tap Start Visit, external Navigate, and Resume
Visit. Flag-gated (`platform.smart_next_customer`, default OFF; pilot only), reversible, additive.

---

## 1. UX flow diagram

```
                    ┌─────────────────────────── APP LAUNCH ───────────────────────────┐
                    │  /today (My Day)                                                  │
                    │   • Resume Visit banner?  ── yes ─▶  open visit (statement)        │
                    │   • Day not started ─▶ [Start Day] ─┐                              │
                    │   • Day open ─▶ [Next planned] ─────┤                              │
                    └─────────────────────────────────────┼────────────────────────────┘
                                                           ▼
                                              /field/next  (Smart Next)
                                   ┌──────────────────────────────────────┐
                                   │ get live GPS → rank route-first       │
                                   │ Top 5 remaining route stops:          │
                                   │  name · distance · seq · overdue ·    │
                                   │  credit · [Start Visit] [Navigate]    │
                                   └───────────────┬───────────────┬──────┘
                                       Start Visit │               │ Navigate
                                                   ▼               ▼
                            /field/van-sales/statement/[id]   Google / Apple / Waze
                              (visit hub: Collect·Sell·Return)   (external map app)
                                                   │
                                          [Complete Visit]
                                                   ▼
                                   /field/next?done=<id>  ◀── loop to the next stop
```

Resume: opening a visit sets a localStorage marker (survives app restart); Complete/Discard
clears it. On launch, the marker drives the **Resume Current Visit** banner.

## 2. Mobile mockup (Visit Completed)

```
┌──────────────────────────────┐
│ ✓ Visit completed            │
│   Pick the next customer…     │
├──────────────────────────────┤
│ NEAREST CUSTOMERS ON ROUTE    │
│ ┌──────────────────────────┐ │
│ │ Al Nour Grocery   350 m  │ │
│ │ [Seq 2] [Overdue]        │ │
│ │ [ ▶ Start Visit ][ ⇄ Nav ]│ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ City Mini Market  600 m  │ │
│ │ [Seq 3] [Credit alert]   │ │
│ │ [ ▶ Start Visit ][ ⇄ Nav ]│ │
│ └──────────────────────────┘ │
│  … up to 5 …                  │
│ [ 📍 View full route ]        │
└──────────────────────────────┘
   Nav → ⌄ Google Maps / Apple Maps / Waze
```

Start-Day mode is identical but the header is **Next planned customer** and the #1 (next planned)
stop is highlighted as a primary card, followed by the remaining nearest stops.

## 3. Technical design

### Ranking engine — `src/lib/van-sales/next-customer.ts` (pure)
**Route protection first.** Candidates are ALWAYS today's remaining route stops
(`active AND not visited AND on today's route` — guaranteed by construction). Ranking:

```
score = routeRank · routeStepMeters  +  distanceM
```
1. **Route sequence is primary** — each step down the plan adds `routeStepMeters` (default 400 m),
   so the planned order is followed by default.
2. **Distance is secondary** — a later stop is promoted only when it is *significantly* closer
   (more than ~one route step); a slightly-closer far-ahead stop never breaks the route.
3. **Route-chaos guard** — when the next planned stop is within `nearThresholdMeters` (default
   1 km / “~5 min”), it is **always** recommended first; the engine only reorders when the planned
   stop is far enough that a meaningful saving exists.
4. **Customer priority — FUTURE.** The `RankWeights` interface already reserves
   `overduePerUnit / collectionPerUnit / visitPriority / supervisorPriority / classification`;
   today only route + distance are applied. No GPS → distance is null and the list is pure
   sequence order.

Both thresholds are configurable (`RankWeights`) so a tenant can tune route adherence.

### Data — `next-customer-server.ts`
Reuses `loadTodayJourney` (route stops + GPS + visited) and enriches each stop with `overdue`
(open invoice older than terms), `creditWarning` (balance ≥ credit limit) and `active`. The
server returns candidates; the **client** supplies live GPS (`navigator.geolocation`) and runs the
pure engine — so location never leaves the device and the server stays cache-friendly.

### Navigation — `map-links.ts` (pure)
Universal deep links: `googleMapsUrl`, `appleMapsUrl`, `wazeUrl` (+ `hasValidCoords`). The
Navigate button opens a sheet with all three; the device opens the installed app.

### Resume — `active-visit.ts`
Single `localStorage` marker `{customerId,name,startedAt}` set when a visit opens, cleared on
Complete/Discard. Survives app restart (unlike per-action `visit-session`).

### Surfaces
- `/field/next` (server, flag-gated → else redirect to `/field/journey`) renders `SmartNextScreen`.
- Complete Visit `completeHref` → `/field/next?done=<id>` when the flag is on.
- `/today` shows the **Resume Visit** banner + a **Start Day / Next planned** entry when on.

All gated by `smartNextCustomerEnabled(flags)`; OFF restores the prior route-screen flow exactly.

## 4. Performance considerations

- **Ranking is O(n log n)** over the rep's route (tens of stops) and runs **client-side** — no
  server round-trip per suggestion.
- **One server read** assembles candidates (journey RPC + two batched `IN` queries for customer
  flags + open invoices); no per-customer queries.
- **GPS** uses a single `getCurrentPosition` with `maximumAge: 30s` + `timeout: 8s`; no continuous
  watch (battery-safe). No-GPS degrades gracefully to route order.
- **No new tables, RPCs, or migrations** — pure UI/logic over existing data; zero transactional
  surface.

## 5. Pilot validation plan

1. **Unit (done):** `next-customer.test.ts` — 14 tests incl. route preservation (no jump for a
   slight gain), significant-saving promotion, near-threshold guard, no-GPS fallback, and the map
   links. `tsc` + full suite (1420) + build green.
2. **Flag rollout:** enabled for the **pilot tenant only** (`platform.smart_next_customer`); OFF
   everywhere else. Instantly reversible by toggling the flag.
3. **Field UAT (staging):** run a real route — verify (a) the next planned stop is suggested first
   when nearby; (b) a much-closer later stop is promoted only when the saving is large; (c) Start
   Visit opens the visit and Complete loops back to suggestions; (d) Navigate opens each map app;
   (e) Resume Visit appears after an app restart mid-visit; (f) no-GPS falls back to route order.
4. **Metrics capture:** record clicks/visit and page transitions/visit before vs after (below).
5. **Go/No-Go:** promote to FMCG default only after UAT sign-off.

## 6. Metrics — before / after (per completed visit → next visit)

| Metric | Before | After | Δ |
| --- | --- | --- | --- |
| Taps to reach the next customer | ~4–5 (Complete → route → scroll/find → open → start) | **2** (Complete → Start Visit) | **−2 to −3** |
| Page transitions | 3 (statement → journey → statement) | **1** (statement → next → statement) | **−2** |
| Find-next cognitive load | scan full route list | top-5 ranked, nearest first | lower |
| Est. time saved / visit | — | **~10–20 s** | × visits/day (e.g. 30 → ~5–10 min/day) |
| Mobile UX | back-tracking through screens | one forward tap; external turn-by-turn | fewer dead-ends |

(Exact figures to be confirmed in field UAT; the engine + flow remove ≥2 transitions per visit by
construction.)

## 7. Future-ready design

The scoring is a weighted blend; `RankWeights` already exposes
`overduePerUnit · collectionPerUnit · visitPriority · supervisorPriority · classification`. Folding
those in later is additive (no API change) and stays subordinate to route protection by keeping
`routeStepMeters` dominant. Today: **distance + route eligibility only.**

---

**Staging only. No production rollout. Feature-flagged and fully reversible.**
