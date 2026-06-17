# FMCG Pilot Readiness — Refresh (post Collection-in-Sell Phase 1)

> Re-evaluation of the prior FMCG gap assessment after the **sell → invoice →
> collect** loop and **Collection-in-Sell Phase 1** (in-flow payment + full credit
> control) landed. No new platform engines proposed — the focus is the **shortest
> path to a real FMCG pilot company on VANTORA**.
>
> **Prior baseline:** FMCG transactional core **95/100** · overall pilot **88/100**
> (remaining gap = operational: activation, setup, on-device dry-run, connectivity).

---

## 1. Van Selling — status

**Substantially complete.** The van rep’s primary workflow is end-to-end and
server-authoritative:

- One obvious entry: bottom-nav **Sell** → Van-Sell for van-sales tenants.
- Flow: Customer → Products → Review → **Payment** → Issue, mobile-first.
- **Multi-UoM** sell (Piece / Inner / Carton) with per-line conversion, per-UoM
  pricing, base-unit stock invariant (U1–U3 done; same picker on POS + invoice +
  sales-order surfaces).
- Server-authoritative pricing (`erp_resolve_price`), discount cap, van-required,
  negative-stock guard, idempotency — all atomic in `erp_van_sell` /
  `erp_van_sell_with_payment`.
- Post-sale: branded receipt + Print / Share / New Sale.

**Status: ✅ Done for pilot.** Residual: **offline** van-sell is not wired
(currently online-only) — see blockers.

## 2. Collections — status

**Substantially complete, and materially stronger than the prior baseline.**

- Standalone **Collect** screen: settle one receipt across many outstanding
  invoices (oldest-first or specified), atomic `erp_settle_collection`, idempotent,
  branded collection receipt. Now **auto-loads** a deep-linked customer’s
  outstanding invoices.
- **Collection-in-Sell Phase 1** (new): take payment **before** issuing — full
  cash / credit / partial / **mixed tenders** (cash · card · bank transfer ·
  cheque), reusing the exact `erp_collections` posting model (so reports /
  statements / reconciliation are unchanged).
- **Credit control, server-enforced** (the real-world FMCG risk that was NOT
  closed before): no overpayment; cash-only (limit 0) must be fully paid; credit
  limit (`unpaid ≤ available`); **credit-days / overdue** block; **Near-limit**
  warning. Validated by a **19/19 matrix** + the 5,000/4,900/1,000 edge case +
  invariants (base-unit stock, AR delta, idempotency) on staging.
- Blocked customers get a **status + reason + debt snapshot** (outstanding,
  overdue, open invoices, oldest age) and a one-tap **Collect Now** → Collection.

**Status: ✅ Done for pilot** (+ closes a credit-governance gap that would have
bitten a real distributor).

---

## 3. Remaining FMCG pilot blockers

The transactional **loop is no longer the blocker.** What remains:

| # | Item | Severity for a REAL pilot | Notes |
|---|------|---------------------------|-------|
| B1 | **Offline van-sell / collect** (queue + replay) | **High** if routes have weak signal; **Low** if online-first | Infra exists (offline-sync lib, idempotency keys = the designed Phase-6 seam). Not yet wired to van-sell/collect. **This is the #1 real-world gap now.** |
| B2 | **Manager day-2 reporting** — AR aging, collections by route/rep, van stock & valuation, route KPIs | **Medium** | Assemble from existing data (no new engine). A light version suffices for a pilot. |
| B3 | **Operational activation** — real-company setup (master data, vans assigned + stocked, prices > 0, customers/terms/limits), enable `platform.multi_uom` + `platform.collect_in_sell`, on-device **supervised dry-run** | **Medium (process, not engineering)** | Already packaged (setup wizard, reference-tenant SQL, Readiness Diagnostic, dry-run script). |
| B4 | **Connectivity decision** | **Decision** | Online-first pilot is viable today; offline (B1) is the first enhancement after. |
| B5 | **Replenishment in UoM (buy/receive, U4)** | **Low for a time-boxed pilot** | Pre-stock works; UoM purchasing is additive and deferred. Needed for steady-state, not pilot day-1. |

No item requires a new platform engine.

---

## 4. Revised pilot readiness

| Track | Prior | Now | Why |
|-------|------:|----:|-----|
| FMCG transactional + **commercial** core | 95 | **98** | Loop complete + in-flow payment + **server-enforced credit control** (governance gap closed) |
| Overall pilot — **online-first** | 88 | **92** | Engineering essentially done; remaining is activation + light reporting + the connectivity decision |
| Overall pilot — **offline-required** | — | **~85** | Offline van-sell/collect (B1) not yet built |

**Verdict:** **GO for a controlled, online-first real FMCG pilot** after activation
+ one supervised on-device dry-run. Rollback is one switch
(`KAKO_VAN_SALES` off, or the per-tenant `platform.collect_in_sell` /
`platform.multi_uom` toggles).

---

## 5. Minimum remaining work before a real FMCG pilot (online-first)

Shortest path — all reuse, no new engines:

1. **Provision the real company** (1–2 days): branches, warehouses + **vans
   assigned/stocked**, SKUs with **base UoM + factors + price > 0**, customers with
   **credit limit + terms**, routes, return reasons. Reuse the setup wizard +
   reference-tenant SQL pattern.
2. **Enable flags** for the company: `van_sales` (+ settings), `platform.multi_uom`,
   `platform.collect_in_sell`.
3. **Readiness Diagnostic = READY, 0 blockers** (`/field/van-sales/readiness`).
4. **One supervised on-device dry-run** of the full loop, including a
   **credit-blocked customer → Collect Now → settle** and a **mixed-tender** sale.
5. **Light manager reporting** (B2): AR aging + collections + van stock from
   existing queries — enough for daily oversight.
6. **Rep training** (½ day): the Payment step, credit statuses, Collect-Now.

After that, the **next highest-priority FMCG gaps** (post sell→invoice→collect),
ranked, all additive / reuse-only:

1. **Offline van-sell + collect** (queue + replay on the existing offline-sync +
   idempotency seam) — biggest real-world lever.
2. **FMCG reporting pack** — AR aging, collection performance, van stock/valuation,
   route/rep KPIs (assembled from existing tables).
3. **Supervisor credit-override** — route through the **existing approvals engine**
   (not a new engine) for one-off limit/overdue overrides.
4. **Buy/receive in UoM (U4)** then **Returns/Transfers in UoM (U5)** — additive,
   flag-gated, for steady-state replenishment.

**Bottom line:** the sell → invoice → collect loop with credit governance is
pilot-ready; the shortest path to a live FMCG pilot is **operational activation +
one dry-run on an online-first route**, with **offline** as the first
post-pilot investment.
