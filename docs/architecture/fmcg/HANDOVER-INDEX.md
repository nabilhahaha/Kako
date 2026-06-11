# VANTORA — Handover & Certification Package (Index)

The single entry point to everything needed to **operate, train on, test, pilot,
and certify** VANTORA's FMCG van-sales capability. Every deliverable below is
committed to the repository and linked from here.

> **Status:** complete & verified on a freshly bootstrapped database
> (full migration chain). FMCG core **95/100**, overall pilot **88/100**.
> **Recommendation: GO** for a controlled, online-first FMCG distributor pilot.
> Scope: additive, backward-compatible, gated behind `KAKO_VAN_SALES` (default
> OFF) + a per-company toggle. No schema/RLS/permission weakening.

---

## The 15 deliverables

| # | Deliverable | Where it lives |
|---|---|---|
| 1 | **FMCG Pilot Certification Report** (final) | [`FMCG-PILOT-CERTIFICATION.md`](./FMCG-PILOT-CERTIFICATION.md) |
| 2 | **Reference Tenant Certification Report** | [`REFERENCE-TENANT-CERTIFICATION.md`](./REFERENCE-TENANT-CERTIFICATION.md) |
| 3 | **Organization Chart** | [`REFERENCE-COMPANY.md` §1](./REFERENCE-COMPANY.md#1-organization-chart) |
| 4 | **Role Matrix** | [`REFERENCE-COMPANY.md` §2](./REFERENCE-COMPANY.md#2-role-matrix) |
| 5 | **Permission Matrix** | [`REFERENCE-COMPANY.md` §3](./REFERENCE-COMPANY.md#3-permission-matrix) |
| 6 | **Master Data Summary** | [`REFERENCE-COMPANY.md` §4](./REFERENCE-COMPANY.md#4-master-data-summary) |
| 7 | **Workflow Coverage Matrix** | [`REFERENCE-COMPANY.md` §5](./REFERENCE-COMPANY.md#5-workflow-coverage-matrix) |
| 8 | **End-to-End Validation Report** | [`REFERENCE-COMPANY.md` §6](./REFERENCE-COMPANY.md#6-end-to-end-validation-report) |
| 9 | **Go / No-Go Checklist** | [`PILOT-LAUNCH-PACKAGE.md` §3](./PILOT-LAUNCH-PACKAGE.md#3-final-go--no-go-checklist) |
| 10 | **Pilot Launch Checklist** | [`PILOT-LAUNCH-PACKAGE.md` §2](./PILOT-LAUNCH-PACKAGE.md#2-one-click-pilot-setup-checklist) |
| 11 | **Pilot Day-1 Operations Guide** | [`PILOT-LAUNCH-PACKAGE.md` §4](./PILOT-LAUNCH-PACKAGE.md#4-pilot-day-1-operations-guide) |
| 12 | **Pilot Week-1 Monitoring Guide** | [`PILOT-LAUNCH-PACKAGE.md` §5](./PILOT-LAUNCH-PACKAGE.md#5-pilot-week-1-monitoring-guide) |
| 13 | **Rollback Guide** | [`PILOT-LAUNCH-PACKAGE.md` §7](./PILOT-LAUNCH-PACKAGE.md#7-pilot-rollback-guide) |
| 14 | **Regression Validation Guide** | [`REGRESSION-VALIDATION-GUIDE.md`](./REGRESSION-VALIDATION-GUIDE.md) |
| 15 | **Clone the Reference Tenant** (demos / future pilots) | [`CLONE-REFERENCE-TENANT.md`](./CLONE-REFERENCE-TENANT.md) |

---

## Executable artifacts (the package runs, it isn't just prose)

| Artifact | Purpose | Verified |
|---|---|---|
| `supabase/pilot/demo-distributor.sql` | Idempotent single-distributor pilot tenant | provisions clean |
| `supabase/pilot/run-pilot-dry-run.sql` | Supervised pilot dry-run as real users | **ALL CHECKS PASSED** |
| `supabase/pilot/reference-company.sql` | Enterprise reference tenant (org + master data + activity) | **PROVISIONED** clean |
| `supabase/pilot/reference-activity-and-validate.sql` | Sample activity + 109-assertion role validation (re-runnable) | **109/109 pass** ×2 |
| `src/test/integration/pilot-dry-run.test.ts` | Automated dry-run twin | green |
| `src/test/integration/fmcg-pilot-simulation.test.ts` | ~1,000-txn invariant simulation | green |

**Companion engineering docs:** [`SELL-INVOICE-COLLECT-DESIGN.md`](./SELL-INVOICE-COLLECT-DESIGN.md) ·
[`PILOT-RUNBOOK.md`](./PILOT-RUNBOOK.md) · Word exports
(`VANTORA-FMCG-Pilot-Launch-Package.docx`, `VANTORA-FMCG-Pilot-Package.docx`).

---

## Onboarding & first-customer deployment

To take a **real distributor live** (the next objective — not feature work), use
the onboarding package:

| Deliverable | Purpose |
|---|---|
| [`../../onboarding/ONBOARDING-INDEX.md`](../../onboarding/ONBOARDING-INDEX.md) | Onboarding package index |
| [`../../onboarding/FIRST-CUSTOMER-DEPLOYMENT-PLAN.md`](../../onboarding/FIRST-CUSTOMER-DEPLOYMENT-PLAN.md) | **First Real Customer Deployment Plan** — deploy + capture feedback |
| [`../../onboarding/DISTRIBUTOR-ONBOARDING-CHECKLIST.md`](../../onboarding/DISTRIBUTOR-ONBOARDING-CHECKLIST.md) | Go/No-Go-gated build runbook |
| Branch / Van / User / Pricing guides + Support Playbook | Step-by-step setup + pilot support |
| [`../../onboarding/templates/`](../../onboarding/templates/) | CSV import templates + feedback log |

---

## Handover confirmations (re-verified at package time)

| Confirmation | Result | Evidence |
|---|---|---|
| All deliverables committed + linked from one index | ✅ | this file |
| Reference tenant can be recreated from scratch | ✅ | fresh bootstrap → `reference-company.sql` → **PROVISIONED** |
| Regression package can be executed repeatedly | ✅ | `reference-activity-and-validate.sql` ×2 → **109/109** both runs, activity idempotent (2nd run skips re-posting, re-validates) |
| Pilot package is complete & self-contained | ✅ | clean DB → `demo-distributor.sql` + `run-pilot-dry-run.sql` → **ALL CHECKS PASSED** |
| Clean bootstrap → seed → validate, repeatable with **no manual cleanup** | ✅ | two full cycles → identical results, **17 distinct users, zero accumulation** |
| **Multiple tenants coexist** on one database | ✅ | reference + pilot tenants both own branch `CAI` and both hold `INV-CAI-000001` with no collision (migration 0268) |
| Platform health | ✅ | typecheck clean · **1,280 unit + 181 integration** green · build green |

---

## Findings resolved during the handover

| Item | Severity | Status |
|---|---|---|
| **Cross-tenant document numbering** — invoice / return / PO / transfer / receipt / order / journal / voucher / RMA numbers carried a **global** unique index while sequences count per-branch, so two tenants sharing a branch code (e.g. both `CAI`) collided. Pre-existing base schema (0005); **not** introduced by the van-sales loop. | Medium | ✅ **FIXED — migration `0268`** re-scopes every number to its owning branch/warehouse (+ adds the missing collections guarantee). Regression test `document-numbering-tenant-scope.test.ts` proves two same-coded tenants coexist. Verified live: reference + pilot tenants both hold `INV-CAI-000001`. |
| **Duplicate `auth.users` accumulation** across reseeds (the `auth` schema survives `DROP SCHEMA public`), causing email-based identity resolution to pick a stale user → false cross-tenant check-in denial. The tenancy guard itself was **correct**. | Low (seed hygiene) | ✅ **FIXED** — both seeds purge prior demo identities before re-provisioning; clean bootstrap → seed → validate is repeatable with no manual cleanup (verified across two cycles). |

## Known limitations (documented, non-blocking)

| Item | Severity | Status |
|---|---|---|
| No dedicated **Merchandiser** / **Customer-Service** roles | Medium | Documented in [`REFERENCE-COMPANY.md` §7](./REFERENCE-COMPANY.md#7-findings--gaps); mapped to closest roles. A purpose-built role is a future permission-model change. |
| No `erp_brands` / `erp_taxes` / `erp_payment_terms` master tables | Low | Modeled via existing columns; documented |
| Offline-first field operation | — | Out of scope (Phase 6); pilot is online-first by design |

See each certification report for the full readiness scoring and Go/No-Go.
