# Territory Intelligence Studio — Future Product Strategy

**Status:** Roadmap / product strategy only — **do not implement now.** Document only.
**Date:** 2026-06-19

---

## 1. Concept

Treat **Territory Audit · Sales Force Sizing · Route Optimization Studio · Visual Territory
Planning · Journey Plan Deployment · Geo Intelligence** as one **product family** —
**Territory Intelligence Studio (TIS)** — built on a shared engine + data model, not six
disconnected features. One pipeline, one dataset, two deployment modes.

```
Upload / Select Customers
  → 1. Territory Audit
  → 2. Sales Force Sizing
  → 3. Route Optimization Studio
  → 4. Visual Territory Planning Studio
  → 5. Journey Plan Deployment (Export Excel / Apply)
  → 6. Geo Intelligence (always-on map layers across all stages)
```

---

## 1a. Cross-Cutting Principle — **Simple Mode for every capability**

**Every advanced capability ships a simple mode.** A sales manager must be able to produce a
usable territory plan **in minutes**, without understanding optimization theory, weights, or
technical settings. This is a **product requirement across all six stages**, not a feature of
one.

- **Zero-configuration default per stage.** Audit, Sizing, Optimization, and Planning each open
  on a one-click happy path with engine-derived defaults (frequency/workload from the FR
  resolver, priority from A/B/C grade, capacity/geo from existing data). Expert controls
  (weights, caps, scenarios) are **opt-in behind an "Advanced" affordance** (progressive
  disclosure).
