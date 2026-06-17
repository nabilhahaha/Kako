# VANTORA — FMCG Pilot Certification Report (Final)

**Subject:** FMCG van-sales pilot capability (sell → invoice → collect → return →
reconcile → close), behind `KAKO_VAN_SALES` (default OFF) + a per-company toggle.
**Verdict:** ✅ **GO** for a controlled, online-first FMCG distributor pilot.
**Date:** 2026-06-10 · **PR:** #311 · **Scope:** additive, backward-compatible,
no RLS/security weakening, rollback is one switch.

---

## 1. Scope certified

The complete field loop on the real Postgres RPCs:
`erp_van_sell` (0265) · `erp_van_return` (0266) · `erp_settle_collection` (0267),
composed with `erp_issue_invoice`, `erp_resolve_price`, `erp_check_in_visit`,
`erp_compute_van_reconciliation`, `erp_close_day`, `erp_next_number`. All
`SECURITY DEFINER`, atomic, concurrency-safe (`FOR UPDATE`), idempotent, and
balance-/stock-consistent. Mobile field UI (Sell/Collect/Return + My Day),
admin Readiness Diagnostic, flag-aware navigation, branded printing
(invoice/receipt/return/credit-note/collection).

## 2. Validation evidence

| Layer | Result |
|---|---|
| **~1,000-txn simulation** | Zero invariant violations (stock conservation, AR consistency, allocation integrity, no negative stock, unique numbering, idempotency, tenant isolation). |
| **Supervised dry-run** (`run-pilot-dry-run.sql`, as real users) | **ALL CHECKS PASSED** — INV-CAI-000001 net 182.60 · COL applied 109.56 · RET 40.00 + CN linked · reconciliation variance 0 · balance 33.04 · van stock 239. |
| **Automated suite** | **1,280 unit + 181 integration** green · typecheck clean · build green · staging migration green. |
| **Permission model** | Reconciliation enforced by DB authority (supervisor/warehouse-keeper manage; rep view-only). |

## 3. Issues found & resolved during certification

| Finding | Severity | Resolution |
|---|---|---|
| Reconciliation perms misaligned (TS vs DB) | Med | **Fixed** — app perms aligned to DB authority. |
| URL-only nav orphans when flags off | Low | **Fixed** — flag-aware navigation. |
| Documents not branded / auto-printed | Low | **Fixed** — logo on every doc; Print/Share/Continue (never auto-print). |
| **Cross-tenant document numbering** (global-unique invoice/return/PO/transfer/receipt numbers; tenants sharing a branch code collide) | **Med** | **Fixed in migration 0268** — numbers re-scoped to their owning branch/warehouse (+ collections guarantee added). Regression test proves two same-coded tenants coexist. Not introduced by this PR (base schema 0005); discovered and fixed here. |
| Seed-identity accumulation across reseeds | Low | **Fixed** — demo seeds purge prior demo identities; reseed is repeatable with no manual cleanup. |

## 4. Remaining (non-blocking)

- **Offline-first** field operation is out of scope (Phase 6); the pilot is
  online-first by design. NO-GO only if the route has poor connectivity **and**
  offline is mandatory.
- No dedicated Merchandiser / Customer-Service roles (mapped to closest roles;
  see reference-tenant report). Pre-launch: verify the target DB has no other
  tenant using the pilot's branch codes (mitigated by 0268, but good hygiene).

## 5. Readiness & recommendation

**FMCG transactional core: 95/100 · Overall pilot: 88/100.** The remaining gap is
operational (activation + setup + on-device dry-run + the connectivity decision),
not engineering.

> ## ✅ GO — controlled, online-first FMCG distributor pilot.
> Execute the [Pilot Launch Checklist](./PILOT-LAUNCH-PACKAGE.md#2-one-click-pilot-setup-checklist)
> and one on-device supervised dry-run, then launch. Rollback is one switch
> (`KAKO_VAN_SALES` off or per-company toggle off).

Full operational guides: [`PILOT-LAUNCH-PACKAGE.md`](./PILOT-LAUNCH-PACKAGE.md).
Index: [`HANDOVER-INDEX.md`](./HANDOVER-INDEX.md).
