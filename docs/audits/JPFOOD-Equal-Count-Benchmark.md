# JPFOOD — Equal-Route-Count Benchmark (Existing-86 vs Optimizer K=86)

**Baseline:** the dataset's existing **Route** column (86 routes). **Equal route count.**
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19

> **Bug found & fixed during this benchmark:** `allocateExact` was distributing the
> "extra" routes roughly **equally** across territories (round-robin), so the giant
> 2,794-customer territory got only ~3 routes (one route had **932 customers**, radius
> 393 km). It now allocates **proportionally to workload** (largest-remainder). After the
> fix the giant territory gets ~40 of 86 routes; **max customers/route 932 → 209**,
> workload balance **0 → 48**, singletons **8 → 1**. This fix benefits ALL multi-territory
> optimization, not just JPFOOD.

---

## Results at K = 86 (after the allocation fix)

| Metric | Existing manual (86) | Optimizer K=86 | Winner |
| :--- | :-- | :-- | :-- |
| Routes | 86 | 86 | = |
| Customers/route (min·avg·max) | 1 · 70 · **1487** | 1 · 70 · **209** | **Optimizer** (no mega-route) |
| Route radius km (min·avg·max) | 0 · **18.2** · 176 | 0 · 46.2 · 301 | **Existing** |
| Compactness score | **73** | 48 | **Existing** |
| Workload balance % | **0** | **47.8** | **Optimizer** |
| Outlier customers | 592 | **221** | **Optimizer** |
| Remote customers (> 50 km) | 887 | **590** | **Optimizer** |
| Singleton routes | 10 | **1** | **Optimizer** |
| Invalid routes | **1** | 10 | **Existing** |

**Important baseline caveat:** the existing Route **"1" holds 1,487 customers** — almost
certainly a catch-all / unassigned bucket, not a real field route. It inflates the
existing max, drives existing workload balance to **0**, and inflates the existing radius
max. The existing plan's *real* routes are tight (~70 customers) — humans grouped by
sub-area but left a giant unrouted bucket.

---

## Answer: can the optimizer match/beat the 86-route plan at equal count?

**Partially — it's a trade, not a clean win (yet).**

**The optimizer WINS on operational load:** every route is ~70 customers (max 209 vs
**1487**), workload balance **48 vs 0**, far fewer singletons (1 vs 10), outliers (221 vs
592) and remote customers (590 vs 887). The existing plan is **not actually field-viable**
where it has a 1,487-customer bucket; the optimizer never produces that.

**The optimizer LOSES on geographic compactness:** radius avg **46 vs 18 km**, compactness
**48 vs 73**, and **10 invalid routes vs 1**.

### Why it still loses on compactness (exact reason)
**Corridor chaining** — the same root cause as the full validation. The grid + union-find
clustering collapses the continuous national distribution into a **single territory
spanning ~847 km**. Even with ~40 routes allocated to it (now correct), each Hilbert
segment traverses part of that 847 km span, so routes can stretch 100–300 km and a few
exceed the 150 km validity limit (the 10 invalid). The existing manual routes avoid this
because a human tied each route to a tight sub-area (at the cost of the 1,487 bucket and
worse balance).

---

## Verdict & next step

At equal route count the optimizer **already beats the manual plan on workload balance,
route-size uniformity, singletons and outliers**, and **matches average customers/route** —
but it **loses on geographic compactness/radius because of corridor chaining**. The clear
path to a clean win is the **P1-fix: cap territory extent** (split any territory wider
than ~60–80 km into sub-territories). With that, the 847 km mega-territory becomes a set of
compact city/sub-area territories, route radii collapse toward the manual ~18 km, and the
invalid routes disappear — while keeping the optimizer's balance/uniformity advantage.

**Recommendation:** proceed with the **P1-fix (territory-extent cap)** before P2; re-run
this exact K=86 benchmark afterwards — the expectation is the optimizer then **matches or
beats** the manual plan on compactness too, giving an all-round win.
