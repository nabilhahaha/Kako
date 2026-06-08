# Step 1 — Mobile Field Client: Offline Operation Foundation (Checkpoint)

**Status:** ✅ Increment 1 implemented · additive · flag-gated (`KAKO_MOBILE`, default OFF) ·
multi-tenant via RLS · reuse-first. Closes the core offline-operation gap (the highest-priority
competitive gap vs SalesBuzz). The PWA *shell* already existed (manifest + service worker +
registration + offline page); this increment adds the missing **offline plumbing**.

## Already present (reused, not rebuilt)
`public/manifest.webmanifest` (standalone, RTL/ar, theme) · `public/sw.js` (network-first nav +
cache-first assets + `/offline` fallback) · `ServiceWorkerRegister` (root layout) · `public/icon.svg` ·
the Phase-7B pure offline engine (queue/conflict/types) + `erp_offline_mutations`/`erp_device_sessions`
(0230) + the `/distribution/field-sync` admin status dashboard.

## Net-new this increment
| Piece | What |
|---|---|
| `src/lib/offline-sync/client.ts` | Browser **IndexedDB queue** — `enqueue` (idempotency-keyed, per-device `client_seq`), `listPending`, `pendingCount`, **`syncNow`** (batches via the engine → posts → marks applied/conflict/rejected). Browser-guarded. |
| `src/lib/offline-sync/use-network.ts` | `useOnlineStatus` (online/offline events) + `useBattery` (Battery API) — **network/battery awareness**. |
| `src/lib/offline-sync/apply.ts` | Pure **server apply-whitelist** — only safe, additive, idempotent (entity, op) auto-apply on intake (starts with `van_expense:create`); everything else recorded as `pending`. Unit-tested. |
| `/api/internal/offline-sync` (route) | **Intake**: records each mutation EXACTLY-ONCE (`company_id`+`idempotency_key`), auto-applies the whitelist, updates the **device session** (app version/platform/last sync/GPS). Flag-gated; session-scoped. |
| `/field/offline` (page + `OfflineClient`) | Mobile surface: online/offline · battery · pending · conflicts · **Sync now** (+ auto-sync on reconnect) · an **offline expense capture** form (enqueue→intake→apply, proving the end-to-end path). Disabled state when flag off. |
| Nav + ar/en i18n | `/field/offline` under the field section (Smartphone icon, `field.sales`). |

## End-to-end path (proven)
Field user (offline) → `enqueue('van_expense','create',…)` into IndexedDB → on reconnect `syncNow()`
→ `/api/internal/offline-sync` records (exactly-once) + applies → `erp_van_expenses` written → result
marks the local queue. The same pipeline extends to visit/collections/returns/surveys/route-riding/van
workflows by adding their `enqueue` calls + a whitelist handler.

## Validation
Typecheck 0 · build 0 (both new routes compiled) · **1134 unit tests + 10 offline-sync** green
(incl. apply whitelist) · no new migration (reuses 0230) · no regressions.

## Next increments (Step 1 continued)
- Wire `enqueue` into the existing field workflows (visit check-in/out, order, collection, return,
  survey, route-riding, van opening/cash-count) + GPS + **media capture** (image compression before
  upload via `erp_attachments`).
- Extend the intake whitelist with per-entity handlers (visit, collection, …) under the conflict engine.
- A persistent `<OfflineStatusBar>` in the field shell; SW background-sync; richer conflict-resolution UI.

Then **Step 2 — pre-pilot hardening**, then **Step 3 — Phase 8** (8A→8D→8E→8F→8C→DnD→8B→8G→8I→8H→8J).
