# VANTORA — Change Log

Chronological record of merged changes during continuous execution. Newest first.
All entries: additive-only migrations, feature flags OFF by default, no gate bypasses,
no UI/UX regressions.

| PR | Date | Change | Flag | Migration | Gates |
|----|------|--------|------|-----------|-------|
| #158 | 2026-06-07 | **Phase 2 readiness report** + end-to-end & multi-company DB tests (PO→GRN→bill→match→AP→GL) | — | none | green |
| #157 | 2026-06-07 | Phase 2 — AP sub-ledger + supplier-invoice GL (Augment: Dr GR-IR/Cr AP) | `KAKO_PURCHASING`/`KAKO_FINANCE` (OFF) | `0191` additive | green |
| #156 | 2026-06-07 | Phase 2 — matching service (PO/GRN/invoice → hold/approve) | `KAKO_PURCHASING` (OFF) | none | green |
| #155 | 2026-06-07 | Phase 2 — supplier invoice (bill) data model | `KAKO_PURCHASING` (OFF) | `0190` additive | green |
| #154 | 2026-06-07 | Phase 2 — 3-way match engine (pure) + kickoff plan | `KAKO_PURCHASING` (OFF) | none | green |
| #153 | 2026-06-07 | **Phase 1 FREEZE** — final consolidated sign-off | — | none | green |
| #152 | 2026-06-07 | Country Compliance & E-Invoicing — architecture & backlog doc | — | none | green |
| #151 | 2026-06-07 | **Phase 1 readiness report** (Finance + Inventory complete, staging-ready) | — | none | — |
| #150 | 2026-06-07 | Role Template Governance & Company Role Overrides — architecture & backlog doc | — | none | green |
| #149 | 2026-06-07 | GL wiring — inventory/COGS Augment legs: seed rules + orchestrator + `goods.received` event + end-to-end DB tests (receipt→Inventory→GL, sale→COGS→GL). Dropped cost-center from COGS leg (FK-safety) after the e2e test caught an invalid `cost_center_id`. | `KAKO_FINANCE` (OFF) | additive (seed) | green |
| #148 | 2026-06-07 | Inventory costing state tables + costing service | `KAKO_INVENTORY_COSTING` (OFF) | additive | green |
| #146 | 2026-06-07 | Data Portability & Backup — architecture & backlog doc | — | none | green |
| #145 | 2026-06-07 | Inventory costing engine core (FIFO/Weighted-Avg/Standard), pure | `KAKO_INVENTORY_COSTING` (OFF) | none | green |
| #144 | 2026-06-07 | Posting consumer/poster (event → journal entry) | `KAKO_FINANCE` (OFF) | additive | green |
| #143 | 2026-06-07 | Posting-rule engine (event → balanced GL lines) | `KAKO_FINANCE` (OFF) | additive | green |
| #142 | 2026-06-07 | Phase 0 event producers + Search-live wiring | `KAKO_EVENTS` (OFF) | additive | green |
| #141 | 2026-06-07 | Phase 0 event-sourcing backbone (outbox/envelope/consumer) | `KAKO_EVENTS` (OFF) | additive | green |

> Append new rows at the top of the body as PRs merge.
