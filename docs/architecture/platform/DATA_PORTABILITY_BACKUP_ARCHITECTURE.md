# VANTORA — Data Portability & Backup (Architecture & Backlog)

**Status:** Architecture & backlog capture only — **no code, no migrations, no
implementation.** Captured on request as a **platform-wide** capability (not tied to
a module).
**Classification:** Platform Foundation Enhancement · **Priority: High.**
**Sequencing:** **after the current core foundations** (Finance, Inventory,
Purchasing, Sales, CRM, Trade Spend) and **before broad customer onboarding** — it
is a prerequisite for trustworthy onboarding (no vendor lock-in, exit guarantee).
**Discipline (same as all foundations):** reuse-over-rebuild · additive ·
flag-gated · multi-tenant + permission model preserved · generic framework, zero
module-specific hardcoding.

> **Reuse points already on `main`:** the `/exports` route + per-capability
> `*.export` keys (customers/pricing/collections/purchasing/…), `erp_audit_logs`
> (audit trail), the **provider-registry pattern** proven by Search OS (each module
> registers a provider; the core knows only the generic shape), the event bus, and
> the Workflow approval engine. Data Portability **reuses these**, adding an export-
> handler registry rather than a new subsystem.

---

## 1. Backup & Restore
- **Full tenant backup** — a complete, restorable snapshot of one company's owned
  data (all module tables scoped by `company_id`/branch) + attachments metadata.
- **Point-in-time backup (future)** — leverage the database's PITR (Supabase/Postgres
  PITR) at the infrastructure layer; app-level captures backup manifests/checkpoints.
- **Restore to same tenant** — controlled, approval-gated restore (destructive →
  maker-checker + confirmation).
- **Restore to sandbox tenant** — restore a backup into an isolated sandbox company
  for validation/training without touching production data.

## 2. Export All Company Data
- **One-click export** of all company-owned data.
- **Coverage:** customers, products, suppliers, inventory, accounting, sales,
  purchasing, CRM, workflow, **attachments metadata**, and **future modules** (via
  the registry — no core change per module).
- **Formats:** **CSV** (per entity), **XLSX** (multi-sheet workbook), **JSON package**
  (a structured, relational, re-importable bundle + manifest).
- Large exports run **async** (job + download artifact), reusing the existing
  background-job/tick infrastructure; small ones stream directly.

## 3. Data Ownership
- Company data **always remains owned by the customer**.
- The customer can **request or self-generate** exports at any time — **no vendor
  lock-in**. The JSON package is documented and re-importable.

## 4. Audit & Security
- Every export/backup/restore action is **logged in `erp_audit_logs`** (who, when,
  scope, format, row counts).
- **Permission-controlled** — reuse `*.export` keys + a new `data.export_all` /
  `data.backup` / `data.restore` capability; RLS guarantees a tenant can only export
  its own data.
- **Optional approval workflow** for full-company exports / restores — authored in
  the existing Workflow Builder/Canvas (maker-checker; high-risk restore always
  gated).

## 5. Architecture — generic export framework
- A **generic export/backup framework** with an **export-handler registry**: each
  module registers a handler (`entity`, tenant-scoped query/select, serializer,
  dependency order) — **mirrors the Search provider registry** (single source of
  per-module knowledge; core stays generic).
- **No module-specific hardcoding** in the core orchestrator; it iterates registered
  handlers, applies RLS/`company_id` scoping, resolves dependency order for a
  consistent relational package, and writes the chosen format.
- **Future industry packs plug in** by registering their handlers — **no redesign**
  (same extensibility guarantee as Search/posting-rules).
- Restore = the inverse: handlers expose an idempotent importer; the package
  manifest drives ordering + referential integrity.

## 6. Commercial / deployment support
- **SaaS tenants** — per-tenant export/backup via the app (RLS-scoped).
- **Dedicated-instance tenants** — same framework + instance-level DB backup/PITR.
- **Future on-premise** — the framework is deployment-agnostic (no SaaS-only
  assumptions); on-prem uses the same handlers + local artifact storage.

---

## Dependencies & integration
- **Per-module export handlers** depend on each foundation's schema being stable →
  hence sequencing **after** the core foundations.
- Reuses: provider-registry pattern (Search), audit (`erp_audit_logs`), Workflow
  (approvals), background jobs/tick (async exports), attachments (metadata), RLS
  (tenant isolation). **No second framework.**

## Backlog placement (master plan)
Insert as a **Platform Foundation Enhancement** in the implementation roadmap:
**after Phase 5 (Trade Spend) / alongside Phase 6**, and **gating broad customer
onboarding**. Flag-gated rollout (`KAKO_DATA_EXPORT`, `KAKO_DATA_BACKUP`), pilot
tenant first, like every other capability.

## Open questions (for the future architecture-review pass)
1. JSON package schema/versioning + re-import contract (round-trip guarantee).
2. Restore-to-same-tenant safety model (full replace vs. merge; snapshot-before-restore).
3. PITR ownership (infra vs. app manifest) for the point-in-time requirement.
4. Attachments: metadata-only vs. binary inclusion (size/egress) per format.
5. Export approval thresholds (size/PII sensitivity) and default policy.

*Architecture & backlog capture only — no code, migrations, or implementation. A
full architecture-review pass will precede any build, after the core foundations.*
