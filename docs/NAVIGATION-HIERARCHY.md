# Operational Navigation Hierarchy

This document records the navigation hierarchy and Back-button behaviour for
every operational screen in the FMCG van-sales experience. It is the source of
truth for the **smart Back** control and the "no dead-end" guarantee.

## Back-button contract

`BackLink` (`src/components/shared/back-link.tsx`) resolves its target in a
strict three-tier priority so a deep link / fresh tab can never strand the user:

| Priority | Source | Behaviour |
| --- | --- | --- |
| 1 | **History** | `router.back()` — the previous page, when in-app history exists (`window.history.length > 1`). |
| 2 | **Parent page** | `href` — the screen's logical parent, used when there is no history. |
| 3 | **Role home** | `home` — the role's landing page, used only when no parent applies. |

```
History  →  Parent Page  →  Role Home
```

- Every operational screen passes its **real parent** as `href` — not just
  My Day.
- `home` is the ultimate role-home fallback and is only set where the parent
  differs from the role home (e.g. warehouse/admin screens).
- The control looks and behaves identically on mobile and desktop; the chevron
  flips for RTL.

## Role homes (`resolveHomePath`, `src/lib/erp/home.ts`)

| Role | Home |
| --- | --- |
| Salesman / Van Sales / Driver | `/today` (My Day) |
| Merchandiser / other field (`field.sales`) | `/today` (My Day) |
| Admin / Manager | `/dashboard` |
| Branch Manager | `/manager` |
| Supervisor / Area / Regional / National / Sales Director | `/approvals/queue` |
| Accountant / Finance | `/collections` |
| Warehouse Keeper | `/inventory/requests` |
| Platform Owner | `/dashboard` |

My Day (`/today`) is the default landing **only** for field roles. Office roles
keep their own dashboards/home.

## Screen-by-screen hierarchy

### Field salesman — daily operation (role home `/today`)

| Screen | Route | Parent (`href`) | Role home (`home`) | Back present |
| --- | --- | --- | --- | --- |
| My Day / Workspace | `/today` | — (home) | — | n/a (home) |
| Today's Journey | `/field/journey` | `/today` | `/today` | ✅ |
| Route Execution | `/field/route` | `/today` | `/today` | ✅ |
| Van Stock | `/field/stock` | `/today` | `/today` | ✅ |
| Offline Sync | `/field/offline` | `/today` | `/today` | ✅ |
| Merchandising Survey | `/field/survey/[customerId]` | `/field/journey` | `/today` | ✅ |
| Van Reconciliation | `/field/van-reconciliation` | `/today` | `/today` | ✅ |
| Sell | `/field/van-sales/sell` | `/today` | `/today` | ✅ |
| Collect | `/field/van-sales/collect` | `/today` | `/today` | ✅ |
| Return | `/field/van-sales/return` | `/today` | `/today` | ✅ |
| Load Confirmation | `/field/van-sales/confirm` | `/today` | `/today` | ✅ |
| Customer Picker | `/field/van-sales/customers` | `/field/van-sales` | `/today` | ✅ |
| Customer Statement | `/field/van-sales/statement/[id]` | `/field/journey` (visit) or `/field/van-sales` | `/today` | ✅ |
| Day-closed Gate | (gate on Sell/Collect/Return) | `/today` | `/today` | ✅ |

### Requests hub & governed requests

| Screen | Route | Parent (`href`) | Role home (`home`) | Back present |
| --- | --- | --- | --- | --- |
| Requests Hub | `/field/van-sales/requests` | `/today` | `/today` | ✅ |
| Stock Load Request | `/field/van-sales/request` | `/field/van-sales/requests` | `/today` | ✅ |

### Approver / confirmer inboxes (role home `/dashboard`)

| Screen | Route | Parent (`href`) | Role home (`home`) | Back present |
| --- | --- | --- | --- | --- |
| Day-Reopen Approvals | `/field/van-sales/reopen-approvals` | `/field/van-sales` | `/dashboard` | ✅ |
| Cash-Handover Confirmations | `/field/van-sales/cash-handovers` | `/field/van-sales` | `/dashboard` | ✅ |
| Customer-Request Inbox | `/field/van-sales/customer-requests` | `/field/van-sales` | `/dashboard` | ✅ |

### Warehouse / admin van-sales screens

| Screen | Route | Parent (`href`) | Role home (`home`) | Back present |
| --- | --- | --- | --- | --- |
| Warehouse Pending-Loads | `/field/van-sales/warehouse` | `/field/van-sales` | `/inventory/requests` | ✅ |
| Load Reports | `/field/van-sales/reports` | `/field/van-sales` | `/today` | ✅ |
| Pilot Readiness | `/field/van-sales/readiness` | `/field/van-sales` | `/dashboard` | ✅ |

### Van-sales shell

`/field/van-sales` is the salesman shell / admin hub. When
`platform.unified_salesman_workspace` is ON, a van salesman is redirected from
this shell into `/today` (one-way; `/today` never redirects back), so it is a
**parent/landing** screen and intentionally has no Back. For admins/managers it
remains the hub that surfaces the approver inboxes (reopen / cash / customer
requests) and the readiness diagnostic — so none of those inboxes are orphaned.

## Dead-end & orphan guarantees

- **No dead-ends:** every operational sub-screen renders a Back control whose
  fallback is a real, navigable parent (tier 2) or role home (tier 3).
- **No orphans:** approver inboxes and the readiness diagnostic are reachable
  from discovery tiles on the van-sales hub; salesman screens are reachable from
  My Day (`/today`) and the bottom nav (Today · Van Stock · Requests · More).
- **End Day:** the My Day "End Day & Settle" action deep-links to
  `/field/journey?endday=1`, which auto-opens the close-day workflow rather than
  routing to a read-only screen.
