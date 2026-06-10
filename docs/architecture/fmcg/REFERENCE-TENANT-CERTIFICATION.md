# VANTORA — Reference Tenant Certification Report

**Subject:** **Nile FMCG Distribution Group** — the permanent VANTORA reference
tenant for demos, testing, onboarding, training, pilot preparation, and
regression validation.
**Verdict:** ✅ **CERTIFIED COMPLETE.**
**Date:** 2026-06-10 · **Scope:** demo/test data + docs only; additive,
non-destructive, no schema/RLS/permission weakening.

---

## 1. What the tenant contains

Provisioned from `supabase/pilot/reference-company.sql` against the real schema:
3 branches · 5 warehouses (3 main + 2 vans) · **12 departments** · 17 job titles ·
**1 platform owner + 16 company users** mapped to enforced roles · master data
(5 categories, **18 priced/taxed SKUs** across 10 brands, 5 suppliers, 2 price
lists + 36 items + 2 price rules, 3 routes, **24 customers** with credit limits /
payment terms / GPS, 5 return reasons) · opening stock · a received PO + an open
PO · a completed main→van transfer. Full org/role/permission/master-data detail:
[`REFERENCE-COMPANY.md`](./REFERENCE-COMPANY.md).

## 2. Certification evidence (re-verified, fresh DB)

| Check | Result |
|---|---|
| Provisions clean from scratch | ✅ **PROVISIONED** (fresh bootstrap → seed) |
| Sample activity as real users | ✅ INV-CAI-000001 net 1,456.92 (promo applied) · collect 874.15 · return 156.00 + CN · reconciliation variance 0 · balance 426.77 · van 246 |
| **Role validation** (allowed + blocked, every identity) | ✅ **109/109 assertions pass** |
| **Repeatable regression** | ✅ run twice → 109/109 both; activity idempotent (2nd run re-validates only) |
| **Repeatable from clean bootstrap, no manual cleanup** | ✅ two full cycles → identical results, **17 distinct users, zero accumulation** |
| Coexists with other tenants (post-0268) | ✅ shares branch code `CAI` with the pilot demo tenant; both hold `INV-CAI-000001` with no collision |
| Platform health | ✅ 1,280 unit + 181 integration green · typecheck clean |

## 3. Findings resolved during certification

| Finding | Category | Resolution |
|---|---|---|
| **Cross-tenant document numbering** (global-unique numbers collide when tenants share a branch code) | Product (pre-existing, base schema 0005) | **Fixed — migration 0268** re-scopes numbers to branch/warehouse; regression test added. Verified the reference tenant now coexists with the pilot tenant on one DB. |
| **Duplicate `auth.users` accumulation** across reseeds → email resolution picked a stale identity → false cross-tenant check-in denial | Seed-data hygiene (not a product defect — the tenancy guard behaved correctly) | **Fixed** — seeds purge prior demo identities before re-provisioning; reseed is repeatable with no manual cleanup. |

## 4. Known limitations (documented, non-blocking)

- No dedicated **Merchandiser** / **Customer-Service** roles — mapped to closest
  enforced roles (`salesman` / `cashier`); a purpose-built role is a future
  permission-model change. See [`REFERENCE-COMPANY.md` §7](./REFERENCE-COMPANY.md#7-findings--gaps).
- No `erp_brands` / `erp_taxes` / `erp_payment_terms` master tables — modeled via
  existing columns (`products.brand` / `products.tax_rate` / `*_terms_days`).

## 5. Declaration

The Reference Tenant package is **complete and certified**: recreatable from
scratch, repeatably validatable without manual cleanup, multi-tenant-safe, and
fully documented. Use it as the standing reference for demos, onboarding,
training, and **regression validation** (see
[`REGRESSION-VALIDATION-GUIDE.md`](./REGRESSION-VALIDATION-GUIDE.md)) and clone it
for new pilots (see [`CLONE-REFERENCE-TENANT.md`](./CLONE-REFERENCE-TENANT.md)).
