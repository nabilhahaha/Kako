# JPFOOD — Real-World Optimizer Validation

**Dataset:** `JPFOOD_Route_Plan.xlsx` (real). Run with the shipped optimizer; **no
synthetic data.**
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19

---

## Dataset reality (verified from the file)

| Property | Value |
| :--- | :--- |
| Rows / customers | **6,017** (all with valid GPS) |
| Columns | Route · Route Type · Day · Sequence · Customer Code · Customer Name · **City** · Frequency · Latitude · Longitude |
| **City / Branch column** | **EMPTY for all 6,017 rows** |
| Route Type | **"outstation" for all** |
| Frequency | **"1" for all** (1 visit/week) |
| Existing routes (Route column) | **86 distinct** |
| GPS extent | lat **16.6° – 31.7°**, lng **34.9° – 50.2°** — **nationwide** (Jizan → Tabuk, Red Sea → Dammam) |

**Branch is not in the data.** Since City is blank, branches below are a *geographic
proxy* = nearest major KSA city (≤ 120 km, else "Remote"):

Jeddah 1035 · Riyadh 962 · **Remote 910** · Dammam 657 · Abha 631 · Najran 253 ·
Jizan 252 · Taif 242 · Makkah 221 · Hofuf 201 · Buraidah 199 · Hail 143 · Madinah 129 ·
Tabuk 102 · Yanbu 80. **910 customers are > 120 km from any major city** (true outstation).

---

## Results (4 scenarios)

| Scenario | Gen. routes | Cust/route (min·avg·max) | Radius km (min·avg·max) | Compactness | Singletons | Invalid | Remote/outlier | Absorbed | Geo-warning |
| :--- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| **Existing (manual, Route col)** | 86 | 1 · 70 · 1487 | 0 · **18.2** · 176 | **73** | 10 | 1 | 887 | — | — |
| **Optimized K=20** | **31** | 1 · 194 · 2796 | 0 · **69.7** · **452** | **42** | 1 | **9** | 3573 | 6 | needs **31** |
| **Optimized K=30** | **31** | 1 · 194 · 2796 | 0 · 69.7 · 452 | 42 | 1 | 9 | 3573 | 6 | needs **31** |
| **Optimized K=40** | 40 | 1 · 150 · 1398 | 0 · **74.2** · **429** | **36** | 1 | **10** | 2015 | 6 | none |

**Routes per branch (proxy):** existing = 52 Remote · Hail 6 · Buraidah 5 · Abha 4 · …
(spread, manual). Optimized K=40 = 25 Remote · Dammam 2 · Riyadh 2 · … (collapsed).

---

## Is this commercially reasonable for FMCG field ops?  ❌ NO (at K = 20/30/40)

**The optimizer is materially WORSE than the existing manual plan on this dataset.**
Manual: 86 routes, **18 km** avg radius, compactness **73**, 1 invalid. Optimized:
31–40 routes, **70–74 km** avg radius, compactness **36–42**, **9–10 invalid**, routes
of up to **2,796 customers** spanning **450 km**. A salesman cannot work 194 customers
across 450 km — this is not field-viable.

### Root causes (verified)
1. **Corridor chaining (dominant).** The grid + union-find territory clustering (0.4°
   cells, 8-neighbour merge) collapses the continuous national customer distribution
   into a **single territory of 2,794 customers spanning ~847 km** — customers along the
   populated corridor bridge the cells. The "hard geographic partition" therefore
   **fails on dense real data**: with few routes per giant territory, a route can span
   hundreds of km (the 452 km radii, the 9 invalid routes).
2. **No branch/city data.** City is empty, so the optimizer cannot partition by the
   natural FMCG unit (branch). The dataset's **Route column already encodes the manual
   branch/route structure** and is far more compact (18 km).
3. **Too few routes for nationwide coverage.** 6,017 nationwide customers need ~**86**
   routes (as the manual plan has), not 20–40. The engine's own warning flags this
   (`geography requires 31` at K=20/30), but 31 is still far too few for 847 km of spread.
4. **910 true outstation customers** (> 120 km from any city) inherently need clustered /
   dedicated handling, not absorption into nationwide mega-routes.

---

## Recommended fixes (priority)

1. **P1-fix — cap territory extent (urgent).** Split any clustered territory whose
   geographic extent exceeds a cap (e.g., > 60–80 km) into sub-territories (recursive
   grid refinement / distance sub-clustering) so **no route can span 450 km**. This
   directly fixes the corridor-chaining failure this dataset exposes.
2. **P2 — partition by business branch/route when present.** Use the dataset's
   Route/branch structure (or a populated City/Region) as the primary partition; the
   optimizer should refine **within** branches, not ignore them. (Requires the branch
   column to be populated — JPFOOD's City is empty; its Route column is usable today.)
3. **Recommend realistic K.** Surface the engine's `geographyRequiresRoutes` prominently
   and recommend ~80–90 routes for this dataset; warn hard when K ≪ feasible.
4. **Separate outstation handling.** Cluster the 910 remote customers into their own
   compact mini-territories rather than folding them into city routes.

---

## Honest conclusion

The P1 work (fragmentation control, Hilbert compactness, exact-K) is correct **and
holds on well-separated cities**, but this **real nationwide JPFOOD dataset breaks the
geographic clustering via corridor chaining**, and the file lacks the branch data the
FMCG workflow needs. **At 20/30/40 routes the optimizer output is not commercially
usable here and is worse than the existing manual 86-route plan.** The clear next step
is a **territory-extent cap** (P1-fix) plus **business-branch partitioning** (P2) — and
recommending a realistic route count — before this optimizer is offered for nationwide
real-world planning.
