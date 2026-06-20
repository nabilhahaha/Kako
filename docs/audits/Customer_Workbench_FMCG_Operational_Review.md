# Customer Workbench — FMCG Operational Review

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** *Audit & review only — no implementation, no architecture change.*

## Executive summary

The Workbench architecture is sound; this review is purely about **operational data exposure**. The most important finding: **most of the requested capability already exists** — either as **persisted data** (`erp_customer_transfers`, `erp_journey_plans`, `erp_routes`, `erp_customers.route_id`, `erp_customer_timeline`) or as **dormant pure logic** (`src/lib/customer-timeline/*` health/risk scoring; `src/lib/ownership/*` transfer ledger). The gaps are largely **"surface what exists,"** not "build new architecture."

Two dormant assets are central:
- **`src/lib/customer-timeline/`** — `healthScore` / `riskScore` / `relationshipStrength` + `customerHealthTimeline` (last visit/order/collection/return/near-expiry/promotion/ownership) + `deriveHealthInputs`. Maps to the `erp_customer_timeline` table. **Not wired into any route.**
- **`src/lib/ownership/`** — `historyFor` / `currentOwner` across `salesman · supervisor · area · region · route`. The transfer/ownership backbone. **Not wired.**

The P5 Workbench currently uses the *simpler* `src/lib/erp/timeline.ts` feed (invoice·payment·visit·return·note), not the richer Phase-3 module.

---

## 1. Customer Health

**Current state.** The header/list badge shows only the 4-state **master** status — `active · inactive · suspended · blocked` (`erp_customers.customer_status`) plus `approval_status` (draft/pending/rejected). There is **no derived health, no "At Risk" band, no score**.

**Exists but unwired.** `customer-timeline/health.ts` already computes:
- `healthScore` (0–100) with inputs: **order recency (30) · visit recency (20) · overdue (25) · near-expiry (15) · returns (10)**.
- `riskScore` = 100 − health; `relationshipStrength` (tenure + order frequency + visit recency).
- `deriveHealthInputs`: daysSinceLastOrder/Visit/Collection, hasOverdue, nearExpiryOpen, returnsLast90, ordersLast90, tenureDays.

**Gap.** "At Risk / Inactive" are **derived operational bands** that don't exist in the UI; only the manual master status does.

**Recommendation.** Surface a **health band + score** (header chip + Overview breakdown), reusing the pure module unchanged. **Keep two distinct concepts:** *master status* (Active/Blocked — manually set, governs credit/sales) vs *health band* (At-Risk/Inactive — derived from activity). They answer different questions; show both, don't merge. Band thresholds are a config decision (see open questions).

---

## 2. Territory & Coverage Context

**Current state.** The Related tab shows **branch · salesman · region · area · parent · children**. `visit_day` is editable in the Profile form but **not shown** in the 360 read view. `route_id` is **not surfaced at all**. No coverage status; no visit frequency.

**Exists.** `erp_customers` has `route_id → erp_routes` (name · rep · visit_day), `region_id`, `area_id`, `salesman_id`, `visit_day`. `erp_journey_plans` holds per-(customer, day) plans with **`frequency` (weekly/biweekly/monthly)**. RLS already scopes on branch/region/area/salesman/route.

**Gap.** Route, visit day, visit frequency, and coverage status are not visible in the Workbench.

**Recommendation.** Add a read-only **Coverage** context block: Route · Region · Area · Salesman · Visit Day (all owned by the customer record) — Workbench-owned. **Visit frequency** (`erp_journey_plans`) and **coverage status** (derived from JP adherence) are **Journey-Plan-owned**: the Workbench should *display* them but not own them (see §split).

---

## 3. Last Activity Summary (Overview)

**Current state.** The Activity tab shows the merged timeline + counts (requests · visits · invoices). The **Overview** tab does **not** surface an at-a-glance "last X."

**Exists.** `customerHealthTimeline()` already returns **lastVisit · lastOrder · lastCollection · lastReturn** (+ near-expiry, promotion, ownership). `loadCustomerStatement` already has invoice/payment data for **last invoice**.

**Gap.** No "Last Activity" strip on Overview — the single highest-frequency FMCG question ("when did we last sell/visit/collect?").

**Recommendation.** Add a **Last Activity** summary strip to Overview (last visit · order · invoice · collection · payment · return), reusing `customerHealthTimeline` + the statement loader. **High value, low effort — logic exists.** Clarify semantics (open questions): "last order" vs "last invoice" (in this ERP an invoice ≈ the order); "last collection" (FMCG term) vs "last payment" (legacy `erp_payments`).

---

## 4. Transfer Visibility

