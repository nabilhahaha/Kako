# VANTORA — Workflow Platform V1 Architecture Review

**Scope:** Independent architecture review of Workflow Platform V1 (Engine +
Runtime + Event Bus + Builder Phase 1 + Canvas Phase 2). **Review only — no code
changes, no new modules.** Findings are grounded in the shipped implementation
(PR #125).

**Verdict (summary):** The platform is well-architected and faithful to "one
engine, one runtime, one builder." It is **pilot/early-production ready behind its
gates**, but **three reliability gaps** (inline best-effort dispatch, tick
concurrency claiming, and actor-less run resumption) plus event-log retention
should be closed before it is considered **production-grade at scale**. None
require a redesign — all are additive hardening.

---

## 1. Architecture Strengths

- **True single engine.** Nodes/forms both serialize to the same
  `erp_workflow_steps`; execution lives only in `advanceRun` + the executor
  registry. No parallel runtimes — the core invariant holds in code.
- **Pure, testable runtime.** `advanceRun` is a pure state machine over injected
  deps; `condition-eval` is a **safe interpreter (no `eval`)**; 71 engine tests +
  graph round-trip identity.
- **Immutable versioning + instance pinning.** Publish snapshots to
  `erp_workflow_definition_versions`; `erp_workflow_instances.workflow_version`
  pins running instances — auditable "what ran when."
- **Security-by-construction.** Tick runs **impersonated** as the run's starter
  (RLS preserved, no privilege escalation); `api_call` is **deny-by-default**
  behind `erp_workflow_egress_rules`; `update_record` is table-allow-listed; every
  result is audited.
- **Offline-aware emission.** `recordEvent` fires after commit and is
  reconciliation-aware, so offline-first mutations still trigger workflows.
- **Clean extensibility surface.** New module = new catalog events + allow-list
  entries + authored definitions; the engine never changes.
- **Two UX surfaces, one model.** Forms and canvas are interchangeable; the canvas
  is strictly visual (`0181` metadata the runtime never reads).

---

## 2. Architecture Weaknesses

1. **Inline, best-effort dispatch (highest priority).** `recordEvent` persists the
   event then dispatches **synchronously in the user's request and swallows all
   errors**. If dispatch fails after the domain mutation commits, the event row
   exists but **no workflow starts**, with no retry. Workflow *start* is therefore
   **not at-least-once**. (Resumption of already-started runs *is* covered by the
   tick.)
2. **Dispatch on the write path.** Fan-out + `erp_workflow_start` runs inside the
   originating mutation's request, adding latency to high-volume entities (orders,
   invoices) and coupling business latency to workflow complexity.
3. **No event-bus retention/partitioning.** `erp_events` is append-only and grows
   unbounded; high event volume needs retention/partitioning (confirm coverage by
   `0119_retention_cleanup`).
4. **Config-as-JSON in the builder.** Automated-step config is free-form JSON
   validated only server-side (per-field inspector forms are the queued follow-up).
5. **Limited parallel-approval surface.** Quorum exists in the engine; builder UI
   is thin.

---

## 3. Technical Debt

- **N+1 writes** in `saveGraph` (per-row "park step_no" loop), `saveLayout`, and
  `copyStepsRemapped` — fine for ≤ dozens of steps, O(N) round-trips otherwise.
  Candidate for a single bulk RPC.
- **Swallowed failures = observability blind spots.** `recordEvent` logs to
  `console.error` only; no metrics/dead-letter for missed dispatch, egress denials,
  or tick errors.
- **Egress rules have no admin UI** (data-layer managed).
- **Tick summary is returned but not persisted** — no run/SLA metrics store.
- **Canvas not load-tested** beyond modest graphs.

---

## 4. Performance Risks

- **Write-path latency** from inline dispatch (see §2.2).
- **Tick batch ceiling:** `BATCH=100` every 5 min ⇒ ~1.2k delayed-run resumptions/
  hour and up to ~5-min timer granularity — coarse for SLA-sensitive or bursty
  timers.
- **N+1 batch saves** on large graphs / template clones.
- **Canvas rendering** untested at 100+ nodes (React Flow is capable but
  unverified here).

---

## 5. Scalability Risks

- **Tick concurrency / double-processing.** `listDueRuns` selects due runs with **no
  row claiming/locking** (`FOR UPDATE SKIP LOCKED` or a `claimed_at`). Overlapping
  tick invocations (cron retry, manual + cron) could process the same run twice.
  Idempotency partly protects start (`uq_wf_instance_active`), but step side
  effects (notify/api_call) are **not idempotent** — at-least-once execution could
  double-fire effects.
- **Single-stream tick** processes sequentially; no sharding/queue for high run
  volume.
- **Unbounded `erp_events`** growth (see §2.3).

---

## 6. Multi-Tenant Risks

- **Strong baseline:** RLS via `erp_user_company_id()`/`erp_is_company_admin()`/
  `erp_is_platform_owner()`, all policies `(select auth.uid())`; tick **always
  impersonates** the run's tenant user.
