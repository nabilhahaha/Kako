# VANTORA — Offline-First Sync & Cross-Platform Architecture

Status: **DESIGN + foundational implementation** (workstream parallel to the macOS RC).
Scope: Windows desktop packaging · offline-first synchronization · desktop online
mode with local persistence. **This document and the `src/lib/sync/*` core do NOT
change current RC behavior** — nothing here is wired into the running app yet; the
sync core is standalone and unit-tested. Schema is proposed SQL, not an applied
migration.

---

## 1. Goals / Non-goals

**Goals**
- One business-logic codebase across **web, macOS, Windows**.
- **Local-first writes:** every mutation is durable locally before anything else.
- **Automatic sync when online; uninterrupted work when offline;** queued ops
  drain automatically on reconnect.
- **No data loss** and **no duplicate submissions** (exactly-once *effect*).
- **Documented conflict handling.**

**Non-goals (now)**
- Real-time multi-writer collaboration / CRDw merge of free-text.
- Changing the current macOS RC behavior (the pure-offline edition stays as-is).
- Mandatory licensing enforcement (remains vendor-opt-in per the RC decision).

---

## 2. Runtime modes

The same Next.js app + same server actions run in three modes, distinguished by
where `supabase-js` points and whether a sync engine is active:

| Mode | Data target | Sync engine | Status |
|------|-------------|-------------|--------|
| **Web / cloud** | cloud Supabase | n/a (already online) | shipping |
| **Desktop offline edition** | local Postgres+PostgREST (`127.0.0.1:54331`) | **none** (island) | **current RC — unchanged** |
| **Desktop online mode (NEW)** | local Postgres+PostgREST **first**, cloud Supabase via sync | **active** | this workstream |

The NEW mode is the union: it boots the same local stack as the offline edition
(so it works with no network), **and** runs a sync engine that reconciles the
local DB with the cloud. It is selected by a build/runtime flag
(`KAKO_SYNC=1`), orthogonal to `KAKO_OFFLINE`. When `KAKO_SYNC` is unset the
engine never starts — guaranteeing the current RC is untouched.

## 3. Shared business logic — the seam that already exists

Mutations today flow through **server actions** (`'use server'`) that call
`createClient()` (supabase-js) → `.from().insert()/.rpc()`. The SAME action runs
in all modes; only the client's base URL differs (cloud vs the local gateway).
This is the seam we extend — we do **not** fork business logic per platform.

Offline-first is added **below** that seam, at the data-gateway layer, not inside
every action:
- In **online desktop mode**, writes still hit the **local** gateway (local-first,
  works offline). A DB-level mechanism (trigger or the gateway route) records each
  committed mutation into a **sync outbox**. Actions are unchanged.
- A separate **sync engine** (client-side worker) drains the outbox to the cloud
  and pulls cloud changes back — entirely outside the request path, so a slow or
  absent network never blocks a user action.

This keeps "every transaction written locally first" true **by construction**: the
action's only synchronous dependency is the local Postgres commit.

## 4. Data model additions (proposed SQL — NOT yet a migration)

Per-row sync metadata on every synced table (added by a future migration, e.g.
`02xx_sync_columns.sql`):

```sql
-- On each syncable table (erp_invoices, erp_payments, erp_customers, ...):
ALTER TABLE erp_invoices
  ADD COLUMN sync_version    bigint      NOT NULL DEFAULT 1,   -- bumped each write
  ADD COLUMN sync_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN sync_origin     text        NOT NULL DEFAULT 'local', -- 'local'|'cloud'
  ADD COLUMN sync_deleted     boolean     NOT NULL DEFAULT false;   -- tombstone
```

The durable local journal (the heart of no-data-loss):

