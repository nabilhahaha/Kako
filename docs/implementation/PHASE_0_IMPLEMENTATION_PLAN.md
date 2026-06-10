# VANTORA — Phase 0 Implementation Plan

**Status:** Implementation planning only — **no code, no migrations, no
implementation.** Operationalizes the approved `VANTORA_IMPLEMENTATION_MASTER_PLAN`
into concrete order, deliverables, migrations, flags, gates, rollback, pilot
strategy, effort, and critical path. **No new architecture, no new modules** — uses
only the approved set: **Workflow · Search · Finance · Inventory · Purchasing ·
Sales · CRM · Trade Spend.**
**Playbook (unchanged):** additive migrations only · flag-gated default-OFF ·
branch-validated on a pure-`main` Supabase branch · `tsc`/suite/build green · schema-
health invariants (FK coverage, wrapped `auth.uid()`) · RLS-first · guarded prod apply.

This document details **Phase 0** in full, plus a per-phase implementation table
(P1–P6) so order/deliverables/migrations/flags/dependencies/rollback/gates/effort
are defined **per phase** end-to-end.

---

## PHASE 0 — Platform activation & event backbone (the prerequisite for all)

**Goal:** turn on the already-shipped platforms and wire the **event-producer
backbone** that Finance posting, Search incremental indexing, and Trade Spend all
depend on. Highest-leverage, lowest-risk; unblocks every later phase.

### 1. Exact implementation order (within Phase 0)
1. **Workflow V1.1 flag rollout** — enable in staging then prod, **C2 → C3 → C1**
   (claim → effect-idempotency → at-least-once dispatch), per the approved hardening
   rollout (never C1 before C2+C3).
2. **Search OS enablement** — enable `KAKO_SEARCH`; run `/api/internal/search-reindex`
   backfill; verify categorized/identifier/deep-link + tenant isolation.
3. **Event-producer backbone** — add `recordEvent(...)` to the remaining domain
   mutations (customer/product/order/invoice/payment/stock/return/visit/…), behind a
   new **`KAKO_EVENTS`** flag (default OFF). These were excluded with the offline-sync
   work; the bus (`erp_events`) + dispatcher already exist on `main`.
4. **Search P2 incremental** — once producers emit, enable `KAKO_SEARCH_LIVE` (index
   stays fresh from events; reconcile sweep as backstop).
5. **Observability** — counters/dead-letter for dispatch, tick, claim contention,
   effect-skip, reindex (review item R6) so all later phases are visible.

### 2. Deliverables
- Workflow V1.1 live (single-flight, idempotent effects, at-least-once dispatch).
- Search live (read) + incremental (live) with backfill.
- Event-producer coverage across domain mutations (flagged).
- Observability dashboard/counters.
- **Prereq design (not run): opening-balance + stock-valuation init jobs** specced
  for Phase 1.

### 3. Database migrations
- **None required** for activation (Workflow `0176–0184` + Search `0185` already on
  `main`). Optional tiny additive migration only if observability needs a counters
  table; otherwise code + flags only. → **Phase 0 is migration-light.**

### 4. Feature flags
`KAKO_WF_CLAIM`, `KAKO_WF_IDEMPOTENT`, `KAKO_WF_DISPATCH_SWEEP` (sequence),
`KAKO_SEARCH`, `KAKO_SEARCH_LIVE`, **`KAKO_EVENTS`** (new producer backbone). All
default OFF; staging-soak before prod.

### 5. Dependencies
None — Phase 0 is the base. (It is itself the dependency for P1–P6.)

### 6. Rollback strategy
Unset the relevant flag → exact prior behavior (additive/inert). Producers no-op
when `KAKO_EVENTS` off; sweeps/claims revert to V1 paths when their flags off.

### 7. Validation gates
`tsc`/suite/build green; flags-OFF = zero behavior change (verified); staging soak;
**event flow verified** (mutation → `erp_events` → dispatch/search projection);
Workflow concurrency/idempotency verified per V1.1 plan; search results correct +
tenant-isolated; no schema-health regressions.

