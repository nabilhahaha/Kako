# Step 1 — Mobile Field Client: Completion Checkpoint

**Status:** ✅ **Offline field operation complete** for the foregrounded-offline scenario.
Additive · flag-gated (`KAKO_MOBILE`, default OFF) · multi-tenant RLS · server-authoritative ·
exactly-once · reuse-first. Closes the highest-priority competitive gap (offline operation) from
the SalesBuzz/SAP/Odoo/Dynamics gap analysis.

## What shipped (merged, CI-green)

| Increment | PR | Summary |
|---|---|---|
| PWA foundation | #232 | IndexedDB queue + intake (`/api/internal/offline-sync`) + exactly-once + apply-whitelist + `/field/offline` surface + network/battery hooks |
| Activation audit | #233 | Feature Activation Matrix; exposed orphaned dashboards (nav-only) |
| Status bar + GPS | #234 | App-wide `OfflineStatusBar` (queue/sync/network visibility) + best-effort GPS on sync |
| Visit check-in | #235 | Offline check-in → **Pending Validation**; replays `erp_check_in_visit` with captured time/day; verdict reconciliation (valid/out_of_route/gps_violation/blocked). Migration 0234 |
| Collections | #236 | Offline collections, **server-authoritative**; replays `collectPayment`/`erp_record_payment` exactly-once; no on-device GL/cash |
| Media capture | #237 | Visit photos (compressed) → own blob store → multipart intake; links to the **synced visit**; new `field.attach_media` perm. Migration 0235 |
| Surveys | #238 | Offline survey capture; replays `submitSurveyResponse` exactly-once |

## Offline intake coverage

| Entity | Path on sync | Validation model |
|---|---|---|
| `van_expense` | direct insert (`erp_van_expenses`) | accepted |
| `visit_checkin` | `erp_check_in_visit` RPC (captured time/day) | Pending Validation → valid / out_of_route / gps_violation / blocked |
| `collection` | `collectPayment` → `erp_record_payment` (idempotency key) | Pending Validation → accepted / rejected (server-authoritative; no device GL/cash) |
| `survey` | `submitSurveyResponse` (scored server-side) | accepted / rejected |
| media (photos) | `/api/internal/offline-media` → `uploadAttachment` | uploaded / pending (waits for visit to sync) / failed |

## Architecture invariants honored

- **Reuse-first:** every apply handler calls the *same* RPC/action as the online path — no forked
  business logic. The server stays authoritative; the device never finalizes ledgered state.
- **Exactly-once:** `erp_offline_mutations (company_id, idempotency_key)` UNIQUE + the
  `erp_record_payment` idempotency key + the `erp_attachments.client_ref` UNIQUE.
- **Capture-time accuracy:** offline visits/collections carry the device-local timestamp/day so
  they land on the day they happened (KPI/compliance integrity) — never counted until validated.
- **Additive migrations only:** 0234 (verdict/result columns + optional check-in time params),
  0235 (`field.attach_media` + `erp_attachments.client_ref`). No existing behavior changed; the
  online 6-arg `erp_check_in_visit` path is byte-for-byte unchanged.
- **Flag-gated OFF:** `KAKO_MOBILE` everywhere; zero impact on tenants without it.

## Validation

`tsc` 0 · `next build` 0 · full suite **1228 tests** (unit + integration + schema-health) green ·
migrations 0234/0235 apply clean on a from-scratch DB.

## Deliberately deferred (per direction / risk)

- **Offline orders / returns / stock movements** — affect inventory & route-stock reconciliation;
  need a dedicated design pass. Not in scope.
- **External principal portal & PIL** — see the Principal Intelligence Layer proposal.
- **True background sync (app closed)** — the app **auto-syncs on reconnect when foregrounded**
  (the common field case). Service-worker background-sync (replaying the queue with the app
  closed) is a tracked enhancement: it requires re-implementing the JSON+multipart drain inside
  the SW context (it can't import the app's client modules), so it is intentionally left as a
  follow-up rather than duplicating queue logic now.

## Next

**Step 2 — pre-pilot hardening:** Audit Log Retention · Temporary Access Expiry Sweep ·
Structured Logging · Alerting · Governance Enforcement Wiring · Sync Retry · Formal Security
Review → readiness checkpoint. Then **Step 3 — Phase 8** (8A→8D→8E→8F→8C→DnD→8B→8G→8I→8H→8J).
