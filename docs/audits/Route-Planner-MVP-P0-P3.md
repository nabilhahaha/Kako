# Simple Route Planner — MVP (P0–P3) Build & JPFOOD Validation

**Scope delivered:** Upload → Split → Correct (on the map) → Approve → **Route Excel export.**
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19
**Not in this delivery (held per approval):** P4–P5 Journey Planning (frequencies, day rules, sequence, journey export).

---

## What a manager does

1. **Upload** a customer file (CSV / Excel / JSON): customer code, name, latitude, longitude, and *optionally* existing route + frequency. Tolerant headers (latitude/lng, route, cadence…).
2. **Enter a route count** and press **Generate split** — a rough geographic first cut (one colour per route).
3. **Correct it on the map** — **click** a point to select, **Shift-drag** a box to select many, pick a target route (or **＋ New route**), press **Move**. Colours update instantly.
4. **Approve** the allocation.
5. **Export routes to Excel** (native `.xlsx`).

The **route side panel** shows, per route: **colour · customer count · weekly visit count · estimated workload (hours/week)**, plus an **Unassigned** row when relevant.

**Session-only:** nothing is read from or written to live company data — consistent with the whole TIS surface. Gated on `reports.view` (the Sales Supervisor / Area Manager audience). Lives at **`/distribution/route-planner`**, beside the advanced screens (none changed).

---

## Engine: deliberately simple

`simpleGeoSplit(customers, K)` orders customers along a **Hilbert space-filling curve** (compact, locality-preserving) and cuts into **exactly K** contiguous equal-count slices. No territory hard-partition, no absorption, no forced extra routes — the corridor-chaining complexity that defeats the advanced optimizer on nationwide data is intentionally **out of scope** here, because the manager shapes the final boundaries by hand. *"Does not need to be perfect automatically; must be easy to review and adjust."*

---

## JPFOOD validation (real dataset, 6,017 customers, all GPS-located)

Full upload → split → **move** → **export (.xlsx) → re-parse** path, run headless on the real file:

| Requested K | Generated | Exactly K? | Unassigned | Customers/route (min·avg·max) | Workload balance | Export rows (re-parsed) |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 40 | 40 | ✅ | 0 | 149 · 150 · 152 | **99.6%** | 6,017 ✅ |
| 86 | 86 | ✅ | 0 | 68 · 70 · 71 | **99.4%** | 6,017 ✅ |
| 120 | 120 | ✅ | 0 | 49 · 50 · 51 | **99.0%** | 6,017 ✅ |

**Manual-correction check:** selected 50 customers from Route 1 and moved them to a new route →
Route 1: 149 → **99**; new route: **50**; totals preserved. ✅

**Export proof:** the generated `.xlsx` re-parses through the existing reader to all 6,017 rows with headers `Route · Customer Code · Customer Name · Frequency · Latitude · Longitude` — so the file opens cleanly in Excel / Google Sheets and round-trips.

> Artifact: `docs/tis-demo/route-planner-validation.json` (generated headless from the real file; the JPFOOD workbook itself is **not** committed — no PII).

---

## What was reused vs. built

**Reused (most of it):** the TIS upload pipeline (`parseTisUpload`, `buildTisDatasetFromRows`), the canonical `TisCustomer`/`TisDataset` model, the `Scenario` + `moveCustomer` edit engine, the Hilbert helper and `customerWorkload`/visit-duration engines, and the MapLibre OSM base.

**Built new (small, tested):**
- `simpleGeoSplit` (exactly-K Hilbert equal-count cut) — `src/lib/tis/optimize-routes.ts`.
- `route-planner.ts` — `routeStats` (count · weekly visits · workload hours · colour), `routeExportRows`.
- `xlsx-write.ts` — dependency-free, browser-safe **native `.xlsx` writer** (STORED ZIP + CRC-32), the mirror of the existing reader.
- `selection-map.tsx` — MapLibre map with **click-toggle + Shift-drag box select** and a selection ring.
- `route-planner-workspace.tsx` + `page.tsx` — the manager surface; nav entry + `routePlanner` i18n (ar/en symmetric).

**Tests:** 10 new unit tests (xlsx roundtrip, exactly-K, route stats, move, export) + the JPFOOD path; full suite **806 passing**, `tsc` clean.

---

## How to test it

1. Open **Distribution → Route Planner** (`/distribution/route-planner`).
2. Upload a customer file (or **Download template** for the column shape).
3. Enter a route count → **Generate split**.
4. **Click** / **Shift-drag** to select customers on the map → choose a route / **New route** → **Move**. Watch the side-panel counts and colours update.
5. **Approve** → **Export routes (Excel)**.

---

## Next (await approval): P4–P5 Journey Planning

Per-customer frequency (daily · 1–3×/wk · every-10-days · biweekly · monthly), day rules (weekly day pick; biweekly W1&3 / W2&4; 2–3×/wk auto-spread; capacity; same-day compactness), and the Journey Plan `.xlsx` export. **Not started** — pending your validation of this MVP.
