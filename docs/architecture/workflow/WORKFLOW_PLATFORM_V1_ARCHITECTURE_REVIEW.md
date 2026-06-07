# VANTORA — Workflow Platform V1 Architecture Review (Complete)

**Scope:** Full, code-grounded architecture review of Workflow Platform V1 (Engine
+ Runtime + Event Bus + Builder Phase 1 + Canvas Phase 2), PR #125.
**Mode:** **Review only — no fixes implemented, no modules started.**
**Focus areas:** scalability, performance, event-bus growth, runtime scaling, tick
reliability, multi-tenant isolation, audit growth, SmartSync interaction, long-term
maintainability, production-grade readiness.

**Overall verdict:** Architecturally sound and faithful to "one engine, one
runtime, one builder." **Pilot-ready behind its gates.** Reaching **production-grade
at scale** requires closing a small set of **delivery/execution-guarantee** gaps
(at-least-once start, run claiming, idempotent effects, actor-less resumption) and
**unbounded-growth** gaps (event bus + audit retention/partitioning). All are
additive — no redesign.

---

## A. Evidence base (verified in code)

- **Emission/dispatch:** `recordEvent` persists to `erp_events` then dispatches
  **inline, in-request, best-effort (errors swallowed)**.
- **Dedup/idempotency:** `uq_erp_events_dedupe (company_id, dedupe_key)` partial
  unique; `uq_wf_instance_active` + `on conflict do nothing` guard duplicate
  *starts*; **step side-effects are not idempotent**.
- **Tick:** Vercel cron `*/5 * * * *` → `/api/internal/workflow-tick` (CRON_SECRET,
  service role), `BATCH=100`, impersonates the run's starter; **actor-less runs
  skipped**; **no row claiming/`SKIP LOCKED`** in `listDueRuns`.
- **Event bus indexing:** `(company_id, seq)`, `(company_id, entity, record_id)`,
  `(company_id, event_type, occurred_at)`, branch FK cover, dedupe partial unique.
- **Retention (`0119`):** cleans `erp_notifications`, completed
  `erp_workflow_tasks`/`erp_workflow_instances`; **does NOT include `erp_events`**;
  **`erp_audit_logs` intentionally retained ("archive later")**. No retention cron
  observed in `vercel.json` (only sync-tick, reconcile, workflow-tick).
- **Audit indexing:** `erp_audit_logs` indexed on `created_at`, `company_id`,
  `(company_id, created_at)`.

---

## B. Findings by severity

### 🔴 Critical (close before production scale)

- **C1 — Workflow start is not at-least-once.** Dispatch is inline and swallows
  errors; if it fails after the domain commit, the event persists but **no instance
  starts**, with no retry/sweep. Approvals can silently never begin.
  *Areas: performance, runtime scaling, SmartSync.*
- **C2 — Due-run processing has no concurrency guard.** `listDueRuns` lacks
  `FOR UPDATE SKIP LOCKED`/lease. Overlapping ticks (cron retry, manual + cron)
  can process the same run twice; combined with **C3** this **double-fires side
  effects** (notifications/api_call/update_record).
  *Areas: scalability, tick reliability, runtime scaling.*
- **C3 — Side-effecting steps are not idempotent.** No per-(instance, step, attempt)
  effect key. At-least-once delivery (the correct target) is therefore unsafe today
  for `notification`/`api_call`/`update_record`.
  *Areas: runtime scaling, production readiness.*

### 🟠 Medium (address during hardening)

- **M1 — `erp_events` grows unbounded.** Well-indexed but excluded from `0119`
  retention; high event volume bloats the bus and slows feed/dispatch scans.
  *Areas: event-bus growth, scalability.*
- **M2 — Audit growth is unbounded by design.** `erp_audit_logs` is intentionally
  retained with archival deferred and **no partitioning**; workflows add
  per-step audit rows, accelerating growth. Needs an archival/partitioning plan.
  *Areas: audit growth, scalability.*
- **M3 — Actor-less runs never resume.** Event-triggered runs without `started_by`
  are skipped by the tick (no safe identity). Without a **per-tenant system
  principal**, system-initiated delayed/escalated workflows stall.
  *Areas: multi-tenant isolation, tick reliability.*
- **M4 — Dispatch on the write path.** Fan-out + `erp_workflow_start` run inside the
  originating mutation's request → latency coupling on hot entities
  (orders/invoices) and **reconciliation bursts** dispatch synchronously on the
  reconcile request. *Areas: performance, SmartSync.*
- **M5 — Retention job scheduling unconfirmed.** `0119` cleanup function exists but
  no cron entry was observed; if unscheduled, "bounded growth" is not actually
  enforced. *Areas: scalability, maintainability.*
- **M6 — Tick throughput/granularity ceiling.** `BATCH=100` every 5 min ⇒ ~1.2k
  resumptions/hour and ~5-min timer granularity — coarse for SLA timers and bursty
  load; single sequential stream, no sharding. *Areas: scalability, performance.*
- **M7 — Observability blind spots.** Swallowed dispatch failures, egress denials,
  and tick errors have no metrics/dead-letter; tick summary not persisted.
  *Areas: production readiness, maintainability.*

