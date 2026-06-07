# VANTORA — Phase 1 FREEZE (Finance + Inventory Foundations)

**Date:** 2026-06-07 · **Status: 🧊 FROZEN — complete, validated, staging-ready (flags OFF).**

This document freezes Phase 1. No further changes land under the Phase-1 scope; new work
proceeds under Phase 2 (Purchasing). Companion to `PHASE_1_READINESS_REPORT.md`.

---

## 1. Completed deliverables
- **Event-sourcing backbone** — outbox/envelope/idempotent consumer; one bus, reused by
  Workflow / Finance / Search.
- **Posting-rule engine** — data-driven rules → pure resolver → balanced GL lines.
- **Idempotent poster** — writes `erp_journal_entries/_lines` via `erp_post_journal_entry`
  (server-side balance re-check).
- **Inventory costing engine** — FIFO / Weighted-Average / Standard (pure, unit-tested).
- **Costing state + service** — `erp_inventory_cost_state` / `_cost_layers` /
  `erp_standard_costs`; values each movement, records `unit_cost`/`total_cost`.
- **GL wiring (Augment legs)** — receipt→**Dr Inventory/Cr GR-IR** (`goods_receipt`);
  sale→**Dr COGS/Cr Inventory** (`invoice_cogs`); distinct reference types → zero double-post.
- **End-to-end tests** — real path engine→resolver→seeded rules→account_map→posting RPC.
- **Governance/backlog (docs):** Data Portability (#146), Role Template Governance (#150),
  Country Compliance & E-Invoicing (#152), registers (#147), readiness report (#151).

## 2. Merged PRs
| PR | Title | Flag | Migration |
|----|-------|------|-----------|
| #141 | Phase 0 event-sourcing backbone | `KAKO_EVENTS` | additive |
| #142 | Event producers + Search-live | `KAKO_EVENTS` | additive |
| #143 | Posting-rule engine | `KAKO_FINANCE` | additive |
| #144 | Posting consumer/poster | `KAKO_FINANCE` | additive |
| #145 | Costing engine core | `KAKO_INVENTORY_COSTING` | none |
| #148 | Costing state + service | `KAKO_INVENTORY_COSTING` | `0188` |
| #149 | GL wiring + e2e tests | `KAKO_FINANCE` | `0189` |
| #146,#147,#150,#151,#152 | Backlog/governance/readiness docs | — | none |

## 3. Migration status
- **`0186`** posting rules · **`0187`** `erp_post_journal_entry` · **`0188`** costing
  state (3 tables + 2 nullable columns + RLS + FK-covering indexes) · **`0189`** seeds 2
  global Augment rules.
- **All additive** (new tables/columns/indexes/seeds; no drops, no type changes, no
  destructive DML). Sequential numbering, no collisions.
- **Validated:** local full-chain build + apply, **idempotent re-apply**, and CI
  staging-apply green on every PR.

## 4. Rollback status
- The repo is **forward-only** (no down-migrations) — standard here. Phase-1 rollback is
  therefore **operational, not migratory**:
  - **Primary rollback = flags.** All Phase-1 behaviour is gated by `KAKO_EVENTS`,
    `KAKO_INVENTORY_COSTING`, `KAKO_FINANCE` — **all OFF by default**. Disabling them
    fully reverts to legacy behaviour with no data change.
  - **Schema is inert at rest** — additive tables/columns are unused until a flag is on;
    leaving them in place has zero runtime effect.
  - If physical removal is ever required, it is a clean, documented additive-drop
    (`DROP TABLE erp_inventory_cost_*`, `erp_standard_costs`; drop the 2 movement
    columns; delete the 2 seeded rules) — none referenced by legacy code.
- **Data safety:** no backfill, no mutation of existing rows; legacy AR/Revenue posting
  untouched. Reverting cannot corrupt or orphan existing data.

## 5. Dependency status
- **Internal:** costing service → costing engine; GL orchestrator → posting engine
  (poster/resolver) + seeded rules; all on `main`, no missing links.
- **Runtime config (for activation only):** per-company `erp_account_map` keys
  `inventory` / `cogs` / `gr_ir`; a chosen costing method. Absence is **safe** (poster
  skips unmapped accounts; costing defaults to moving-average).
- **External:** none added. No new packages, no new services.
- **Blocker register:** none open (B-001 replace-vs-augment resolved by owner, D-003).

## 6. Data-integrity validation
- **No double-post** — idempotency on `(reference_type, reference_id)`; reference types
  distinct from legacy triggers.
- **No unbalanced post** — pure resolver throws; `erp_post_journal_entry` re-checks
  balance server-side (integration-tested: refuses unbalanced/empty).
- **No partial post** — aborts if any `account_key` unmapped.
- **No fabricated cost** — engine throws `InsufficientStockError` on over-issue.
- **Tenant isolation** — RLS on all new tables (`warehouse→branch`, `company_id`);
  FK-coverage scalability invariant satisfied.
- **FK-safety** — COGS leg posts without cost-center after an e2e test caught an invalid
  `cost_center_id` FK (diagnosed, fixed, re-tested before merge).
- **Evidence:** **798 unit + 30 integration tests passing**; all green in CI.

## 7. UI/UX compliance validation
- **Zero UI surface added or changed in Phase 1** — all work is backend/data + default-OFF
  flags. No routes, components, copy, or styles modified.
- **No UX regression** — Playwright smoke (no-DB) **green on every PR**; build clean each time.
- When flags are later enabled, posting is server-side and invisible to existing screens;
  any user-facing surfacing of cost/GL data will be a separate, reviewed UI increment.

## 8. Stop-conditions
None encountered. Single architectural conflict (replace vs augment) escalated and
resolved by owner (D-003). No security, production, irreversible-migration, or
unresolved-dependency issues.

---

**Phase 1 is FROZEN.** Proceeding to **Phase 2 (Purchasing)** under the same discipline:
data integrity first · additive-only migrations · flags OFF by default · no gate
bypasses · no UX regressions · reuse-over-rebuild.
