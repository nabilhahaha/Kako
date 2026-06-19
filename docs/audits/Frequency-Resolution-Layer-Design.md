# Visit-Frequency Resolution Layer — Design Package

**Workstream:** Coverage & Journey-Plan Engine → Frequency Authority Re-architecture (FR-1…FR-6)
**Status:** Design only — no implementation yet (gated methodology; awaiting approval)
**Date:** 2026-06-19

---

## 1. Design Direction (restated)

Customer-specific visit frequency is the **primary source of truth**. Classification
(A/B/C) is a **recommendation / auto-fill helper**, never the default authority.

**Precedence (highest → lowest):**

1. **Customer-level frequency** — manual or imported (per customer)
2. **Route / planning assignment** — frequency set in the planning context
3. **Classification recommendation** — A/B/C → visits/week
4. **System defaults**

Must support: Excel import, manual per-customer entry, Weekly / Biweekly / Monthly
today, and Annual / Custom in future. Classification must **not** override a
customer-specific frequency unless a company explicitly opts in. Industry-agnostic
(FMCG, Distribution, Wholesale, future verticals).

---

## 2. Current State (audit — grounded in code)

| Concern | Today | File |
| :--- | :--- | :--- |
| Per-customer frequency master | **Does not exist** | `erp_customers` (no column) |
| Frequency source of truth | Classification only | `route-optimization/frequency.ts` |
| Classification → visits/week | `erp_visit_frequency_rules` (company-configurable) + `DEFAULT_FREQUENCY_RULES` | `frequency.ts`, mig `0215` |
| Plan-row frequency | `erp_journey_plans.frequency` (weekly\|biweekly\|monthly) — **generated from classification, overwritten on every apply** | `journey-plan/actions.ts:127` |
| Cadence enforcement | Reads `erp_journey_plans.frequency` | `cadence.ts` / `erp_today_journey` (CJ-2) |
| Coverage status | Reads `erp_journey_plans.frequency` | `coverage-status.ts` (CJ-3) |
| Frequency vocabulary | `visits/week` float + 3-value enum (weekly/biweekly/monthly) | `frequency.ts` |

**Key finding:** `erp_journey_plans.frequency` is *physically* per-customer, but it is
**derived from classification and clobbered on each generation** — so classification is
the de-facto authority. There is no place a manually-set or imported customer frequency
can live and survive regeneration. CJ-2 (cadence) and CJ-3 (coverage) already consume the
plan-row frequency, so **once the resolver feeds the correct value into that column, both
inherit the new precedence for free.**

---

## 3. Gap Analysis

| # | Gap | Impact |
| :--- | :--- | :--- |
| G-1 | No customer-level frequency master (manual/imported) | Cannot honour precedence #1 at all |
| G-2 | Classification is the default authority (generator writes it) | Inverts the desired precedence |
| G-3 | No precedence resolver / no "company may let classification override" policy | No single, testable authority rule |
| G-4 | No Excel-import or manual-entry path for frequency | Cannot ingest customer-specific cadence |
| G-5 | Only weekly/biweekly/monthly; no annual/custom; vocabulary is FMCG-shaped | Not flexible across industries / future cadences |

---

## 4. Proposed Architecture

### 4.1 Frequency value model (industry-agnostic)

A normalized value object replaces the bare enum, with a backward-compatible token:

```
VisitFrequency = {
  kind: 'weekly' | 'biweekly' | 'monthly' | 'annual' | 'custom',
  everyN: number,          // e.g. monthly everyN=2 → every 2 months
  visitsPerCycle: number,  // visits within one cycle (default 1)
}
```

- **Canonical token** (string) stored on the customer, e.g. `weekly`, `biweekly`,
  `monthly`, `monthly:every-2`, `annual`, `custom:…`. Backward-compatible with the
  existing `weekly|biweekly|monthly` enum (those tokens are unchanged).
- **`visitsPerWeek` float** remains the bridge to the current generator/spread logic.
- Forward-compatible: `annual`/`custom` carried in a `jsonb` meta column; the existing
  cadence engine already treats unknown frequency as "always due" (CJ-2 forward-compat),
  so nothing breaks before FR-6 extends `isVisitDueOn`.

### 4.2 The Resolver (pure, single authority)

```
resolveVisitFrequency({
  customerLevel,      // #1  from erp_customers.visit_frequency (manual|import)
  planningLevel,      // #2  from route/planning assignment
  classification,     // #3  A/B/C → rules
  rules,              // company visit-frequency rules
  policy,             // { classificationCanOverride: boolean (default false) }
}): { frequency, source, recommendation }
```

