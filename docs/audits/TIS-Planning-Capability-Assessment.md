# TIS Planning — Consolidated Capability & Gap Assessment

**Purpose:** Assess (no implementation) four stacked requests against the existing
TIS / FR / Route-Optimization / Planning engines:
**A.** Optimization constraints + feasibility · **B.** "New Optimization" Excel-in/out
mode + `tis.run_optimization` permission · **C.** Single-salesman journey planning ·
**D.** Expected visit duration (with global default + hierarchy).
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19

**Headline:** the pure engines already cover ~70–90% of all four; the gaps are mostly
UI, a couple of small pure helpers, and (for monthly journeys + time-based balancing)
two genuinely new engine pieces. None require touching live-write (RO-4/VTP-4 stay paused).

---

## A. Optimization Constraints + Feasibility

**1. Exists.** The engine `RouteConstraints` (`optimize-routes.ts`) already supports
**every** requested constraint: `routeCount`, `targetPerRoute`, `maxPerRoute`,
`maxVisitsPerDay`, `workingDays`, and `balanceBy: 'workload' | 'value' | 'count'`.
`resolveRouteCount` already **derives** the required route count from
`maxVisitsPerDay × workingDays` capacity — i.e. the feasibility math exists.

**2. Partial.** UI exposure is incomplete. The **standalone** Route Optimizer shows
`routeCount` + `maxPerRoute` + `maxVisitsPerDay` (Advanced) + `workingDays`. The
**Studio** Optimize panel shows only `routeCount` + `workingDays`.

