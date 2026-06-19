# Route Optimization Studio — Future Capability (Roadmap)

**Workstream:** Coverage & Journey Planning → Route Optimization Studio
**Status:** Roadmap only — **do not implement now.** Recorded for future planning.
**Date:** 2026-06-19

---

## 1. Vision

Let a planner upload or select a **large customer set** (a full city, region, or country)
and **automatically generate optimized routes and journey plans** — balanced by multiple
business factors, not customer count alone.

**Example input**

| Parameter | Example |
| :--- | :--- |
| Customer set | All customers in a city / region / country |
| Desired routes | 10 |
| Target customers per route | ~120 |
| Working days | Sat–Wed |
| Max visits per day | e.g. 35 |
| Visit frequency rules | Per-customer (see Frequency Resolution Layer) |
| Sales value balancing | On |
| Geographic distance balancing | On |
| Customer priority / classification | A/B/C |

> All numeric targets in this table are **examples**, not system rules.

---

## 1a. Configurable Constraints — **no hardcoded counts**

Customer count is a **planning constraint set by the user**, never a fixed system rule.
Every example figure above (10 routes, ~120 customers, 35 visits/day) is illustrative
only. The optimizer must accept, and balance against, a **fully user-configurable**
constraint set:

| Constraint | Meaning | Default |
| :--- | :--- | :--- |
| Target customers per route | Soft target the balancer aims for | **User-set** (no default count) |
| Maximum customers per route | Hard cap per route | **User-set** |
| Maximum visits per day | Daily workload ceiling per rep | **User-set** |
| Maximum visits per week | Weekly workload ceiling per rep | **User-set** |
| Target sales load | Sales-value target/ceiling per route | **User-set** |
| Route count | Number of routes to generate | **User-set OR auto-calculated** |

**Auto-calculate route count:** when the user does not fix a route count, the optimizer
derives it from the constraints + the selected customer set's **visit workload** (not
customer count) — e.g. `ceil(total weekly visits / (max visits per day × working days))`,
also respecting max-customers-per-route and target sales load. Conversely, when route
count is fixed, per-route targets are derived. The two modes are duals; neither hardcodes
a count.

**Targets vs. caps:** "target" values are soft objectives the balancer optimizes toward;
"maximum" values are hard constraints it must never exceed. Both are data, supplied per
optimization run and storable as reusable company templates (consistent with the
no-hardcoded-values principle used in CJ-1 frequency rules).

---

## 1b. Simple Mode vs Advanced Mode — **every advanced capability has a simple mode**

**Product principle (applies to the whole family):** a sales manager must be able to generate
a **usable territory plan in minutes** without understanding optimization theory, weights, or
technical settings. Advanced power is opt-in, never a prerequisite.

| | **Simple Mode (default)** | **Advanced Mode (opt-in)** |
| :--- | :--- | :--- |
| Inputs | Pick customers + working days. That's it. | Full constraint set (§1a) + objective weights (§2) |
| Route count | Auto-calculated from workload | User-set or auto |
| Balancing | Sensible default blend (workload + distance) | User-tuned weights (count · workload · sales · geo · capacity) |
| Output | One recommended plan + preview | Multiple scenarios + compare |
| Vocabulary | Plain language ("balanced by visits & travel") | Technical (weights, caps, scores) |

**How Simple Mode stays smart without exposing knobs:**

- **Defaults come from the engines, not the user** — frequency/workload from the FR resolver,
  priority from A/B/C grade, capacity from rep defaults, distance from geo. The optimizer is
  fully configured out of the box; Advanced Mode only *reveals* those defaults for tuning.
- **Progressive disclosure** — one primary action ("Generate Plan") up front; constraints,
  weights, and scenarios live behind an "Advanced" affordance. Nothing technical on the
  default screen.
- **Plain-language results** — outputs read as "≈120 stops/route, balanced by visits and
  travel time," not raw scores. Scores/weights appear only in Advanced.