### 8. Pilot company strategy
Enable Phase 0 flags for a **single pilot distribution (FMCG) tenant** in production
first (per-tenant/allowlist gating), soak ~1 week, then progressive enablement.

### 9. Estimated effort
**S–M, ~2–3 weeks** (mostly producer wiring + flag rollout + observability).

### 10. Critical path
Phase 0 **is** the start of the critical path: **event backbone → Finance+Inventory
core (P1)**. Producer coverage is the gating dependency for Finance event-posting
and Search-live.

---

## Per-phase implementation table (P1–P6)

Each phase: own `main`-based PR(s), additive migrations branch-validated, flag-gated
OFF, gates green, staging→soak→prod, pilot tenant first.

### P1 — Finance + Inventory core *(critical path; the backbone)*
- **Order:** Finance journal+posting-rule engine → tax V1 → multi-ccy → fiscal
  close; **then** Inventory costing layer emits valued events into it; lots/expiry/
  bins/reservations.
- **Deliverables:** balanced/immutable journal + reversing; posting-rule engine
  (rules-as-data) + resolver; tax codes/determination (VAT + ETA connector);
  exchange rates + functional posting; period open/close; **costing layer**
  (FIFO/WA/Standard); lots/FEFO; optional bins; generic reservations/available;
  valued movement events → posting.
- **Migrations (additive):** Finance — `posting_rules`, `tax_codes`/`tax_rules`,
  `exchange_rates`, COA class/currency columns, period lifecycle (journal/periods/
  cost_centers already exist). Inventory — `inventory_cost_layers`,
  `inventory_avg_cost`, `standard_costs`, `inventory_lots` (+ `lot_id` on stock/
  movements), `warehouse_bins`, generic `reservations` (+ migrate
  `fashion_reservations`).
- **Flags:** `KAKO_FINANCE`, `KAKO_INVENTORY_COSTING`.
- **Dependencies:** Phase 0 (events).
- **Rollback:** flags OFF → no posting/costing; additive tables inert.
- **Gates:** **M1** — purchase receipt → inventory valued → GL posted; sale → COGS +
  AR posted (perpetual), end-to-end on the pilot; balanced-entry + FK + auth.uid
  invariants; opening-balance + valuation-init backfill run for pilot.
- **Effort:** **L, ~6–8 weeks.**

### P2 — Purchasing (P2P → AP)
- **Deliverables:** PR, RFQ/quotations, supplier price lists, landed cost, GRN
  formalization, three-way match, supplier-invoice → AP; approvals.
- **Migrations:** `purchase_requests`/lines, `rfqs`/lines, `supplier_quotations`/
  lines, `supplier_price_lists`/items, `landed_cost`/allocations, `supplier_invoices`
  (PO/GRN/returns exist).
- **Flags:** `KAKO_PURCHASING`. **Deps:** P1.
- **Gates:** **M2** — PR→RFQ→PO→GRN→3-way→AP→payment + landed cost in item cost.
- **Effort:** **M, ~3–5 weeks** (can overlap late P3).

### P3 — Sales (O2C + FMCG → AR/COGS)
- **Deliverables:** formalize orders/invoices/returns/routes/visits/van/collections/
  credit; add quotations, delivery notes, channels, credit gate; promotions
  *execution* hook (mechanics owned by P5).
- **Migrations:** `sales_quotations`/lines, `delivery_notes`/lines, customer
  `channel`, credit-exposure view (orders/invoices/returns/routes/van/payments/
  credit-requests/price-lists/outlet-grades exist).
- **Flags:** `KAKO_SALES` (+ FMCG sub-flags). **Deps:** P1.
- **Gates:** **M3** — route visit → van sale → day-close reconciliation → AR/cash;
  order→delivery→invoice→return with COGS/AR; credit control live.
- **Effort:** **L, ~6–8 weeks** (overlap with P2).

