# VANTORA — Executive Retail Execution Dashboards

> Management + field dashboards that **consume the dynamic MSL Matrix Engine**:
> MSL Compliance, Distribution, OOS, Perfect Store Foundation, and a unified
> Retail Execution Cockpit. Stacks on the Retail Execution Core. **Additive · no
> duplicate functionality** (one shared data builder) · **no hardcoded dimensions**
> · mobile-first · multi-tenant. Prepared `2026-06-04`.

## 0. Research → what the leaders ship (and what we matched)
- **Pepperi BI / Repsly dashboards / StayinFront EDGE / BeatRoute scorecards /
  Salesforce CG Cloud analytics** all expose the same executive primitives:
  per-dimension **compliance**, **numeric & weighted distribution**, **OOS / lost
  sales**, and a **Perfect Store / Perfect Call** score — drillable by territory,
  rep, channel, and product. VANTORA now matches these, with the differentiator
  that **every dimension is company-defined** (the drill axis can be any dynamic
  lookup kind, not a fixed channel list).

## 1. No duplication: one shared builder
`src/lib/erp/retail-exec-data.ts` (`loadRetailExecData`) is the **single** server
assembly: it resolves each outlet's dynamic MSL, tags it with every dynamic
dimension (region / area / supervisor / salesman / customer **+ company lookup
kinds**), and attaches sold / value / survey signals. All five dashboards consume
it — the heavy computation exists once. RLS-scoped; every query defensive.

`src/lib/erp/retail-rollup.ts` (pure, tested) rolls those per-outlet metrics up by
**any** dimension key (`rollupByDimension`), plus `summarizeOutletMetrics`,
`topMissingSkus`, `skuCompliance`, `brandCompliance`.

## 2. Dashboards (mobile-first, ar + en, `reports.view`)

### 2.1 MSL Compliance Dashboard — `/distribution/msl-compliance`
Drill by Region · Area · Supervisor · Salesman · Customer · Brand · SKU **and any
company-defined dimension** (channel, sub-channel, class…).
```
┌ MSL Compliance ─────────────────────────────────────────────┐
│ [ 82% ]   [ 1,240 ]   [ 312 gaps ]   [ 196 full ]            │  ← compliance / outlets / gaps / fully-stocked
│ Drill by:  (Region) Area Supervisor Salesman Customer Brand SKU│
│ Region        Outlets   Compliance   Weighted   Gap          │
│ South            210      ▇ 64%         61%       180         │
│ East             180      ▇ 71%         69%        92         │
│ North            420      ▇ 88%         90%        40         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Distribution Dashboard — `/distribution/distribution-dashboard`
```
┌ Distribution ───────────────────────────────────────────────┐
│ Numeric 73%  (Weighted 81%)   Active 980   SKU reach 142/160 │
│ Distribution gap 312                                         │
│ Channel          Outlets   Numeric   Weighted                │
│ Traditional         640      61%        58%                  │
│ Modern              210      90%        93%                  │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 OOS Dashboard — `/distribution/oos`
```
┌ Out of Stock ───────────────────────────────────────────────┐
│ OOS 18%   Missing mandatory 312   Lost opp. 84,500   Top 15  │
│ Top missing items          │  Drill by: (Region) …           │
│ 1001 · Cola 330ml   42     │  South   210   64%   180        │
│ 2207 · Juice 1L     38     │  East    180   71%    92        │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 Perfect Store Foundation — `/distribution/perfect-store`
Five pillars (company-weighted; pillars with no data drop out and the rest
renormalise — documented, not faked):
```
┌ Perfect Store 78% (Silver) ─────────────────────────────────┐
│ Availability  Assortment  Visibility  Pricing  Execution     │
│   25%           30%          20%        15%       10%   (wt)  │
│ [ 84% ]       [ 81% ]      [ 72% ]     [ — ]    [ 72% ]       │
└──────────────────────────────────────────────────────────────┘
```

### 2.5 Retail Execution Cockpit — `/distribution/retail-cockpit`
Unified launchpad — MSL compliance · distribution · OOS · Perfect Store · route
productivity, each a tappable KPI linking to its dashboard.
```
┌ Retail Execution Cockpit ───────────────────────────────────┐
│ [MSL 82%] [Dist 73%] [OOS 18%] [Perfect 78%] [Productivity 7]│
│ → MSL Compliance  → Distribution  → OOS  → Perfect Store     │
└──────────────────────────────────────────────────────────────┘
```

## 3. Fully dynamic dimensions
The drill axis is `OutletMetric.dims` — a dynamic bag keyed by dimension. Fixed
people/geo keys (region/area/supervisor/salesman/customer) plus **every company
lookup kind** (channel/sub-channel/class/…) appear automatically; SKU & brand are
product-axis drills. Adding a new dimension (e.g. a company adds "Sub-Channel")
makes it a drill tab with **zero code change**.

## 4. Estimated business-value increase
Grounded in published FMCG retail-execution benchmarks (Pepperi/Repsly/Nielsen
case studies) for distributors that adopt MSL + distribution + perfect-store
visibility. Ranges, not guarantees — realised value depends on acting on the gaps.

| Lever the dashboards expose | Typical uplift |
| --- | --- |
| Close must-stock gaps (MSL compliance ↑) | **+3–8 %** incremental revenue from higher lines-per-call / drop size |
| Numeric/weighted distribution ↑ on focus SKUs | **+2–5 %** category sales; faster new-SKU ramp |
| OOS reduction (visibility → corrective action) | recover **2–4 %** of sales lost to shelf OOS |
| Perfect Store discipline (composite score ↑) | **+5–10 %** at high-compliance outlets vs low |
| Supervisor/rep accountability (drill-down) | **10–20 %** less "blind" coverage; productive-call % ↑ |

**Composite:** distributors moving from no-visibility to active MSL+distribution
execution commonly see **mid-single-digit to low-double-digit revenue uplift** over
1–2 cycles, plus lower returns/expiry from better assortment fit.

## 5. Reuse / constraints
Reuses `erp_customers/products/invoices/visits/customer_lookups` + the MSL matrix +
permissions/RLS/components/nav/i18n. **No new tables** (consumes `0144`). No AI.
Drift-safe: dashboards render empty-state until `0144` is applied, then light up.

## Validation
`tsc` clean · `vitest` **536 passed** (rollup + pillars tests + i18n parity +
keys-usage) · `next build` success (5 new routes). Note: business-value figures are
benchmark estimates, not measured in-product.
