# P5 — Customer Workbench & Customer 360 — Design Package

### Canonical customer experience on the proven workbench pattern

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Audit + design + plan — *no implementation, no new features.*

Brings `/customers` onto the same canonical 3-panel **AdminWorkbench** used by Companies and Users, with a tabbed **Customer 360** detail. Reuse-first: every existing action, loader, and permission is reused unchanged. Constraints: no business-logic, permission, RLS, or workflow change. CRM Evolution remains deferred.

---

## 1. Audit — current state (grounded)

| Surface | Component | Pattern | Notes |
|--------|-----------|---------|-------|
| `/customers` (list) | `CustomersManager` | **bespoke** list + **inline create/edit form** | server pagination + search + 3 filters (segment/classification/channel); 8 actions (upsert, toggle-active, approve/reject, import, GPS/credit/approval requests) |
| `/customers/[id]` (detail) | `CustomerStatementView` | **bespoke, single view (no tabs)** | statement: summary + aging + open invoices + reconciling ledger + EntityNotes + status; credit-limit request |
| `/customers/[id]/360` | timeline + StatCards + QuickNav | **bespoke** | `customerActivity()` timeline = invoices + payments + returns (**financial-only**) |
| `/customers/transfer` | `CustomerTransferForm` | bespoke page | `customer.transfer` gate |
| `customers/layout.tsx` | — | gate | `requireModule('sales')` (not `crm`) — latent (flagged earlier; **not changed by P5**) |

**Findings:** the customer experience is **fragmented across 3 routes** with a bespoke list+form, a separate statement, and a separate financial 360 — inconsistent with the Companies/Users workbench standard. All business logic, actions, and gates already exist and are enforced at the action level.

---

## 2. Architecture review — the pattern to adopt

Mirror the **Companies workbench** (the reference):
- **Page (server):** load the list → render `CustomersWorkbench`.
- **Workbench (client):** `AdminWorkbench` = `EntityListPanel` (left) · `Customer360` (center) · `ContextPanel` (right). URL-addressable via `useWorkbenchSelection` (`?id&tab`). Detail bundle lazy-loaded on selection.
- **Detail bundle (server):** `loadCustomerDetailBundle(supabase, id, locale)` — parallel load of customer + statement + activity + audit + summary stats (mirrors `loadCompanyDetailBundle`).
- **Customer 360 (client):** `EntityHeader` (name + status + `EntityActionBar`) + `EntityTabs` + per-tab sections (`SectionCard`).

Secondary reference (Users workbench): `ContextPanel` with Summary + `ActivityFeed` + `RelatedChips`.

### Canonical Customer 360 tabs (all from existing data)
| Tab | Content (reused) |
|-----|------------------|
| **Overview** | identity + key stats (balance · credit limit · overdue · status) + quick actions |
| **Profile** | the existing edit form (reuse `CustomersManager` fields + `upsertCustomer` + `DynamicCustomFields` + Attachments) |
| **Statement** | `CustomerStatementView` verbatim (summary · aging · open invoices · ledger) |
| **Activity** | `customerActivity()` timeline + StatCards (financial) |
| **Related** | branch · salesman · region/area · parent/child chips (`RelatedChips`) |
| **Audit** | `ActivityFeed entity='customer'` |

**Actions** (via `EntityActionBar`, permission-aware, reused as-is): Activate/Deactivate · Approve/Reject · Request Credit-Limit · Transfer · GPS-change. No new actions.

---

## 3. Before / After

```
BEFORE (3 fragmented routes, bespoke)        AFTER (one canonical workbench)
/customers            list + inline form     /customers?id=&tab=overview
/customers/[id]       statement (no tabs)      ├ EntityListPanel (left)
/customers/[id]/360   financial timeline       ├ Customer360 (center): Overview · Profile ·
/customers/transfer   separate page            │   Statement · Activity · Related · Audit
                                               └ ContextPanel (right): Summary · Activity · Related
        old routes → redirect to ?id=&tab=… (deep links preserved)
```

The list, statement, and 360 are unified into one URL-addressable workbench identical in shape to Companies/Users.

---

## 4. Reuse analysis