- Walks the precedence chain and returns the **first non-empty** candidate, tagging its
  `source` (`'manual' | 'import' | 'planning' | 'classification' | 'system'`).
- Classification's value is **always** computed and returned as `recommendation` (for the
  auto-fill helper + "recommended vs actual" UI), but it only becomes the resolved
  `frequency` when nothing higher exists — **or** when `policy.classificationCanOverride`
  is explicitly enabled by the company.
- Pure and fully unit-tested; no I/O. This is the one place precedence is decided, so every
  surface (generator, cadence, coverage, dashboards) is consistent.

### 4.3 Schema (additive · no backfill · no breaking change)

- `erp_customers.visit_frequency text NULL` — canonical token (provenance #1).
- `erp_customers.visit_frequency_source text NULL` — `manual|import|classification|system`.
- `erp_customers.visit_frequency_meta jsonb NULL` — annual/custom detail (forward-compat).
- Company policy `journey.classification_can_override_customer_frequency boolean default false`
  (reuse the existing company-settings mechanism — no new table).

Null customer-level frequency ⇒ behaviour identical to today (classification path), so
**existing tenants are unaffected until they set values**.

### 4.4 Integration points (reuse-first)

| Surface | Change |
| :--- | :--- |
| `applyJourneyProposal` | Replace "classification → frequency" with `resolveVisitFrequency`; customer-level wins; classification only fills nulls (or when policy opts in) |
| Generator wizard | Show classification value as a **recommendation**; offer one-click auto-fill into the customer master (opt-in), never silent override |
| CustomerForm | Governed `visit_frequency` field (manual entry, source=`manual`) |
| Customer 360 | Display resolved frequency + its source badge alongside Coverage status |
| Customer import | Map a `visit_frequency` column (source=`import`) via the existing import pipeline |
| CJ-2 cadence / CJ-3 coverage | **No change** — they read the resolved plan-row frequency |

### 4.5 Cross-industry flexibility

The token model + resolver are vertical-neutral. The classification layer is pluggable
(FMCG A/B/C, Wholesale tiers, Distribution grades) because it is just data feeding level #3.
Company policy decides authority. No FMCG values are hardcoded (consistent with CJ-1).

---

## 5. Reuse Analysis

| Component | Reuse |
| :--- | :--- |
| `frequency.ts` (rules, visits/week, spread) | Wrapped by resolver — kept |
| `cadence.ts` / `erp_today_journey` (CJ-2) | Unchanged — inherits precedence via plan-row |
| `coverage-status.ts` (CJ-3) | Unchanged — inherits precedence via plan-row |
| Customer import pipeline | Extended with one column mapping |
| CustomerForm + field-governance | Extended with one governed field |
| Company settings | Reused for the override policy flag |

**Estimated reuse ≈ 80%.** Net-new: the value model, the resolver, three additive columns,
one policy flag, two thin UI bindings, one import column.

---

## 6. Implementation Roadmap (phased, gated)

| Phase | Scope | Effort |
| :--- | :--- | :--- |
| **FR-1** | Frequency value model + pure resolver + tests (no schema, no UI) — locks the precedence contract | ~0.5d |
| **FR-2** | Additive schema (customer `visit_frequency` + source + meta) + company override policy; read path uses resolver | ~0.5d |
| **FR-3** | Manual entry: governed `visit_frequency` field in CustomerForm + Customer 360 display | ~0.5d |
| **FR-4** | Excel import mapping + provenance (`source=import`) | ~0.5d |
| **FR-5** | Generator/apply uses resolver; classification becomes recommendation + opt-in auto-fill | ~1d |
| **FR-6** | Annual / custom cadence (extend `isVisitDueOn` + richer plan-row frequency) — forward-looking | ~1d |

**Total ≈ 4 dev-days, fully phased.** FR-1→FR-3 deliver the precedence + manual override
(the core of the direction); FR-4 adds import; FR-5 flips classification to recommendation;
FR-6 unlocks future cadences.

---

## 7. Business Impact

- **Correctness:** field-set or imported customer cadence is honoured instead of being
  silently overwritten by classification — directly fixes the inverted authority.
- **Flexibility:** weekly/biweekly/monthly now, annual/custom later, across verticals.
- **Trust:** provenance (`source`) + "recommended vs actual" makes the cadence auditable.
- **No regression:** additive, no backfill; null customer-frequency = today's behaviour.

---

## 8. Recommendation

Proceed **FR-1 → FR-2 → FR-3** first (precedence contract + customer-level authority +
manual entry), then **FR-4** (import), then **FR-5** (classification as recommendation),
with **FR-6** (annual/custom) as a forward-looking phase. One validated commit per phase,
Word review package per the standard process. Awaiting approval before any code.
