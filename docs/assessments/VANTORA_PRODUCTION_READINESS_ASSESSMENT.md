# VANTORA — Production Readiness Assessment

**Scope:** End-to-end review for production onboarding + long-term SaaS scale. Verified against
actual code/migrations (0001–0228, ~150 lib modules, ~147 test files). **2026-06-08.**

## Verdict: 🟢 GO for controlled pilot, with conditions
The platform has a **sound, scalable multi-tenant architecture** (per-company RLS, normalized schema,
generic workflow/approval engine, pure-engine-first business logic, distinct GL reference types,
composite indexing, daily backups + PITR, Sentry, retention cron). **No architectural rewrites required.**
Remaining work is **operational hardening + wiring the newest engines to runtime/UI** (the Phase 3–7
engines were built engine-first by design and are flag-gated OFF). Below: findings by severity with the
required fields. Two **safe auto-fixes were applied** (see Auto-Fix Log); everything else is a
recommendation pending approval.

> **Corrections to note:** schema-health (FK-coverage + RLS-wrap) **is** gated in CI (`ci.yml` →
> `npm run test:db`); the 0110 composite indexes **are** in the applied migration chain; cross-tenant
> isolation tests **exist** (`rls.test.ts`, `customer-scope.test.ts`) though a broader dedicated suite is
> recommended; GL uses **distinct reference types per module** (zero double-post by construction) + a
> `hasEntryFor` idempotency check — the finding is a *defensive* DB constraint, not a live bug.

---

## Findings (Finding · Area · Severity · Risk · Fix · Effort · Auto-fixable · Approval)

### Critical
| # | Finding | Area | Risk | Recommended fix | Effort | Auto-fix | Approval |
|---|---|---|---|---|---|---|---|
| C1 | **Unbounded audit-log growth** — `erp_audit_logs` excluded from retention (0119) | Scalability | 36M+ rows/yr at 10k users → bloat, slow admin queries, disk cost | Add a retention window (e.g. 2-yr hot) + archive/partition by `created_at`; extend `erp_purge_old_data()` | M | No | **Yes** (compliance/retention policy) |
| C2 | **Temporary-access grants have no expiry sweep** — `erp_temporary_access_grants` time-checked only at resolution | Security/Governance | Expired grants persist as data; no revoke trail | pg_cron/job to mark expired→revoked; add `revoked_at`; audit grant/revoke | M | No | **Yes** (security) |

### High
| # | Finding | Area | Risk | Recommended fix | Effort | Auto-fix | Approval |
|---|---|---|---|---|---|---|---|
| H1 | **No structured logging / request-level observability** (Sentry captures exceptions only) | Prod Ops | Slow MTTR at scale; no request-id/latency correlation | Add Pino/Vercel logging on `/api/internal/*` + key RPCs (sync/kpi/workflow tick) | M | No (vendor choice) | No |
| H2 | **No pre-computed reporting summaries** (AR aging, sales summary live-queried) | Scalability | Dashboard p95 degrades at 100+ companies | Nightly summary tables via a `reporting-refresh` cron (mirror kpi-snapshot) | M | No | No |
| H3 | **Sync engine has no retry/backoff** — failed runs sit until manual `force_run` | Integration | Silent broken syncs | Add `retry_count`/`next_attempt_at` + retry sweep + alert after max | M | No | No |
| H4 | **No alerting wired** (CPU/connections/error-rate/backup/sync) | Prod Ops | Incidents detected reactively | Wire Supabase + Sentry + uptime alerts → ops channel; escalation matrix | M | No | No |
| H5 | **New Phase 3–7 engines are backend-only** (route-riding/route-optimization/promotion/returns/attribution/commercial/role-governance/entity360) — **by design** (engine-first) | Architecture/Visibility | Capabilities not user-reachable until UI wiring | Phase-8 UI + server-action/gateway wiring per engine; keep flag-gated OFF until exposed | L (per engine) | No | **Yes** (roadmap) |
| H6 | **Approval-authority + role-versioning + data-scope engines not yet enforced at runtime** (built, not wired) | Governance | Thresholds/version isolation not active | Wire `resolveApprovalAuthority`/`planUpgrade`/scope filters into order/discount/credit/permission paths | L | No | **Yes** (security/workflow) |
| H7 | **Connector runtimes: 6 live** (generic-REST, CSV/SFTP, Dynamics-BC, SAP-S/4, Odoo, NetSuite); **QuickBooks/Xero/Shopify/Woo/Sheets are registry descriptors without runtime** | Integration | Marketplace implies more than exists | Mark missing as tier-3 "planned" in the registry; build per Phase-6E order | L | Partial (label stubs) | **Yes** |
| H8 | **3 built pages have no nav entry** — Trade-Spend dashboard, Customer-360 (`/customers/[id]/360`), Field-Survey | Visibility/UX | Features undiscoverable | Add module/permission-gated nav entries + a "360" link on customer detail | S | UI-yes* | No |
| H9 | **Hidden third-party credentials + cert material not in a KMS** (env/`material_ref` placeholder) | Security | Plaintext env secrets; no rotation | Move to Supabase Vault/KMS; rotation policy; resolve `material_ref` layer (ties to paused e-invoicing) | M-L | No | **Yes** |