```sql
CREATE TABLE sync_outbox (
  id             bigserial PRIMARY KEY,
  entity         text        NOT NULL,             -- table/entity key
  op             text        NOT NULL CHECK (op IN ('insert','update','delete')),
  pk             text        NOT NULL,             -- target row id
  client_op_id   uuid        NOT NULL,             -- idempotency key (see §6)
  base_version   bigint,                            -- row sync_version the change was based on
  payload        jsonb       NOT NULL,             -- the row image / patch
  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','inflight','synced','failed','conflict')),
  attempts       int         NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_op_id)                            -- dedupe at the source
);
CREATE INDEX ix_sync_outbox_due ON sync_outbox (status, next_attempt_at);

-- Pull cursor + per-entity high-water marks.
CREATE TABLE sync_state (
  entity     text PRIMARY KEY,
  cursor     text,                                  -- opaque server cursor (e.g. max sync_updated_at)
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Outbox population options (decision in §13): **(A)** DB `AFTER INSERT/UPDATE/DELETE`
triggers on syncable tables (capture is automatic, can't be forgotten), or **(B)**
a thin wrapper in the data layer. We recommend **(A)** — triggers make local-first
capture exhaustive and immune to a new action forgetting to enqueue.

## 5. Sync engine

A client-side worker (runs in the desktop shell; could also be a Rust task) with
two pumps, both idempotent and resumable:

**Push (local → cloud)**
1. `takeBatch`: claim N `pending`/due `failed` outbox rows → mark `inflight`.
2. `transport.push(ops)` → cloud applies each with its `client_op_id` as the
   idempotency key (unique index ⇒ replay is a no-op).
3. Per-op result:
   - `ok` → `markSynced` (delete or archive the outbox row).
   - `conflict` (server row `sync_version` ≠ `base_version`) → run §8 policy →
     either re-enqueue a merged op, or accept server (`applyRemote` + drop op).
   - `error` → `markFailed` with exponential backoff (`next_attempt_at`).

**Pull (cloud → local)**
1. `transport.pull(cursor)` → changes since cursor (rows with `sync_updated_at >`
   cursor), plus a new cursor.
2. For each remote row: if a **pending local op** exists for that pk → §8 conflict;
   else apply (upsert/tombstone) with `sync_origin='cloud'` (so the trigger does
   **not** re-enqueue it — origin guard prevents echo loops).
3. Persist the new cursor in `sync_state` only after the batch is durably applied.

**Triggers to run a cycle:** on reconnect (`online` event), on a debounced
local-write signal, on an interval (e.g. 15s while online), and on app
foreground/launch.

## 6. Idempotency — no duplicate submissions (exactly-once *effect*)

We reuse the pattern already in the codebase (`erp_invoices.idempotency_key` +
unique partial index `uq_erp_invoices_idem`, mirrored for payments):

- Every outbox op carries a stable **`client_op_id` (uuid)** generated at write
  time — the same value used as the row's `idempotency_key`.
- The cloud apply path upserts keyed on `client_op_id`; the unique index makes a
  retried/duplicated push a no-op. So "send twice" ⇒ "applied once."
- Because the id is generated **before** the local commit and stored with both the
  row and the outbox entry, a crash between local-commit and push cannot create a
  second logical record on the next attempt.

This generalizes the existing per-entity idempotency to *all* synced entities.

## 7. No-data-loss guarantees

- The mutation is durable in **local Postgres** before the action returns; the
  outbox row is written **in the same transaction** as the business write
  (trigger-based capture) ⇒ no window where a committed change lacks an outbox
  entry.
- Outbox rows are deleted/archived **only after** the cloud acks the
  `client_op_id` ⇒ at-least-once delivery; the idempotency key makes redelivery
  safe ⇒ at-least-once + dedupe = exactly-once effect.
- `failed` ops retry with capped exponential backoff; after `MAX_ATTEMPTS` they go
  to a visible **dead-letter** state (status stays `failed`, surfaced in a Sync
  status UI) — never silently dropped.
- Pull cursor advances only after the batch is durably applied ⇒ a crash mid-pull
  re-fetches, never skips.

## 8. Conflict handling (documented requirement)

Conflicts are detected by **optimistic version check**: an op carries the
`base_version` it was derived from; if the server row's `sync_version` advanced in
between, it's a conflict. Resolution is **per-entity policy** (a single registry,
`src/lib/sync/policy.ts` in a later phase):

| Entity class | Policy | Rationale |
|--------------|--------|-----------|
| Immutable ledger events (invoices once *issued*, payments, stock moves, audit) | **Append-only / server-authoritative** — never update in place; corrections are new compensating documents | Financial integrity; avoids destructive merges |
| Mutable master data (customers, suppliers, products) | **Last-Write-Wins by `sync_updated_at`** (tiebreak: higher `sync_version`, then `sync_origin='cloud'`) | Simple, deterministic; rare real conflicts |
| Field-scoped editable docs (draft orders, settings) | **Field-level merge** — non-overlapping fields merge; overlapping fields use LWW | Preserves concurrent edits to different fields |
| Counters / sequences (invoice numbers) | **Server-allocated** — never invented offline; local uses a provisional `LOCAL-####`, replaced by the server number on sync | No number collisions across devices |

