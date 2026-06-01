# VANTORA — Platform Readiness Review

*Architecture & readiness review before FMCG-specific pack development. Review only — nothing implemented.*

---

## ⭐ Copy-friendly summary (one-click)

> **VANTORA Platform Readiness — Summary.** The Platform Foundation Phase is complete: Audit Trail Engine, Role & Permission Matrix, Universal Notification Engine, Raw Data Framework, and Customer 360 — all additive, multi-tenant (RLS), and consistent with the Workflow & Approval Engine. Unit suite green (287). **Production is still at migration 0098; everything from 0099–0112 is staging-only and awaits a guarded production rollout.**
>
> **Must-fix before launch / first pack (P0):** (1) add `currency` (+ `source_table`/`source_id`, optional `uom`) to `erp_raw_facts` to avoid an analytics redesign; (2) model **Region/Area** (recommend branch attributes) to complete the org hierarchy & analytics dimensions; (3) execute the **production cutover** of 0099–0112 with backup + production-clone dry-run + no-op verification + smoke test; (4) add **integration + RLS-isolation tests** for the engine and foundations (CI-gating).
>
> **Before scale (P1):** partitioning + retention for high-volume tables (raw_facts, audit_logs, workflow_events, notification_dispatch); attachment taxonomy + storage lifecycle; notification email adapter; bulk-path discipline for audit/fact writes.
>
> **Incremental during packs (P2):** adopt matrix permissions + raw-fact emission per pack; extend audit coverage; build Customer 360 UI; publish per-module fact conventions.
>
> **Bottom line:** foundations are sound and additive. The must-fix items are small and cheap now but costly later. Recommended sequence: P0 currency + Region/Area + production cutover + tests → then begin FMCG packs (each emitting raw facts and adopting matrix permissions from day one).

---

## 1. Executive Summary

The Platform Foundation Phase delivered five cross-cutting capabilities — **Audit Trail Engine**, **Role & Permission Matrix**, **Universal Notification Engine**, **Raw Data Framework**, and **Customer 360** — on top of the generic **Workflow & Approval Engine** (company- and platform-scope approvals, hierarchical + route/account-owner resolution). All work is **additive, idempotent, and multi-tenant (RLS-isolated)**, with the unit suite green (287 passed / 10 skipped) and CI staging migration-apply passing for every migration.

The platform is **architecturally ready** to begin FMCG packs, with one major operational caveat — **production has not been migrated past `0098`** — and a small set of cheap-now/expensive-later schema items that should be settled before data accumulates (currency on facts, Region/Area modeling). Partitioning, retention, attachment lifecycle, email delivery, and integration testing are P1 scaling items that can run in parallel with early pack work.

---

## 2. Risks

**Database / scale**
- Unbounded growth on high-volume tables (`erp_raw_facts`, `erp_audit_logs`, `erp_workflow_events`, `erp_notification_dispatch`, `erp_entity_attachments`); none partitioned.
- Write overhead from the generic audit-capture trigger (JSONB diff on every change) under bulk imports / sales execution.
- Index bloat risk on write-heavy tables if indexes are added reflexively.
- No retention/archival → ever-growing tables, slower backup/restore.

**Organizational hierarchy**
- **Region & Area are not modeled** (only free-text columns on facts) → requested hierarchy Company → Region → Area → Branch → Route → Customer is incomplete; analytics group-bys by region/area unreliable.
- `reports_to` has no cycle/self guard; multi-branch users can have multiple reporting lines.

**Attachments**
- No document taxonomy (mime only); Customer 360 infers "certifications" by filename — fragile.
- No lifecycle controls (size/type limits, scanning, signed-URL TTL, retention, tiering).

**Production rollout**
- Production at `0098`; 14 ordered migrations, several **redefining the same functions** (workflow `make_tasks`/`start` across 0102/0103/0107; M1 triggers redefined in 0108) — must apply strictly in order.
- Canonical subscription cutover (`0100`) backfills ~40 companies (0 billing subs today); designed as a no-op but unproven on production-shaped data.
- Audit capture begins writing immediately on `0108` apply.
- No verified production backup/dry-run; staging ≠ production data shape.

