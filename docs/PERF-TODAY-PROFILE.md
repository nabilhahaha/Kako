# Performance Profile — Today / My Day (`/today`)

**Symptom:** ~5 s skeleton before `/today` is usable (van salesman → unified workspace path).
**Method:** code-path trace of the server render + DB execution timings on staging (pilot).
**Status:** profile only — **no optimization implemented**.

## TL;DR

The queries are **fast** (all < 10 ms on the pilot's tiny dataset — `erp_today_journey` 5.1 ms;
11 customers, 15 open invoices). The 5 s is a **sequential server-render waterfall**: ~20+
**sequential** DB round-trips before the RSC returns. At a high app→DB round-trip time (RTT) — a
cross-region / cold Supabase pooler from the serverless function — `≈ 21 round-trips × ~230 ms ≈
4.8 s`. The DB is not the bottleneck; the **count of sequential round-trips × network latency** is.

## 1. Total load time

| Phase | Estimate | Notes |
| --- | --- | --- |
| HTML shell + skeleton (`loading.tsx`) | < 300 ms | streams immediately |
| Server component data resolve | **~4.5–5 s** | the sequential chain below (blocks content) |
| Render (RSC → HTML) | < 100 ms | tiny data |
| Hydration → interactive | ~200–500 ms | client components mount |
| **First meaningful render** | **~5 s** | when content replaces the skeleton |
| **Total interactive** | **~5 s** | dominated by the data resolve |

`/today` is a single non-streaming async server component: it `await`s everything before returning
JSX, so "skeleton time" ≈ full server data-resolve time.

## 2. Slowest queries

**None individually slow.** Measured on staging (pilot):

| Query | Exec time |
| --- | --- |
| `erp_today_journey(salesman, date)` | **5.1 ms** (5 stops) |
| `erp_customers` branch list (≤500) | < 5 ms (11 rows) |
| `erp_invoices` open (branch) | < 5 ms (15 rows) |
| `erp_feature_flags` (company) | < 2 ms (9 rows) |
| `erp_van_sales_settings` | < 2 ms |

The cost is **how many** of these run **one-after-another**, each paying a full app→DB RTT.

## 3. RPC / query-timing breakdown (DB side)

`erp_today_journey` ≈ 5 ms; everything else single-digit ms. Total **DB execution** for the whole
page is well under ~60 ms. The remaining ~4.9 s is **network RTT × sequential round-trips** (the
serverless function → Supabase pooler hop, not visible in DB-side `EXPLAIN`).

## 4. Sequential vs parallel (the waterfall)

```
getUserContext()                 ~8 sequential queries  (auth.getUser, profiles, user_branches,
                                                        companies, company_roles, company_role_
                                                        permissions, plan_modules, company_modules)
   ▼  (React cache() — runs ONCE per request; reused by the actions below)
Promise.all(                     ── these two run in parallel ──
  homeSignals(),                 ~5 sequential queries (salesMtd, overdue, lostCustomers×2, coverage)
  nextBestActions(),             ~8 sequential queries (expiring, companies, session, gps, overdue,
)                                                       pendingVisits, pendingDayClose, custTransfers…)
   ▼
isVanSalesActive()               1 query  (erp_van_sales_settings)
   ▼
getFeatureFlags()                1 query  (erp_feature_flags)               ← flags load #1 (page)
   ▼
<SalesmanWorkspace>              Promise.all(7) [parallel] but loadVanCustomerPicker = 1 + Promise.all(4)
   + getFeatureFlags()           1 query  (erp_feature_flags)               ← flags load #2 (workspace)
```

**Dominated by sequential round-trips.** `getUserContext` (~8, once) + the slower of
homeSignals/nextBestActions (~8) + settings (1) + flags×2 (2) + workspace picker (2) ≈ **~21
sequential round-trips**. Within `homeSignals`/`nextBestActions`, the internal queries are awaited
**one-by-one** (not `Promise.all`), which is the largest avoidable serial cost.

### Wasted work (van salesman path)
- **`homeSignals()` is fetched, then discarded.** Its result (`sig`) is only used on the *non-
  workspace* render branch; the salesman workspace early-returns at line 49 without using it. That
  is ~5 sequential round-trips of pure waste for every salesman load.
- **`getUserContext` is called 3×** (page, homeSignals, nextBestActions) but is **request-memoized**
  (`cache()`), so it runs once — *not* an amplifier (good).

## 5. Feature-flag loading impact

Flags/settings are read **3× sequentially**: `isVanSalesActive` → `erp_van_sales_settings` (1) +
`getFeatureFlags` on the page (1) + `getFeatureFlags` in the workspace (1). ≈ **3 round-trips
(~0.5–0.7 s at high RTT)**. The page already loads flags (line 46) but does **not** pass them to the
workspace, so the workspace re-loads them.

## 6. Smart Next loading impact

**One extra sequential `getFeatureFlags` round-trip in the workspace** (added for Smart Next, run
*after* the workspace `Promise.all`) ≈ **~0.2–0.25 s** at high RTT. Everything else for Smart Next
is free at load time: `startHref` is a string; `ResumeVisitBanner` is a **client** component (no
SSR cost). Net `/today` impact: **+1 sequential round-trip** (redundant with the page's flag load).

## 7. Telemetry loading impact

**Zero on initial load.** `logFieldUxEvent` is client-side, best-effort, fire-and-forget, and only
runs on **interactions**; `ResumeVisitBanner` emits `resume_shown` **after hydration**, off the
critical path. No effect on TTFB, skeleton, or first meaningful render.

## Today-specific summary

| Metric | Now | Target |
| --- | --- | --- |
| TTFB (content / skeleton→content) | ~4.5–5 s | — |
| Data fetch duration | **~4.5 s** (the serial chain) | — |
| Render duration | < 100 ms | — |
| Total interactive | **~5 s** | **< 2 s** |
| First meaningful render | **~5 s** | **< 1 s** |

## Proposed optimizations (NOT yet implemented — for approval)

Ordered by expected impact ÷ effort:

1. **Don't fetch `homeSignals()` on the salesman-workspace path** — it is discarded. Move it into
   the non-workspace branch (compute after deciding the path). *Removes ~5 serial round-trips.*
2. **Load feature flags once and pass them down** — read flags + van-sales settings on the page,
   pass `flags`/`vanSalesOn`/`smartNext` to `SalesmanWorkspace` (drop its `getFeatureFlags`).
   *Removes ~2 round-trips, incl. the Smart Next one.*
3. **Parallelize inside `homeSignals` and `nextBestActions`** — wrap their independent `await`s in
   `Promise.all`. *Collapses ~8 serial → ~1–2.*
4. **Stream the page** — render the day-status + KPIs first and `Suspense`-defer the attention/
   copilot list, so first meaningful render is the actionable header (< 1 s) while the list fills
   in. *Biggest perceived-latency win.*
5. **Reconsider `nextBestActions` (copilot) on the workspace** — the salesman workspace mainly needs
   day state + KPIs + picker; the full attention/copilot scan can be deferred/streamed or trimmed.

Combined, (1)–(3) cut the serial chain from ~21 → ~8 round-trips; (4) puts first meaningful render
under ~1 s by streaming the header. Targets (< 1 s first render, < 2 s interactive) are achievable
without schema/query changes — purely by removing waste, deduping flags, and parallelizing/streaming.