| Reused **verbatim** | New code |
|---------------------|----------|
| Primitives: AdminWorkbench · EntityListPanel · EntityHeader · EntityTabs · EntityActionBar · SectionCard · ContextPanel · ActivityFeed | `loadCustomerDetailBundle()` loader (~75 LOC) |
| Loaders: `loadCustomerStatement()` · `customerActivity()` | `Customer360` tabs component (~300 LOC, mostly composed from existing pieces / Company360 shape) |
| Components: `CustomerStatementView` · `ActivityTimeline` · `EntityNotes` · `DynamicCustomFields` · Attachments | `CustomersWorkbench` shell (~150 LOC, mirrors CompaniesWorkbench) |
| **All 8 customer actions** (`upsertCustomer`, `toggleCustomerActive`, approve/reject, import, GPS/credit/approval requests, transfer) | `/customers/page.tsx` rewire (~20 LOC) + `[id]`/`[id]/360` redirect stubs (~5 LOC each) |
| **All permission gates** (customers.manage, customer.create/edit/import, customers.change_status, customers.approval.approve, credit.request.*, customer.transfer) — unchanged | — |

**Estimated reuse ≈ 85%** (primitives + loaders + actions + components reused; new code is composition + one loader + redirects). **Zero** business-logic / permission / RLS / workflow change; **no new permissions or actions.**

---

## 5. Risk — no functional reduction (gap matrix)

The earlier Companies migration drew a "functionally reduced" concern; P5 pre-empts it by mapping **every** current capability to its new home:

| Current capability | Preserved in workbench |
|---|---|
| Create / edit (inline form + custom fields + attachments) | **Profile** tab (same form + `upsertCustomer`) |
| Server search + 3 filters (segment/classification/channel) + pagination | **EntityListPanel** (server-search hook) — same filters/pagination |
| Activate/deactivate (reason-required) | **EntityActionBar** action (same `toggleCustomerActive`) |
| Approve / reject | EntityActionBar (same actions) |
| Import / Export | Overview/Profile toolbar (same `importCustomers`) |
| Statement (aging/invoices/ledger) | **Statement** tab (verbatim) |
| 360 timeline + stats | **Activity** tab (verbatim) |
| Credit-limit request · GPS request | EntityActionBar (same gated actions) |
| Transfer | EntityActionBar / quick action (same `transferCustomer`) |
| Notes | Statement/Overview (`EntityNotes`) |
| Deep links to `/customers/[id]`, `/[id]/360` | **redirects** to `?id=&tab=…` |

**Gate note:** `customers/layout` stays on `requireModule('sales')` — unchanged (the sales-vs-crm reconciliation is a separate, deferred item; P5 changes no gate).

---

## 6. Implementation plan (phased; before execution; each validated)

> One piece per commit; tsc · full suite · build · gate check after each — same cadence as M3/AC.

| Step | Scope | Risk |
|------|-------|------|
| **P5-1** | `loadCustomerDetailBundle()` server loader (additive; no UI change) | Low |
| **P5-2** | `Customer360` tabbed component — Overview · Profile · Statement · Activity · Related · Audit, reusing all existing components/actions | Med |
| **P5-3** | `CustomersWorkbench` shell — `EntityListPanel` (from the existing list section) + `Customer360` + `ContextPanel` | Med |
| **P5-4** | Rewire `/customers/page.tsx` → `CustomersWorkbench`; add `[id]` + `[id]/360` redirect stubs (preserve deep links); gap-matrix verification | Med |

**Validation gate (per step):** tsc · 1596+ tests · build; permission/RLS/action unchanged (asserted); old routes redirect; before/after screenshots/capture points; explicit gap-matrix sign-off that nothing is lost.

---

## 7. Decision point (one item for you)

**Customer 360 — Activity tab scope.** The canonical 360 reuses the existing **financial** timeline (invoices/payments/returns). The data for a richer timeline (customer **requests**, **visit outcomes**) already exists with loaders (`erp_customer_requests`, `erp_visit_outcomes`), but surfacing it on the 360 borders on **CRM Evolution** (deferred).
- **Recommended (default):** keep the Activity tab to the existing financial timeline for P5 (pure reuse, no scope creep); park the requests/visits/surveys enrichment under CRM Evolution.
- **Alternative:** include requests/visits in the timeline now (still reuse-only of existing data, but expands the 360 beyond financial).

I'll proceed with the **recommended** default unless you choose the alternative.

---

## 8. Summary

- **Audit:** customer surface is fragmented (list+form / statement / financial-360) and off-standard.
- **Design:** one canonical `AdminWorkbench` + tabbed `Customer 360`, identical to Companies/Users.
- **Reuse ≈ 85%**, no new permissions/actions, gap-matrix guarantees no functional loss.
- **Plan:** P5-1 → P5-4, one validated commit each, with redirects for deep links.

**No implementation until this plan is approved.** On approval I start with **P5-1** (the detail-bundle loader).