**3. Missing.** **`balanceBy`** is not surfaced in any UI (engine-only). No
**feasibility validation / recommendation** message (e.g. "requested 10 routes ×
120 max = 1 200 < 1 450 customers → need ≥ 13 routes").

**4. Engine support.** Full. Only a small **pure feasibility function**
(`validateConstraints → { feasible, recommendedRoutes, reason }`) and UI controls
are needed.

**5. Effort.** ~0.5–1 day (UI + one pure validator; engine ready).

---

## B. "New Optimization" — Excel-in/Excel-out mode + permission

**1. Exists.** Most of it. The Studio **Import** already does Excel/CSV/JSON →
`buildTisDatasetFromRows` → a **temporary session dataset** (`source: 'upload'`,
**no live write**). All requested tools already run on that session — Map, Route, Day,
Salesman views, drag-and-drop edits, and CSV export. The dataset model is
**source-agnostic**, so "session" vs "live" is the *same* pipeline.

**2. Partial.** Export is **CSV only** (no XLSX "Excel-out"). Constraints UI is partial
(see A). Import has **no preview/mapping confirmation** yet (a P0 item already on the
hardening list).

**3. Missing.** (a) A distinct **"New Optimization" entry point** that starts a fresh
session independent of live data; (b) the **`tis.run_optimization` permission** with the
requested role visibility (Salesman hidden; Supervisor/Area/Regional/Director allowed;
Admin configurable); (c) explicit **two-mode framing** (Optimization Session vs Live
Territory Studio) — today the Studio silently falls back to demo/live; (d) **XLSX
export**.

**4. Engine support.** Full — `TisSource` already includes `'upload'`; engines never
read live tables. Permissions are a simple string-union + metadata + role-list
(`permissions.ts`), so `tis.run_optimization` is a small additive change.

**5. Effort.** ~2–3 days (entry point + permission wiring + import preview + XLSX
export + a `mode` flag). No engine risk.

---

## C. Single-Salesman Journey Planning (Week / Month)

**Scenario:** one salesman, ~120 customers, 5 days, ≤ 25 visits/day, existing A/B/C/D +
FR frequencies.

**1. Exists.** The building blocks are all present: **FR engine**
(frequency → visits/week, `customerWorkload`), **scope** (filter to one salesman),
**day assignment** (`balanceRoutes` now distributes a route's customers across the
working days, workload-balanced), the **Day view**, drag-adjust, and export.
A **weekly** single-salesman plan is largely assemblable today: scope → salesman →
one "route" → day-distribute → review by Day → export.

**2. Partial.** Day distribution balances workload but **does not enforce the
`maxVisitsPerDay` cap** (it spreads evenly, it doesn't cap at 25/day and flag
overflow). Feasibility (Σ visits/week vs days × cap) is computable but not surfaced.

**3. Missing.** (a) **Monthly / multi-week cycles** — the scenario carries a single
`dayOfWeek` per customer (a weekly model); biweekly/monthly/annual cadences are **not
expanded** into "week-of-month + day" slots, so a true **monthly** journey is not yet
generated. (b) A **salesman-journey wizard** (Select salesman → horizon → generate →
review by day → export). (c) **Per-day capacity enforcement**.

**4. Engine support.** Weekly: yes (FR + day assignment + planning board). Monthly:
**needs a new cadence-expansion engine** (FR `everyN`/cycle → which week(s) of the
month) — this is real engine work, mirroring the FR resolver.

**5. Effort.** Weekly wizard ~1–2 days (assembly + capacity check). Monthly cadence
expansion +2–3 days (new pure engine + a 4-week calendar view).

---

## D. Expected Visit Duration (+ global default & hierarchy)

**1. Exists.** Workload today = **visits/week** only (`customerWorkload` from FR);
`balanceBy` already abstracts the balancing dimension (workload/value/count). Distance
is modelled (`optimizeRoute` total metres) but **not time**. `TisCustomer` carries
**grade** (class) but **no channel** and **no duration**.

**2. Reusable.** Strong reuse: the **FR frequency-resolver precedence pattern**
(customer → planning → classification → system default) is the exact template for a
**duration resolver**. `balanceBy` can gain a **`'time'`** dimension. The single-model
import/export already round-trips arbitrary columns, so a `duration`/`channel` column
flows through with no schema break.

**3. Missing.** (a) A **`durationMin`** field + a **`channel`** field on the customer
model; (b) **class-default** and **channel-default** duration maps + a **global default**
(e.g. 20 min); (c) a **duration resolver** with the precedence below; (d) a
**travel-time** model (distance ÷ speed); (e) **time-based balancing** (minutes/day load
= travel + visit duration) and a **minutes/day** capacity (replacing visits/day).

**4. Should it be customer / class / channel / global?** **All of the above**, resolved
by precedence so SMEs can start with nothing but a global default:

```
1. Customer-specific duration   (most specific)
2. Customer class duration      (A/B/C/D)
3. Channel duration             (Mini-market / Retail / Wholesale / Modern Trade)
4. Global default duration      (e.g. 20 min)   ← guarantees every customer resolves
```

This mirrors the FR resolver exactly, so the **global default makes the feature usable
immediately** without per-customer data — and richer data simply overrides upward.

**5. Effort.** ~2–4 days: duration resolver (small, mirrors FR) + model fields +
class/channel/global defaults UI + optimizer `'time'` dimension + a travel-time
assumption. Highest value comes from doing the **resolver + global default + time
balancing** first; channel/class data can be layered later.

---

## Cross-cutting summary & recommended sequencing

| Ask | Engine ready? | Net new engine work | Effort |
| :--- | :--- | :--- | :--- |
| **A. Constraints + feasibility** | Yes (full) | Tiny (1 pure validator) | 0.5–1 d |
| **B. New Optimization + permission** | Yes (full) | None (UI + perm + XLSX) | 2–3 d |
| **C. Weekly salesman journey** | Yes | None (capacity check) | 1–2 d |
| **C. Monthly journey** | No | Cadence/cycle expansion | +2–3 d |
| **D. Visit duration + time balance** | Partial | Duration resolver + time dimension + travel-time | 2–4 d |

**Suggested order if approved:** A (constraints/feasibility — unlocks B & C) →
B (New Optimization session + permission) → C weekly journey → D duration resolver +
global default + time balancing → C monthly cadence. A, B, C-weekly are mostly
assembly over shipped engines; D and C-monthly are the two real engine additions.

**No implementation done.** Awaiting your prioritization. RO-4 / VTP-4 / Apply remain
paused; the current STUDIO-UX hardening pass (P0 done; P1 color-modes done) can also
resume on your word.
