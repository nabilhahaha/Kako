# Platform Navigation Cleanup — P1–P4 UX Review & Updated Navigation Map

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Commit:** `4e57585` · **Date:** 2026-06-18

Implements approved **P1 (label cleanup), P2 (CRM umbrella), P3 (container rule), P4 (group Sales & Distribution).** Constraints held: no business-logic, permission, RLS, or workflow change; **no new CRM features** (umbrella surfaces existing pages only). Gate: **tsc clean · 1592 tests passed · build green.**

---

## 1. What shipped

| # | Item | Nature |
|---|------|--------|
| **P1** | 4 shared label keys split: `pharmacyExpiry`, `distributionDailySummary`, `salonAppointments`, `salonServices` | Labels only |
| **P2** | New **CRM** section — canonical entry point surfacing existing pages | Nav reorg, reuse-only |
| **P3** | Admin container decision rule (`src/components/admin/README.md`) | Doc/governance |
| **P4** | Sales & Distribution re-grouped into rail subsections | Grouping/reorder |

---

## 2. CRM umbrella (P2) — visibility-preserving relocation

The CRM section is the **canonical CRM entry point**; it *surfaces existing pages*, adds no new pages/features. Five items were relocated **verbatim** out of Sales/Distribution:

| Item | Page (unchanged) | From |
|------|------------------|------|
| Customers | `/customers` | Sales |
| Customer Transfer | `/customers/transfer` | Sales |
| Customer Requests | `/field/van-sales/requests` | Sales |
| Credit Requests | `/distribution/credit-requests` | Distribution |
| Visit Outcomes | `/distribution/visit-outcomes` | Distribution |

**Why visibility is identical:** each item keeps its exact `perm`/`flag` and now carries an **explicit `module` gate equal to its prior section context**; the CRM section gate is the **ANY-of UNION** of those module sets. Since each item's module set ⊆ the union, the section can never hide an item its own gate would show — so effective visibility = `item.module ∧ perm ∧ flag`, byte-identical to the inherited-section behaviour before. Validated by the full suite (incl. route-coverage + gating invariants).

---

## 3. Updated navigation map (rail)

```
PLATFORM (provider)                 [unchanged: Overview · Tenants · Catalog · Billing · Team · Reference]

MAIN                                [unchanged]

★ CRM   (new — canonical entry point; module: crm/sales/field_ops/distribution …)
  • Customers
  • Customer Transfer
  • Customer Requests
  • Credit Requests
  • Visit Outcomes

SALES   (was 28 flat → grouped; CRM items removed)
  ── Selling
     Quick Sale · Sales Orders · Invoices · Collections · Cash Box · Pricing · Price Book · Sales Returns
  ── Field / Van Sales
     Rep App · Settlement · Journey · Today’s Journey · Offline · My Returns · Return Approvals ·
     Day-Close Approvals · Day-Close Settlement · Override Center · Statement · Daily Summary · Cash Custody
  ── Reports
     Sales Report · Return Report · Day-Close Report · Override History

DISTRIBUTION   (was 24 flat → grouped; CRM items removed)
  ── Execution
     Routes · Van Accounting · Field Sync · Suggested Load · Journey Compliance · Trade Spend
  ── Coverage & Assortment
     Coverage · Assortment · MSL Compliance · OOS · Territory Intel · Retail Cockpit
  ── Perfect Store
     Perfect Store Scores · Perfect Store · Outlet Grading
  ── Reports
     Distribution Report · Distribution Dashboard · Daily Distribution Summary · Returns Analysis ·
     Targets · Targets Achievement · Sales Summary

INVENTORY · PURCHASING · ACCOUNTING · (verticals)   [unchanged]

SETTINGS   [single link → in-page canonical Top Grouping, from M1+M2]
```

The verticals (Hotel/Clinic/Salon/Pharmacy/Fashion/…) are unchanged and remain contextually gated.

---

## 4. UX review

| Criterion | Result |
|-----------|--------|
| Label duplication (P1) | ✅ The 4 shared keys now resolve to distinct labels; co-appearable pairs read differently ("Near-Expiry Medicines" vs "Near Expiry"; "Daily Distribution Summary" vs "Daily Summary") |
| CRM canonical entry point (P2) | ✅ One CRM home surfacing existing customer pages; no scatter at the entry level |
| No new features (P2) | ✅ Zero new pages/actions; pages render verbatim |
| Visibility / flags / platform-owner (P2) | ✅ Identical (union-gate algebra + full suite) |
| Over-stuffed rail (P4) | ✅ Sales 28→3 labelled subsections; Distribution 24→4 — "wall of links" gone |
| Container consistency (P3) | ✅ Rule documented (Workbench = collections, ModulePage = hubs) |
| Routes / pages | ✅ Unchanged (route-coverage test green) |
| Validation | ✅ tsc · 1592 tests · build |

---

## 5. Capture points (preview, commit `4e57585`)

Authenticated screenshots can't be captured from the sandbox; these are the exact shots to take (toggle EN/AR for RTL):

| Where | Expect |
|-------|--------|
| Sidebar (FMCG/distribution tenant) | New **CRM** section above Sales; Sales/Distribution show labelled subsection headers |
| Sidebar — Sales | *Selling · Field / Van Sales · Reports* sub-headers; no Customers/Transfer/Requests (now under CRM) |
| Sidebar — Distribution | *Execution · Coverage & Assortment · Perfect Store · Reports*; no Credit Requests / Visit Outcomes |
| Pharmacy tenant + Inventory | "Near-Expiry Medicines" (pharmacy) vs "Near Expiry" (inventory) — distinct |
| Salon tenant | "Salon Appointments" / "Salon Services" |
| Same user, before vs after | Same set of reachable pages (nothing gained/lost) — only grouping/placement changed |

---

## 6. Status & next

- **P1–P4 complete, validated, pushed.** Awaiting your live preview sign-off.
- **P5** (align platform entity pages + `/customers` to AdminWorkbench; unify list pagination) and **P6** (CRM sales-funnel — new features) remain **deferred**.
- **Settings M3** page-merges remain deferred and independent.

Priority preserved: **navigation consistency > taxonomy clarity > page consolidation**, and **architecture/UX consistency before new features.**
