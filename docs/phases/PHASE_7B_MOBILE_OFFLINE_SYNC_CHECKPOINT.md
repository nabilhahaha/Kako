# Phase 7B — Mobile Field App: Offline Sync Foundation (Checkpoint)

**Status:** ✅ Foundation implemented · additive · flag-gated (`KAKO_MOBILE`, default OFF) ·
multi-tenant safe · audit-first · reuse-first. The offline-first **spine** for the mobile
field app (the PWA shell + client store + intake route build on this).

## Pure engine (`src/lib/offline-sync/`, 9 unit tests)
| Module | Capability |
|---|---|
| `queue.ts` | Deterministic ordering (per-device `client_seq`, causal) · **dedup by idempotency key** (exactly-once apply) · skip already-applied · batching |
| `conflict.ts` | Policy-driven resolution: **server-authoritative** for ledgered entities (invoice/collection/van cash/inventory → device can't overwrite) · **last-write-wins** with base-version match + field-merge by recency; `planApply` → apply/conflict/rejected |
| `types.ts` | OfflineMutation · ConflictPolicy + ledgered-entity defaults · ServerRecord |

## Schema (additive, RLS, FK-covering, idempotent)
- **0230** `erp_offline_mutations` — queued ops, **exactly-once** via `UNIQUE(company_id, idempotency_key)`, status pending/applied/conflict/rejected, causal `client_seq`/`client_ts`, `base_version`.
- **0230** `erp_device_sessions` — device audit (app version, platform, last sync, GPS).

## Reuse (not rebuilt)
Idempotency pattern (0118) · existing field surfaces become offline-capable over this queue
(visits/journey/GPS 0014/0129/0131, orders, collections 0192, returns 0219, surveys 0144,
route-riding 0212/0213, van-accounting 0229) · `erp_attachments` (0111) for media.

## Requirement coverage
Offline-first architecture (queue + exactly-once + conflict policy) ✓ · conflict handling
(server-authoritative for ledger; LWW field-merge for field data) ✓ · device audit trail ✓ ·
Android-first/PWA + offline synchronization + media compression = the **thin client layer** over
this engine (next increment). Check-in/out · GPS · route execution · order taking · collections ·
returns · surveys · photos · competitor tracking · customer-data updates · route-riding — all
become offline surfaces that enqueue mutations resolved by this engine.

## Validation
Typecheck 0 · build 0 · **1117 unit tests** (+9) · integration: offline-sync-schema (2) +
schema-health FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (the client layer)
PWA manifest + service worker (Android-first, installable, offline cache) · IndexedDB mutation
store + sync-status UI · `/api/internal/offline-sync` intake (validate → `planApply` → per-entity
write, idempotent) · client-side image compression before upload · device-scoped session tokens.

## Next: Phase 7C — Perfect Store Engine (depends on field-execution data).
