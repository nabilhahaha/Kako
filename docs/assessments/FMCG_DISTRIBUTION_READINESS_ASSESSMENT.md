# VANTORA — Phase 3 FMCG Distribution Excellence: Readiness Assessment & Roadmap

**Type:** Assessment + roadmap **only** (no implementation). Verified against actual
code/migrations (0001–0211) and integration tests. Reuse-first. No redesign unless justified.

## Executive summary
VANTORA already has a **mature FMCG distribution core** (Phases 3/3.x/4): customer
master, journey plans, GPS-validated visits, day-close, coverage/strike KPIs + daily
snapshots, MSL/OOS/Perfect-Store/grading, numeric/weighted distribution, collections
settlement, van load/transfer/reconciliation, targets, returns, and trade spend — all
flag-gated (`KAKO_DISTRIBUTION`, `KAKO_TRADE_SPEND`) and additive. The **biggest
greenfield gaps** are **Near-Expiry management (~5%)**, **Offline/mobile execution
(design-only, ~20%)**, **Forecasting (~5%)**, and **advanced merchandising** (display,
shelf-share, competitor, planogram). Most remaining items are **extensions of existing
engines**, not redesigns.

### Domain readiness (verified)
| Domain | Readiness | Headline gap |
|---|---|---|
| Customers (master) | ~85% | sub-channel, health score, multi-contact, supervisor assignment, ownership |
| Customer data governance | ~80% | GPS/national-address change approval, data-steward role |
| Journey plan engine | ~87% | frequency-rules engine, route rebalancing, **route riding** |
| Visit execution | ~85% | check-out RPC, competitor photos, outcome/call codes, **offline** |
| Coverage & execution KPIs | ~90% | drop size, AOV, calls-per-route |
| Mobile / offline | ~20% | **design-only** — no PWA/queue/sync engine |
| Sales execution | ~90% | SKU/customer performance persistence, commissions |
| Collections | ~75% | promise-to-pay, pre-computed aging |
| Van sales | ~65% | driver settlement, van profitability |
| Returns | ~70% | trade/damaged typing, multi-stage approval, structured photos |
| Near expiry | ~5% | **essentially absent** |
| Merchandising | ~40% | display, shelf-share, competitor, planogram |
| Distribution excellence | ~50% | listing/delisting, new-SKU introduction |
| Trade spend | ~85% | agreement typing, promo evaluation, post-promo, budget pools |
| Supervisor cockpit | ~70% | multi-level rollup dashboards |
| Forecasting | ~5% | **essentially absent** |

---

## 1. Existing functionality (verified, with evidence)
- **Customers:** `erp_customers` (0005) + expansion 0103 (segment/classification/channel,
  region/area, GPS lat/long, national_address, cr_number, tax_number/VAT, payment_terms_days,
  contact_person/phone, salesman_id); hierarchy 0112; status active/inactive/suspended/blocked
  + DB blocking triggers 0113; lookups `erp_customer_lookups`.
- **Governance:** staged change-requests for sensitive fields (`erp_customer_change_requests`,
  0109; `customer-approval.ts` SENSITIVE_FIELDS = cr/tax/credit_limit/segment/classification/
  channel/payment_terms); credit-limit workflow 0141; generic field governance 0114–0117;
  workflow engine 0088–0090/0176–0184.
- **Journey/Visits:** `erp_journey_plans` + `erp_today_journey` + `erp_customer_in_today_plan`
  (0129); `erp_routes`/`erp_route_customers` (0062/0129); `erp_visits` w/ check_in/out, GPS,
  route_id, work_session_id, sequence, gps_status, out_of_route (0014/0128); `erp_check_in_visit`
  + haversine `erp_gps_distance_m` + `erp_visit_compliance` (0131); `erp_close_day` + skips (0132);
  `journey-sort.ts` (manual/nearest/optimized/hybrid).
- **KPIs:** coverage/adherence/strike engines (`lib/distribution/coverage/kpi.ts`), rep scorecard
  pillars + gold/silver/bronze (`scorecard.ts`), `erp_rep_day_kpis` daily snapshots (0193) via
  `/api/internal/kpi-snapshot`; `erp_coverage_summary` (0143); `KpiScorecard`/`StatCard` UI.
