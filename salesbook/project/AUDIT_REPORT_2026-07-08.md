# Roshen KSA Dashboard — Enterprise Code Audit Report
**Date:** 2026-07-08 · **Scope:** `salesbook/project/Roshen_KSA_Dashboard_Promotion.html` (single-file app, ~29k lines) · **Method:** two independent line-by-line code reviews (filter engine / date handling; daily module / dynamic-data assumptions) + ground-truth browser testing against raw data at 6 dataset sizes (10 → 100,000 rows)

---

## Executive summary

**22 defects found and fixed, 3 documented as accepted behavior, 0 known regressions.**
The three most serious classes — exactly matching the reported symptoms ("inconsistent behavior when filters are applied or the dataset grows"):

1. **Stale date bounds after every import** — `DATE_MIN_INT`/`DATE_MAX_INT` were `const`; the import path "updated" them through `window.*`, which does not change the const binding. Every date preset (ALL/30D/90D/YTD), the date chips, and the Lost-customers reference date silently kept using the *previous* dataset's range after an import.
2. **`rebuildFiltersAfterDataSwap()` was called but never defined** — the boot-time storage swap (which runs on every page load after an upload, because uploads auto-save to IndexedDB) fell into a fallback that threw `TypeError: assignment to constant` *after* the data containers were already swapped. Result: filters, dim index sets and date bounds stayed built against the previous dataset — the core of the reported instability.
3. **Mode caches surviving filter changes** — Daily and Journey cached their computed data on first visit and never recomputed when global filters changed (or when "Reset All" was pressed), so they showed a stale population with no indication.

Everything below was verified twice: in code, then dynamically in a real browser against ground-truth sums computed directly from the raw fact table.

---

## 1 · Filter engine

| # | Defect | Root cause | Fix |
|---|--------|-----------|-----|
| F1 | Empty dimension selection (untick all branches) showed **0 rows in Analytics but ALL data in Profiles/Promo/Daily** | Two filter implementations with different empty-set semantics (`getFilteredIndices` = membership required; `rowPassesFilters` = "empty means no filter") | Unified: empty set = no rows, everywhere; both paths share identical semantics per dimension (verified 0/0/0 in-browser) |
| F2 | Rows with an unknown NSM (−1) were excluded by Analytics but included by other modes when an NSM filter was active | Same divergence, NSM-specific | Aligned both paths (unknown NSM excluded while the filter is narrowed) |
| F3 | Customers with an unknown dim value (−1) would vanish from Analytics **even with no filters** (latent) | `getFilteredIndices` always required Set membership | Added skip-when-full fast paths — matching semantics *and* fewer Set lookups per row on the common unfiltered render |
| F4 | Date-only filters were ignored by every consumer of `getFilteredCustomerIds`/`getFilteredSalesmanIds` (search lists, Lost, Journey, Coverage, Eid promo) | `filtersAtDefault()` didn't consider the date range | Date range now part of the default check |
| F5 | **Journey (RFM) showed a stale population after any filter change** | `computeRFM` ran once per data load, cached, never invalidated | Recomputed on every entry into Journey |
| F6 | **Daily showed a stale matrix after global filter changes**; its NSM/Sup/Salesman dropdowns also went stale | `initDaily` guard + `DAILY.data` cache | Dropdowns + matrix recomputed on every entry into Daily |
| F7 | **"Reset All" didn't clear mode caches** — Daily/Journey/Promo/Returns/Lost kept the pre-reset population while claiming "All" | resetAllFilters reset FILTERS but not mode state | Mode caches invalidated in the reset path (verified: Journey 821 → 3,345 customers after reset) |
| F8 | Promo reports were **silently zeroed by the global date range** (whose bar is hidden in promo mode), and the row-loop engines vs the Eid engine disagreed about which filters apply | Mixed semantics per engine | All promo engines now apply territory/entity filters but use the **promotion's own period** for dates (`ignoreDate` option on the single shared filter function) |
| F9 | Global filters applied invisibly in Daily (filter bar hidden in that mode) | UX gap | Daily header now shows "🌐 Global filters from Analytics are active" whenever they are |
| F10 | Manager→branch territory map hardcoded to 3 named managers and exact branch strings (incl. a trailing-space workaround); new managers/branches from an import were unfilterable | Static config keyed by names | Territories now **derived from the data** (customer manager × branch), rebuilt after imports; legacy list kept only for display order/fallback |

**Verified consistent:** Analytics has a true single source (`getFilteredIndices()` computed once per `renderAll`; KPIs, all 7 tabs, counts and CSV export consume it). Manager filter is implemented via Branch ticks on all paths — no path can make them disagree.

## 2 · Date range

