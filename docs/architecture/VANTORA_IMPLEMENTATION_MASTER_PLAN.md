# VANTORA — Implementation Master Plan

**Status:** Planning document only — **no implementation, no code, no migrations.**
Consolidates the approved platform + foundation architectures into a single build
order, dependency graph, phases, milestones, timeline, release strategy, and
rollout plan.
**Governing discipline (proven across Workflow + Search):** one engine per concern,
reuse-over-rebuild, **additive migrations only**, **flag-gated default-OFF**,
branch-validated on a pure-`main` Supabase branch, `tsc`/suite/build green per step,
RLS-first multi-tenancy, approvals via Workflow, discovery via Search.

---

## 0. Where we are (baseline)

| Capability | State |
|---|---|
| **Workflow Platform** (engine/runtime/builder/canvas + V1.1 hardening) | **Shipped to `main`**, flag-gated OFF (PR #126/#129 merged) |
| **Search OS Phase 1** (unified index, palette, categorized, code/barcode/phone/VAT, deep-link) | **Shipped to `main`**, flag-gated OFF (PR #129 merged) |
| **Finance Foundation** | Architecture **approved & frozen** (PR #131) |
| **Inventory Foundation** (houses the costing layer Finance §8A depends on) | approved & frozen (PR #132) |
| **Purchasing Foundation** | approved & frozen (PR #133) |
| **Sales Foundation** (FMCG-first-class) | approved & frozen (PR #134) |
| **CRM Foundation** | approved & frozen (PR #135) |
| **Trade Spend Foundation** (FMCG-first-class) | approved & frozen (PR #136) |

All foundations **formalize substantial existing schema** and fill documented gaps;
none is greenfield except Trade Spend (a layer over Finance+Sales).

---

## 1. Dependency graph

```
            Workflow Platform ──┐ (events, approvals, tick, egress, idempotency)
            Search OS ──────────┤ (index/providers)
                                ▼
   ┌──────── Event-producer backbone (recordEvent on domain mutations) ────────┐
   │                                                                            │
   ▼                                                                            ▼
 FINANCE core (journal + posting-rule engine + periods + tax + multi-ccy)
        ▲  consumes valued events                  posting backbone for ALL
        │
 INVENTORY core (movement ledger + COSTING LAYER + lots/expiry/bins/reservations)
        │  (Inventory costing ⇄ Finance posting are co-dependent → Phase 1 together)
        ▼
   ┌───────────────┬───────────────┐
 PURCHASING      SALES (FMCG)     (parallel once Finance+Inventory stable)
 (P2P → AP)      (O2C → AR/COGS)
        │               │
        │               ▼
        │             CRM (lead→opportunity→ hand off to Sales)
        ▼               ▼
        └───────► TRADE SPEND (needs Finance + Sales + Purchasing)
                         │
                         ▼
        Finance depends-on modules: AR/AP sub-ledgers, GL reporting,
        Fixed Assets, Budgeting  +  Search P2/P3 (event-driven)
```

**Hard dependencies:** Purchasing & Sales need **Finance + Inventory core**; CRM
needs **Sales**; Trade Spend needs **Finance + Sales + Purchasing**; Finance
posting needs **Inventory costing** for COGS/valuation (and Inventory needs Finance
to consume its valued events) → they are **one co-built core**. Search P2 and
Finance event-posting both need the **event-producer backbone**.

---

## 2. Build order

1. **Phase 0 — Platform activation & event backbone** (enables everything).
2. **Phase 1 — Finance + Inventory core** (ledger + costing + posting engine).
3. **Phase 2 — Purchasing** (P2P → AP).
4. **Phase 3 — Sales** (O2C + FMCG → AR/COGS) — may overlap late Purchasing.
5. **Phase 4 — CRM** (relationship + pipeline) — may overlap late Sales.
6. **Phase 5 — Trade Spend** (budget→promo→claim→settle→ROI).
7. **Phase 6 — Depends-on modules & Search depth** (AR/AP/GL reporting, Fixed
   Assets, Budgeting; Search P2/P3).

---

## 3. Phases (scope + exit criteria)

### Phase 0 — Platform activation & event backbone
- Roll out **Workflow V1.1 flags** in order C2 → C3 → C1 (claim → idempotency →
  at-least-once dispatch) per the approved rollout; enable **Search OS** + run the
  reindex backfill.
- **Event-producer backbone:** add `recordEvent` to domain mutations
  (customer/product/order/invoice/payment/stock/…) — unblocks Finance event-posting,
  Search incremental (P2), and Trade Spend triggers.
- *Exit:* flags green in staging→prod; events flowing; observability counters.

### Phase 1 — Finance + Inventory core (the backbone)
- Finance: COA classes formalized, **journal engine guarantees** (balanced,
  immutable+reversing, exactly-once), **posting-rule engine** (rules-as-data),
  fiscal periods (open/close), **tax engine V1** (VAT + ETA connector), **multi-ccy**
  (transaction+functional).
- Inventory: movement-ledger formalized as truth, **costing layer**
  (FIFO/WA/Standard), lots/expiry (FEFO), bins (optional), reservations/available.
- *Exit (milestone M1):* **purchase receipt → inventory valued → GL posted**, and
  **sale → COGS + AR posted** end-to-end (perpetual), flag-gated, branch-validated.

### Phase 2 — Purchasing (P2P)
- Formalize PO/GRN/returns/supplier-payments; add **PR, RFQ/quotations, supplier
  price lists, landed cost, three-way match, supplier-invoice**.
- *Exit (M2):* PR→RFQ→PO→GRN→3-way→AP→payment, landed cost in item cost, approvals.

### Phase 3 — Sales (O2C + FMCG)
- Formalize orders/invoices/returns/routes/visits/van/collections/credit; add
  **quotations, delivery notes, promotions hook, channels, credit gate**.
- *Exit (M3):* route visit → van sale → day-close reconciliation → AR/cash posting;
  order→delivery→invoice→return with COGS/AR; credit control live.

### Phase 4 — CRM
- Add contacts, leads, opportunities/pipeline, **unified activity timeline
  (projection)**, cases, campaigns/segmentation; reuse accounts/notes/tasks/visits.
- *Exit (M4):* lead → qualify → opportunity → win → hand-off to Sales quote/order.

### Phase 5 — Trade Spend (FMCG)
- Budgets, customer agreements, listing/visibility, promotion planning, claims,
  accruals, settlement/deductions, ROI.
- *Exit (M5):* plan promo (budget check) → execute discount at sale → accrue → claim
  → settle via credit note → ROI.

### Phase 6 — Depends-on modules & Search depth
- AR/AP sub-ledgers formalized, **GL financial reporting** (TB/P&L/BS/cash-flow),
  Fixed Assets, Budgeting; **Search P2** (event-driven incremental) + **P3**
  (Arabic UX/analytics) + finance/inventory/purchasing/sales/CRM/trade providers.
- *Exit (M6):* financial statements from the GL; live search across all modules.

---

## 4. Milestones

| ID | Milestone | Proves |
|---|---|---|
| **M0** | Platform live (flags on; events flowing) | Workflow + Search active; producers emitting |
| **M1** | Ledger+costing+posting core | perpetual COGS/AR posting end-to-end |
| **M2** | Procure-to-pay complete | PR→…→AP→pay + landed cost + 3-way |
| **M3** | Order-to-cash + FMCG complete | van/route/collections + AR/COGS + credit |
| **M4** | CRM live | lead→opportunity→Sales hand-off |
| **M5** | Trade spend live | plan→accrue→claim→settle→ROI |
| **M6** | Reporting + search depth | financial statements + platform-wide search |

---

## 5. Estimated timeline (planning estimate — not a commitment)

Indicative, assuming the proven single-track cadence (architecture→plan→build→
validate→flag rollout) and that foundations formalize existing schema:

| Phase | Size | Indicative |
|---|---|---|
| Phase 0 | S–M | ~2–3 weeks |
| Phase 1 (Finance+Inventory core) | **L** | ~6–8 weeks |
| Phase 2 (Purchasing) | M | ~3–5 weeks |
| Phase 3 (Sales+FMCG) | **L** | ~6–8 weeks (overlap w/ P2) |
| Phase 4 (CRM) | M | ~3–4 weeks (overlap w/ P3) |
| Phase 5 (Trade Spend) | M | ~3–5 weeks |
| Phase 6 (reporting + Search depth) | M–L | ~4–6 weeks |

**Net ~7–9 months** sequential; **~5–6 months** with the noted Purchasing∥Sales and
Sales∥CRM overlaps. Each phase ships incrementally behind flags (value lands early).
*Estimates are directional and depend on review cadence + data-migration scope.*

---

## 6. Release strategy

- **Per-foundation feature flags, default OFF** (e.g. `KAKO_FINANCE`,
  `KAKO_INVENTORY_COSTING`, `KAKO_PURCHASING`, `KAKO_SALES`/FMCG sub-flags,
  `KAKO_CRM`, `KAKO_TRADE_SPEND`). Merging changes nothing until enabled.
- **Additive migrations only**, each **branch-validated on a pure-`main` Supabase
  branch** (FK-coverage + wrapped-`auth.uid()` invariants), STAGING auto-apply,
  **PRODUCTION apply guarded/manual**.
- **Gates per PR:** `tsc` clean · full suite green · production build clean · schema-
  health invariants · i18n parity · flags-OFF = no behavior change.
- **Stacked but decoupled:** land each phase as its own `main`-based PR (Option-C
  discipline) so nothing blocks on unrelated tracks.
- Reviewer cadence: architecture (done) → implementation plan per phase → build →
  completion report → flag rollout.

---

## 7. Rollout plan

For each phase, in order, **staging → soak → production**:
1. Apply migrations to staging (CI); run any **backfill** (Search reindex; Finance
   COA seed + **opening balances**; Inventory **stock valuation initialization**;
   tenant scoping standardization branch→company where needed).
2. Enable the phase flag in **staging**; validate end-to-end against the milestone;
   measure latency + correctness; verify tenant isolation.
3. **Pilot tenant** in production first; then progressive enablement; production
   migration apply is the guarded manual step.
4. Observability (counters/dead-letter) for posting, costing, dispatch, approvals;
   rollback = unset the flag (additive schema inert).
5. Cross-cutting before/with Phase 1: **event-producer rollout** and **opening-
   balance / valuation initialization** are prerequisites for correct posting.

**Sequencing guardrails:** never enable a phase whose dependency phase isn't live
(Purchasing/Sales after Finance+Inventory; CRM after Sales; Trade Spend after
Finance+Sales+Purchasing). Workflow C1 (at-least-once) only after C2+C3 (per its
own plan).

---

## Key cross-cutting risks (planning)

- **Opening balances / valuation init** (Finance COA + Inventory costing) — a
  one-time data migration; must precede go-live posting.
- **Event-producer coverage** — Finance posting + Search incremental depend on it.
- **Branch→company scoping standardization** — several foundations note it; a
  careful additive migration + backfill.
- **Multi-currency + tax (ETA)** correctness — validate early in Phase 1.
- **FMCG complexity** (van day-close, promotions/claims) — pilot with a real
  distribution tenant.

---

*Planning document only — no code, migrations, or implementation. Per instruction,
all new architecture tracks are stopped; this consolidates the approved set into one
build plan. Awaiting approval to begin Phase 0 / per-phase implementation planning.*