- **Merchandising/Distribution:** MSL matrix (0144, `msl-matrix.ts`), assortment, OOS + Perfect
  Store pillar scorer (`perfect-store.ts`), numeric/weighted/SKU distribution (`distribution-kpi.ts`),
  outlet grading (0145); dashboards under `/distribution/*`; dynamic `erp_surveys`/`erp_survey_responses`.
- **Sales/Collections/Van/Returns:** sales orders/invoices/lines (0005), credit hold (0026),
  targets + achievement (0139), collections settlement + allocations (0192, `collections/allocation.ts`),
  payments (cash/cheque/transfer/card/mobile), van load manifest (0194), van transfers (0133),
  van reconciliation (0138), sales returns + reason catalog (0005/0140), audit logs (0003),
  idempotency (0118).
- **Trade spend:** promotions/accruals/claims/allocations (0195) + GL (0196) + pure engines
  (`trade-spend/{accrual,claims,roi,summary}.ts`) + dashboard.

## 2. Missing functionality
- **Near-expiry:** detection, risk-days, dashboard, recovery, return recommendation, approval,
  customer/product risk scores (the `near_expiry_records` referenced in 0002 was never created).
- **Offline/mobile:** no PWA manifest/service worker, no `erp_offline_mutations`, no sync endpoint
  or client queue (OFFLINE_SYNC_FOUNDATION.md is design-only).
- **Forecasting:** customer/route/salesman/SKU/demand forecast, promotion uplift, seasonality
  (only a naïve run-rate forecast in 0139).
- **Merchandising depth:** display tracking, shelf share, competitor tracking + photos, planogram.
- **Distribution lifecycle:** listing/delisting state, new-SKU introduction, distribution-gap workflow.
- **Customers:** sub-channel, customer group (general), health score, formal lifecycle, multiple
  contacts, customer ownership, supervisor assignment.
- **Collections:** promise-to-pay, pre-computed aging buckets, overdue escalation workflow.
- **Van:** driver settlement payout, van profitability/P&L, vehicle registry.
- **Returns:** trade-vs-damaged typing, multi-stage approval state machine, structured return photos,
  return status history.
- **KPIs:** drop size, AOV, calls-per-route; multi-level (area/regional) rollup dashboards.
- **Route riding** (now a dedicated module — see the Route Riding build).

## 3. Reuse opportunities (reuse-first)
| Need | Reuse |
|---|---|
| Approvals (returns, near-expiry, governance) | Workflow engine 0088–0090/0176–0184 + permission approver (0109) |
| Dynamic evaluation/eval forms | `erp_surveys`/`erp_survey_responses` + survey scoring + field governance 0114 |
| Scoring/banding | `scorecard.ts` pillars + `perfect-store.ts` pillar scorer |
| KPI persistence/trends | `erp_rep_day_kpis` snapshot pattern + `/api/internal/kpi-snapshot` |
| Photos | polymorphic `erp_attachments` (0111) + near-expiry-photos bucket (0001) |
| GPS/geofence | `erp_gps_distance_m` + `erp_check_in_visit` + `gps_radius` settings |
| Aging/near-expiry inputs | `goods_receipt_lines.batch_number/expiry_date` + `products_catalog.expiry_days` |
| Targets/achievement | `erp_targets` + `erp_target_achievement()` (metrics extensible) |
| GL postings | Phase-1 `erp_post_journal_entry` + seeded posting rules (distinct reference types) |
| Customer health/risk inputs | invoices, payments, visits, returns, balance, status |

## 4. Gaps vs enterprise FMCG distributors
- **Offline-first field execution** (SFA/DMS table stakes) — currently online-only.
- **Near-expiry/freshness governance** — required for food/pharma FMCG; absent.
- **Perfect-store depth** (planogram, share-of-shelf, competitor intel) — partial.
- **Distribution lifecycle** (listing/NPD/delisting, distribution gaps as workflow) — metrics only.
- **Demand planning & forecasting** (incl. promo uplift/seasonality) — absent.
- **Driver/van settlement & profitability**, **promise-to-pay & aging discipline** — partial.
- **Multi-level management cockpits** (rep→supervisor→area→regional rollups) — partial.