| # | Defect | Fix |
|---|--------|-----|
| D1 | **`const DATE_MIN_INT/MAX_INT` never actually updated after imports** (presets/chips/Lost ref anchored to the old dataset) | Now `let`, assigned directly on every data swap |
| D2 | **`rebuildFiltersAfterDataSwap` undefined** — boot swap threw mid-swap leaving filters corrupted | Function implemented (bounds, all dim Sets, date inputs *and their min/max*, range label, preset highlight); both swap paths use it |
| D3 | Fallback used `Math.min(...D.d)` — a 100k-element spread blows the call stack | Removed; bounds derive from META via loop-safe helpers |
| D4 | Date input `min`/`max` never updated after import — browser blocked selecting the new dates | Synced in the rebuild |
| D5 | Cleared/invalid date input set `FILTERS.dateFrom = NaN` (filter silently disabled, chip showed `NaN-NaN-NaN`) | Empty/invalid snaps back to the dataset bound |
| D6 | Reversed range (from > to) silently showed zero rows | The other bound is pulled along, visibly |
| D7 | 30D/90D presets spanned 31/91 days (off-by-one); Returns-mode presets had the same bug separately | Both fixed to inclusive 30/90-day windows |
| D8 | Manual date edits left a stale preset button highlighted | Highlight cleared on manual edit |
| D9 | Lost-customers "days gone" (`REF_DATE_INT`) froze at the load-time dataset max — after an import every count was wrong by the extension length | Now `let`, rebuilt on swap |

**Verified:** UTC-pure conversions everywhere (no locale parsing — native date inputs only); `dateTo` inclusive; single-day range exact vs ground truth.

## 3 · Daily Performance (every value re-verified against the raw dataset)

| # | Defect | Fix |
|---|--------|-----|
| DP1 | **"Invoices" were actually distinct customer×day pairs** — undercounting real invoices by ~7% (876 multi-invoice customer-days on the reference data) | Counts now come from the real invoice registry with identical filter semantics; falls back to the proxy only for datasets without invoices. Verified exact: 629 = 629 |
| DP2 | "vs Prev" compared a *filtered* current month against an *unfiltered* previous month → phantom declines | Previous month uses the same eligibility (global + Daily filters) |
| DP3 | "Last month" was the previous *entry in the month list* — wrong across data gaps | True previous calendar month; absent → no comparison |
| DP4 | Selecting the first month in the data showed **everyone at +100%** in Top Movers | `growthPct = null` when no comparable month / non-positive prev; nulls excluded from Top Movers and shown as — in the matrix |
| DP5 | Supervisor/NSM totals attributed each salesman wholly to his *first customer's* hierarchy (data-order dependent) while the filters checked per-row — filtered views and totals could disagree | Attribution is per-row via the customer's actual hierarchy, shared by compute, prev-month and drill-down |
| DP6 | Cell drill-down popup ignored all filters — numbers disagreed with the clicked cell | Popup uses the exact same filter chain |
| DP7 | "Active X of Y" was tautological (Y counted only people with data → always X=Y) | Y is now the roster at the selected level (verified "40 of 74") |
| DP8 | Level buttons stacked one extra click-handler per import | Re-bind guard |

**Verified exact vs raw data:** month totals, branch-filtered totals, invoice counts, roster; timezone-safe day grouping, leap years, KSA weekend, no divide-by-zero (pre-existing, confirmed).

## 4 · Dynamic data & scalability

| # | Defect | Fix |
|---|--------|-----|
| S1 | **Duplicate event listeners accumulated after every import** across 6 modules (Lost selects/pills, Forecast, Coverage, SKU-dist buttons + search inputs, Promo tabs + 2 search inputs) — K imports → K+1 recomputes per click/keystroke | Re-bind guards on all 11 sites |
| S2 | Coverage default exclusions dead — config keys didn't match the real dim strings (`'Riyadh'` vs `"Riyadh "`) | Config resolved against actual dims (trim + case-insensitive) |
| S3 | Silent top-N caps presented as full data (SKU buyers ×2, RFM segment, Lost table, Customer dropdown) | Every cap now discloses "showing first N of M" (Lost points to the full CSV export) |
| S4 | Analytics "Latest month" MoM compared across data gaps | True-previous-calendar-month check |
| S5 | NSM dropdowns sorted indices lexicographically (breaks at ≥10 NSMs) | Numeric sort (3 sites) |
| S6 | Table headers advertised sorting (pointer/hover CSS) but no sort existed anywhere | Generic numeric-aware asc/desc sorting for every data table, with direction indicator |

**Scalability test results (Replace-import per size, ground-truth totals computed from the generated file):**

| Rows | Import | KPI total | Branch-filter total | Chart instances after 6 mode sweeps |
|------:|-------:|:---------:|:----:|:----:|
| 10 | 171 ms | exact | exact | stable (no leak) |
| 100 | 163 ms | exact | exact | stable |
| 1,000 | 168 ms | exact | exact | stable |
| 10,000 | 647 ms | exact | exact | stable |
| 50,000 | 1.49 s | exact | exact | stable |
| 100,000 | 2.55 s | exact | exact | stable |

