# VANTORA — Phase 1 Readiness Report (Finance + Inventory Foundations)

**Date:** 2026-06-07 · **Status: ✅ Phase 1 complete and staging-ready (flags OFF).**
**Scope:** event-sourcing backbone (Phase 0) → posting-rule engine → inventory costing
(FIFO / Weighted-Average / Standard) → GL wiring for the two missing legs
(receipt→Inventory, sale→COGS) → end-to-end tests.

All work shipped **additive, flag-gated default-OFF, no gate bypasses, no UX/UI
regressions, reuse-over-rebuild** — production behaviour is unchanged until the flags
are deliberately enabled.

---

## 1. What shipped (merged to `main`)

| PR | Capability | Flag (default) | Migration |
|----|------------|----------------|-----------|
| #141 | Event-sourcing backbone (outbox/envelope/idempotent consumer) | `KAKO_EVENTS` (OFF) | additive |
| #142 | Event producers + Search-live wiring | `KAKO_EVENTS` (OFF) | additive |
| #143 | Posting-rule engine (event → balanced GL lines, pure resolver) | `KAKO_FINANCE` (OFF) | additive |
| #144 | Posting consumer/poster (idempotent journal-entry writer) | `KAKO_FINANCE` (OFF) | additive |
| #145 | Inventory costing engine core (FIFO / Weighted-Avg / Standard, pure) | `KAKO_INVENTORY_COSTING` (OFF) | none |
| #148 | Costing state tables + costing service | `KAKO_INVENTORY_COSTING` (OFF) | `0188` additive |
| #149 | GL wiring (Augment legs) + **end-to-end** receipt→GL & sale→COGS→GL tests | `KAKO_FINANCE` (OFF) | `0189` seed |

Supporting governance/architecture (docs): #146 Data Portability & Backup, #147
registers, #150 Role Template Governance — backlog captures, no implementation.

## 2. Architecture decision (owner-approved)
**D-003 — Augment, not replace.** The event-driven engine posts **only** the legs the
legacy DB triggers omit (COGS, inventory valuation), under **distinct reference types**
(`goods_receipt`, `invoice_cogs`), so there is **zero double-post** with the existing
AR/Revenue/payment/return posting. The full trigger→engine cutover (incl. tax
separation, which requires changing the AR/Revenue net/gross split) is **deferred** to a
later, separately-reviewed migration. (Decision register D-001…D-004.)

## 3. The two flows, end-to-end

**Receipt → Inventory → GL**
`goods receipt → costing engine values the receipt → erp_inventory_cost_state/_layers
updated → erp_stock_movements.unit_cost/total_cost recorded → postCostedMovementGl →
rule 'goods.received' → Dr Inventory / Cr GR-IR (reference_type 'goods_receipt')`.

**Sale → COGS → GL**
`sale issue → costing engine values the issue (avg / FIFO / standard) → state updated →
movement cost recorded → postCostedMovementGl → rule 'invoice.cogs' →
Dr COGS / Cr Inventory (reference_type 'invoice_cogs')`.

Same posting shape across all three costing methods — only the number differs
(amount-agnostic GL, arch #132 §1).

## 4. Data-integrity invariants (enforced + tested)
- **No double-post** — idempotency keyed on `(reference_type, reference_id)`; distinct
  reference types from the legacy triggers.
- **No unbalanced entry** — pure resolver throws; `erp_post_journal_entry` re-checks
  balance server-side (defense-in-depth, integration-tested).
- **No partial entry** — posting aborts if any `account_key` is unmapped (skips, never
  writes a half entry).
- **No fabricated cost** — costing engine throws `InsufficientStockError` on over-issue
  rather than invent a number.
- **Tenant isolation** — all new tables RLS-scoped (`warehouse→branch` for costing,
  `company_id` for rules); FK-coverage scalability invariant satisfied.
- **FK-safety** — COGS leg posts without a cost-center (an e2e test caught and we fixed
  an invalid `cost_center_id` FK before merge).

## 5. Test coverage
- **Unit:** costing engine (8), costing service (8), posting resolver, poster, inventory
  GL orchestrator (6) — full unit suite **798 passing**.
- **Integration (real DB):** `inventory-cogs-posting.test.ts` drives the **real** path
  (engine → resolver → seeded `0189` rules → account_map → `erp_post_journal_entry`) for
  both legs; plus finance-posting and schema-health invariants — **30 integration tests
  passing**.
- Build clean; all CI gates green on every merge.

## 6. Migrations (additive, validated)
`0186` posting rules · `0187` `erp_post_journal_entry` · `0188` costing state
(`erp_inventory_cost_state` / `_cost_layers` / `erp_standard_costs` + nullable
`erp_stock_movements.unit_cost/total_cost`, RLS, FK-covering indexes) · `0189` seeds the
two global Augment rules (idempotent). All validated locally (apply + idempotent
re-apply) and via CI staging-apply.

## 7. Activation plan (post-Phase-1, separate change)
1. Per pilot company: map account keys `inventory`, `cogs`, `gr_ir` in
   `erp_account_map`; choose costing method in `erp_inventory_cost_state`.
2. Enable `KAKO_EVENTS`, then `KAKO_INVENTORY_COSTING`, then `KAKO_FINANCE` on the pilot
   tenant; observe COGS/inventory entries posting under the distinct reference types.
3. Reconcile against the legacy AR/Revenue entries (confirm zero overlap).
4. Roll out per tenant; defer the full trigger cutover + tax separation to its own
   reviewed migration.

## 8. Deferred / backlog (logged, not blocking Phase 1)
- Full trigger→engine cutover + **tax separation** (needs AR/Revenue split change).
- Wiring `postCostedMovementGl` + the costing service into the live sales/purchase
  write paths (inert orchestration exists; call-site wiring is a flagged follow-up).
- Cost-center dimension on COGS (per-company rule override).
- Platform backlog: Data Portability & Backup (#146), Role Template Governance (#150).

## 9. Stop-conditions
None encountered. No data-integrity, security, production, irreversible-migration, or
unresolved-owner-dependency issues. The one architectural conflict (replace vs augment)
was escalated and resolved by the owner (D-003).

**Conclusion:** Phase 1 (Finance + Inventory foundations) is **complete, tested, and
staging-ready behind default-OFF flags**, with a clean activation path and no production
impact until deliberately enabled.
