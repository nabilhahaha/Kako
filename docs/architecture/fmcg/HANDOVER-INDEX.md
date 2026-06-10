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

## Handover confirmations (re-verified at package time)

| Confirmation | Result | Evidence |
|---|---|---|
| All deliverables committed + linked from one index | ✅ | this file |
| Reference tenant can be recreated from scratch | ✅ | fresh bootstrap → `reference-company.sql` → **PROVISIONED** |
| Regression package can be executed repeatedly | ✅ | `reference-activity-and-validate.sql` ×2 → **109/109** both runs, activity idempotent (2nd run skips re-posting, re-validates) |
| Pilot package is complete & self-contained | ✅ | clean DB → `demo-distributor.sql` + `run-pilot-dry-run.sql` → **ALL CHECKS PASSED** |
| Platform health | ✅ | typecheck clean · **1,280 unit + 176 integration** green · build green |

---

## Known limitations & recommended next phase

| Item | Severity | Status |
|---|---|---|
| **Cross-tenant document numbering** — `erp_invoices.invoice_number` / `erp_sales_returns.return_number` carry a **global** unique index while sequences count per-branch. Two *different companies* sharing a branch code (e.g. both `CAI`) would collide on first invoice. Pre-existing base schema (migration 0005); **not** introduced by the van-sales loop; does **not** affect a single dedicated pilot tenant. | Medium | **Documented — recommended for the next phase** (tenant-scope the number, or prefix it per company). A constraint change is a migration = higher-risk; not made here. |
| No dedicated **Merchandiser** / **Customer-Service** roles | Medium | Documented in [`REFERENCE-COMPANY.md` §7](./REFERENCE-COMPANY.md#7-findings--gaps); mapped to closest roles |
| No `erp_brands` / `erp_taxes` / `erp_payment_terms` master tables | Low | Modeled via existing columns; documented |
| Offline-first field operation | — | Out of scope (Phase 6); pilot is online-first by design |

See each certification report for the full readiness scoring and Go/No-Go.