- **Plain-language everywhere.** Results read in business terms ("balanced by visits and
  travel time," "2 reps under-utilized"), not raw scores; technical detail lives in Advanced.
- **Safe escalation.** Simple output is real engine output, so switching to Advanced refines
  the *same* result — no rework, no second algorithm.
- **Standalone-friendly.** The simple path also defines the minimal upload schema for
  standalone mode (§4), keeping the low-friction entry consistent in both shells.

> Acceptance bar for any TIS stage: *a non-expert reaches a usable, applyable result without
> opening a single advanced control.* (Detailed Simple/Advanced split for optimization in the
> Route Optimization Studio roadmap §1b.)

---

## 2. Stage Map — capability · current status · reuse anchor

| # | Stage | Sub-capabilities | Status today | Reuse anchor |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Territory Audit** | coverage gaps · white-space · territory imbalance · route imbalance · customer distribution | **Not built** (partial signals exist) | Coverage Status (CJ-3), `territory.ts` split/merge, customer geo, grades |
| 2 | **Sales Force Sizing** | recommended #salesmen · coverage impact · workload impact · cost vs coverage scenarios | **Not built (new)** | Visit workload (FR resolver), rep capacity, coverage engine |
| 3 | **Route Optimization Studio** | route generation · workload/sales/distance balancing · scenarios | **Roadmap** (designed) | `optimize.ts`, `generator.ts` (CJ-1), FR resolver, `proposal.ts` |
| 4 | **Visual Territory Planning** | map planning · day assignment · drag & drop · ownership · scenario compare | **Roadmap** (§7) | RO Studio §7, Coverage/Health/Ownership read-models |
| 5 | **Journey Plan Deployment** | Excel export · Apply · publish | **Partly built** (CJ-1 apply; export roadmap) | `erp_journey_plans` apply path, single data model (§4a RO doc) |
| 6 | **Geo Intelligence** | coverage · territory · ownership · sales heatmap · white-space maps | **Roadmap** (4 phases) | `erp_customers.lat/long`, `erp_territories`, CJ-3, FR resolver |

---

## 3. Unification Verdict

**Yes — these can and should be unified under one architecture.** They already share the same
substrate, which is why the family is coherent rather than forced:

- **One dataset / data model.** The Route-Optimization "single data model" rule (Export ≡
  Journey-Plan import ≡ Apply) becomes the **TIS canonical dataset**: customer · geo ·
  classification · sales value · **frequency/workload (FR resolver)** · route · ownership ·
  coverage. Every stage reads and writes this one shape.
- **Shared engines.** Audit, Sizing, Optimization, and Planning are different *questions* over
  the **same engines** — coverage (CJ-3), frequency/workload (FR-1…FR-6), grading
  (`outlet-grade.ts`), territory split/merge (`territory.ts`), per-stop optimization
  (`optimize.ts`), conflict detection (`proposal.ts`). No engine is stage-specific.
- **Geo Intelligence is a cross-cutting view layer**, not a stage — the same map renders
  audit gaps, sizing scenarios, optimized routes, and ownership from the shared dataset.
- **Scenario state is shared.** One scenario model (Current · A · B · C) threads Audit →
  Sizing → Optimization → Planning, compared on the same metrics (customers · visits · sales
  · distance · coverage · balance).

**Architecturally:** a **TIS core** (pure, data-driven: dataset model + engines + scenario
state) with **stage modules** as thin orchestrations over it, and **two shells** (embedded
VANTORA / standalone). This matches the reuse-first pattern already used across CJ + FR.

---

## 4. Two Deployment Modes (one codebase)

| Mode | Inputs | Terminal action |
| :--- | :--- | :--- |
| **A. VANTORA platform** | live customer/sales/coverage/ownership (RLS) | Apply to Journey Plan + publish |
| **B. Standalone TIS** | **uploaded customer dataset** (no ERP/Inventory/Sales/Collections required) | Excel Export (same single-model schema) |

**Standalone flow:** `Upload → Audit → Sizing → Optimization → Planning → Excel Export`. The
engines are already pure/data-driven, so standalone is a **boundary + ingestion + licensing**
concern (consistent with RO Studio §8), not a re-implementation. Live ERP data is an
*enrichment* of the uploaded dataset, never a prerequisite.

---

## 4a. Graceful Degradation Model (Modes A / B / C)

**Architecture principle:** TIS exposes the **same workflow and UX in every mode**; individual
capabilities **enable or disable based on available data and enabled modules**, never gate the
product. One product family, three commercial entry points.

```
Upload / Select Customers → Audit → Sizing → Optimization → Planning → Export / Apply
                         (identical journey in A, B and C)
```

| | **Mode A — Optimization Only** | **Mode B — Connected Sales** | **Mode C — Full VANTORA Distribution OS** |
| :--- | :--- | :--- | :--- |
| **Inputs** | Uploaded dataset (Excel/CSV): locations, optional sales value, optional ownership | + customer · journey · sales activity | + live customers · visits · GPS · journey execution · sales · collections · inventory |
| **Available** | Territory Audit · Sales Force Sizing · Route Optimization · Visual Territory Planning · Scenario Compare · Map Planning · Excel Export | + Customer 360 · Journey Planning · Coverage Status · Customer Health · sales-based analysis | + Coverage Engine · GPS Compliance · Route Adherence · Geo Intelligence · full Territory + Geo Intelligence |
| **Not available** | Live Coverage · GPS Compliance · Visit Execution · Customer Health · Collections · Inventory insights | GPS/execution-grade compliance · inventory-driven insights | — (full) |
| **Terminal action** | Excel Export | Export **or** Apply to Journey Plan | Apply + publish + execute |

### Design rules
- **Capability availability is a function of present data**, resolved at runtime from a single
  **capability matrix** (which inputs/modules each feature needs) — not hardcoded per build.
- **Same screens, graceful empties:** a feature with missing inputs shows a clear "needs X"
  state or hides, but the **navigation and flow never change** between modes.
- **Upgrade is additive:** moving A→B→C **adds** capabilities over the same dataset/UX — no
  migration, no relearning. A standalone (A) customer's exported plan Applies unchanged in a
  VANTORA (C) tenant (single data model, §4 / RO §4a).
- **Pure engines, layered enrichment:** Audit/Sizing/Optimization run on the uploaded core
  (Mode A); Coverage/Health/GPS/Geo are **enrichment layers** that light up as their data
  arrives (B, C). Consistent with the Coverage Engine façade and FR resolver patterns.

### Commercial objective
Maximum flexibility from one codebase: **Standalone Optimization** customers (A),
**ERP-connected** customers (B), and **Full VANTORA** customers (C) — same product family, same
user experience, capabilities scaled to the data they have.

---

## 5. Remaining Gaps (to close before TIS is whole)

| Gap | Severity | Note |
| :--- | :--- | :--- |
| **Territory Audit engine** | High (new) | Coverage gaps + imbalance need a scoring/aggregation layer over CJ-3 + geo + grades. Signals exist; the audit synthesis does not. |
| **Sales Force Sizing engine** | High (new) | Genuinely new: workload→headcount model + cost-vs-coverage scenarios. Depends on FR workload + rep capacity + sales value. |
| **Geo / map rendering** | High | No map surface yet (Geo Intelligence is roadmap). Hard dependency for stages 4 & 6 and audit visualization. |
| **Shared TIS dataset model** | Medium | The single data model (RO §4a) must be generalized to carry sales value · ownership · coverage · workload as first-class, optional columns. |
| **Shared scenario engine** | Medium | One scenario/compare state across all stages (not per-stage). |
| **Standalone ingestion + licensing** | Medium | Customer-data upload, decoupled boundary, packaging/licensing (RO §8). |
| **Sales value rollup** | Low–Med | Per-customer/route value aggregation (exists in sales history; needs a reusable rollup). |
| **White-space detection** | Medium | Requires external/market reference (prospects not yet customers) — data-source gap, not just compute. |
| **Cost model** | Medium (new) | Sizing's "cost vs coverage" needs a rep-cost input the platform doesn't model today. |

**Already covered (no gap):** frequency/workload authority (FR-1…FR-3 done; FR-4…FR-6
roadmap), coverage status (CJ-3 done), journey apply (CJ-1 done), grading, territory
split/merge, single data model + standalone direction (RO Studio doc).

---

## 6. Recommended Architecture (when scheduled)

```
                 ┌──────────────── TIS Core (pure, data-driven) ────────────────┐
                 │  Canonical dataset model  ·  Scenario state                   │
                 │  Engines: coverage (CJ-3) · frequency/workload (FR) ·         │
                 │           grading · territory split/merge · optimize ·        │
                 │           conflict detection · sizing* · audit*               │
                 └───────────────────────────────────────────────────────────────┘
   Stage modules:  Audit*   Sizing*   Optimize   Planning   Deployment   Geo(view)
   Shells:         ── A. Embedded VANTORA ──   ── B. Standalone TIS (upload) ──
                              (* = new engines to build)
```

- **TIS Core** depends only on the dataset model + FR value model — never on ERP internals.
- **Stage modules** are thin orchestrations; **Geo** is a view layer over the same dataset.
- **Two shells** differ only in **ingestion** (live RLS vs upload) and **terminal action**
  (Apply vs Export) — kept on one data contract (Export ≡ Import ≡ Apply).

---

## 7. Indicative Phasing (when scheduled, after current FR/CJ work)

| Phase | Scope |
| :--- | :--- |
| TIS-0 | Generalize the single dataset model + shared scenario state (foundation) |
| TIS-1 | Territory Audit engine (gaps · imbalance · distribution) over CJ-3 + geo |
| TIS-2 | Geo Intelligence base map + core layers (coverage · ownership · sales heatmap) |
| TIS-3 | Route Optimization Studio (RO-1…RO-6) on the shared core |
| TIS-4 | Visual Territory Planning (RO-7) + scenario compare |
| TIS-5 | Sales Force Sizing engine (headcount · cost-vs-coverage) |
| TIS-6 | Standalone packaging (RO-10): upload ingestion, boundary, licensing |

**Prerequisites already in motion:** Visit-Frequency Resolution Layer (workload),
Coverage Status (CJ-3), Geo Intelligence (map). TIS unifies them; it does not replace them.

---

## 8. Bottom Line

The six capabilities are **one product** sharing one dataset, one engine set, and one
scenario model — unification is the natural architecture, not a stretch. The **only genuinely
new builds** are the **Territory Audit** and **Sales Force Sizing** engines, a **map surface**
(Geo Intelligence), and the **standalone ingestion/licensing** boundary; everything else is
reuse of work already done or already on the roadmap. Recommend formalizing **Territory
Intelligence Studio** as the umbrella and sequencing TIS-0 (shared dataset/scenario core)
first so every later stage plugs in without refactor.