Algorithms (implemented & unit-tested in `src/lib/sync/conflict.ts`):
- `last-write-wins(local, remote)` → newer `updatedAt` wins; deterministic
  tiebreak so two devices converge to the **same** winner.
- `field-merge(base, local, remote)` → per-key: if only one side changed vs base,
  take it; if both changed, LWW on that key.
- `server-wins` / `client-wins` → explicit overrides.
Every resolution returns a `reason` for the audit log; unresolved
append-only conflicts are recorded as compensating entries, never overwrites.

Convergence property: resolution is a **pure, commutative, deterministic** function
of (local, remote) — both peers compute the same winner regardless of order, so the
system converges without a coordinator.

## 9. Connectivity detection & queue drain

- Online signal = `navigator.onLine` **AND** a lightweight reachability ping to a
  cloud health endpoint (onLine alone lies on captive portals).
- On `offline` → engine parks (writes keep flowing to local + outbox).
- On `online` → immediate drain cycle, then resume the interval.
- All transitions logged; a **Sync status** indicator (synced / N pending /
  offline / error) is surfaced in the top bar (later phase).

## 10. Sequence flows

```
WRITE (online desktop, network down):
  user → server action → local PG commit (+ outbox row, same txn) → returns OK
  (user keeps working; nothing blocks on network)

RECONNECT:
  online event → engine.syncOnce()
    push: takeBatch → transport.push (client_op_id idempotent) → markSynced
    pull: transport.pull(cursor) → applyRemote (origin=cloud, no re-enqueue) → setCursor

CONFLICT (same customer edited on two devices):
  push op base_version=5; server row now version=7 → conflict
    → policy LWW(local, remote) → deterministic winner
    → loser side: applyRemote OR re-enqueue merged op; reason logged
```

## 11. Windows desktop build & packaging (Item 1)

Current state: `src-tauri/tauri.conf.json` already targets `nsis`;
`scripts/offline/windows/fetch-binaries.ps1` stages app scripts + migrations and
documents the manual sidecar steps. To reach parity with macOS:

1. **Sidecars** (`fetch-binaries.ps1`, to automate): PostgreSQL 17 x64
   (bin/lib/share → `resources/pgsql`), PostgREST windows release
   (`postgrest-x86_64-pc-windows-msvc.exe`), Node
   (`node-x86_64-pc-windows-msvc.exe`) → `src-tauri/binaries`.
2. **Shell**: `main.rs` is already cross-platform (uses `current_exe()` for the
   node sidecar; `winreg`/SMBIOS fingerprint behind `cfg(windows)`). Verify the
   externalBin name resolves on Windows (`node-<triple>.exe`).
3. **Process lifecycle**: the RT-1/RT-3 fixes (detached children + PID-file
   teardown) must be validated on Windows — `process.kill(pid,'SIGTERM')` maps to
   `TerminateProcess`; confirm clean port release. Consider a Windows job object
   for guaranteed child cleanup.
4. **Bundle/sign**: NSIS `perMachine` (already set). Add Authenticode signing in
   `scripts/release/windows.ps1` (sign every staged `.exe` + the installer).
5. **CI**: re-enable the commented Windows matrix leg in `release.yml` on a
   `windows-latest` runner; gate on signed installer + updater manifest.

Packaging risks: PostgreSQL on Windows wants the VC++ runtime; `initdb`/`pg_ctl`
path quoting; antivirus false-positives on unsigned sidecars (⇒ sign early).

