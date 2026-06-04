# VANTORA — UX Excellence & Product-Design Review

> Findings, mock structures, recommended hierarchy, and a UX roadmap. **No
> implementation** — review only; awaiting approval before any coding. No new
> modules, no new tables, no AI, no ERP-breadth. Prepared `2026-06-04`.
>
> **Ranking legend:** 🔴 Must Do Now · 🟢 High ROI · 🟡 Medium ROI · ⚪ Ignore.

---

## 0. Method & guiding principle

Reviewed VANTORA as each persona (salesman / supervisor / manager) against
patterns from **ERPNext, Odoo, Salesforce, HubSpot, Zoho CRM, Monday.com,
ClickUp, Linear, Notion, Typesense, Meilisearch**.

**Principle:** VANTORA is a *mobile field-execution* product, not a desktop ERP.
The UX should optimize the **field loop** (Plan → Visit → Sell → Collect →
Close) and the **supervisor/manager exception loop** (See → Decide → Act), not
mimic ERP breadth. Today the app borrows an ERP sidebar/dashboard shape; the
biggest wins come from making it **role-first and exceptions-first**.

---

## 1. Open-source / SaaS pattern harvest (what to borrow)

| Source | Pattern worth borrowing | Apply to VANTORA |
| --- | --- | --- |
| **Linear** | Command palette as the primary nav; keyboard-first; minimal chrome | Elevate the existing command palette to a first-class global action |
| **Notion** | Role/context-aware home; calm density; clear empty states | Role-aware home pages (salesman/supervisor/manager) |
| **Monday.com / ClickUp** | "My Work" / today-first views; status pills; color-coded health | Salesman "Today"; health-banded cards |
| **Salesforce** | Record 360 + activity timeline; "what needs attention" | Customer 360 + Attention Center (started) |
| **HubSpot** | Clean list + inline quick actions; saved views | Customer/invoice list quick actions + saved filters |
| **Zoho CRM** | Mobile check-in + route-aware field app | Today's Journey as the salesman home |
| **Odoo** | Activity/next-action chips on records | "Next best action" chips on customer/invoice |
| **ERPNext** | Number cards + report center | A single **Reports Center** (consolidate scattered reports) |
| **Typesense / Meilisearch** | Instant search, typo-tolerance, grouped + highlighted results, facets | Search excellence (grouping, highlight, filters) |

---

## 2. Whole-app walkthrough (12 screens × 6 questions)

Scale: ✅ good · ⚠️ partial · ❌ needs work.

| Screen | Obvious? | Fast? | Mobile? | Overloaded? | Simplify? | Faster actions? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Dashboard | ⚠️ generic, not role-aware | ✅ | ⚠️ | ⚠️ mixed metrics | ✅ role-split | ✅ add quick actions |
| 2 Customers | ✅ | ⚠️ load full list | ⚠️ | ⚠️ | ✅ saved filters | ✅ inline actions |
| 3 Visits | ⚠️ buried in journey | ⚠️ | ⚠️ modal hops | ⚠️ | ✅ one-tap check-in | ✅ sticky action |
| 4 Journey Plans | ✅ | ✅ (sort engine) | ✅ | ✅ | ⚠️ | ✅ make it the home |
| 5 Invoices | ✅ | ⚠️ | ⚠️ | ⚠️ status mix | ✅ status filters | ✅ "new" FAB |
| 6 Returns | ⚠️ analysis vs entry split | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| 7 Inventory | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| 8 Van Operations | ⚠️ spread (transfer/recon) | ⚠️ | ⚠️ | ⚠️ | ✅ group "Van" hub | ✅ |
| 9 Approvals | ✅ | ⚠️ | ⚠️ | ⚠️ many types | ✅ unified center | ✅ batch approve |
| 10 Reports | ❌ scattered | ⚠️ | ⚠️ | ❌ | 🔴 Reports Center | ✅ |
| 11 Copilot | ✅ (deterministic) | ✅ | ✅ | ✅ | ✅ surface chips | ✅ inline "why disabled" |
| 12 Settings | ⚠️ long | ⚠️ | ⚠️ | ⚠️ | ✅ grouped subsections (partly done) | ⚠️ |

**Cross-cutting themes:** (a) home/dashboard not role-aware; (b) reports &
van-ops scattered; (c) lists load full data instead of search-first; (d) mobile
bottom-nav doesn't match the field loop; (e) actions hidden behind navigation
instead of surfaced (FAB / inline).