### Medium
| # | Finding | Area | Risk | Recommended fix | Effort | Auto-fix | Approval |
|---|---|---|---|---|---|---|---|
| M1 | **`erp_integration_xref` not populated by sync dispatcher** | Integration | Re-sync idempotency/remap gap | Write (connection,entity,external_id,internal_id) on ingest, transactional | M | No | **Yes** |
| M2 | **Not all SECURITY DEFINER functions pin `search_path`** (0031 pinned the core set) | Security | Search-path hijack on un-pinned fns | `ALTER FUNCTION … SET search_path` for the remainder | M | No (security) | **Yes** |
| M3 | **Company admins can't read their own audit logs** (0153 limits to platform owner) | Security/Audit | Tenant compliance gap | Widen read policy to company admins for own-company logs + an Audit Viewer page | S | No (permission) | **Yes** |
| M4 | **Branch-scoped RLS on `erp_customers`/`erp_sales_orders` lacks a defensive company filter** | Security | Orphaned-branch edge cases | Add company-level guard or denormalize `company_id` | M | No (RLS) | **Yes** |
| M5 | **`round2()` duplicated ~34×** | Code quality | Inconsistent-rounding update burden | Extract a shared `utils-math` + import | S | Yes (cleanup) | No |
| M6 | **No DB CHECK preventing negative on-hand** (engine enforces; DB doesn't) | Data integrity | Negative stock if engine bypassed | Add `CHECK (qty >= 0)` after data audit | S | No (could reject existing data) | **Yes** |
| M7 | **No materialized reporting / outbound-sync conflict detection** (inbound has it) | Integration | Last-write-wins on push | Document; add remote `updated_at` check if needed | L | No | No |
| M8 | **EmptyState/empty-loading-error states used inconsistently** across list pages | UX | "Is it broken or empty?" ambiguity | Standardize EmptyState on all lists + per-section skeletons | M | Partial | No |
| M9 | **Workflow-builder canvas (React Flow) a11y/RTL/mobile untested** | UX/A11y | Desktop-only; RTL handle misalignment | Keyboard nav, RTL test, mobile fallback, undo stack | M | No | **Yes** |
| M10 | **Audit coverage gaps** — customer status change, credit-limit decision not always logged | Audit | Incomplete trail on sensitive ops | Add `logAudit` to those flows | M | No | **Yes** |

### Low
| # | Finding | Area | Risk | Fix | Effort | Auto-fix | Approval |
|---|---|---|---|---|---|---|---|
| L1 | **No `/api/health` endpoint** | Prod Ops | Uptime monitors can't probe liveness/DB | Add health route | S | **Yes — APPLIED** | No |
| L2 | **No `not-found.tsx`** (404s fall through to error boundary → Sentry noise) | UX/Perf | Generic 404, Sentry spam | Add in-app 404 page | S | **Yes — APPLIED** | No |
| L3 | **Legacy `ts_*` trade-spend tables (0004) use `USING(true)` RLS** | Security | Over-permissive on a legacy module | Scope or archive the legacy module | S–L | No | **Yes** |
| L4 | **Attachment storage has no hard-purge/retention** (soft-delete only) | Cost | Unbounded storage at scale | Hard-delete + storage purge in retention cron | M | No | No |
| L5 | **Governance feature status undocumented** (which flags are live vs backlog) | Docs | Operator confusion | `GOVERNANCE-STATUS.md` + a platform status page | S | No | No |
| L6 | **Some back-buttons missing** on ~10 detail pages (BackLink component exists) | UX | Navigation friction | Add `<BackLink/>` to those pages | S | UI-yes* | No |

\* UI-yes = mechanically auto-fixable but edits existing page/nav files; deferred to a reviewed UX-polish PR rather than this zero-risk auto-fix pass (agents had some file-path inaccuracies; each target should be verified individually).

---

## 1–10 Area summaries
- **Architecture:** clean module boundaries; pure-engine-first; consistent `KAKO_*` flags all default-OFF (verified). Main debt: `round2` dup (M5) + new engines lacking UI wiring (H5, intentional). No duplicate functionality of concern.
- **Scalability:** sound to ~10–50 companies now; bottlenecks before 100+ are audit-log growth (C1), live reporting (H2), and partitioning of audit/journal/stock-movement at 1,000+. FK-coverage + composite indexes (0110/0157/0159) are strong; schema-health gates regressions in CI.
- **Security:** strong RLS + company isolation + service-role isolation + API-key hashing + Vault for connector secrets. Gaps: temp-access sweep (C2), search_path on all fns (M2), audit read for admins (M3), KMS for third-party/cert secrets (H9), defensive company filter (M4).
- **Visibility:** ~90 features exposed across 11 vertical packs + core ERP + field ops + workflow; 3 built pages hidden (H8); new engines backend-only (H5).
- **UX:** i18n/RTL framework solid; error/loading boundaries exist; **404 now added (L2)**; gaps in EmptyState consistency (M8), some back-buttons (L6), canvas a11y (M9).
- **Drag & drop:** only the workflow-builder canvas (React Flow) — desktop pointer/touch; keyboard/RTL/mobile untested (M9). No other DnD; none urgently needed.
- **Business logic:** sales/AR/AP/GL/tax/inventory-costing well-founded + tested; distinct GL reference types prevent double-post; defensive `(reference_type,reference_id,company_id)` uniqueness recommended (hardening). Collections/returns/trade-spend engines correct + tested but their **GL/persistence wiring is the follow-up** (consistent with engine-first).
- **Integrations:** registry + sync engine + Vault secrets solid; 6 runtimes live; xref population (M1) + retry (H3) + remaining connectors (H7) are the gaps.
- **Production ops:** backups + PITR + deployment/rollback playbooks excellent; **gaps: health endpoint (now added), structured logging (H1), alerting (H4).**
- **Platform governance:** role templates + versioning + approval-authority + temporary-access + data-scope **schemas/engines exist**; runtime enforcement + UI are the wiring work (H6, C2). VIEW_AS_ROLE / ACT_AS_USER remain backlog (not implemented) — correct.

---

## Auto-Fix Log (this PR — safe, additive, backward-compatible, new files only)
1. **`/api/health` endpoint** (L1) — liveness + DB connectivity for uptime monitors; no tenant data; 200/503.
2. **`(app)/not-found.tsx`** (L2) — in-app bilingual 404; avoids error-boundary fall-through + Sentry noise.

Both are net-new files — **zero edits to existing code** — validated by typecheck + build + full test suite.
All other findings (security, permissions, RLS, schema redesigns, business-logic wiring, customer-facing
UX) are **left as recommendations pending approval**, per the auto-fix rule.

## Recommended remediation order
1. **Before pilot:** C1 (audit retention), C2 (temp-access sweep), H4 (alerting), H1 (logging). (L1/L2 done.)
2. **Before first paying customer:** H2 (reporting summaries), H3 (sync retry), H6 (governance enforcement wiring), M3/M10 (audit), formal security review/pentest.
3. **Before 100 companies:** audit/journal/stock-movement partitioning, attachment retention (L4), M2 (search_path), M5 cleanup.
4. **Phase 8 (feature exposure):** H5/H8 UI wiring for the new engines + Entity-360 pages; H7 connector runtimes (Phase-6E order).
