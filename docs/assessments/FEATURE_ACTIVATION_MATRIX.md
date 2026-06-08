# Full Feature Exposure & Activation Audit — Feature Activation Matrix

**Date:** 2026-06-08 · **Scope:** every approved capability built through Phase 7 + Step 1
(Mobile Field Client increment 1). **Method:** static cross-reference of built pages
(`src/app/**/page.tsx`, 193 routes) against the nav registry (`src/lib/erp/navigation.ts`,
140 hrefs), the feature flags (`src/lib/*/flags.ts`), the permission gates, and the
RLS-scoped data layer.

## Auto-fix applied this pass (UI exposure only — no logic / permission / security / schema change)

Two built, flag-gated, permission-protected operational dashboards had **no navigation
entry and no parent link** (truly orphaned — reachable only by typing the URL):

| Page | Flag | Permission | Fix |
|---|---|---|---|
| `/distribution/trade-spend` | `TRADE_SPEND_ENABLED` (`KAKO_TRADE_SPEND`, OFF) | `reports.view` | Added Distribution nav entry `nav.items.tradeSpend` (ar/en) + Receipt icon |
| `/distribution/coverage` | `DISTRIBUTION_ENABLED` (`KAKO_DISTRIBUTION`, OFF) | `reports.view` | Added Distribution nav entry `nav.items.coverage` (ar/en) + Map icon |

Both already had their content i18n keys (`distribution.ts*`, `distribution.coverage*`) and
their pure read-models — only the discovery link was missing. The flag gate is preserved, so
the items appear in the registry but the pages still `notFound()` until the tenant enables the
flag (no behavioural change for current tenants).

No other auto-fixable gaps were found: all `/settings/integrations/*` and
`/settings/onboarding/*` child pages are linked from their parent screens, and all `/print/*`
views are linked contextually from their owning modules. Everything else below is either
intentionally backend-only (reported for approval, **not** auto-exposed) or already fully active.

## Matrix legend

- **Status** — Fully Active · Backend Only (by design) · Hidden by Flag · Public/Auth · Child (reachable via parent)
- **Visible** — has a sidebar nav entry · **Reachable** — navigable in-app (nav or parent link)
- **Wired** — UI → action/route → RLS-scoped table path proven · **Perm** — permission-gated
- **Mobile** — usable on the PWA/field surface · **Flag** — feature flag (default OFF unless noted)

## A. Phase 7 capabilities (engine + thin UI, all merged)

| Feature | Phase | Status | Visible | Reachable | Wired | Perm | Mobile | Flag | Missing | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|
| Route/Van Accounting (opening balance, expenses, cash recon, profitability, statement) | 7A | Fully Active | ✅ `/distribution/van-accounting` | ✅ | ✅ | `reports.view` | ➖ admin | `KAKO_VAN_ACCOUNTING` | — | Wire van cash-count + opening into the offline queue (Step 1 cont.) |
| Offline sync engine + admin status | 7B | Fully Active | ✅ `/distribution/field-sync` | ✅ | ✅ | `reports.view` | ➖ admin | `KAKO_MOBILE` | — | — |
| Perfect Store scorecards & scoring | 7C | Fully Active | ✅ `/distribution/perfect-store-scores` | ✅ | ✅ | `reports.view` | ➖ | `KAKO_PERFECT_STORE` | — | — |
| Territory / Route Intelligence dashboards | 7D | Fully Active | ✅ `/distribution/territory-intel` | ✅ | ✅ | `reports.view` | ➖ | `KAKO_ROUTE_INTEL` | — | — |
| Suggested Load / replenishment | 7E | Fully Active | ✅ `/distribution/suggested-load` | ✅ | ✅ | `reports.view` | ➖ | `KAKO_SUGGESTED_LOAD` | — | — |

## B. Mobile Field Client — Step 1 increment 1 (merged, PR #232)