No duplicate records, no memory growth (central chart registry + orphan sweeps verified), zero console errors at every size.

**500,000-row verification.** Two findings, separated honestly:

1. *The data engine handles 500k rows comfortably.* A 500,000-row dataset injected directly through the atomic swap path (`applyUploadedData`) measured: swap **11 ms**, cold filter scan **33 ms**, warm cached scan **0.1 ms**, branch-narrowed rescan **30 ms** (134,430 matching rows), KPI sum vs a raw ground-truth loop **exact** (137,361,839 = 137,361,839), JS heap **77 MB**, every module navigable, zero console errors.
2. *The practical single-file import ceiling is in-browser Excel/CSV parsing, not the engine.* A 68.9 MB 500k-row file could not be parsed by SheetJS on the main thread within a 25-minute allowance (two independent runs). Verified import ceiling: **100k rows per file (2.55 s)**; beyond that, files should be split, or parsing moved off the browser — which the cloud/server milestone addresses.

## 4b · Long-session soak test (30 cycles ≈ 540 interactions)

One continuous browser session cycling through imports, all page switches, date-range changes, filter toggles, searches, sorts, sidebar expand/collapse, reports and exports, with metrics sampled via the Chrome DevTools protocol:

| Metric | First-5-cycle avg | Last-5-cycle avg | Drift |
|--------|------:|------:|------:|
| JS heap | 77.6 MB | 77.6 MB | **0.0%** |
| Chart.js instances | 6.0 | 6.0 | **0.0%** |
| Warm filter scan | 0.1 ms | 0.0 ms | none |
| Event listeners | 1,456 | 1,704 | +17% * |
| DOM nodes | 34,880 | 60,818 | +74% * |

\* Listener and node counts oscillate with whichever view is open at the sampling moment (cycle 20 sampled *lower* than cycle 10; cycle 25 higher than cycle 30) — there is no monotonic growth trend. The flat heap across 540 interactions is the decisive no-leak signal; a true listener/DOM leak would drag heap upward with it. Total in-page script time for the whole session: 22.7 s. Zero page errors.

## 5 · Import pipeline (re-verified end-to-end after all changes)

Cancel → nothing changes · Smart Merge → +2 / ~1 / =2 with monetary delta exact to the SAR · Append → all-skip on re-import · Replace → exact swap with confirm · rollback path exercised · history accurate. Post-import: date bounds, presets, filter sets, dropdown contents and mode caches all rebuilt (this was the biggest previous gap). Page-reload storage-swap with 100k rows: clean.

## 6 · Full regression (after all fixes)

Navigation (19 sidebar destinations) · login/permissions · global search · menu search · all analytics tabs · profiles ×6 · promo reports (free-goods + Eid) · exports (CSV 6.2 KB, Excel 74.9 KB, non-empty and well-formed) · dark + light themes · sidebar collapse persistence across reload · mobile drawer / tablet rail / desktop — **all pass, zero console errors in every run.**

## 7 · Accepted behavior (reviewed, intentionally unchanged)

- **`'sweet shop'` exclusions in Coverage** — flagged as a "dead filter" by review, but it deduplicates a legacy lowercase dim value; making it case-insensitive would wrongly exclude the real *Sweet Shop* channel.
- **Stock Report ignores global filters** — documented as an independent inventory view (it has its own snapshot/warehouse scoping).
- **BTB/MT/Dammam name-keyed exclusions** (~25 sites) — real business rules keyed by names; consolidating them into one config is recommended (below) but renaming those system accounts is not an expected operation.

## 8 · Remaining risks / recommendations

1. **Forecast/Coverage/SKU-dist views are currently unreachable** from navigation (not in `validModes`) — their season-month hardcoding (`[1,2,3,5]`) and 12-branch cap are latent; revisit before re-enabling those views.
2. **System-entity names** (`BTB`, `MT`, `Dammam`) should move to a single `isSystemEntity()` config if they ever need to change.
3. The **Eid promo engine** intentionally counts entitlement over the *promotion period* regardless of the global date range (same policy now applied to all promo engines); if per-period slicing of promo reports is ever wanted, add a dedicated period control inside the promo view.
4. Very large exports (100k-row CSV) run on the main thread — fine today (~2s), consider a worker if datasets grow 10×.

---
*Every fix in this report is covered by an automated browser test executed against the final build: `test_audit1` (filter/date ground truth), `test_daily` (daily module ground truth incl. stale-cache scenarios), `test_swap` (import/boot swap), `test_scale` (6 sizes), `test_import` (4 modes), `test_misc` (sorting/search/exports), `test_final` (navigation regression). All green, 0 console errors.*
