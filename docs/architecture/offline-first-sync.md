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

## 14. Open decisions (need owner input)
1. Outbox capture: **DB triggers (recommended)** vs data-layer wrapper.
2. Cloud transport: extend `/api/v1/[entity]` vs a dedicated `/api/sync` batch
   endpoint (recommended for cursors + batching).
3. Identity reconciliation in online mode (local vs cloud user ids) — needs the
   auth model finalized.
4. Which entities are append-only vs LWW vs merge (the §8 matrix is a proposal).
