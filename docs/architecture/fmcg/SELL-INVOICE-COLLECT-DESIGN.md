# FMCG Sell → Invoice → Collect — implementation design

Closes the two FMCG pilot **hard blockers** from the readiness assessment:
**van selling / invoicing (incl. van returns)** and **collections entry +
multi-invoice allocation**. Builds **only** on existing platform engines
(invoicing, pricing, returns, collections-settlement, workflow/event-bus,
offline-sync, finance posting) — **no new platform engines**. Everything is
additive, flag-gated (`KAKO_VAN_SALES` + per-company `erp_van_sales_settings`,
default OFF), backward-compatible, and CI-green.

> Companion to the owner-facing review `VANTORA-Sell-Invoice-Collect-Design-Review.docx`.
> This is the engineering doc + the **live phase checklist** (updated continuously).

---

## 1. Principle — reuse, don't rebuild

The transactional cores already exist and are inert behind flags; the gap is
field UI, thin wiring, and a small number of atomic RPCs. Concretely:

- **Van invoicing stock-out already works.** `erp_issue_invoice` (0013) picks
  the rep's assigned van warehouse first, posts a `sale_out` movement, raises
  the customer balance, and the `trg_erp_journal_on_invoice` (0005) trigger
  posts AR/Revenue on the status→`issued` transition.
- **Pricing is authoritative server-side.** `erp_resolve_price` (0106) resolves
  the unit price for `(product, customer, branch, qty, date)`.
- **Collections engine exists + is tested.** `erp_collections` /
  `erp_collection_allocations` (0192) + `lib/distribution/collections/`
  (pure `allocation.ts`, `settleCollection()` service, gateway) — never wired
  to a UI.

## 2. Van-sell authority model (Phase 1)

`erp_van_sell()` is a **single SECURITY DEFINER RPC = one transaction** that
layers van-specific authority on top of the existing tested insert + issue path:

1. Branch access (`erp_has_branch_access`) + resolve company.
2. **Idempotency** — a repeat `idempotency_key` returns the existing invoice
   (no double sale), matching `createInvoice`.
3. **Customer guard** — `is_approved` must not be false; credit data loaded.
4. **Van is required** — resolve the rep's active van warehouse
   (`is_van AND assigned_to = auth.uid()` in the branch); **error if none**
   (a van sale must come from the van — no silent fallback to branch stock).
5. **Server-side pricing** — unit price per line from `erp_resolve_price`
   (client never supplies the price); per-line tax from `products_catalog.tax_rate`.
6. **Discount cap** — `discount_pct` per line ≤ `erp_van_sales_settings.discount_cap_pct`
   (NULL = uncapped).
7. **Credit limit** — `credit_limit > 0 AND balance + net > credit_limit` ⇒ reject.
8. **Negative-stock guard** — unless `allow_negative_van_stock`, each line's
   quantity must be available at the van (missing stock row = 0).
9. Insert the invoice as `draft` + lines, then call **`erp_issue_invoice`**
   (reused) to post the `sale_out` at the same van, raise the balance, and fire
   the AR/Revenue journal via the status→`issued` trigger.

Totals follow `sales-calc` exactly (`net = gross − discount + tax`). The RPC is
**new**; `createInvoice` / `issueInvoice` / `erp_issue_invoice` are unchanged, so
desktop invoicing is untouched (backward compatible).

**Pure core** (`src/lib/van-sales/sell.ts`): line normalization + discount-cap
validation + totals, unit-tested with no DB — used by the thin server wrapper for
fast, friendly validation before the RPC (the RPC remains the sole authority).

## 3. Later phases (summary; detailed before each is built)

- **P2** Van-sell mobile UI anchored to visit/journey + receipt.
- **P3** Van returns — `return_in` to the rep's **van** (variant of
  `erp_complete_sales_return`) + credit-note link.
- **P4** Collection numbering — register `'collection'`/`COL` in `erp_next_number`.
- **P5** Collection entry UI + multi-invoice allocation grid (wires the existing
  `settleCollection`) + `/collections` listing.