### P4 — CRM
- **Deliverables:** contacts, leads, opportunities/pipeline, **activity timeline
  (projection)**, cases, campaigns/segmentation; account = customer; Sales hand-off.
- **Migrations:** `crm_contacts`, `crm_leads`, `crm_opportunities`(+stages),
  `crm_activities`, `crm_cases`, `crm_segments`, `crm_campaigns`.
- **Flags:** `KAKO_CRM`. **Deps:** P3 (Sales hand-off).
- **Gates:** **M4** — lead→qualify→opportunity→win→Sales quote/order.
- **Effort:** **M, ~3–4 weeks** (overlap with late P3).

### P5 — Trade Spend (FMCG)
- **Deliverables:** budgets, customer agreements, listing/visibility, promotion
  planning, claims, accruals, settlement/deductions, ROI.
- **Migrations:** `trade_budgets`, `customer_agreements`, `listing_fees`,
  `visibility_contracts`, `promotions`, `trade_claims` (accruals via Finance rules).
- **Flags:** `KAKO_TRADE_SPEND`. **Deps:** P1 (Finance) + P3 (Sales) + P2 (Purchasing
  co-op claims).
- **Gates:** **M5** — plan (budget check) → execute discount at sale → accrue →
  claim → settle via credit note → ROI.
- **Effort:** **M, ~3–5 weeks.**

### P6 — Depends-on modules & Search depth
- **Deliverables:** AR/AP sub-ledgers formalized, **GL reporting** (TB/P&L/BS/cash-
  flow), Fixed Assets, Budgeting; Search P3 (Arabic UX/analytics) + module providers.
- **Migrations:** `fixed_assets`/depreciation, `budgets` (Finance), reporting views.
- **Flags:** `KAKO_FIXED_ASSETS`, `KAKO_BUDGETING`, `KAKO_SEARCH_UX`. **Deps:** P1
  (+ data from P2/P3/P5).
- **Gates:** **M6** — financial statements from the GL; platform-wide search.
- **Effort:** **M–L, ~4–6 weeks.**

---

## Cross-cutting

### Critical path
**P0 event backbone → P1 Finance+Inventory core → (P2 Purchasing ∥ P3 Sales) → P5
Trade Spend → P6 reporting.** P1 is the long pole (Finance posting engine + Inventory
costing co-build). CRM (P4) is off the critical path (parallel to late Sales).
Within P1, **Finance posting must precede Inventory valued-event wiring** (needs a
consumer). Net critical path ≈ **P0 + P1 + max(P2,P3) + P5 + P6**.

### Pilot company strategy (whole program)
One real **FMCG distribution tenant** as the design partner: enable each phase's flag
for it **first in production** after staging soak; run that tenant's **opening
balances (Finance COA) + stock valuation init (Inventory)** before P1 go-live;
validate each milestone (M1–M6) against real data; expand to more tenants once a
phase is stable. Per-tenant/allowlist flag gating throughout.

### Rollback (program-wide)
Every phase behind its own default-OFF flag → instant rollback by unsetting; additive
migrations stay inert when off; no destructive changes; reversing entries (Finance)
and movement reversals (Inventory) handle in-flight corrections.

### Validation gates (every phase PR)
`tsc` clean · full suite green · production build clean · **migration branch-
validated on a pure-`main` Supabase branch** (FK coverage + wrapped `auth.uid()`) ·
STAGING auto-apply · i18n ar/en parity · flags-OFF = no behavior change · the phase
**milestone (M1–M6)** demonstrated end-to-end on the pilot · tenant-isolation +
permission tests.

### Effort & timeline summary
P0 S–M (~2–3w) · P1 L (~6–8w) · P2 M (~3–5w) · P3 L (~6–8w) · P4 M (~3–4w) · P5 M
(~3–5w) · P6 M–L (~4–6w). **~5–6 months with overlaps**, value landing each phase.
*(Directional estimates; depend on review cadence + data-migration scope.)*

---

*Implementation planning only — no code, migrations, or implementation. No new
architecture or modules. Stop for review before executing Phase 0.*