## 5. Recommended implementation order
Aligned to the stated FMCG priority list, sequenced by dependency + value, each additive +
flag-gated:
1. **Customer master fill-ins** (sub-channel, group, health score, multi-contact, ownership, supervisor).
2. **Journey plan v2** (frequency-rules engine, rebalancing) + **Route Riding** (dedicated module).
3. **Visit execution completion** (check-out RPC + duration, outcome codes, competitor photos).
4. **Collections discipline** (promise-to-pay, pre-computed aging, overdue workflow).
5. **Van excellence** (driver settlement, van profitability, vehicle registry).
6. **Returns v2** (typing, multi-stage approval, structured photos + status history).
7. **Near-expiry management** (detection, risk scoring, recovery, approval → credit note).
8. **Merchandising depth** (display, shelf-share, competitor, planogram).
9. **Distribution KPIs/lifecycle** (drop size/AOV, listing/delisting/NPD, gap workflow).
10. **Trade spend refine** (agreement typing, promo evaluation, post-promo, budget pools).
11. **Supervisor cockpit** (multi-level rollups: supervisor/area/regional).
12. **Forecasting & planning** (demand/SKU/route, promo uplift, seasonality, coverage planning).
**Cross-cutting (parallel, high-leverage): Offline/mobile foundation** — unblocks field-first execution for all of the above.

## 6. Database impacts (all additive, RLS, FK-covering, flag-gated)
- New tables (illustrative): `erp_customer_contacts`, `erp_customer_health` (or snapshot),
  `erp_visit_outcomes`, `erp_promise_to_pay`, `erp_driver_settlements`, `erp_return_status_history`,
  `erp_near_expiry_*` (batches/alerts/recommendations), `erp_display_audits`/`erp_shelf_share`/
  `erp_competitor_*`/`erp_planograms`, `erp_product_listings`, `erp_forecasts`, `erp_offline_mutations`,
  and the **Route Riding** tables.
- Augment-only on existing (e.g., `erp_customers` sub_channel_id/owner_id/supervisor_id, `erp_visits`
  duration/outcome, `erp_sales_returns` return_type) — never country/feature-specific schema in core entities.

## 7. Mobile impacts
- The single largest cross-cutting gap. Needs: PWA (manifest + service worker), an offline mutation
  queue (`erp_offline_mutations` + `/api/internal/offline-sync` + client store), conflict policy, and
  sync-status UI. Every field module (visits, route riding, merchandising, returns, near-expiry) should
  be authored mobile-first/offline-first against this foundation.

## 8. Dashboard impacts
- Reuse `StatCard`/`KpiScorecard` + read-model pattern. Add: drop-size/AOV, near-expiry, display/OOS
  depth, and **multi-level rollups** (supervisor → area → regional) over `erp_rep_day_kpis` (extend the
  snapshot dimensions rather than recompute live).

## 9. Workflow impacts
- Reuse the workflow engine + permission approver for: returns multi-stage approval, near-expiry
  return/credit-note approval, customer data-governance (extend sensitive fields to GPS/national
  address + a data-steward permission), and route-riding acknowledgement/coaching follow-up.

## 10. Scalability considerations
- Keep KPIs as **persisted snapshots** (extend `erp_rep_day_kpis`/add roll-up tables) rather than live
  recompute; FK-covering indexes (schema-health invariant) on every new FK; company-scoped RLS via
  `erp_user_company_id()`/branch helpers; pure engines + thin gateways (DB-free unit tests); additive,
  idempotent migrations; flags OFF by default; offline queue must be idempotent + conflict-safe at scale.

---

*Assessment only. On approval, each item proceeds as its own additive, flag-gated increment under the
established discipline. The Route Riding Excellence Module is delivered as the first build on this surface.*
