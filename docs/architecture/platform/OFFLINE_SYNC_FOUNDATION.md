# VANTORA — Offline-First Field Sync Foundation (Architecture & Design)

**Status:** Architecture & design (priority 8). **No client engine built yet** — the
full offline sync engine is a **major architectural decision** (client storage, sync
protocol, conflict resolution) that warrants explicit owner sign-off before build. This
doc captures the design, the **already-present** server-side primitives it reuses, and
the additive landing model so implementation lands incrementally without redesign.
**Discipline:** additive-only · flags OFF (`KAKO_DISTRIBUTION` / a future `KAKO_OFFLINE`) ·
multi-company RLS + auditability intact · reuse-over-rebuild.

## Why a foundation doc (not a half engine)
Offline-first field execution is the one Phase-3.x item that is genuinely a **new
architectural surface** (a mobile/PWA client queue + a sync protocol + conflict policy).
Per the execution rules, a major architectural decision is a checkpoint — so we design
it and expose the additive server landing zone, rather than ship a partial engine that
would need redesign.

## Reuse baseline (already on `main`)
- **Idempotent creates** — `erp_invoices.idempotency_key` (unique) already makes invoice
  creation safe to retry; the same pattern extends to orders/visits/collections.
- **Provenance** — `erp_customers.created_source` / `updated_source` (and similar) record
  where a record originated (rep app vs back-office).
- **Event bus** — `erp_events` + `emitDomainEvent` (KAKO_EVENTS) gives async,
  at-least-once propagation with dispatch retry — the server-side half of a sync loop.
- **Integration ingest** — the `/api/internal/sync-tick` + `ingestRecord` path already
  does idempotent, company-scoped upserts from external systems; an offline client is
  just another source.
- **RLS + service-role intake** — the `/api/v1` + service-client pattern shows the
  authenticated, company-scoped write path a sync endpoint will reuse.

## Design (target)
```
Rep device (PWA/mobile)
  ├─ local store (IndexedDB/SQLite): queued mutations w/ client_uuid + base_version
  ├─ optimistic apply locally; mark pending
  └─ on connectivity → POST batch to /api/internal/offline-sync
                                   │
Server (authenticated, company-scoped, RLS)
  ├─ dedupe by client_uuid (idempotency) — replay-safe
  ├─ apply each mutation via the SAME server action/RPC paths (no bypass)
  ├─ conflict policy per entity: last-write-wins (visits/GPS), or reject+return-server-
  │   state (orders/collections — money), surfaced for rep re-confirm
  └─ ack each client_uuid (applied | conflicted | rejected) + emit domain events
```

### Additive server landing model (when greenlit)
- `erp_offline_mutations(id, company_id, client_uuid UNIQUE, device_id, salesman_id,
  entity, op, payload jsonb, base_version, status[pending|applied|conflicted|rejected],
  server_result jsonb, received_at, applied_at)` — RLS company/branch scoped; the
  dedupe + audit ledger of every offline operation. **Additive, idempotent on
  client_uuid.**
- Reuses `idempotency_key` on the target tables for the actual write safety.

### Conflict-resolution policy (per entity class)
| Entity | Policy | Rationale |
|--------|--------|-----------|
| Visit / GPS / check-in | last-write-wins (append) | observational; late sync still valid |
| Order / Invoice | idempotent create (client_uuid) | never duplicate a sale |
| Collection / payment | idempotent + server-balance recheck | money: reject if invoice state moved |
| Customer edit | base_version check → conflict surface | avoid clobbering back-office edits |

## Multi-tenant / audit
Every offline mutation carries `company_id` (from the authenticated session, never the
payload), is RLS-scoped, deduped by `client_uuid`, and logged — same guarantees as the
integration intake path. No tenant can replay into another's data.

## Phased build (each additive, flag-gated, owner-greenlit)
1. **`erp_offline_mutations`** landing table + the authenticated `/api/internal/offline-sync`
   intake (dedupe + apply via existing paths). *(needs the architectural sign-off below)*
2. Per-entity conflict policy + `server_result` ack contract.
3. Client queue (PWA/IndexedDB) + optimistic UI + retry/backoff.
4. Sync status surfacing for the rep + supervisor.

## Decision required (checkpoint)
The **client storage + sync protocol + conflict-policy defaults** are a product/architecture
decision (which entities are LWW vs reject-on-conflict; PWA vs native). Recommended:
start with **idempotent batch intake + per-entity policy table above**, LWW for
observational data, reject-on-conflict for money. Build begins once this is signed off.

*Design & backlog capture — no client engine or migration in this increment.*
