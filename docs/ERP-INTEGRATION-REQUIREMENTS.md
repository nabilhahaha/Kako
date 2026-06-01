# ERP Integration Requirements — customer onboarding package

The standard data-onboarding spec for any new customer. Defines what data the
platform needs, how it can be delivered, and the **minimum dataset** to operate
at each tier. Pairs with `ERP-SYNC.md` (the technical ingestion contract).

## 1. Data categories

### Mandatory data
| Dataset | Why | Key fields |
|---|---|---|
| **Customer Master** | every visit, target, promotion, commission is per customer | `external_id`*, code, name, channel, classification, branch, (salesman) |
| **Product Master** | scoring, targets, OOS, performance by category/brand/SKU | `external_id`*, SKU(code), name, **category**, **sub-category**, **brand**, unit, price |
| **Sales Transactions** | the actuals behind achievement/growth/commission/incentive | invoices **or** confirmed sales orders: `external_id`*, number, branch, customer, status, date, amounts, **lines** (product, qty, value) |

\* `external_id` (the stable id from the source system) is required on every
record for idempotent sync + de-duplication.

### Optional data (enables more, not required to start)
| Dataset | Unlocks |
|---|---|
| **Returns** | net sales accuracy, return-aware performance |
| **Collections / Payments** | collection targets & incentives |
| **Inventory** | stock-aware OOS / distribution insight |
| **Targets** | (else entered in-app via Excel import) |
| **Promotions** | (else managed in-app via TPM) |

## 2. Supported integration methods
| Method | How | Best for |
|---|---|---|
| **API** | push rows to `erp_sync_ingest(entity, rows, source, erp_system)` (REST/Edge) or pull via `erp_sync_jobs` | live/near-real-time, multi-ERP |
| **Database View** | expose ERP views the sync job reads (cursor/delta) | on-prem ERPs (SAP/Dynamics) with DB access |
| **Excel / CSV** | upload master/targets via the in-app importers (true `.xlsx`, validated) | first load, low-tech, targets/promotions |

All methods converge on the same idempotent, `external_id`-keyed upsert with a
`source_wins` conflict policy and full sync audit (`erp_sync_map`,
`erp_sync_dashboard()`), tagged with the originating **ERP system name** so
multiple ERPs per platform are supported.

## 3. Minimum dataset by operating tier

### Tier 1 — Dashboard Only
Operational visibility (visits, coverage, capture) without commercial figures.
- **Required:** Customer Master (+ branch/route assignment), reps & hierarchy.
- **Not required:** products, sales, targets.
- **Delivery:** Excel/CSV is sufficient.

### Tier 2 — Commercial Performance
Targets vs actuals, achievement, growth, RAG, commission & incentive.
- **Required:** Customer Master, **Product Master** (with category/brand/SKU),
  **Sales Transactions** (invoices or confirmed orders, with lines), Targets
  (synced or Excel).
- **Recommended:** Collections (for collection-based incentives).
- **Delivery:** API or DB View for sales (volume); Excel for targets.

### Tier 3 — Full FMCG Platform
Everything in Tier 2 plus field execution, alerts, TPM, governance, automation.
- **Required:** Tier 2 data **kept in sync on a schedule** (daily+), reps with
  routes + reporting hierarchy, geofence/coverage config.
- **Recommended:** Returns, Inventory, Promotions; scheduled ERP sync jobs;
  Collections.
- **Delivery:** API/DB View on a schedule (scheduler health-monitored), Excel for
  ad-hoc targets/promotions.

## 4. Onboarding checklist (per customer)
- [ ] Confirm tier (Dashboard / Commercial / Full)
- [ ] Map source `external_id` for customers, products, sales
- [ ] Map branch codes, category/sub-category codes, SKU codes, channel &
      classification values
- [ ] Choose actuals source: **invoices** vs **confirmed orders** (per company)
- [ ] Pick integration method per dataset (API / DB View / Excel)
- [ ] Dry-run a sample batch into a non-prod company; verify
      `erp_sync_dashboard()` (0 errors) and idempotency (re-run → 0 created)
- [ ] Schedule recurring sync (Full tier) + confirm Scheduler health
- [ ] Sign off the minimum dataset for the agreed tier

> Companion docs: `ERP-SYNC.md` (ingestion/field contract + conflict policy),
> `MIGRATION-READINESS.md` (cutover), `PILOT-RUNBOOK.md` (first pilot).
