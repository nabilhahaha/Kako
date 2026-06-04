# Pilot Launch Readiness — score & first-customer profile

*Feature freeze. Robustness/scalability/ops only. No merge, no production deployment.*

## Hardening priorities — status
| # | Priority | Status |
|---|---|---|
| 1 | Staging k6 load test | **Artifact ready** (`scripts/loadtest/`), DB-layer measured (sub-2ms @100k w/ 0110) — **execute on staging (ops)** |
| 2 | PITR + Storage restore validation | **Script + runbook ready** (`reconcile-attachments.sql`, Operations Manual) — **run on Supabase (ops)** |
| 3 | Alerting & monitoring config | **Instrumentation verified + spec** — **configure alerts/SLOs (ops)** |
| 4 | Retention / cleanup jobs | ✅ **DONE** — 0119 `erp_purge_old_data` (notifications 90d / workflows 180d; audit retained) + daily guarded cron; tested |
| 5 | Scoped-RLS index path | ✅ **VERIFIED COVERED** — all scope columns indexed (+ 0110 `idx_cust_company_salesman`); scoped query measured sub-ms; no redundant index added |
| 6 | Planned-count cutover | ✅ **DONE** — customers/products/suppliers/inventory lists use `count:'estimated'` (exact for small, planner estimate at scale) |

**Net:** 4/5/6 closed in code; 1/2/3 are live-Supabase ops actions. Migration chain now **0100→0119**, applies clean; 337 unit + 20 integration; tsc + build green.

## Pilot Launch Readiness Score: **85 / 100** — GO (conditional)
+3 vs the prior 82: retention bounds long-term growth, count-cutover removes the scale-sensitive count cost, scoped-RLS confirmed indexed. Held below 90 only by the **un-executed ops gates** (load test, DR drill, alerts) — **no code blockers**.

### Remaining blockers (all operational, none code)
1. Staging k6 load test → p95<500ms.
2. Supabase PITR + Storage backup confirmed → restore drill → `reconcile-attachments.sql` (missing_files=0).
3. Alerts/SLOs configured + escalation contacts filled.
4. Guarded production deploy of the integration release (0100–0119 incl. 0110) → smoke → tag.
5. Pilot tenant provisioned + assisted import + core-cycle smoke.

## Recommended first-customer profile (maximize pilot success)
**Ideal:** a cooperative **FMCG distributor / wholesaler** that runs the classic van-sales + credit cycle — squarely what the platform is built for.

| Dimension | Recommended |
|---|---|
| Business type | Wholesale / delivery FMCG (seeded master data + routes/visits/credit fit this) |
| Branches | **1–2** (HQ + maybe one depot) |
| Users | **5–15**: 1 admin · 1–2 managers · 3–8 sales reps · 1 accountant/collector |
| Customers | **500–2,500** (within proven headroom; under the ~3k comfort line) |
| Products (SKUs) | hundreds to ~2,000 |
| Routes | a handful, with assigned reps + visit days |
| Commercial model | **uses credit sales + collections** — exercises credit limits, status blocking, approvals (the high-value areas) |
| Region / language | KSA / Arabic-first (matches i18n + national-address/CR/VAT fields) |
| Scope | core cycle (customer→order→invoice→payment→statement) + visits/routes + approvals + attachments |
| Temperament | a champion admin, feedback-oriented, willing to do **assisted onboarding + import** |

**Avoid for the first pilot:** very large customer books (>5k) until the staging load test + pagination mitigations are confirmed; integrations-heavy requirements; needs for promotions/trade-spend, multi-company consolidation, or self-serve billing (all roadmap, post-pilot).

**Why this profile:** it fully exercises the proven strengths (multi-tenant isolation, financial integrity, credit/status governance, routes/visits, attachments) at a data size with measured sub-2ms performance and ample headroom — maximizing the odds of a clean, reference-able first pilot.

*Readiness summary only. No new features, no merge, no production deployment.*
