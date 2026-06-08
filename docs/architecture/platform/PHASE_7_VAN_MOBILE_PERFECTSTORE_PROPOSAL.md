# VANTORA — Phases 7A–7E Architecture Proposals (Design Review)

**Status:** 🔵 **Design review / proposal only — NO implementation, NO migrations, NO code.**
Reuse-first · multi-tenant · RLS · auditable · flags default OFF · additive migrations · integration
tests before merge. **Do not implement until approved.** Each sub-phase reuses the large foundation
already merged (van ops, day-close, collections, returns, forecasting, perfect-store, coverage KPIs,
route optimization, ownership history, role governance).

---

## 7A — Route Accounting & Van Operations
**Reuse baseline:** van load manifest (`erp_van_load_manifests`, 0194), van transfers (`erp_van_transfers`,
0133), van reconciliation (`erp_van_reconciliations`, 0138), day-close (`erp_close_day`, 0132),
collections (0192), returns (0219), customer profitability (0223), GL poster (Phase 1).

**Net-new (additive):**
- `erp_van_opening_balances` (route/van/day opening cash + stock value).
- `erp_van_expenses` (fuel/per-diem/misc; company-configurable categories).
- `erp_van_cash_reconciliations` (expected cash = opening + sales − returns − expenses + collections; vs counted → variance).
- A pure **van-statement / day-close / route-P&L** engine assembling the above + reconciliation into the five reports.

**Architecture:** pure engine `src/lib/van-accounting/` (opening → load → sales/collections/returns/
expenses → cash + inventory reconciliation → day close → route P&L), thin Supabase gateway, GL reuse.
**Outputs:** Van Statement · Day Close Report · Cash Reconciliation · Inventory Reconciliation · Route Profitability.
**Risks:** double-count vs existing day-close (mitigate: distinct reference types); cash vs GL parity.
**Dependencies:** 0132/0133/0138/0192/0194/0219/0223. **Complexity:** Medium (mostly assembly + 3 tables).

## 7B — Mobile Field Sales App
**Reuse baseline:** `OFFLINE_SYNC_FOUNDATION.md` (design), visits/journey/GPS (0014/0129/0131), route
riding (0212/0213), surveys (0144), attachments (0111), data-scope/governance (0227).

**Net-new:**
- **PWA shell** (manifest + service worker) — Android-first, installable, offline cache.
- **Offline sync engine**: `erp_offline_mutations` (client-queued ops) + `/api/internal/offline-sync` intake (idempotent, company-scoped) + a **conflict policy** (last-write-wins per field + server-authoritative for stock/cash; surfaced conflicts to a review queue).
- **Media compression** (client-side image downscale before upload) + **device audit trail** (`erp_device_sessions`: device id, app version, last sync, GPS).

**Architecture:** the offline queue is the spine; every field action (check-in/order/collection/return/
survey/photo/customer-update/route-riding) writes locally then syncs. **Risks:** conflict correctness,
duplicate suppression (idempotency keys — reuse 0118 pattern), media size, battery/GPS. **Dependencies:**
all field tables + idempotency. **Complexity:** High (the offline engine + conflict handling).

## 7C — Perfect Store Engine
**Reuse baseline:** `perfect-store.ts` pillar scorer + `perfectStorePillars`/banding, MSL matrix (0144),
assortment/OOS, distribution KPIs (`distribution-kpi.ts`), outlet grading (0145), surveys.

**Net-new:**
- `erp_perfect_store_scorecards` (company-configurable pillar weights) + `erp_perfect_store_rules`
  (channel / region / customer-type specific overrides — no hardcoding).
- Pure **configurable scorer** layering channel/region/customer-type templates over `perfectStorePillars`.
- `erp_perfect_store_scores` snapshot (outlet/period) for **historical trend**.
- Pure leaderboard/trend read-models.

**Outputs:** Perfect Store Dashboard · Outlet Scorecard · Team Scorecard · Compliance Leaderboard.
**Risks:** scorecard config explosion (mitigate: template inheritance). **Dependencies:** 0144/0145 +
perfect-store. **Complexity:** Medium.

## 7D — Route & Territory Intelligence
**Reuse baseline:** coverage/strike KPIs (`coverage/kpi.ts`), rep scorecard (`scorecard.ts`),
`erp_rep_day_kpis` (0193), route optimization + balancing (0214/0215), ownership history (0214 — owner-at-
execution attribution).

**Net-new:** pure **health-score** read-models — Route / Salesman / Territory health (composite of
coverage, strike, adherence, missed customers, call compliance, productivity) reusing the pillar scorer;
multi-level dashboard read-models (territory/route/salesman/supervisor) over `erp_rep_day_kpis` (extend
snapshot dimensions, no live recompute). **Risks:** snapshot dimensionality. **Dependencies:** 0193 +
coverage + ownership. **Complexity:** Low-Medium (read-models; mostly reuse).

## 7E — Suggested Load & Demand Engine
**Reuse baseline:** forecasting engine (`commercial/forecasting`, 6B), van load manifest (0194), journey
plans (0129), promotions/trade-spend, attribution (OOS history via timeline).

**Net-new:** pure **suggested-load** engine: per route/day, project demand (forecast × seasonality ×
promotion uplift × active customers) → suggested van load sheet + replenishment recommendations + van
utilization (load vs capacity). `erp_suggested_loads` snapshot. **Risks:** forecast accuracy → over/under
load (mitigate: WAPE-bounded buffers). **Dependencies:** 6B forecasting + 0194. **Complexity:** Medium.

---

## Recommended implementation order
1. **7D Route/Territory Intelligence** (lowest risk, pure read-models over existing snapshots — fast value).
2. **7C Perfect Store Engine** (configurable scorer over the existing pillar scorer).
3. **7A Route Accounting & Van Ops** (assembles existing van/day-close/collections/returns + 3 tables + reports).
4. **7E Suggested Load & Demand** (builds on 7A van ops + 6B forecasting).
5. **7B Mobile Field App** (largest, highest-risk; the offline engine unblocks true field-first execution — do last, or start the offline foundation in parallel as its own track).

## Cross-cutting
- **Reuse-first:** ~70% of 7A/7C/7D is assembly + read-models over merged engines; net-new is mostly van
  accounting (7A), the offline engine (7B), configurable scorecards (7C), and suggested-load (7E).
- **Discipline:** every sub-phase = pure engine + additive flagged migrations (`KAKO_VAN_ACCOUNTING`,
  `KAKO_MOBILE`, `KAKO_PERFECT_STORE`, `KAKO_ROUTE_INTEL`, `KAKO_SUGGESTED_LOAD`, default OFF) + RLS +
  FK-covering + integration tests before merge.
- **Role governance:** dashboards honor data-scope + Entity-360 section security (0227).

*Design review only. On approval, each sub-phase proceeds in the recommended order under the same
engineering discipline (pure-engine-first → additive migration → gateway → tests → flagged dashboards).*
