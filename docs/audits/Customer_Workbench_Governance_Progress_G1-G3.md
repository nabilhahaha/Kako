# Customer Workbench Governance — Progress Report (G1–G3)

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** G1–G3 delivered, validated, pushed. G4–G7 pending.

Reuse-first, one validated commit per phase. No business-logic, permission, RLS, or workflow change in any phase. Health is kept strictly separate from the customer master status.

---

## G1 — Read-only Commercial & Territory context  ✅
Commit `df01283` (+ supervisor follow-up `67f1cda`).

Two read-only cards on the Customer 360 **Overview** tab (display-only; edits stay governed in the Profile form):
- **Commercial:** Credit Limit · Payment Terms.
- **Territory & Coverage:** Assigned Salesman · **Supervisor** · Route · Region · Area · Visit Day.

Supervisor is resolved from the salesman's `erp_profiles.reports_to` (the existing supervisor link), shown "where available". The page loads active `erp_routes` for the route name and a rep→supervisor map. Added the long-missing `route_id` to the `ErpCustomer` type (column already existed in the DB/RLS).

---

## G2 — Last Activity summary  ✅
Commit `7317ca4`.

A **Last Activity** card on the Overview tab: **last visit · order · invoice · collection · return**. `loadCustomerDetailBundle` now returns a `lastActivity` summary — last **order** from `erp_sales_orders` (distinct from invoices, drafts excluded); the rest derive from the existing merged 360 timeline (newest-first, first-match-per-kind). Localized "None" when absent.

---

## G3 — Customer Health band + score  ✅
Commit `f6f2a00`.

A derived health signal, **kept entirely separate from the master status**:
- **Header:** a health chip **beside** (never merged with) the status badge — e.g. `[Active] [At risk · 65]`.
- **Overview:** a Health card with the 0–100 score, band, and contributing signals (order/visit recency · overdue · returns-90d).

A pure `customer-health` helper derives the scorer inputs from the G2 bundle and reuses the existing `customer-timeline/health` scorer (no `erp_customer_timeline` activation). Approved bands:

| Band | Score |
|------|-------|
| Healthy | 80–100 |
| At Risk | 60–79 |
| Inactive | 30–59 |
| Critical | 0–29 |

Master status (Active / Inactive / Suspended / Blocked) is unchanged.

---

## Validation (each phase: tsc → tests → build → gap → report)

| Phase | tsc | tests | build | gap |
|-------|-----|-------|-------|-----|
| G1 (+supervisor) | clean | 1601 pass / 192 skip | ✓ | display-only; no functional change |
| G2 | clean | 1601 pass / 192 skip | ✓ | display-only; +1 bundle read |
| G3 | clean | **1607 pass** (+6 health tests) / 192 skip | ✓ | health ≠ status (two badges) |

`/customers` route weight: 22.4 → **23.5 kB** across G1–G3. No business-logic / permission / RLS / workflow change.

---

## Remaining governance phases

| Phase | Scope | Status |
|-------|-------|--------|
| **G4** | Transfer history (read `erp_customer_transfers`: prev→new salesman/route/region + reason·date·status) | next |
| **G5** | Structured audit envelope (`{field, oldValue, newValue, role, reason, requestRef}`) | pending |
| **G6** | Field-governance default policy (non-admin → view → request; **opt-in per company**) | pending |
| **G7** | Change-request UI (deliberate affordance over the existing `erp_customer_change_requests` backbone) | pending |
| G8 | Country-aware Structured Address | design-only / deferred |

Customer Planning & Targeting remains a separate future workstream (out of G1–G7).