- **Risk — actor-less runs are skipped.** Event-triggered runs without a
  `started_by` are **not resumed** by the tick (no safe identity to impersonate).
  Without a defined **system service principal per tenant**, system-initiated
  delayed/escalated workflows can stall. (Correctness/operability gap.)
- **Global templates** are intentionally cross-tenant (read-only); confirm
  `erp_workflow_egress_rules` are **tenant-scoped** so one tenant cannot use
  another's approved connectors.

---

## 7. Security Risks

- **Good:** `CRON_SECRET` gate on the tick; service role only server-side;
  deny-by-default egress mitigates SSRF; impersonation is purpose-scoped; condition
  DSL is non-`eval`.
- **Watch:**
  - `api_call` **headers/body may carry secrets**; ensure they are not logged in
    audit payloads and are referenced via a secret store, not inline literals.
  - **Swallowed dispatch errors** could mask a security-relevant failure (e.g., an
    approval workflow silently not starting) — needs alerting.
  - Egress rules need **change-audit + admin UI** to prevent quiet allow-list
    widening.
  - Confirm `update_record` allow-list cannot target sensitive tables (auth,
    billing) and that patches are column-scoped.

---

## 8. SmartSync Impact

- **Builder is online-only** (correct); **runtime is event-driven**, so
  offline-reconciled records trigger workflows on sync.
- **Risk — reconciliation bursts.** A batch of reconciled mutations each call
  `recordEvent` → **inline dispatch on the reconcile request**, which can spike
  latency/load and start many workflows synchronously. An async dispatch sweep
  (see §11.1) would absorb this far better.
- **Ordering:** events dispatch in reconcile order; cross-record ordering guarantees
  are not defined — acceptable for independent approvals, but document it.

---

## 9. Future Extensibility

- **High.** New verbs = one executor in the shared registry (`validate` + audited
  `execute`); new triggers = catalog events (incl. future **timer/cron "events"**);
  **sub-workflows** can be a node that emits a start event (composition, not a
  sub-engine). Versioning/templates/simulation already generalize.
- **Constraint to preserve:** keep the executor set closed and central; resist
  module-local runners (guardrails in the Reuse Strategy).

---

## 10. Reuse Opportunities (per module — no new engines)

- **CRM:** lifecycle/visit follow-ups on existing `customer.*` / `visit.*` events
  — zero new code.
- **Finance:** credit/trade-spend/invoice-void/payment-exception approvals via
  existing + a few new events; `api_call` to finance connectors (egress-governed).
- **Inventory:** near-expiry, transfer approval, count-review on `stock_transfer.*`
  + new `inventory.*` events; `delay` reminders.
- **Procurement:** purchase-request/PO/supplier-onboarding via new `purchase.*`
  events; `task` + `api_call`.
- **HR:** leave/expense/onboarding via new `hr.*` events; `escalation` + SLA.
- **Governance:** policy sign-off, SoD gates, audit routing, attestations; immutable
  versioning *is* the audit trail.
- **Service:** ticket routing/escalation/SLA via new `ticket.*` events.
- **Common enabler/risk:** every module above relies on **reliable event
  dispatch** — which is exactly the §11.1 gap. Fixing it unblocks all reuse at
  production scale.

---

## 11. What to improve before "production-grade"

Ordered by priority (all additive — no redesign):

1. **Make workflow start at-least-once.** Add dispatch tracking to `erp_events`
   (e.g., `dispatched_at`/status) and a **tick sweep that dispatches undispatched
   events**, decoupling dispatch from the user request path. Closes §2.1, §4.1,
   §8 burst risk in one move.
2. **Claim due runs safely.** `FOR UPDATE SKIP LOCKED` or a `claimed_at` lease in
   `listDueRuns` to prevent double-processing (§5.1) — important because step
   effects are not idempotent.
3. **Define per-tenant system principals** so actor-less, event-triggered runs
   resume on the tick (§6 gap).
4. **Idempotency for side-effecting steps** (notification/api_call/update_record):
   an effect key per (instance, step, attempt) to make at-least-once safe.
5. **Event retention/partitioning** for `erp_events` (confirm/extend `0119`).
6. **Observability:** metrics + dead-letter for swallowed dispatch failures, egress
   denials, tick errors; persist tick/SLA summaries.
7. **Replace N+1 batch saves** with a bulk `saveGraph` RPC.
8. **Tighter/dynamic tick cadence** (or a queue) for SLA-sensitive timers.
9. **Per-field inspector forms** + client-side config shape hints (queued).
10. **Egress-rules admin UI + secret handling**; verify `update_record`/egress
    allow-lists exclude sensitive targets and are tenant-scoped.
11. **Load-test** the canvas (100+ nodes) and the tick under high run volume.

---

## Closing

The foundations are sound and the "one engine" discipline is real in the code.
The path to production-grade is **hardening the event-delivery and tick-execution
guarantees** (items 1–4) plus retention/observability — not architectural change.
Recommend addressing §11.1–§11.4 before any module track depends on workflow at
production scale.

*Review only — no code was changed and no new module was started.*