- **One-click happy path** — `Select customers → Generate → Preview → Apply/Export`. A
  manager never has to touch a weight to get a usable plan.
- **Safe escalation** — Simple results are real engine output (not a lesser algorithm), so a
  manager can switch to Advanced and keep refining the *same* plan — no rework.

This principle is **cross-cutting**: it governs Route Optimization, Visual Territory Planning,
Territory Audit, and Sales Force Sizing alike (see TIS strategy). Each stage ships a
zero-configuration default before any expert controls.

---

## 2. Core Principle — balance by **workload & value**, not count

A customer needing **3 visits/week** must **not** be treated the same as one needing
**1 visit/month**. The optimizer balances routes using a weighted blend:

- Customer count
- **Visit workload** (visits/period — from the Frequency Resolution Layer)
- Sales value
- Customer priority / classification
- Distance / geography (compactness)
- Working days
- Rep capacity
- Route compactness

> Dependency: route balancing by workload **requires per-customer visit frequency**, so this
> Studio builds directly on the **Visit-Frequency Resolution Layer (FR-1…FR-6)**. Frequency
> first, optimizer second.

---

## 3. Expected Flow

```
Upload / Select Customers
  → Set Optimization Rules
  → Generate Route Scenarios
  → Map Preview
  → Conflict Detection
  → Drag & Drop Adjustments
  → Export Excel
  → Apply to Journey Plan
```

---

## 4. Outputs

- Route list
- Customers per route
- Estimated **sales value** per route
- **Visit workload** per route
- Distance / drive-time estimate
- Coverage load
- Conflict warnings
- Map visualization

---

## 4a. Single Data Model — Export ≡ Journey-Plan Import/Apply

The optimized route dataset is the **single source of truth**. There must **not** be a
separate "optimization" data model maintained alongside the Journey-Plan model — the Studio
operates on, and emits, the **same shape** the Journey-Plan engine already imports/applies
(`erp_journey_plans`: customer · route · salesman · day_of_week · frequency · sequence).

**Both terminal actions consume the identical dataset:**

```
Generate → Preview → Drag & Drop Adjustments → ┬─ Export Excel
                                               └─ Apply to Journey Plan
```

- **Export Excel** writes the **same columns** the Journey-Plan import expects, so a file
  exported from the Studio is **re-importable with no transformation, no validation issues,
  and no field remapping** (round-trip safe: Export → edit offline → Import → Apply).
- **Apply to Journey Plan** publishes the in-memory dataset directly via the existing
  apply path — Export and Apply are two serializations of one model, never two models.
- Frequency uses the FR-1 canonical token (already the journey-plan vocabulary), so workload
  semantics survive the round-trip unchanged.

> Design rule: if a field exists in the export, it exists in the import, with the same name,
> type, and meaning. The Excel schema is owned by the Journey-Plan import contract.

---

## 5. Future Integrations

| System | Role |
| :--- | :--- |
| Journey Plan Engine | Apply generated routes/plans (`erp_journey_plans`, CJ-1) |
| Coverage Status | Validate resulting coverage load (CJ-3) |
| Smart Next | Consume optimized sequence/priority |
| Geo Intelligence | Map preview + distance/compactness (lat/long already on customers) |
| Drag & Drop Planning | Manual scenario adjustment |
| Excel Import / Export | Bulk customer ingest + route export |

---

## 6. Reuse Anchors (already in the platform)

| Capability | Existing asset |
| :--- | :--- |
| Per-stop optimization (distance) | `route-optimization/optimize.ts` (`optimizeRoute`) |
| Territory split/merge | `route-optimization/territory.ts` |
| Weekly plan generation | `route-optimization/generator.ts` (CJ-1) |
| Visit frequency / workload | Frequency Resolution Layer (FR-1…FR-6) |
| Outlet grade / priority | `erp/outlet-grade.ts` |
| Conflict detection | `journey-plan/proposal.ts` (CJ-1) |
| Customer geo | `erp_customers.latitude/longitude` |