**Current state.** **Not surfaced anywhere.** The transfer *request* flow exists (→ approval queue), but history is invisible in the 360.

**Exists.** `erp_customer_transfers` persists **everything requested**: `from/to_region_id · from/to_branch_id · from/to_route_id · from/to_salesman_id · reason · status · created_at · applied_at · decided_at · requested_by · decided_by`. Plus the `ownership` ledger (`historyFor`) gives the same across dimensions.

**Gap.** Previous salesman, previous territory, transfer date, and reason are all **stored but never shown**.

**Recommendation.** Add a **Transfer History** view (a section in Related, or a sub-panel) reading `erp_customer_transfers`: *previous → new* salesman/route/region, reason, date, status. **All requested fields already exist** — pure read. Medium priority.

---

## 5. Related Tab

**Current state.** Already richer than "branch + salesman only": **branch · salesman · region · area · parent · children**. So the premise (branch+salesman only) is already exceeded.

**Gap (FMCG-relevant relationships missing).** Route · Supervisor (reports-to) · Journey Plan · Price list / segment tier · Current owners (`ownership.currentOwner` per dimension) · recent transfers · open credit requests.

**Recommendation.** Add (deep-link chips): **Route**, **Supervisor**, **Price list / tier**, **Journey Plan**. These are the relationships a supervisor/ASM actually traverses. Keep it navigational, not data-heavy.

---

## 6. Audit Tab

**Current state.** `ActivityFeed entity='customer'` surfaces `logAudit` events: **create · update · status-change (reason) · approval request · approve/reject · credit-limit request · GPS-change request** — i.e. **master-data + workflow compliance** events.

**Gap.** **Operational** events are absent: customer transfers, visits, orders/invoices, collections, returns, ownership changes, journey-plan changes, credit decisions. These belong in the `erp_customer_timeline` operational stream (dormant), not `erp_audit`.

**Recommendation.** Distinguish **Audit** (who-changed-what / compliance) from **Activity** (operational event stream). Two concrete moves: (a) add **`customer_transfer`, credit-limit *decision*, journey-plan change** to the audit feed (compliance-relevant); (b) longer term, surface the `erp_customer_timeline` operational stream in the Activity tab. Don't overload one tab with both purposes.

---

## Priority ranking

| # | Item | Value | Effort | Why |
|---|------|-------|--------|-----|
| **P1** | Last Activity summary (Overview) | High | Low | `customerHealthTimeline` exists; #1 FMCG question |
| **P1** | Customer Health band + score | High | Low–Med | `customer-timeline/health` exists; just surface |
| **P1** | Territory/Coverage read block (route · region · area · salesman · visit day) | High | Low | All on the customer record already |
| **P2** | Transfer history view | Med | Low | `erp_customer_transfers` fully populated |
| **P2** | Related enrichment (route · supervisor · price tier · JP link) | Med | Low | Deep-link chips |
| **P3** | Visit frequency + coverage status | Med | Med | JP-engine-owned (see split) |
| **P3** | Audit enrichment w/ operational events | Med | Med–High | Needs `erp_customer_timeline` activation |

---

## Customer Workbench vs Coverage & Journey-Plan Engine

**Belongs in the Customer Workbench** (read/display of existing data — no new ownership):
- Health band + score (reuse the pure `customer-timeline` module)
- Last Activity summary
- Territory context display: route · region · area · salesman · visit day
- Transfer **history** (read `erp_customer_transfers`)
- Related enrichment: route · supervisor · price tier
- Audit: add `customer_transfer` + credit-**decision** events

**Belongs in the Coverage & Journey-Plan Engine** (owns the data/logic; the Workbench only *reads*):
- **Visit frequency** (`erp_journey_plans` owns it)
- **Coverage status** (derived from JP adherence / visit compliance)
- Journey-plan creation/editing, route assignment management
- Populating the **`erp_customer_timeline`** operational stream (visits/orders/collections that feed health + last-activity) — the engine/transactions *produce*, the Workbench *consumes*

---

## Open decisions for you (before any implementation)

1. **Health bands & placement** — thresholds for Active / At-Risk / Inactive on the 0–100 score, and whether the health chip sits *beside* the master-status badge (recommended) or replaces it.
2. **Activity semantics** — is "last order" distinct from "last invoice" in this ERP? Is "payment" (legacy) shown alongside "collection" (FMCG), or collapsed?
3. **`erp_customer_timeline` activation** — activate it now (it's the backbone for health, last-activity, and operational audit), or short-term feed health/last-activity from the existing statement + activity loaders and defer the full stream to the Coverage/JP workstream?

**No implementation performed. Awaiting your decisions on what moves into the Customer Workbench vs the future Coverage & Journey-Plan workstream.**