---

## 3. Navigation — current vs recommended

### Current
```
Sidebar: Provider · Main(Dashboard, Approvals, Notifications) · [business-type
sections] · Sales · Distribution · Electrical · Inventory · Purchasing ·
Accounting · Settings
Bottom nav (mobile): Home · Customers · Sell · Inventory · More
Command palette: exists (recents/frequent) — under-surfaced
```
Issues: long ERP-style sidebar; bottom nav ignores the field loop (no
Journey/Visit/Collect); reports scattered; no Attention/Reports centers.

### Recommended (role-aware)
```
HOME (role-aware): salesman→Today · supervisor→Team · manager→Command
PRIMARY (sidebar, collapsed to essentials per role):
  • Home  • Attention Center  • Customers  • Journey  • Sales/Invoices
  • Van Hub (transfer+recon+stock)  • Reports Center  • Approvals Center
  • Settings (grouped subsections)
GLOBAL: Command palette (⌘K / prominent search) · Quick-Action FAB
BOTTOM NAV (mobile, role-aware):
  salesman:  Today · Customers · Sell · Collect · More
  supervisor: Team · Attention · Customers · Reports · More
  manager:   Home · Attention · Reports · Approvals · More
```

**Centers to introduce (consolidation, not new modules):**
- **Attention Center** (started, #102) — exceptions-first, role-tailored.
- **Approval Center** — unify visit/day-close/transfer/credit/workflow approvals + batch actions.
- **Reports Center** — one hub for sales-summary, coverage, returns-analysis, journey-compliance, targets.

---

## 4. Manager Dashboard design (decision-speed)

```
┌── VANTORA · Manager Home ───────────────────────────────┐
│ [Health 86%]  [Sales MTD ▲12%]  [Coverage 78% ⚠]        │  ← KPI band (trend + band)
│ [Pending Approvals 6]  [Inventory Risk 3]  [Alerts 2]   │
├─────────────────────────────────────────────────────────┤
│ ⚠ ATTENTION FIRST (ranked)                               │
│  • 4 overdue-invoice customers  → Collect                │
│  • 2 routes < 50% coverage      → Route health          │
│  • 5 lost customers (no order 30d) → Win-back            │
├──────────────────────┬──────────────────────────────────┤
│ Team Performance      │ Route Health                     │
│  rep  ach%  cov%  ▲▼  │  route  cov%  visits  GPS-flags   │
├──────────────────────┴──────────────────────────────────┤
│ Quick: New Customer · New Invoice · Open Reports         │
└─────────────────────────────────────────────────────────┘
```
Sections (all reuse existing RLS-scoped data): **Sales** (`erp_sales_summary`),
**Coverage** (`work_sessions`+`coverageBand`), **Lost Customers** (no order/visit
in N days), **Route Health** (`summarizeAttention`), **Team Performance**
(`erp_target_achievement`), **Pending Approvals** (workflow counts), **Inventory
Risk** (low-stock + van variance), **Alerts** (compliance flags).

---

## 5. Supervisor Dashboard design

```
┌── Supervisor Home ──────────────────────────────────────┐
│ [Today's Visits 42/60]  [Coverage 70% ⚠]  [GPS flags 3] │
├─────────────────────────────────────────────────────────┤
│ ⚠ NEEDS YOU NOW                                          │
│  • 3 GPS / out-of-route → approve/deny (batch)          │
│  • 2 day-close exceptions → review                       │
│  • 5 missing visits (planned, not done) → reassign      │
├──────────────────────┬──────────────────────────────────┤
│ Customer Issues       │ Stock / Returns                  │
│  • blocked/suspended  │  • van variance 2                │
│  • credit requests 1  │  • returns spike (reason)        │
├──────────────────────┴──────────────────────────────────┤
│ Team Alerts (per rep)  →  drill to rep day               │
└─────────────────────────────────────────────────────────┘
```
Includes: **Today's Visits, Coverage, GPS Compliance, Missing Visits, Customer
Issues, Returns, Stock Issues, Team Alerts** — all from existing compliance/visit
data; **batch approve** is the key time-saver.

---

## 6. Salesman Home design (minimum clicks)

```
┌── Today ────────────────────────────────────────────────┐
│ Good morning, Ahmed · 12 stops · 3 done                  │
│ [ ▶ Start / Continue Journey ]   ← single primary action │
├─────────────────────────────────────────────────────────┤
│ NEXT STOP  ·  Al-Salam Market  ·  300m                   │
│   [ Check in ]  [ Sell ]  [ No-order ]   ← one tap each  │
├─────────────────────────────────────────────────────────┤
│ Today: Sales 4,200 · Collected 1,500 · Skipped 1        │
│ ⚠ 2 overdue customers on route → Collect                 │
├─────────────────────────────────────────────────────────┤
│ [ + Quick: New Customer · Record Payment ] (FAB)         │
└─────────────────────────────────────────────────────────┘
```
Goals: **one tap to start journey**, **one tap per stop action** (check-in /
sell / no-order with inline reason — no modal hop), end-of-day summary inline.
Everything else moves to "More".

---

## 7. Search Excellence design

Build on the **existing command palette** (already has recents/frequent).
```
[ ⌘K / Search everything… ]
 ├─ Recent           (last 5, per entity)         ← localStorage (exists)
 ├─ Suggested        (your top customers/products, route-aware)
 ├─ Results, GROUPED:  Customers · Products · Invoices · Routes
 │     • match HIGHLIGHTED, typo-tolerant
 ├─ Smart filters    (chips: status, route, channel, overdue)
 └─ Shortcuts        ("new invoice", "today's journey", "approvals")
```
- **Recent / Suggested / Grouped / Highlight / Filters / Shortcuts** — all
  client-side or on existing RLS-scoped search RPCs (`erp_search_products`,
  customer search). No new tables. Pure `combobox-reducer` extension keeps it
  testable. (Borrow Typesense/Meilisearch instant-grouped-highlighted feel.)

---

## 8. Top 50 UX improvements (ranked)

1. 🔴 Role-aware home (salesman/supervisor/manager) instead of one generic dashboard.
2. 🔴 Salesman home = **Today's Journey** with one-tap start.
3. 🔴 Consolidate scattered reports into a **Reports Center**.
4. 🔴 **Approval Center** unifying all approval types + batch approve.
5. 🔴 Exceptions-first **Attention Center** surfaced in nav (started #102).
6. 🔴 Mobile bottom-nav matched to the field loop (Today/Sell/Collect).
7. 🟢 Global quick-action **FAB** (New invoice / customer / check-in).
8. 🟢 Elevate the command palette (prominent search, ⌘K hint).
9. 🟢 One-tap visit check-in (kill the modal hop; inline reason on violation).
10. 🟢 Health/coverage **band colors** consistently across cards.
11. 🟢 Trend arrows (▲▼ + %) on KPI cards (additive `StatCard` props).
12. 🟢 "Next best action" chips on customer & invoice records.
13. 🟢 Search-first lists (don't load full catalog) — already true for combobox; extend to list pages.
14. 🟢 Saved filters / views on Customers & Invoices.
15. 🟢 Inline row quick-actions (call, collect, edit) on lists.
16. 🟢 Customer 360 with activity timeline (reuse existing data).
17. 🟢 Van Hub grouping (transfer + reconciliation + van stock).
18. 🟢 Empty states everywhere via shared `EmptyState` (consistent, helpful CTA).
19. 🟢 Status badges normalized to one variant map.
20. 🟢 Sticky primary action on long mobile forms.
21. 🟢 Skeleton loaders on all data screens (some exist) for perceived speed.
22. 🟡 Breadcrumb/back affordance consistency.
23. 🟡 Reduce settings depth via labeled subsections (partly done).
24. 🟡 Collapse sidebar to role-essentials; hide unused business-type sections.
25. 🟡 Per-screen suggested questions (Copilot chips in header).
26. 🟢 Inline "Why is this disabled?" on gated buttons (deterministic Copilot).
27. 🟡 Number formatting/RTL consistency (currency, dates) audit.
28. 🟡 Toast consistency (success/error patterns).
29. 🟡 Confirm-dialog consistency for destructive actions.
30. 🟡 Keyboard support in tables/combobox (arrow/enter).
31. 🟢 "Collect" as a first-class field action (overdue → one tap).
32. 🟢 Today summary band on salesman home (sales/collected/skipped).
33. 🟡 Pull-to-refresh on mobile data screens.
34. 🟡 Offline-tolerant messaging for field (graceful errors).
35. 🟡 Consistent page scaffolding (`PageHeader` + spacing) everywhere.
36. 🟢 Batch actions (approve/assign) where lists imply them.
37. 🟡 Density toggle (comfortable/compact) for managers.
38. 🟡 Column-level sort on report tables.
39. 🟢 Route health summary card (coverage band per route).
40. 🟢 Lost-customer surfacing (no order/visit in N days).
41. 🟡 Notification center grouping by type.
42. 🟡 Consistent icon language across nav/actions.
43. 🟡 Mobile tap-target sizing audit (≥44px).
44. 🟡 Inline validation messaging on forms (vs after-submit).
45. 🟡 "Recently viewed" customers/products.
46. ⚪ Theming/branding customization per tenant (low daily value now).
47. ⚪ Drag-and-drop dashboard widgets (nice but heavy).
48. ⚪ Full keyboard-shortcut system beyond ⌘K (later).
49. ⚪ Multi-tab/workspace UI (not field-appropriate).
50. ⚪ Desktop-grade pivot tables (against the mobile-first thesis).

---

## 9. Top 20 Mobile improvements
1. 🔴 Field-loop bottom nav (Today/Customers/Sell/Collect/More).
2. 🔴 One-tap journey start on home.
3. 🔴 One-tap per-stop actions (check-in/sell/no-order).
4. 🟢 Quick-action FAB.
5. 🟢 Sticky primary action on forms.
6. 🟢 Kill modal-in-modal flows (single-scroll forms).
7. 🟢 Inline reason capture on GPS/out-of-route (no separate screen).
8. 🟢 Skeletons + optimistic UI for perceived speed.
9. 🟢 Larger tap targets (≥44px) audit.
10. 🟡 Pull-to-refresh.
11. 🟡 Bottom-sheet pickers instead of full-page modals.
12. 🟡 Sticky search on long lists.
13. 🟡 Collapse KPI band to a swipeable row on small screens.
14. 🟡 Reduce typing: recent/suggested in search; remember last route.
15. 🟡 Offline-tolerant error messaging.
16. 🟡 One-handed reach: primary actions at thumb zone (bottom).
17. 🟡 Map/list toggle on journey.
18. 🟡 Compact currency/number display, LTR-pinned.
19. ⚪ Native-app shell/push (beyond scope now).
20. ⚪ Barcode-scan everywhere (only where stock-relevant).

## 10. Top 20 Navigation improvements
1. 🔴 Role-aware home routing.
2. 🔴 Reports Center (consolidate).
3. 🔴 Approval Center (consolidate + batch).
4. 🔴 Attention Center in nav (started).
5. 🟢 Elevate command palette as primary nav.
6. 🟢 Role-aware bottom nav.
7. 🟢 Van Hub grouping.
8. 🟢 Collapse sidebar to role-essentials.
9. 🟢 Quick-action FAB.
10. 🟡 Labeled subsections in Settings (extend).
11. 🟡 Hide empty business-type sections for FMCG tenants.
12. 🟡 Breadcrumbs on deep screens.
13. 🟡 "Recently visited" in palette (exists for platform; extend to tenant).
14. 🟡 Consistent back affordance.
15. 🟡 Pin/favorite screens per user.
16. 🟡 Section badges (counts) on Approvals/Attention.
17. 🟡 Keyboard ⌘K hint visible.
18. 🟡 Search scoped tabs (customers/products/invoices).
19. ⚪ Mega-menu (ERP-style) — avoid.
20. ⚪ Deep multi-level trees — avoid.

## 11. Top 20 Dashboard improvements
1. 🔴 Role-aware dashboards (manager/supervisor/salesman).
2. 🔴 Exceptions-first block at top.
3. 🟢 KPI trend (▲▼ %) + health bands.
4. 🟢 Coverage + route-health cards.
5. 🟢 Pending-approvals + inventory-risk cards.
6. 🟢 Lost-customer card.
7. 🟢 Team performance table (achievement %).
8. 🟢 Quick-actions row.
9. 🟢 Consistent empty states.
10. 🟡 Drill-through from every card.
11. 🟡 Date-range + branch filter persistence.
12. 🟡 "Compare to last period" deltas.
13. 🟡 Sparklines on KPI cards.
14. 🟡 Alert center inline.
15. 🟡 Density toggle (manager).
16. 🟡 Card reordering by relevance (auto, not drag).
17. 🟡 Cache/fast-load for KPIs.
18. 🟡 Mobile: swipeable KPI band.
19. ⚪ Custom widget builder.
20. ⚪ Embeddable BI.

## 12. Top 20 Manager experience improvements
1. 🔴 Manager command home (§4).
2. 🔴 Reports Center.
3. 🟢 Team performance + achievement at a glance.
4. 🟢 Route-health ranking.
5. 🟢 Lost-customer win-back list.
6. 🟢 Coverage trend.
7. 🟢 Pending approvals summary + batch.
8. 🟢 Inventory-risk surfacing.
9. 🟢 Alert center.
10. 🟡 Period/branch comparison.
11. 🟡 Exception drill-through.
12. 🟡 Export from any report (exists in places) — standardize.
13. 🟡 Saved report views.
14. 🟡 Targets vs actuals per rep/route.
15. 🟡 Credit-exposure overview.
16. 🟡 Returns-reason trend.
17. 🟡 Day-close exception overview.
18. 🟡 Scheduled report digest (later).
19. ⚪ Custom KPI builder.
20. ⚪ Forecasting/BI.

## 13. Top 20 Supervisor experience improvements
1. 🔴 Supervisor team home (§5).
2. 🔴 Batch approve (GPS/out-of-route/day-close).
3. 🟢 Today's visits + coverage at a glance.
4. 🟢 Missing-visits reassignment.
5. 🟢 GPS-compliance queue.
6. 🟢 Customer issues (blocked/suspended/credit).
7. 🟢 Returns + stock issues cards.
8. 🟢 Per-rep team alerts → drill to rep day.
9. 🟡 Reassign customer/route quick action.
10. 🟡 Van variance review queue.
11. 🟡 Coverage trend per route.
12. 🟡 Exception aging (how long pending).
13. 🟡 One-tap call/message rep.
14. 🟡 Visit timeline per customer.
15. 🟡 Skip-reason analysis.
16. 🟡 Approve-with-note inline.
17. 🟡 Route compliance heat view.
18. 🟡 Threshold config shortcuts.
19. ⚪ Live map tracking (privacy/heavy).
20. ⚪ Geofence editor UI (later).

## 14. Top 20 Salesman experience improvements
1. 🔴 "Today" home with one-tap start (§6).
2. 🔴 One-tap per-stop actions.
3. 🔴 Collect as a first-class action (overdue on route).
4. 🟢 Inline reason on GPS/out-of-route.
5. 🟢 Today summary (sales/collected/skipped).
6. 🟢 Quick New Customer / Record Payment FAB.
7. 🟢 Nearest-next-stop with distance.
8. 🟢 No-order one tap with reason.
9. 🟡 Remember last route.
10. 🟡 Recent/suggested in customer/product search.
11. 🟡 Offline-tolerant capture.
12. 🟡 End-day coverage summary inline.
13. 🟡 Map/list toggle.
14. 🟡 Product quick-add by barcode (where stock).
15. 🟡 Customer balance visible at check-in.
16. 🟡 Promo/price hints at sell (from price book).
17. 🟡 One-handed thumb-zone actions.
18. 🟡 Visit notes quick capture.
19. ⚪ Voice notes.
20. ⚪ In-app chat.

---

## 15. UX roadmap (phased — additive, low-risk, reuses existing RLS data)

**Phase U1 — Role-aware homes & centers (highest ROI)**
- Role-aware home routing; Salesman "Today"; Supervisor & Manager dashboards;
  Attention Center (started, #102); Approval Center; Reports Center.

**Phase U2 — Mobile field loop**
- Field-loop bottom nav; one-tap journey + per-stop actions; quick-action FAB;
  sticky form actions; modal-flatten.

**Phase U3 — Dashboard polish & components**
- `StatCard` trend/band props; consistent empty states + status badges; KPI
  drill-through; skeletons.

**Phase U4 — Search excellence**
- Command-palette grouping/highlight/filters/shortcuts; recent/suggested; pure
  `combobox-reducer` extension.

**Phase U5 — Consistency pass**
- Buttons/forms/tables/cards/modals/badges normalization; icon language; tap
  targets; RTL/number formatting.

> All phases are **additive UI** over existing RLS-scoped data/RPCs — no new
> modules, tables, or AI. Each ships behind small PRs with typecheck/test/build
> gates, like the Attention Center.

---

## 16. Approval gate

This is review + design only. **Recommended first build after approval:**
Phase **U1** (role-aware homes + the three Centers) — the single biggest
clarity/productivity win, fully additive. Awaiting your go before coding.
