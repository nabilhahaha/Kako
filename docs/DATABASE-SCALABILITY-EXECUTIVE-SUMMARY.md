# Database Scalability — Executive Summary

*VANTORA multi-tenant ERP · grounded in the live schema (migrations 0001–0109) · read-only assessment.*

---

## Executive Summary
VANTORA's database is **architecturally sound and built to scale**. It can support the planned pilot and early commercial growth **without re-engineering**. Before onboarding real customers, a small, low-risk package of work (mainly query "accelerators"/indexes) should land. There are **no architectural dead-ends and no rewrite required** — the open items are operational tuning and housekeeping, not redesign.

## Overall Verdict — **Conditionally Ready** ✅
Proceed to pilot **after** the *Must Do* index package. Fold the *Should Do* items into a short hardening sprint before the first paying customer. Defer scale-only work until the data warrants it.

## Current Capacity Estimate
| Dimension | Target | Verdict |
|---|---|---|
| Companies (tenants) | 50 | ✅ Ample headroom |
| Users | 500 | ✅ Ample headroom |
| Customers | 250,000 | ✅ Supported (watch single tenants >50k customers) |
| Transactions | Millions | ✅ Supported with the index package; revisit at tens of millions |

**The stated targets are achievable on the current architecture.**

## Scalability Scorecard (1–10)
| Area | Score | Rationale |
|---|---|---|
| Multi-Tenant Architecture | **8** | `company_id` + row-level security on every table; clean per-company isolation & config. |
| Database Performance | **6** | Good for pilot; row-by-row sales-scope filtering + missing composite indexes are the items to close. |
| Security & RLS | **8** | Strong tenant isolation; permission-based access; migrations gated from production. |
| Workflow Engine | **8** | Generic, reusable approval engine (conditional/parallel routing, permission approvers). |
| Audit & Governance | **8** | Mandatory audit trail, approval workflows, disciplined release process. |
| Reporting | **5** | Live aggregates over transactional tables; no pre-computed summaries yet. |
| Attachment Storage | **5** | Files in storage buckets only; no metadata/linking table. |
| **Overall Pilot Readiness** | **8** | Feature-complete & staging-validated; conditional on the small Must-Do package. |

## Critical Findings (only what matters)
1. **Sales-hierarchy filtering is evaluated row-by-row.** The rules limiting each rep/manager to "their" customers (`erp_customer_in_scope`, `erp_customer_id_in_scope`) run per row on high-volume tables. Fine at pilot size; needs an index-friendly path before large per-company customer counts. *Company-wide roles (Admin/Finance/Director) are unaffected — they use a fast path.*
2. **Common screens/reports lack composite indexes.** Tables have single-column indexes but not the real query shapes (status + date, company + salesperson). Cheap to fix; high impact.
3. **Append-only "log" tables have no clean-up** — `erp_audit_logs`, `erp_notifications`, `erp_workflow_tasks/instances` grow unbounded.
4. **Reporting runs live**, with **no materialized views** — acceptable now, not at heavy load.
5. **Attachments have no tracking table** — no automatic cleanup on record delete.

## Must Do Before Pilot
- Add composite indexes to high-traffic tables: **invoices** `(branch_id, status, due_date)`, **customers** `(company_id, salesman_id, approval_status)`, **stock movements** `(warehouse_id, product_id, created_at)`, **journal entries** `(branch_id, entry_date, status)`, **payments** `(invoice_id, payment_date)`, **visits** `(customer_id, visit_date)`, **workflow tasks** `(company_id, status, created_at)`, **audit logs** `(company_id, created_at)`.
- Confirm region/area manager lookups are indexed (used by the scope rules).

## Should Do Before First Paying Customer
- Optimize the **sales-rep scope filtering** (index-friendly `salesman_id` path + app-level filter on rep screens).
- Add **retention/clean-up jobs** (scheduled): notifications (~90 days), completed workflows (archive), audit logs (retention window).
- Introduce **pre-computed report summaries** (AR aging, sales summary) refreshed nightly.
- Add an **attachments metadata table** linking files to records (clean lifecycle + cascade delete).

## Can Wait Until Scale
- **Table partitioning** for the largest tables (only near ~10M rows): `erp_stock_movements`, `erp_audit_logs`, invoice/journal line tables.
- **Read replica / analytics copy** if reporting ever competes with operations.
- **Archiving of inactive (cold) tenants.**

## Bottlenecks Identified
| Area | Finding |
|---|---|
| **High-volume tables** | `erp_invoice_lines`, `erp_journal_lines`, `erp_sales_order_lines`, `erp_stock_movements` grow fastest; then `erp_invoices` / `erp_payments` / `erp_visits`. |
| **Indexes** | Mostly single-column; missing composites for status+date and company+salesperson filters (see Must Do). |
| **RLS** | Per-row scope functions on `erp_customers`, `erp_invoices`, `erp_sales_orders`, `erp_sales_returns`, `erp_visits`, `erp_payments`, `erp_routes` for *scoped* roles. |
| **Audit logs** | `erp_audit_logs` — append-only, no retention; add `(company_id, created_at desc)` index. |
| **Workflow tables** | `erp_workflow_tasks` / `erp_workflow_instances` — completed rows persist forever; archive needed. |
| **Notifications** | `erp_notifications` — unbounded; needs a clean-up job. |
| **Reporting queries** | AR aging, sales summary, inventory variance run as live aggregates — index now, materialize later. |
| **Attachments** | Storage buckets (`visit-photos`, `near-expiry-photos`) only; no metadata table. |
| **Partitioning** | None today — appropriate; introduce on the few 10M+ tables when reached. |

## Recommended Roadmap
**Immediate (before pilot)**
- Ship the **composite-index package** (one additive, staging-validated change; production held until approved).

**Short Term (before first paying customer)**
- Sales-rep scope optimization; retention/clean-up jobs; report summaries; attachments table.

**Long Term (until scale)**
- Partition the largest tables at ~10M rows; consider an analytics read replica; archive cold tenants.

## Final Recommendation — **GO for pilot (Conditionally Ready)**
Complete the low-effort **Must-Do index package**, then launch the pilot — the platform is feature-complete and staging-validated. Schedule the **Should-Do** items as a short hardening sprint before the first paying customer, and defer scale-only work until the data warrants it. **No architectural risk; clear, low-cost path to production.**

*Read-only assessment — no schema changes made; production remains on hold; nothing merged.*
