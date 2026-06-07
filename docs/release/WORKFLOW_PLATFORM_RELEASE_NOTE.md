# VANTORA — Workflow Platform Release Note

**Release:** Workflow Platform **V1 + V1.1** (hardening).
**Merged to `main`:** PR #126 (squash `7e29b53`), base `main` `690afa5`.
**Status:** Shipped, **flag-gated OFF** — zero behavior change until rollout.
**Law:** One Engine. One Runtime. One Builder. Execution owned by the Event Bus,
Workflow Engine, Runtime, and Executors.

---

## What shipped

A single, entity-neutral Workflow OS for the whole platform, landed independently
of the Desktop RC track (Option C decouple).

- **Engine + Runtime + Event Bus** — `erp_workflow_*` tables/RPCs (extended, not
  duplicated), pure `advanceRun` over a **9-type executor registry** (approval,
  reject, condition, notification, task, update_record, api_call, delay,
  escalation), condition DSL, dispatcher + `erp_events` bus, `api_call` egress
  allow-list, per-actor impersonation, full audit.
- **Workflow Builder (Phase 1, forms)** — List · Details (Overview/Trigger/Steps/
  Versions/Simulate) · Templates (Global/Company/Private) · Publish · Archive.
- **Workflow Canvas (Phase 2, React Flow)** — drag-&-drop visual layer over the
  same step rows: 9 node types, auto-layout, zoom-to-fit, mini-map, undo/redo,
  multi-select, keyboard-delete, read-only published view, unsaved-changes warning.
- **Templates · Versioning (immutable snapshots + instance pinning) · Simulation
  (dry-run via the real runtime).**
- **V1.1 hardening (C2/C3/C1)** — single-flight due-run claiming, effect-idempotency
  ledger, at-least-once dispatch sweep.

## Migrations (`0176–0184`, additive)

`0176` event/workflow foundation · `0177` step generalization · `0178` runtime
state · `0179` Phase A (decide_runtime + egress rules) · `0180`
publishing/versioning/templates · `0181` canvas layout (UI-only) · `0182` run
claiming · `0183` step-effects ledger · `0184` event dispatch tracking. All
additive; every new FK covered; all RLS policies use `(select auth.uid())`.

## Feature flags (all DEFAULT OFF)

| Flag | Enables |
|---|---|
| `KAKO_WF_CLAIM` (+ `KAKO_WF_CLAIM_LEASE_SECONDS`) | single-flight due-run claiming (C2) |
| `KAKO_WF_IDEMPOTENT` | effect-idempotency ledger (C3) |
| `KAKO_WF_DISPATCH_SWEEP` | at-least-once dispatch sweep (C1) |

With all flags unset, the platform behaves exactly as before this release.
**Recommended rollout order (per the approval doc): observability → C2 → C3 → C1**,
staging-soak each before production; never enable C1 before C2 + C3.

## Excluded (untouched, on their own track)

Desktop RC (PR #124 / `feat/auto-updater`), Tauri, Auto-Updater, print/export
desktop integrations, and the Offline Sync engine + write-seam. PR #125 (offline
sync) remains open and can be rebased/closed to Offline-Sync-only as a follow-up.

## Reuse

The engine is entity-neutral: CRM, Finance, Inventory, Procurement, HR, Governance,
and Service gain workflow automation by adding catalog events + allow-list entries +
authored definitions — **no new engine, runtime, executors, or builder**
(see `WORKFLOW_PLATFORM_V1_REUSE_STRATEGY.md`).

## Validation at merge

`tsc` clean · suite **745 passed / 24 skipped** (incl. 77 workflow tests) ·
production build clean (`/settings/workflows` 11.9 kB, canvas lazy-chunked) ·
migrations `0176–0184` validated on a pure-main Supabase branch and applied to
STAGING green via CI.

## Status freeze

Workflow Platform is **frozen and accepted** as a reusable platform capability. No
new workflow features/modules. Next platform priority to be decided in the
platform-priority review.

---

## Post-merge confirmation (verified)

- **`main` after merge — GREEN.** On `main` @ `7e29b53` both push workflows
  completed **success**: `CI` (Typecheck & build ✓, Integration tests DB ✓) and
  `E2E` ✓.
- **Workflow migrations applied as expected.** Confirmed three ways:
  1. **main CI / Integration tests (DB):** the "Build test database (bootstrap +
     migrations)" step applied the **full `0001–0184` chain** on a fresh Postgres
     and the integration tests (incl. schema-health invariants) passed ✓.
  2. **PR #126 "Apply migrations to STAGING":** `0176–0184` applied to the staging
     DB ✓ (on the exact tree that merged).
  3. **Pre-merge isolated Supabase branch:** `0176–0184` applied in order on a
     pure-`main` schema; FK-coverage + wrapped-`auth.uid()` invariants clean ✓.
- **Production apply:** remains the **guarded manual** step (skipped in CI), to be
  run when the platform is rolled out.