## 12. Online mode with local persistence (Item 3)

This is mode #3 in §2, realized by: boot the local stack (as offline edition) +
start the sync engine (`KAKO_SYNC=1`). The app reads/writes **local** always
(instant, offline-tolerant); the engine mirrors to/from cloud in the background.
Login/auth in this mode: local auth for the working session; cloud identity is
reconciled by the sync layer (cloud user ids are the canonical ids stored locally,
so pushed rows reference valid cloud FKs).

## 13. Phased rollout

- **P0 (this PR):** design doc + pure sync core (`types`, `conflict`, `outbox`,
  `engine`) with unit tests. Inert — not imported by the app.
- **P1:** schema migration (`sync_outbox`, `sync_state`, per-row sync cols) +
  capture triggers, behind `KAKO_SYNC`. Cloud apply endpoint reusing
  `/api/v1/[entity]` ingest + `client_op_id` idempotency.
- **P2:** wire the engine into the desktop shell (background worker + connectivity
  detection + Sync status UI). Validate no-loss/no-dup with fault injection.
- **P3:** Windows packaging to parity (automate sidecar fetch, sign, CI leg).
- **P4:** conflict-policy registry per entity + audit of resolutions; pilot.

## 14. Decisions (LOCKED by owner)
1. **Outbox capture:** DB triggers (server/desktop Postgres). In the *browser*
   online edition the capture is the client write-seam (`WebLocalStore.enqueue`)
   that records every mutation locally-first into the IndexedDB outbox.
2. **Cloud transport:** dedicated **`/api/sync`** endpoint (`/push` + `/pull`),
   batched + cursor-based.
3. **Identity reconciliation:** the **cloud User ID is the source of truth**;
   local rows reference cloud user/company ids so pushed rows carry valid FKs.
4. **Entity conflict matrix:** Visits = append-only · Orders = append-only ·
   Audit logs = append-only · Customers = field-merge · Products = LWW (cloud
   wins) · Settings = LWW (cloud wins) · Inventory counts = conflict-review
   workflow.

## 15. Online (web) edition — implemented (behind `KAKO_SYNC`, inert)

Online-first, offline-safe: writes go to a durable local outbox first; a
background orchestrator mirrors them to the cloud whenever connectivity allows.
Imported only when `KAKO_SYNC` is enabled — current online app is unchanged.

**Modules (`src/lib/sync/web/`):**
- `client-op-id.ts` — stable per-op idempotency key (uuid), reused across retries
  → exactly-once effect on the server.
- `idb.ts` + `web-store.ts` — `WebLocalStore` (IndexedDB): durable outbox, local
  mirror of synced rows, pull cursors. Survives refresh / browser close / restart.
  A **unique index on `clientOpId`** is the first anti-duplicate guard;
  `reclaimInflight()` recovers work interrupted mid-push. Implements the engine's
  `LocalStore`; `enqueue()` is the write-seam.
- `status.ts` — five-state badge (**Online · Offline · Syncing · Synced · Sync
  failed**): pure `deriveStatus` + a `useSyncExternalStore`-compatible store.
- `transport.ts` — `WebTransport` → `POST /api/sync/push` + `GET /api/sync/pull`.
- `orchestrator.ts` — connectivity (navigator.onLine + online/offline) +
  automatic backoff-retrying push/pull; publishes status; drains on reconnect.
  Connectivity/timers injectable for tests.
- `backup.ts` — local backup/export of the outbox + synced-row mirror with
  metadata (timestamp, user, company, entity, sync status, operation id).

**No-duplicates (defence in depth):** (a) unique `clientOpId` index in the
outbox; (b) engine `dedupeByClientOpId` per batch; (c) server `/api/sync` dedupe
on `client_op_id` (UNIQUE) — designed, applied in P2.

**Server `/api/sync` + migration — DESIGNED, NOT APPLIED (needs review, §7):**
`sync_ingest(client_op_id uuid PK, entity, pk, applied_at)` for server-side
exactly-once; per-entity apply per the §14 matrix; cursor = monotonic seq. No
migration is run in this PR.

