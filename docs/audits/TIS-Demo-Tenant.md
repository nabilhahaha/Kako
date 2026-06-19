# TIS Demo Tenant — Jeddah (Permanent Reference Environment)

**Purpose:** A safe, deterministic synthetic sandbox for the whole TIS family — Territory Audit ·
Geo Intelligence · Route Optimization · Visual Territory Planning · Sales Force Sizing.
**Safety:** In-repo synthetic data only. **No production or pilot tenant is touched.**
**Date:** 2026-06-19

---

## 1. What & Where

- **Generator:** `src/lib/tis/demo/jeddah.ts` — `buildJeddahDemoDataset()`. Pure, deterministic
  (seeded PRNG, seed `20260619`), so the dataset is **stable and permanent**.
- **Artifacts:** `docs/tis-demo/` — coverage + route SVG maps + the scenario report, regenerated
  by `npx vitest run src/lib/tis/demo` (the report test also asserts the dataset shape).
- **How it is consumed:** it builds a TIS-0 `TisDataset` directly, so every TIS engine runs on
  it unchanged (it is the canonical Mode-C dataset). It can also be exported and re-loaded via the
  standalone upload path (Mode A) — same shape.

---

## 2. Dataset Profile (500 customers)

| Attribute | Profile |
| :--- | :--- |
| Count | **500** |
| City | **Jeddah only** — 13 major sectors (Al-Balad · Al-Hamra · Al-Rawdah · Al-Salamah · Al-Naeem · Al-Shati · Al-Faisaliyah · Al-Aziziyah · Al-Safa · Al-Marwah · Al-Naseem · Obhur · Al-Khomrah) |
| Geo | Real lat/lng structure: sector-centred Gaussian scatter, **21.2–21.9 N · 39.0–39.4 E** |
| Grade mix | A ≈15% · B ≈30% · C ≈45% · D ≈10% |
| Sales value | Grade-correlated (A 30–80k · B 10–30k · C 2–10k · D 0.5–2k) |
| Frequency (FR) | A = 3×/week · B = 2×/week · C = weekly · D = biweekly |
| Assignment | ~85% assigned (salesman + sector route) · ~15% **unassigned** (white-space) |
| Coverage | on-track ≈55% · under ≈20% · never ≈15% · over ≈10% (unassigned skew to never-visited) |
| Health | Derived from coverage (Mode-C reference): on-track 75–95 … never-visited 10–40 |

**Mode:** **C** (coverage + health present) — exercises every layer/overlay.

---

## 3. Territory Audit (on the demo)

`{ customers: 500, coveragePct: 59.8%, gapCount: 201 (under+never), worstBalancePct: 77.1%,
whiteSpaceCount: 143 }` — i.e. ~40% coverage gap and ~143 un-worked outlets to act on.

---

## 4. Scenario Comparison (Route Optimization)

Generated with the RO-1 balancer (`balanceRoutes`) — balanced by **workload** (and one
**value-balanced** run). Visits/week and total sales are constant (same customers; only routing
changes).

| Scenario | Routes | Visits/wk | Sales (SAR) | Distance | Workload balance | Value balance |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 routes (workload) | 4 | 747 | 8,081,848 | 423.6 km | **99.5%** | 70.4% |
| 6 routes (workload) | 6 | 747 | 8,081,848 | 436.4 km | **99.5%** | 79.3% |
| 8 routes (workload) | 8 | 747 | 8,081,848 | 498.0 km | 98.2% | 79.4% |
| 6 routes (value) | 6 | 747 | 8,081,848 | 439.3 km | 99.0% | **99.0%** |

**Reading it:** workload-balanced routes are near-perfectly even on visits (98–99.5%) but only
70–79% even on sales; switching the objective to **value** lifts value balance to 99% — exactly
the "balance by workload **or** value, not customer count" principle, demonstrated on real data.
More routes ⇒ slightly more total distance (smaller, denser routes) — the classic trade-off a
manager compares before applying.

---

## 5. Maps (artifacts in `docs/tis-demo/`)

- `jeddah-coverage.svg` — 500 customers coloured by coverage status.
- `jeddah-routes-4-workload.svg` · `-6-workload.svg` · `-8-workload.svg` — coloured by route.
- `jeddah-routes-6-value.svg` — value-balanced routing.

> These are static SVG renders (lat/lng → viewport) emitted without a browser — the live
> MapLibre surface (`/distribution/geo`, `/distribution/route-optimizer`) renders the same data
> interactively. Screenshots of the live UI require a browser session, which this headless build
> environment cannot capture.

---

## 6. Safety & Reuse

- **No DB writes.** This is in-repo synthetic data; no production/pilot tenant is created or
  modified. If a *real* sandbox tenant is later wanted, a seed can be derived from this exact
  dataset and applied to a sandbox database by ops — out of scope here by design.
- **Permanent reference:** every TIS workstream (Audit · Geo · Route Optimization · Visual
  Planning · Sales Force Sizing) can use `buildJeddahDemoDataset()` for demos, tests, and
  comparisons against a known, stable population.
