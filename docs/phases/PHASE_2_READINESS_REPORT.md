# VANTORA — Phase 2 (Purchasing / Procure-to-Pay) Readiness Report

**Date:** 2026-06-07 · **Status: ✅ Procure-to-Pay AP core complete & staging-ready
(flags OFF).** Two upstream/adjacent sub-tracks (PR/RFQ sourcing, supplier-returns app
layer) are **explicitly deferred** — see the checklist below. Honest scope, no overclaim.

Discipline held throughout: data integrity first · additive-only migrations · flags OFF
by default (`KAKO_PURCHASING`, `KAKO_FINANCE`) · no gate bypasses · no UX regressions ·
reuse-over-rebuild.

---

## 1. Merged PRs (Phase 2)
| PR | Capability | Flag | Migration |
|----|------------|------|-----------|
| #154 | 3-way match engine (pure) + kickoff plan | `KAKO_PURCHASING` | none |
| #155 | Supplier invoice (bill) data model | `KAKO_PURCHASING` | `0190` |
| #156 | Matching service (PO/GRN/invoice → hold/approve) | `KAKO_PURCHASING` | none |
| #157 | AP sub-ledger + supplier-invoice GL (Augment) | `KAKO_PURCHASING`/`KAKO_FINANCE` | `0191` |
| #158 | End-to-end + multi-company tests + this report | — | none |

## 2. Requested checklist — status & evidence

| # | Item | Status | Evidence / notes |
|---|------|--------|------------------|
| 1 | **PR / RFQ / Supplier Quotation** | ⏸ **Deferred (backlog)** | Net-new upstream *sourcing* flow (requisition → RFQ → quotation → award→PO). Not required by the procure-to-pay AP core. Scoped as **Phase 2.x** below; owner to greenlight before KSA/Egypt onboarding if needed. |
| 2 | **Purchase Order lifecycle** | ✅ Pre-existing, validated | `erp_purchase_orders` (draft→sent→partial→received→cancelled); e2e persists a PO + line. |
| 3 | **Goods Receipt (GRN)** | ✅ Pre-existing, validated | `erp_goods_receipts`/`_lines`; trigger → `erp_stock_movements` → on-hand; e2e persists GR + line. |
| 4 | **Supplier Invoice (Bill)** | ✅ **Built** (#155) | `erp_supplier_invoices`/`_lines`, status+match lifecycle, due date, duplicate-bill guard. |
| 5 | **3-Way Match validation** | ✅ **Built** (#154/#156) | Pure engine + matching service; e2e: clean match + variance hold. |
| 6 | **AP Subledger** | ✅ **Built** (#157) | `erp_ap_ledger` (signed bill/payment/return/adjustment) + pure aging; e2e aged buckets. |
| 7 | **AP → GL posting** | ✅ **Built** (#157) | `supplier.invoice` rule → Dr GR-IR / Cr AP; e2e posts a balanced entry under `supplier_invoice`. |
| 8 | **Partial receipt handling** | ✅ **Built** | Match engine flags `over_billed` when billed > received; e2e tested (recv 60 / bill 100 → hold). |
| 9 | **Partial invoice handling** | ✅ **Built** | `under_billed` advisory (bill < received) passes; e2e tested. |
| 10 | **Supplier returns** | ◑ **Schema present; app layer deferred** | `erp_purchase_returns` + RPC exist (0096); no UI/actions. GL credit-note leg scoped in Phase 2.x. |
| 11 | **Multi-company validation** | ✅ **Built** | e2e: AP ledger RLS isolation (company A can't see/write B), tenant insert-stamping. |
| 12 | **Role-governance compatibility** | ✅ Compatible | New tables RLS-scoped (branch/company) and permission-gated; no conflict with the Role-Template-Governance model (effective-permission resolver applies unchanged). |
| 13 | **Data-portability compatibility** | ✅ Compatible | New tables are tenant-scoped and additive → exportable via the generic export-handler registry (no per-table hardcoding). |
| 14 | **Country-compliance compatibility** | ✅ Compatible | Supplier invoices carry `tax_amount`/`net_amount`/`total_amount` and are **finalized documents** the compliance layer consumes downstream; no posting-logic coupling. |

## 3. The procure-to-pay chain (validated end-to-end)
```
PO ──▶ Goods Receipt ──▶ Supplier Invoice ──▶ 3-way match ──▶ AP sub-ledger ──▶ AP→GL
 (qty/price)  (received qty)   (billed qty/price)   (hold|approve)   (aging)      (Dr GR-IR / Cr AP)
```
Net GL across Phase 1 + Phase 2 (Augment, distinct reference types, zero double-post):
`receipt: Dr Inventory / Cr GR-IR` then `bill: Dr GR-IR / Cr AP` → **Inventory Dr / AP Cr**.

## 4. Data-integrity invariants
- **Never pay for unreceived goods** — `over_billed` blocks (invoiced > received), even on PO-unlinked lines (received defaults 0).
- **Price control** — material price variance vs PO blocks (bidirectional, tolerance-aware).
- **Duplicate-bill guard** — `UNIQUE(supplier_id, invoice_number)`.
- **No double/partial/unbalanced GL post** — reuses the Phase-1 poster (idempotent, server-side balance check, distinct reference types).
- **Tenant isolation** — RLS on all new tables; multi-company e2e proves A↮B; FK-coverage + RLS schema-health invariants pass.
- **Evidence:** **823 unit + 35 integration tests passing**; build clean; all CI gates green per PR.

## 5. Migrations (additive, validated)
`0190` supplier invoices (+ `erp_suppliers.payment_terms_days`) · `0191` AP ledger + `supplier.invoice` rule. Applies + idempotent re-apply locally; CI staging-apply green. **Rollback = flags (OFF) + inert schema**; clean additive-drop if ever needed; no data mutation.

## 6. Deferred sub-tracks (Phase 2.x — owner greenlight)
1. **PR / RFQ / Supplier Quotation** sourcing flow (requisition → RFQ → quotation → award → PO), with approval via the Workflow OS (reuse).
2. **Supplier-returns app layer** (UI/actions over the existing `erp_purchase_returns` schema) + the credit-note GL leg (Dr AP / Cr Inventory or GR-IR).
3. **Payment-application** wiring (link `erp_supplier_payments` → AP ledger entries) and **PO approval** thresholds.
These are additive, flag-gated, and do not change the delivered AP core.

## 7. Stop-conditions
None encountered. No data-integrity, security, irreversible-migration, or architectural-
conflict issues. The Augment reconciliation (legacy GR trigger vs engine legs) is logged
for the eventual reviewed cutover; both paths remain flag-OFF until then.

**Conclusion:** the **Procure-to-Pay AP core of Phase 2 is complete, validated, and
staging-ready behind default-OFF flags**, fully compatible with the Role-Governance,
Data-Portability, and Country-Compliance foundations. PR/RFQ sourcing and the
supplier-returns app layer are the clearly-scoped remaining sub-tracks for owner
greenlight before they are built.