**Analytics / AI**
- **No `currency` on `erp_raw_facts`** despite multi-currency billing → cross-currency aggregates corrupt. (Highest analytics risk.)
- No `source_table`/`source_id` for drill-through / idempotent emission.
- Region/Area as text only; no point-in-time dimension snapshots beyond ids.

**Testing**
- No integration/E2E coverage for the new engine/foundation RPCs and request journeys; RLS isolation not codified in tests.

---

## 3. Gaps

- **Schema:** missing `currency` (+ `source_table`/`source_id`, optional `uom`) on raw facts; missing Region/Area entities/attributes; missing attachment `category`/`expires_at`.
- **Ops:** no partitioning; no retention/archival policy; no production backup/dry-run procedure documented; no bulk-write path that bypasses/defers capture.
- **Delivery:** notification **email sending not wired** (engine/queue/templates/preferences ready; no provider/dispatcher).
- **Adoption:** raw-fact emission not yet called by any module; permission-matrix enforcement is incremental (legacy guards still in place); audit capture covers a curated table set only.
- **Product:** no Customer 360 UI (foundation function only); staff-initiated pre-creation onboarding needs a nullable-company start variant.
- **Quality:** no integration/E2E/RLS tests for the new flows.

---

## 4. Recommendations

**Schema (do before data accumulates)**
- Add `currency`, `source_table`, `source_id` (and optionally `uom`) to `erp_raw_facts`.
- Model Region/Area — recommend `region`/`area` attributes on `erp_branches` now (denormalized into facts via the emitter); dimension tables later if territory management becomes a feature.
- Add `category` (image/document/contract/certificate/id/other) and optional `expires_at` to `erp_entity_attachments`; Customer 360 reads categories.

**Operations**
- Range-partition by month (`event_at`/`created_at`) for `raw_facts`, `audit_logs`, `workflow_events`, `notification_dispatch` (schemas are partition-ready; no app change).
- Define retention/archival per table (hot 12–24 months → cold/object storage; never delete audit within the legal window).
- Add a bulk path to defer/disable audit capture during large ETL/imports; emit facts in batches.
- Wire the notification email adapter (provider via env + a worker draining `erp_notification_dispatch`) if email is needed at launch.
- Attachment upload policy (max size, allowed mime, scan hook) + signed URLs (short TTL) + storage lifecycle.

**Testing**
- DB integration tests (existing disposable-Postgres harness) for: workflow start/decide (company + platform scope, quorum/parallel/conditional, hierarchical + route/account-owner), subscription projection **no-op**, `erp_matrix_has`, audit before/after capture, notification enqueue, raw-fact emit, `erp_customer_360`, and **RLS isolation** (tenant A ≠ tenant B; platform vs company). Make CI-gating.
- One thin E2E for a request journey (submit → platform inbox → approve → outcome).

---

## 5. Priority Order

**P0 — before production rollout / first pack**
1. Add `currency` (+ `source_table`/`source_id`, optional `uom`) to `erp_raw_facts`.
2. Decide & implement the Region/Area model (recommend branch attributes).
3. Production rollout plan: backup → production-clone dry-run → in-order guarded apply of `0099`–`0112` → no-op verification → smoke test.
4. Integration + RLS-isolation tests for the engine and the five foundations (CI-gating).

**P1 — before scaling FMCG volume**
5. Partitioning + retention/archival for the high-volume tables.
6. Attachment taxonomy + storage lifecycle.
7. Notification email adapter.
8. Bulk-path discipline for audit capture / fact emission.

**P2 — incremental during pack development**
9. Adopt matrix permissions + raw-fact emission in each new pack from day one.
10. Extend audit-capture coverage; build the Customer 360 UI; finalize per-module fact conventions.

---

## 6. Production Rollout Notes

