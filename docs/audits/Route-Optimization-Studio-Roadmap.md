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

## 7. Indicative Phasing (when scheduled)

| Phase | Scope |
| :--- | :--- |
| RO-1 | Bulk customer selection (city/region/country) + rule form |
| RO-2 | Multi-objective balancer (count · workload · value · distance · capacity) → scenarios |
| RO-3 | Map preview + conflict detection |
| RO-4 | Drag & drop scenario adjustment |
| RO-5 | Excel export + apply to Journey Plan |
| RO-6 | Geo Intelligence + Smart Next integration |

**Prerequisite:** Visit-Frequency Resolution Layer (workload weighting) and Geo Intelligence
(map + distance) — both already recorded as roadmap items.