### 🟡 Low (quality / future-proofing)

- **L1 — N+1 writes** in `saveGraph` (per-row step_no parking), `saveLayout`,
  `copyStepsRemapped`; fine for small graphs, O(N) round-trips otherwise.
- **L2 — Canvas not load-tested** beyond modest graphs (100+ nodes unverified).
- **L3 — Builder config is free-form JSON** (server-validated only; per-field forms
  queued).
- **L4 — Egress rules lack an admin UI / change-audit**; verify they are
  tenant-scoped and that `update_record`/egress allow-lists exclude sensitive
  tables. (Enforcement itself is correct: deny-by-default + table allow-list.)
- **L5 — Cross-record event ordering** is reconcile-order, not guaranteed; fine for
  independent approvals but should be documented.
- **L6 — Parallel-approval quorum** has thin builder UI surface.

---

## C. Focus-area assessment

1. **Scalability** — Engine schema + event indexes are solid; ceilings are the
   unbounded `erp_events`/audit (M1/M2), sequential tick with no sharding/claiming
   (C2/M6), and N+1 batch saves (L1).
2. **Performance** — Read paths are indexed and fast. The real cost is
   **inline dispatch on writes** (M4) and tick batch granularity (M6).
3. **Event Bus growth** — Good indexing + dedup; **missing retention** (M1) is the
   gap. Recommend time-partitioning + retention/archival of `erp_events`.
4. **Workflow runtime scaling** — Pure runtime scales horizontally in principle,
   but the **single cron stream + no claiming** (C2) caps concurrency and risks
   double-execution (C3). A claim-based queue unlocks parallel workers.
5. **Tick scheduling reliability** — Authenticated, isolated, impersonated — good.
   Risks: overlap without locking (C2), actor-less skips (M3), coarse cadence (M6),
   and no persisted tick metrics (M7).
6. **Multi-tenant isolation** — Strong: RLS everywhere, `(select auth.uid())`, tick
   always impersonates. Gaps: system-principal absence (M3); verify egress rules
   are tenant-scoped (L4).
7. **Audit growth** — Indexed and intentionally retained, but **no partitioning/
   archival** and workflow steps amplify volume (M2).
8. **SmartSync interaction** — Emission is reconciliation-aware (correct); risk is
   **synchronous dispatch bursts on reconcile** (M4/C1) and undocumented ordering
   (L5). An async sweep (R1) absorbs bursts cleanly.
9. **Long-term maintainability** — High: single engine, closed executor set, pure
   modules, strong tests (894 suite / 71 engine), clear docs. Watch: observability
   (M7), N+1 patterns (L1), and keeping the executor set central (guardrail).
10. **Production-grade readiness** — **Conditional.** Ready for gated pilots now;
    production-grade after C1–C3 + M1/M3 are closed and retention/observability are
    in place.

---

## D. Immediate recommendations (pre-production-scale; additive, no redesign)

- **R1 (C1, M4, SmartSync):** Make start at-least-once — add a `dispatched_at`/
  status to `erp_events` and a **tick sweep that dispatches undispatched events**,
  moving fan-out off the request path.
- **R2 (C2):** Claim due runs with `FOR UPDATE SKIP LOCKED` (or a `claimed_at`
  lease) so overlapping ticks/workers never double-process.
- **R3 (C3):** Add a per-(instance, step, attempt) **effect-idempotency key** so
  notification/api_call/update_record are safe under at-least-once.
- **R4 (M3):** Define **per-tenant system service principals** so actor-less,
  event-triggered runs resume under correct RLS.
- **R5 (M1, M5):** Add `erp_events` retention/partitioning and **confirm the `0119`
  cleanup job is actually scheduled** (cron entry).
- **R6 (M7):** Minimal observability — counters/dead-letter for dispatch failures,
  egress denials, tick errors; persist tick/SLA summaries.

## E. Future recommendations (scale & richness)

- **F1:** Move the runtime to a **claim-based queue with parallel workers** (builds
  on R2) for high run volume; dynamic batch / tighter cadence for SLA timers (M6).
- **F2:** **Partition + archive** `erp_audit_logs` (and `erp_events`) by month;
  cold-storage export for compliance (M2).
- **F3:** **Bulk `saveGraph` RPC** to remove N+1 (L1); virtualize/cap canvas nodes
  (L2).
- **F4:** **Egress-rules admin UI + change-audit + secret references** for
  `api_call` (L4).
- **F5:** **Timer/cron triggers** as first-class catalog "events"; **sub-workflow**
  nodes via event composition.
- **F6:** Per-field inspector forms + client config schema hints (L3); richer
  parallel-approval/quorum UI (L6).
- **F7:** Workflow analytics (cycle time, bottleneck steps, SLA breach rates).

---

## F. Conclusion

The platform's foundations are strong and the single-engine discipline is real in
the code. The route to production-grade is **strengthening delivery and execution
guarantees** (R1–R4) and **bounding append-only growth with observability**
(R5–R6) — not architectural change. Recommend completing the Immediate set before
any module track depends on workflow at production scale.

*Review only — no code changed, no module started. Awaiting approval.*