**Validation → tests (`src/lib/sync/web/*.test.ts`, all green):** offline
create/update (durable pending) · browser-refresh persistence (reopen DB) ·
reconnect sync · retry-without-duplicates incl. **lost-ACK** (row count stays 1) ·
failed-sync recovery (backoff→success) · push-time conflict (server-wins, no
loss). Pure conflict + engine conflict covered by P0 tests.

## 16. Phased rollout (updated)
- **P0 (done):** design + pure core + tests.
- **P1 (done):** browser durable outbox + status + transport + orchestrator +
  backup + full client-side validation scenario — behind `KAKO_SYNC`, inert.
- **P2 (done):** `/api/sync` push/pull/backup + review-only migration + status
  badge + cloud backup; server apply (exactly-once + §14) tested.
- **P3 (done):** local-first write-seam (`recordMutation`) + inventory review UI
  + Sync console (`/settings/sync`). All behind `KAKO_SYNC`.
- **P4 (in progress):** reviewed migration validated on an isolated Supabase branch
  (server contract: exactly-once, LWW, conflict park+resolve, monotonic pull cursor,
  RLS, cloud-backup snapshot — all green; branch torn down, production untouched);
  write-seam call-site rollout complete (checklist §17); remaining: real-cloud
  fault-injection on a preview deploy and Windows packaging parity.

## 17. Write-seam call-site rollout (checklist)
`recordMutation()` is the local-first seam (no-op unless `KAKO_SYNC`). Each call-site
fires after the server action succeeds, with a reliable pk + representative payload.
- [x] POS checkout (`market/pos/cashier-terminal.tsx`) — orders / append-only
- [x] Wholesale order (`wholesale/order/wholesale-order.tsx`) — orders / append-only
- [x] customers create/update (`customers/customers-manager.tsx`) — field-merge
      (`upsertCustomer` now returns the new id on create; update uses the form id)
- [x] products: style + variant create (`fashion/products/products-manager.tsx`) — LWW
      (`createVariant` now returns the catalog product id)
- [x] settings save (`settings/store/store-form.tsx`) — LWW (pk = company id)
- [x] visits create (`clinic/visits/visits-manager.tsx`) — append-only
      (`createVisit` now returns the new visit id)