- **P6** Offline wiring for van-sell + collection (apply handlers, idempotency,
  apply-time re-checks).
- **P7** *(optional `KAKO_FINANCE`)* GL posting for collections (DR cash/bank, CR AR).
- **P8** Reconciliation glue (expected = loaded − sold − returned) + E2E demo + runbook.

## 4. Guardrails (every phase)

- Feature flags **default OFF**; no tenant enabled.
- Backward-compatible / additive only; new tables & functions, never destructive.
- New migration numbers continue from the ceiling (next free: **0265**).
- Pure-core + thin-wiring + **integration tests for all new RPC behavior**.
- CI stays green (no bypass): typecheck/build, integration (schema-health:
  every FK covered by an index, no unwrapped `auth.uid()` in RLS), Playwright,
  staging migrate.
- Commit after each phase milestone; pause only for high-risk architectural issues.

---

## 5. Live phase checklist

### Phase 0 — design + scaffolding (no behavior change) ✅
- [x] Design doc + checklist (this file)
- [x] Pure core `src/lib/van-sales/sell.ts` (normalize + discount-cap + totals)
- [x] Unit tests `src/lib/van-sales/sell.test.ts` (8 passing)
- [x] Export from `src/lib/van-sales/index.ts`

### Phase 1 — `erp_van_sell` atomic RPC (no UI) ✅
- [x] Migration `0265_van_sell.sql` — `erp_van_sell()` SECURITY DEFINER
- [x] Thin server wrapper `src/lib/van-sales/sell-server.ts` (calls the RPC)
- [x] Integration tests `src/test/integration/van-sell.test.ts` (7 passing):
  - [x] happy path: issued invoice, `sale_out` at the van, balance raised, server-resolved price
  - [x] server-side price (RPC takes no client price); discount cap enforced
  - [x] credit-limit reject; negative-stock reject (and pass when `allow_negative`)
  - [x] no van assigned ⇒ reject (no branch fallback)
  - [x] idempotency: repeat key returns the same invoice (no double sale)
  - [x] tenant isolation (RLS): cross-company actor cannot sell
- Verified locally against Postgres 16 (full migration chain): 7/7 van-sell,
  151/151 integration, 1258/1258 unit, typecheck clean.
- Fix found by the tests: when no settings row exists, `SELECT … INTO
  v_allow_neg` left it NULL → `NOT NULL` silently skipped the stock guard;
  coerced to `false` after the SELECT.

### Phase 2 — Van-sell mobile UI (visit-anchored, no new RPC) ✅
Route `/field/van-sales/sell` (server, `force-dynamic`), wired from the "Sell"
step on the "My Day" hub. Mobile-first, minimal-tap flow:
**Customer → Products → Review → Issue → Print/Share**.
- [x] `previewVanSale` server action (read-only) — server-authoritative prices via
      `erp_resolve_price` + `computeVanSellTotals`; never trusts a client price
- [x] `sell/page.tsx` — gate `isVanSalesActive` + `field.sales`; loads the rep's
      van, van stock per SKU, customers, `discount_cap_pct`, `sales.discount`
      permission, optional `?customer=` preselect
- [x] `sell/sell-screen.tsx` — customer pick (or deep-linked) · product add with
      per-SKU stock badges · qty stepper · discount field gated by `sales.discount`
      and clamped to the cap · review (server prices) · issue (`vanSell`, client
      idempotency key) · receipt with Print (`/print/receipt/[id]`) + Web Share
- [x] Wire the hub `sell` step href (remove "coming soon")
- [x] i18n `vanSales.sell.*` (ar source + en mirror) — parity test green
- [x] Integration test: a customer-scoped `percent_off` rule flows through to the
      issued `unit_price` (server-resolved price authority underpinning preview)
- Verified: typecheck clean · 8/8 van-sell integration · 16 unit/i18n · build via CI.
- Offline-ready design: online-status banner, cart held in state, client
  idempotency key for safe retries; preview/issue need a connection because
  pricing is server-authoritative. Full offline queue/replay is **Phase 6**.

### Phases 3–8
- [ ] _planned; detailed design added before each is built_