- **Scope:** migrations `0099`–`0112` (trial → canonical subscription → workflow engine extensions → platform scope → hierarchical approvers → subscription-change/onboarding/module-activation requests → route ownership → audit trail → permission matrix → notification engine → raw data → customer 360). Production is currently at `0098`.
- **Ordering is mandatory** — several migrations `CREATE OR REPLACE` the same functions (workflow `make_tasks`/`start`: 0102 → 0103 → 0107; workflow audit triggers: 0101 → 0108). Out-of-order apply yields wrong final bodies.
- **Canonical subscription cutover (`0100`)** backfills one `erp_billing_subscriptions` row per company (production has ~40 companies, 0 billing subs today) and projects the company cache. Designed as a **no-op** (no company has `trial_ends_at`), but verify on a production clone: the projected `plan_key` / `subscription_end` / `is_active` must equal current values (empty diff).
- **Recommended cutover:** (1) backup / PITR checkpoint; (2) restore a production clone and apply `0099`–`0112`, verifying no-op + workflow seeds + no errors; (3) apply to production via the guarded job, in order, one transaction per migration, low-traffic window; (4) smoke test (subscription state unchanged; a workflow start/decide; an audit row; `customer_360` returns); (5) keep per-migration rollback notes (all additive/reversible; the company cache stays authoritative throughout).

---

## 7. Database Scalability Notes

- **Multi-tenant capacity:** `company_id` + RLS on all tenant tables; resolver functions with owner/platform-staff bypass; per-company isolation verified by design (formal RLS tests recommended — see §9).
- **Indexing:** targeted indexes exist (audit by entity/company/workflow/actor; raw facts by company×module/customer/route/user×event_at, entity, workflow; dispatch by status/company/user; matrix by company/role). Review per query pattern; avoid over-indexing write-heavy tables.
- **High-volume tables:** `erp_raw_facts`, `erp_audit_logs`, `erp_workflow_events`, `erp_notification_dispatch`, `erp_entity_attachments`.
- **Archiving/retention:** none defined yet — add per-table policy (hot/cold/legal-hold).
- **Partitioning:** not yet applied; schemas are partition-ready — convert to monthly RANGE partitions on `event_at`/`created_at` before FMCG volume, with no application change.

---

## 8. Attachment Architecture Notes

- **Model:** `erp_entity_attachments` holds metadata (`file_name`, `file_path` = object-storage key, `mime_type`, `size_bytes`, `uploaded_by`, `created_at`) per `(entity, record_id)`; bytes live in object storage; attachment **history** is audited via the Audit Trail Engine.
- **Gaps:** no document **category** (contracts/certificates/IDs distinguished only by mime/filename); no size/type policy, scanning, signed-URL TTL, retention, or storage tiering.
- **Recommendations:** add `category` + optional `expires_at`; enforce upload policy + server-side scan; serve via short-TTL signed URLs; align storage lifecycle with the DB archival policy; keep metadata in DB, bytes in storage (CDN for images).

---

## 9. Testing / E2E Coverage Notes

- **Current:** unit suite **287 passed / 10 skipped**; i18n parity/usage + navigation tests; CI **staging migration-apply** validates each migration on real Postgres; Playwright **smoke** only.
- **Missing:** integration tests for the new RPCs/flows (workflow `start`/`decide` across scopes, quorum/parallel/conditional, hierarchical + route/account-owner resolution, subscription projection no-op, `erp_matrix_has`, audit before/after capture, notification enqueue, `erp_raw_emit`, `erp_customer_360`); **RLS isolation** tests (tenant↔tenant, platform↔company); one E2E for a request journey.
- **Recommendation:** add these against the existing disposable-Postgres harness and make them CI-gating **before** production rollout and before each FMCG pack.

---

## 10. Final Recommendation Before FMCG Packs

Proceed to FMCG packs **after** clearing the four P0 items — they are inexpensive now and would force schema/analytics rework if deferred:

1. **`currency` (+ `source_table`/`source_id`, optional `uom`) on `erp_raw_facts`.**
2. **Region/Area model** (branch attributes) to complete the hierarchy and analytics dimensions.
3. **Production cutover** of `0099`–`0112` with backup + production-clone dry-run + no-op verification + smoke test.
4. **Integration + RLS-isolation tests** for the engine and foundations (CI-gating).

P1 scaling work (partitioning/retention, attachment lifecycle, email adapter, bulk-path discipline) can proceed in parallel with early packs. Every FMCG pack should, from day one, **emit raw facts** and **adopt matrix permissions** — cheap per-module, expensive to retrofit.

*The foundations are sound, additive, and multi-tenant. With the P0 items closed, the platform is ready for FMCG pack development.*

---

*End of review — architecture and readiness only; nothing implemented.*
