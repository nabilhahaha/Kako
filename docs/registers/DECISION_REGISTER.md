# VANTORA — Decision Register

Living record of architectural/product decisions made during execution. Newest first.

| # | Date | Decision | Context | Status |
|---|------|----------|---------|--------|
| D-004 | 2026-06-07 | **Data Portability & Backup = generic export-handler registry** mirroring the Search provider pattern; no module hardcoding; reuses `/exports`, `*.export` keys, `erp_audit_logs`, Workflow approvals, jobs, RLS. Backlog only. | New platform-wide capability requested. | Captured (no impl) |
| D-003 | 2026-06-07 | **Augment model** for Finance engine: the event-driven engine posts ONLY the legs the legacy triggers omit (COGS, inventory valuation, tax separation) under distinct `reference_type`s, with zero double-post. Full trigger→engine cutover deferred to a later, separately-reviewed migration. | Existing DB triggers already post AR/Revenue/payment/return at invoice/payment time. Replacing vs augmenting was an architectural conflict requiring an owner decision. | **Approved by owner** |
| D-002 | 2026-06-07 | **Inventory costing layer is pure + amount-agnostic GL**: costing engine (FIFO/Weighted-Avg/Standard) computes the valued cost; Finance posts whatever amount it is handed (same posting shape across methods). | Arch #132 §1/§8A. Keeps GL method-agnostic. | Implemented (#145) |
| D-001 | 2026-06-07 | **Event-sourcing backbone first**: outbox + typed event envelope + idempotent consumer + posting-rule engine, all flag-gated OFF, before any module wiring. | Phase 0 of the master plan; reuse-over-rebuild on existing tables. | Implemented (#141–144) |

> Append new rows at the top of the body. Never rewrite history; supersede with a new row referencing the old.