- [x] inventory counts finalize (`inventory/count/stock-count-manager.tsx`) — review workflow
- [x] sales invoices create + issue (`sales/invoices/invoices-manager.tsx`) — append-only (`sales_invoices`)
- [x] sales returns create + complete (`sales/returns/returns-manager.tsx`) — append-only (`sales_returns`)
- [x] collections / customer payments (`sales/invoices` PaymentDialog) — append-only
      (`customer_payments`; pk = the dialog's stable idempotency key)

New entity keys added to the §14 policy registry (`src/lib/sync/policy.ts`), all
**append-only** as immutable ledger documents: `sales_invoices`, `sales_returns`,
`customer_payments`.

Helper: `formPayload(formData, omit)` (in `web/write-seam.ts`) builds a sync payload
from a form's scalar fields (skips File attachments and the pk field); unit-tested.

Known follow-up (P4): the inventory-counts review path passes no `baseVersion` yet
(the client doesn't track `sync_version`), so the server only parks a count when the
cloud row genuinely diverges via the optimistic check — fine for the pilot's
single-counter flow; wire `baseVersion` from the local mirror when multi-device count
editing lands.

## 18. Offline-safe UX layer (browser) — implemented behind `KAKO_SYNC`
The sync *engine* keeps writes durable; this layer makes the *experience* offline-safe
so a dropped connection never shows a generic error or blanks a usable page. All of it
is inert with the flag off (production unchanged).

- **Offline-aware error boundary** (`src/app/(app)/error.tsx`): when a failure looks
  like connectivity (navigator offline, or a fetch/RSC/Server-Action network error) it
  degrades to a friendly "You're offline" card instead of the generic error, skips the
  Sentry report, and **auto-recovers** by calling `reset()` on the `online` event. With
  the flag off it behaves exactly as before.
- **Non-blocking offline banner + nav guard** (`src/components/sync/offline-shell.tsx`):
  `OfflineBanner` shows a slim notice (with the pending count) while the loaded page stays
  usable underneath; `OfflineNavGuard` intercepts internal link navigations while offline
  so the destination's failing server fetch can't trip the boundary — the user keeps the
  current page. Both read the existing `SyncStatusStore` (Online · Pending · Syncing ·
  Synced · Sync-failed) — requirement-7 state is surfaced by the `SyncBadge` + banner.
- **Offline-safe writes** (`src/lib/sync/web/submit-offline.ts`):
  - `submitOffline({action, mutation})` — runs the cloud action; on a network rejection it
    journals the mutation to the outbox (client-generated pk for inserts) and returns a
    synthetic offline-success, so the orchestrator replays it on reconnect.
  - `submitOnlineOnly(action)` — for flows that must NOT happen offline: on a network
    rejection it returns a non-fatal `{ ok:false, offline:true }` (caller shows a
    "reconnect to save" toast, keeps the form) and journals **nothing**.
  - Both are exact passthroughs when the flag is off (real network errors surface as today).

**Owner's hybrid policy (operational continuity without risking financial integrity):**

| Offline-queue + auto-sync (`submitOffline`) | Require online (`submitOnlineOnly`) |
|---|---|
| POS checkout — `market/pos/cashier-terminal.tsx` | Official invoices create/issue — `sales/invoices` |
| Wholesale order — `wholesale/order/wholesale-order.tsx` | Customer payments / collections — `sales/invoices` PaymentDialog |
| Customer create/update — `customers/customers-manager.tsx` | Financial returns create/complete — `sales/returns` |
| Clinic visit register — `clinic/visits/visits-manager.tsx` | Stock-count finalize (stock-affecting) — `inventory/count` |
| GPS visit check-in — `field/journey/journey-screen.tsx` | Attachments/photos upload — `components/shared/attachments.tsx` † |
| Field survey observations — `field/survey/[customerId]` (`survey_response`) | |

† Photos are binary uploads to Supabase Storage; the JSON outbox can't carry file bytes
yet, so uploads are require-online for now. A **blob-capable outbox** (store the file in
IndexedDB, replay the multipart upload on reconnect) is the follow-up to make photos truly
offline-queue.

**⚠ Architectural caveat (offline-created records):** journaled offline writes land in the
cloud **`sync_rows` mirror** on reconnect. Until the mirror→business-tables reconciliation
(§15 P3) is built, an offline-created order/visit/customer/survey syncs to the mirror but
does **not** yet materialize as the corresponding `erp_*` row / appear in business reports.
The offline-queue set was chosen precisely because those entities are append-only / low-risk
operational captures; **financial + stock-affecting flows are require-online** so no money or
inventory movement is ever recorded into an unreconciled mirror. Building the reconciliation
worker is the gate before the offline-created operational records become fully "real".

**Validation (§9 scenarios):** engine-level coverage in `web/scenario.test.ts`
(offline create → refresh persistence → reconnect drain → sync) and
`web/submit-offline.test.ts` (online journal · flag-off passthrough · offline journal with
client pk · genuine-error rethrow); status states in `web/status.test.ts`. Real-browser
pass on the preview (page loaded → disconnect → navigate → create → refresh → reconnect →
auto-sync) is the remaining manual gate, with `KAKO_SYNC` enabled on the preview.

## 19. Reconciliation worker — `sync_rows` → business tables (resolves the §18 caveat)
Closes the loop: offline-created operational records in the mirror become **real**
business rows automatically after sync. Behind `KAKO_SYNC`; migration `0002` is
review-only (under `docs/`).

**Architecture.** A pure engine (`src/lib/sync/server/reconcile.ts`) over an injected
`ReconcileDeps` + a per-entity `ReconcileHandler` registry — same testable shape as
`applyPush`. Backed by migration `0002_sync_reconcile.sql`:
- `sync_reconcile` — per-(company,entity,pk) ledger: `status` (pending/done/failed/
  skipped), `business_id`, `attempts`, `last_error`, `reason`, `next_attempt_at`. PK
  makes processing exactly-once and is the **clear status** surface (RLS-guarded read).
- `sync_reconcile_log` — append-only **audit trail** of every attempt.
- `sync_reconcile_due(entities, limit)` — claims mirror rows with no ledger row, or
  `failed`/`pending` past their backoff (ordered by mirror `seq`).
- `sync_reconcile_mark(...)` — atomic ledger upsert + audit-log append.
Wired to Supabase in `reconcile-deps.ts`; driven by the cron route
`/api/sync/reconcile` (service-role, `CRON_SECRET`, 404 when the flag is off),
scheduled every 15 min in `vercel.json`.

**Materialization.** Single-table operational entities use the **offline client uuid as
the business row id** (`upsert … on conflict (id) do nothing`), so a replay — or a crash
between materialize and `markDone` — can never double-create. Reference handler:
`customers` → `erp_customers` (validated end-to-end on an isolated branch). `visits`,
`survey_response` follow the same column-mapped pattern once their maps are confirmed.

**Flow.**
```
cron → reconcile():
  due(entities, N) ──> for each mirror record:
     ledger 'done'?  ──yes──> skip (exactly-once)
        │no
     handler? ──no──> markSkipped('no-handler')      (parked, visible, retriable)
        │yes
     materialize(rec)  (idempotent: id = offline uuid)
        ├─ ok    → markDone(businessId)               → erp_* row + ledger 'done' + log
        └─ throw → markFailed(attempt, backoff)        retry … → dead-letter at attempt 6
```

**Failure handling.** Per-record isolation (one failure never blocks the batch);
capped exponential backoff (30s·2ⁿ, max 1h) via `next_attempt_at`; **dead-letter** to a
visible terminal `failed` (`reason='dead-letter'`, parked far-future) after 6 attempts —
never silently dropped; every attempt audited. No-handler entities are parked `skipped`
(not faked done) so adding a handler later resumes them. **Branch-validated on real
cloud:** offline customer materialized into `erp_customers`; replay produced **no
duplicate**; `done` excluded from the due feed; failed-past-backoff re-claimed; dead-letter
parked; audit row written.

**Orders/invoices (financial) — implemented + branch-validated.** Offline POS + wholesale
orders materialize into real `erp_invoices` through the **exact same audited logic** as the
online path. No accounting/stock/numbering was re-implemented:
- `createInvoice/issueInvoice/recordPayment` and `cashierCheckout/wholesaleInvoice` were
  split into session-decoupled **cores** (`src/lib/erp/sales/{invoice,cashier}-core.ts`);
  the server actions are now thin session wrappers over them. All money movement stays in
  the DB RPCs `erp_next_number` / `erp_issue_invoice` (stock-out + AR/Revenue journal +
  balance) / `erp_record_payment`.
- **Idempotency:** `createInvoiceCore` dedupes on `idempotency_key = mirror pk`;
  `erp_record_payment` dedupes on the same uuid; the checkout is **resumable** (issues only
  a still-`draft` invoice) so a retry after a partial failure continues without duplicating.
- **Identity / audit:** `erp_issue_invoice` gates on `auth.uid()` for branch access and
  stamps `created_by` on stock movements, so the worker runs **as the originating cashier**
  (`createUserScopedClient` mints a short-lived JWT from the `created_by` captured in the
  offline payload). RLS still applies — strictly safer than a service-role bypass and it
  preserves audit attribution. Online-created sales are mirrored too (pk = real invoice id,
  no `offline` flag) — the handler confirms and marks those done without re-creating.
- **Validated end-to-end on an isolated branch** (then torn down): offline POS order → 2 @ 50
  → invoice `INV-…-000001` issued+`paid`; stock `100 → 98` with one `sale_out` movement
  attributed to the cashier; one journal entry; cash-customer balance nets to 0; one payment
  row (100.00). **Replay (same pk): 1 invoice, stock still 98, paid still 100, 1 movement,
  1 journal — a complete no-op.** Requires `SUPABASE_JWT_SECRET`; if unset the handler fails
  closed (records stay retriable, never wrong data).