The Studio is largely an **orchestration + multi-objective balancing + map UI** layer over
these engines — it does not re-implement routing, frequency, or grading.

---

## 7. Future Enhancement — Visual Territory Planning Studio

Evolves the Studio from a route *generator* into an interactive **Territory Planning
Studio** where the **map is a first-class planning surface, not only a visualization.**
Roadmap only.

### 7.1 Interactive Map Planning
Click any customer on the map to view, inline: **customer name · route · salesman ·
supervisor · current visit day · frequency** (FR resolver) · **coverage status** (CJ-3) ·
**workload impact** · **sales value**. The map both plans and visualizes — not a reporting
map.

### 7.2 Day Assignment from the Map
Selecting a customer surfaces the seven days (**Sun · Mon · Tue · Wed · Thu · Fri · Sat**),
**each with its own colour**. The manager assigns/reassigns the visit day directly on the map
(e.g. `Route A → Monday` ⇒ `Route A → Wednesday`); the preview updates immediately.

### 7.3 Drag & Drop Route Planning
Drag a customer across **Customer → Route · Customer → Visit Day · Customer → Salesman**,
from any of three interchangeable planning surfaces on the same dataset:

- **Route boards** (kanban-style per-route columns)
- **Calendar view** (per-day columns, Sun–Sat)
- **Map view** (geographic)

Examples: Route A → Route B · Monday → Tuesday · Salesman A → Salesman B.

### 7.4 Live Route Preview (before Apply)
Every planning change instantly recomputes: route **distance** · **drive time** · **visit
workload** · **coverage load** · **route balance score** · **conflict warnings** · **sales
load** (§7.8) — all before
Apply.

### 7.5 Scenario Planning
Maintain **Current Plan · Scenario A · B · C** and compare before publishing, on:
Customers · Visits · Sales Value · Distance · Coverage · Route Balance.

### 7.6 Map Layers (future)
Customer Health (CJ Health) · Coverage Status (CJ-3) · A/B/C Classification · Sales Value
(§7.8) · Route Ownership (§7.9) · Territory Boundaries (`erp_territories`) · GPS Compliance
(`erp_visit_compliance`) · White-Space Opportunities. Each toggleable.

### 7.8 Sales Load Layer
Make **sales value** a first-class visibility + balancing dimension on the map and in the
optimizer:

- Display **per-customer sales value** on the map; support a **sales-value heatmap** view.
- Display **route sales totals** and **estimated sales load per route**.
- Route balancing optionally weights any combination of: customer count · visit workload ·
  **sales value** · geography · rep capacity (multi-objective, configurable — see §1a).

```
Route A   120 customers   SAR 520,000
Route B   115 customers   SAR 510,000
Route C   122 customers   SAR 525,000
```

Managers can **balance routes by sales value, not customer count only** — a route with fewer
but higher-value (or higher-workload) outlets stays balanced against a larger, lower-value one.

> **Reuse:** sales value derives from existing sales/invoice history per customer (no new
> source); the optimizer already accepts weighted objectives (§2). This layer adds a value
> rollup + heatmap rendering, not new business logic.

### 7.9 Territory Ownership Layer
Make **ownership responsibility** a planning + management layer on the map (not only
reporting):

- Visualize **salesman · supervisor · area · region** ownership, **a distinct colour per
  owner**, with **toggleable** ownership layers.
- Selecting a customer shows its **assigned salesman + supervisor**; render **route ownership
  boundaries**; **highlight customers assigned outside their expected territory** (exceptions).

```
Blue = Ahmed    Green = Mohamed    Orange = Ali
```

At a glance the manager sees **who owns the customer · who owns the route · who owns the
territory**. Integrates with **Customer 360 · Coverage Status (CJ-3) · Journey Planning ·
Route Optimization · Geo Intelligence**.

