# VANTORA — Change Log

Chronological record of merged changes during continuous execution. Newest first.
All entries: additive-only migrations, feature flags OFF by default, no gate bypasses,
no UI/UX regressions.

| PR | Date | Change | Flag | Migration | Gates |
|----|------|--------|------|-----------|-------|
| #150 | 2026-06-07 | GL wiring — inventory/COGS Augment legs: seed posting rules + orchestrator + `goods.received` event | `KAKO_FINANCE` (OFF) | additive (seed) | green |
| #148 | 2026-06-07 | Inventory costing state tables + costing service | `KAKO_INVENTORY_COSTING` (OFF) | additive | green |
| #146 | 2026-06-07 | Data Portability & Backup — architecture & backlog doc | — | none | green |
| #145 | 2026-06-07 | Inventory costing engine core (FIFO/Weighted-Avg/Standard), pure | `KAKO_INVENTORY_COSTING` (OFF) | none | green |
| #144 | 2026-06-07 | Posting consumer/poster (event → journal entry) | `KAKO_FINANCE` (OFF) | additive | green |
| #143 | 2026-06-07 | Posting-rule engine (event → balanced GL lines) | `KAKO_FINANCE` (OFF) | additive | green |
| #142 | 2026-06-07 | Phase 0 event producers + Search-live wiring | `KAKO_EVENTS` (OFF) | additive | green |
| #141 | 2026-06-07 | Phase 0 event-sourcing backbone (outbox/envelope/consumer) | `KAKO_EVENTS` (OFF) | additive | green |

> Append new rows at the top of the body as PRs merge.