| Feature | Status | Visible | Reachable | Wired | Perm | Mobile | Flag | Missing | Recommended action |
|---|---|---|---|---|---|---|---|---|---|
| PWA shell (manifest + service worker + offline fallback) | Fully Active | n/a | ✅ | ✅ | — | ✅ | — | — | — |
| Offline IndexedDB queue + intake (`/api/internal/offline-sync`) | Fully Active | n/a | ✅ | ✅ | session | ✅ | `KAKO_MOBILE` | — | — |
| Offline surface `/field/offline` (online/battery/pending/conflicts + sync + expense capture) | Fully Active | ✅ `nav.items.fieldOffline` | ✅ | ✅ | `field.sales` | ✅ | `KAKO_MOBILE` | — | — |
| Network / battery awareness hooks | Fully Active | n/a | ✅ | ✅ | — | ✅ | `KAKO_MOBILE` | — | — |
| Apply-whitelist (van_expense:create) | Fully Active | n/a | n/a | ✅ | — | ✅ | `KAKO_MOBILE` | other entities pending | Extend whitelist to visit/collection/return/survey (Step 1 cont.) |
| **Pending (Step 1 continued — not yet built):** enqueue wiring into visit/order/collection/return/survey/route-riding/van workflows; GPS + media capture; persistent `<OfflineStatusBar>`; SW background-sync | Not Yet Implemented | — | — | — | — | — | `KAKO_MOBILE` | the above | Continue Step 1 increments |

## C. Newly exposed this pass (were Hidden, now Visible)

| Feature | Phase | Status | Visible | Reachable | Wired | Perm | Mobile | Flag | Missing | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|
| Trade Spend dashboard (accrued/claimed/open liability/cap util) | 4 | Hidden→Active | ✅ (added) | ✅ (added) | ✅ | `reports.view` | ➖ | `KAKO_TRADE_SPEND` | — | Enable flag for trade-spend pilot tenants |
| Coverage & Supervisor Monitoring (rep-day KPIs) | 3 | Hidden→Active | ✅ (added) | ✅ (added) | ✅ | `reports.view` | ➖ | `KAKO_DISTRIBUTION` | — | — |

## D. Backend-only modules (engine merged, no UI by design — reported, NOT auto-exposed)

These have pure read-models / server logic and migrations but **intentionally** no dedicated
sidebar surface — they are consumed by other dashboards, actions, or APIs. Exposing any of
them would require new pages + permission/UX decisions, which is **out of the auto-fix scope**
and listed here for approval if/when a dedicated surface is wanted.

| Module (`src/lib/…`) | Consumed by | Recommended action |
|---|---|---|
| `tax` | invoice/GL posting | None — internal |
| `promotion` | pricing/order engine | None — internal |
| `returns` | `/sales/returns`, returns-analysis | None — internal |
| `attribution` | sales-summary / commercial | None — internal |
| `commercial` (forecasting) | suggested-load, dashboards | None — internal |
| `finance` | accounting/GL | None — internal |
| `customer-timeline` | customer 360 | None — internal |
| `entity360` | `/customers/[id]/360` | None — internal |
| `ownership` | RLS / governance | None — internal |
| `route-riding` | supervisor flows | Candidate UI surface — propose for Step 1 cont. |
| `role-templates` / role-governance | authz console | Surfaced via `/settings/authz` |

## E. Foundational areas (already fully active — spot-checked)

Main control center (`/dashboard`, `/today`, `/supervisor`, `/manager`, `/attention`,
`/approval-center`, `/reports`, `/territory`, `/coaching`), field execution (`/field/route`,
`/field/stock`, `/field/journey`, `/field/van-reconciliation`), sales/CRM, inventory,
purchasing, accounting, the vertical packs (hotel/clinic/restaurant/salon/pharmacy/laundry/
market/fashion/electrical), platform/vendor panel, and the Settings governance suite all
carry the standard 3-gate pattern (`getUserContext` → flag/module → `hasPermission` →
RLS-scoped `createClient`) and are reachable through the sidebar. No exposure gaps.

## F. Feature flags

~22 module-level `KAKO_*` flags (plus per-capability flags), **all default OFF**
(`on(v)` requires `'1'`/`'true'`). Newly-exposed Trade Spend and Coverage remain flag-gated,
so this audit changes **discovery only**, never default behaviour.

## Summary

- **193 pages built · 142 nav hrefs · 2 orphaned operational dashboards found and fixed
  (nav-only, flag-preserving).**
- **0 remaining auto-fixable exposure gaps.**
- Everything else is either fully active, a flag-gated pilot capability now discoverable,
  a child page reachable via its parent, an auth/public page, or an intentionally
  backend-only engine (reported above, awaiting approval before any new surface is built).
- **No business-logic, permission, security, or schema changes were made.**