> **Reuse:** ownership is existing data — `erp_customers.salesman_id`, the rep→supervisor
> `reports_to` chain (already surfaced in Customer 360 G1), `route_id`, `region_id`/`area_id`,
> and `erp_territories` boundaries. This layer is colour-coding + boundary rendering +
> out-of-territory detection over those, not new business logic.

### 7.10 Apply
```
Generate → Preview → Drag & Drop → Scenario Compare → Apply
```
Apply publishes directly into the **Journey Plan Engine** using the single data model
(§4a) — Export and Apply remain two serializations of one dataset.

> **Reuse:** layers and metrics are existing read-models (Coverage Status CJ-3, Customer
> Health, outlet grade, frequency/workload from the FR resolver, GPS compliance, territories).
> The enhancement is a **map interaction + scenario-state** layer over them, not new business
> logic. Heavy dependency on **Geo Intelligence & Territory Mapping** (separate roadmap item).

---

## 8. Deployment Model — Standalone Product

The Studio should be designed to operate in **two modes from one codebase**:

1. **Embedded VANTORA module** — integrated with the platform (applies into the Journey
   Plan Engine, reads live customer/sales/coverage data).
2. **Standalone SaaS / service offering** — a self-contained product usable **even when
   Sales, Inventory, Collections, and other ERP modules are not enabled.**

**Standalone workflow:**
```
Upload Customer Data → Set Optimization Rules → Generate Route Scenarios → Map Planning
  → Drag & Drop Adjustments → Scenario Comparison → Excel Export → (optional) Apply to Journey Plan
```

**Design implications (to honour now, so no refactor later):**

- **Self-sufficient inputs:** the Studio must run from an **uploaded customer dataset**
  (name · geo · classification · sales value · frequency · ownership) — it cannot assume
  Sales/Inventory/Collections tables exist. Live ERP data is an *enrichment*, not a
  prerequisite.
- **Decoupled core:** the optimization + balancing + scenario engine depends only on the
  **single route dataset model** (§4a) and the **FR-1 frequency value model**, never on ERP
  module internals. Sales value, coverage, ownership arrive as **optional columns/layers**
  that degrade gracefully when absent.
- **Optional Apply:** "Apply to Journey Plan" is the *only* step that requires the embedded
  platform; in standalone mode the terminal action is **Excel Export** (same single-model
  schema, §4a), keeping the two modes on one data contract.
- **Excel as the portability boundary:** because Export ≡ Journey-Plan import (§4a), a
  standalone customer can hand the exported file to a VANTORA tenant and Apply it unchanged.

> **Reuse:** the engines (`optimize.ts`, `territory.ts`, `generator.ts`, FR resolver,
> conflict detection) are already pure/data-driven, so a standalone packaging is mostly a
> **boundary + ingestion (upload) + licensing** concern, not a re-implementation.

---

## 9. Indicative Phasing (when scheduled)

| Phase | Scope |
| :--- | :--- |
| RO-1 | Bulk customer selection (city/region/country) + rule form |
| RO-2 | Multi-objective balancer (count · workload · value · distance · capacity) → scenarios |
| RO-3 | Map preview + conflict detection |
| RO-4 | Drag & drop scenario adjustment |
| RO-5 | Excel export + apply to Journey Plan (single data model, §4a) |
| RO-6 | Geo Intelligence + Smart Next integration |
| RO-7 | Visual Territory Planning Studio (§7): map-driven day assignment, drag & drop, live preview, scenario compare, map layers |
| RO-8 | Sales Load Layer (§7.8): per-customer value + heatmap, route sales totals, sales-weighted balancing |
| RO-9 | Territory Ownership Layer (§7.9): colour-coded salesman/supervisor/area/region ownership, boundaries, out-of-territory detection |
| RO-10 | Standalone packaging (§8): customer-data upload/ingestion, decoupled engine boundary, Excel-export terminal mode, optional Apply, licensing |

**Prerequisite:** Visit-Frequency Resolution Layer (workload weighting) and Geo Intelligence
(map + distance) — both already recorded as roadmap items.
