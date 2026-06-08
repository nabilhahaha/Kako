# VANTORA — Van Sales Mobile Control: Design Review (pre-implementation)

> **Status:** Design only. No code. For sign-off before implementation.
> **Flag:** `KAKO_VAN_SALES` (default OFF). Additive, multi-tenant, role-based, offline-aware, audited.
> **Architecture law:** Reuse the existing VANTORA engines (workflow, form-builder, field-governance, notifications, audit, offline-sync, pricing, collections, van-accounting). **Do not duplicate workflow/governance/offline logic.** Add the *minimum* new tables for genuine gaps; everything else is screens + thin services over existing primitives.
> **Primary target:** Mobile-first **PWA, Android-first, offline-first** for the Salesman. Office roles (Admin/Warehouse/Cashier/Supervisor/Area·Regional Manager) use the responsive desktop surface. Single codebase.

---

## 0. Goal & design principles

Build a salesman app that feels like a single guided spine:

> **Start Day → Confirm Van Load → Journey / Map → Visit Customer → Sell / Collect / Return → Print or Share → Check Stock → End Day → Reports**

Design laws (apply to every screen):
- **One job per screen, one dominant action** (bottom-anchored, thumb-reach).
- **Show only what is needed now.** Big buttons, chips over dropdowns, steppers/scanners over typing, numeric keypads for money.
- **1–2 taps for common actions** (reorder last, collect oldest, confirm load).
- **Color semantics everywhere:** red = overdue/block, amber = warning/approval, green = ok.
- **Full RTL mirroring** (not just translated strings); Arabic source of truth, English mirror.
- **Offline is the default,** not a mode. Always-visible sync status; never silently drop a record.
- **Alerts surface before the action they affect** (overdue before the order, variance before close).

---

## 1. Competitor benchmark summary

Researched: SalesBuzz, In2Distribution, Bizom, FieldAssist, Botree, Ivy/Infor DSD, Pepperi, Repsly, StayinFront, SAP DSD, Oracle DSD/Collections, Odoo, legacy HHT systems, and GCC/Saudi van-sales ERPs (Mirnah RoutePro, Coral, etc.).

### Highest-leverage ideas we will adopt (made simpler/cleaner than incumbents)
1. **Hard day-open / day-close gates** — no selling before "Start My Day"; no logout before a reconciled close (SAP DSD; GCC ERPs).
2. **One-screen start-of-day**: load confirm + cash float + (optional odometer) in a single checklist.
3. **Two-party van-load handshake** — confirm-default + adjust-exceptions, accept/reject/variance with reason; **van opening stock = accepted qty** (Bizom load-in/out; Odoo scan).
4. **Customer 360 *before* the order** — available credit, overdue + oldest-invoice age, last 3 orders, scheme eligibility on one card (GCC "outstanding before arrival").
5. **Auto-firing promotion/FOC engine** at cart; **FOC as a distinct line** (Bizom trade promotions).
6. **Credit control = block-or-override-with-reason at point of sale**, logged, with offline-queued supervisor approval (SAP credit exposure).
7. **"Collect before you sell" nudge** when overdue exists.
8. **Collections both ways** — oldest-first auto-allocation *and* pay-on-balance; partial payments; cheque photo + reference at capture (Oracle aging buckets).
9. **One-tap print with automatic PDF/WhatsApp fallback** when no printer/paper (Ivy; Odoo e-sign).
10. **ZATCA-ready bilingual invoice** (Arabic + QR) from day one for Saudi/GCC.
11. **Live "what's on my van"** updated per transaction, with low-stock badges.
12. **Day-close physical count** — expected vs counted per SKU, variance + reason mandatory.
13. **Unified handshake model** for transfers (van↔warehouse, van↔van) and returns receiving — same accept/reject/variance UI; in-transit state to avoid double-counting (Pepperi).
14. **Returns split good vs bad/expiry** with reason + photo; good returns re-enter sellable stock; auto credit note.
15. **One settlement that ties cash AND stock together** before close — not two disconnected reconciliations (SAP Settlement Cockpit).
16. **Offline-first with UUID idempotency + FIFO queue + per-entity ordering**; last-write-wins + a supervisor conflict queue; **server-assigned document numbers** (no offline number collisions).
17. **Always-visible sync state** per document and globally.
18. **Exception-first supervisor dashboard** — overrides, cash/stock variance, missed visits, overdue-without-collection at the top; standard KPIs (coverage, strike rate, lines/call, collection vs target).
19. **Geofenced check-in with reason-coded exceptions + GPS-stamped transactions;** "Navigate" via external maps deep-link.

### What incumbents do badly — we deliberately fix
- Heavy, typing-intensive, desktop-style screens → one-job screens, steppers, scanners, favorites/last-bought.
- Cash and stock reconciled separately → **one settlement that must tie out**.
- Weak/non-idempotent offline → **exactly-once UUID**, visible queue, ordering guarantees.
- Soft, ignorable credit warnings with no audit → **block-or-override-with-reason, logged**.
- Returns/FOC lumped into single buckets → split good/bad/expiry; FOC a distinct line.
- Compliance gamed by mislabeling unplanned visits → **track unplanned separately**.
- 50-chart vanity dashboards → **actionable exceptions first**.
- Partial RTL / non-ZATCA invoices → **full RTL + compliant bilingual invoice** from the start.

### 1b. Benchmark extension — field execution, customer lifecycle & approvals

Researched across Bizom, FieldAssist, Botree, Ivy/Infor DSD, Pepperi, Repsly, StayinFront, SAP DSD, SalesBuzz, Mirnah RoutePro. Per area: what's standard → the best idea we adopt → **how VANTORA does it simpler** (reusing existing engines).

| Area | Industry standard | Best idea we adopt | VANTORA (reuse) |
|---|---|---|---|
| **Supervisor route riding** | Mostly live-tracking side-effect; structured ride scoring is rare | Purpose-built "work-with" linked to the rep's *actual* visit; short tap-rating rubric; auto coaching note | `erp_route_rides` + `erp_route_ride_criteria` (0212); supervisor field mode, **never** the rep's check-in |
| **Merchandising audits** | Most mature (FieldAssist Perfect Store, Bizom AI) | **Outlet-mission-driven** audits per channel/class; split availability / share-of-shelf / planogram / POSM / competitor; roll up to one score | Surveys engine + **Perfect Store (0231)**; seeded survey template; photos via `field.attach_media` |
| **New customer creation** | Geo-tagged + photo (Botree); OTP emerging | **Live non-editable GPS + storefront photo + OTP**; channel/class at creation; **duplicate guard** (phone + geo-radius) | New-outlet intake form (form-builder, governed) → draft `erp_customers` |
| **New customer approval** | Provisional → approval before sellable (BeatRoute, Botree) | **Provisional status, sell-blocked**; tiered: supervisor=legitimacy, back-office=KYC/credit; auto-approve clean | Onboarding workflow (0088) + configurable steps; status chip + reason on reject |
| **Customer onboarding** | Lifecycle stages (Pepperi) | Visible **status pipeline** (Lead→Created→Pending→KYC→Credit→Active); each stage unlocks capability | Customer `approval_status` + workflow + entity timeline (0228) |
| **Master-data updates** | SAP MDG change-request governance | Field edits = **change requests** for governed fields (before/after, geo, audit); direct only for low-risk | **Shipped (8F)** — form → change request → approval → governed apply |
| **Field approvals (all types)** | Dynamic routing, escalation (SalesBuzz, CPQ) | **One unified approval inbox**; threshold auto-routing + SLA; **"held order" so the rep keeps selling**; offline-queued one-tap | One workflow engine + role dashboards (§6A); the 8F pattern |
| **Visit quality scoring** | Perfect Store/Call composite (FieldAssist) | **Objective task-completion** ("completeness ring"), geofence + dwell guard; separate Perfect Call vs Perfect Store; auto-scored | Surveys/Perfect Store (0231) + visit compliance (0234) |
| **Coaching notes & action plans** | Thin across majors (a real gap) | **Closed loop**: each work-with spawns ≤3 tracked actions, owner+due, revisited next time; trend scores | `erp_route_rides` + workflow follow-up; **differentiator** |
| **Display/availability/pricing** | Universal | Three fast checks: **availability tap-grid**, **price pre-fill + deviation flag**, display photo; auto-raise exceptions | Survey question types (yes/no, count, rating, photo) |
| **Photo proof / IR** | IR mature (FieldAssist IRIS, StayinFront on-device) | Standard **geo+time-stamped photo proof** everywhere; **on-device IR with instant feedback** where ROI justifies (fix shelf before leaving); before/after | `field.attach_media` now; IR as a later optional layer |
| **Geo-validation** | GPS check-in standard | **Multi-signal**: geofence, mock-location/spoof detection, **non-editable live GPS** for creation, impossible-speed flags; reason-coded override (not hard-block on weak signal) | Reuse visit GPS/compliance (0234) + capture accuracy |
| **Exception management** | Detect→alert→assign→close (YooBic, FieldPie) | **Auto-raised** from field data (OOS focus SKU, price-out-of-band, near-expiry); owner+deadline; **closure needs proof**; SLA escalation | Workflow tasks + notifications + audit (§6A) |

**Best ideas we adopt (shortlist):** outlet-mission visits · completeness-ring quality · one unified approval inbox · provisional new-outlet + tiered approval · duplicate guard · field-edits-as-change-requests · purpose-built work-with · **closed-loop coaching** · on-device IR with instant feedback · pre-filled price confirm + availability grid · multi-signal geo-validation · auto-raised exceptions with proof-verified closure.

**Incumbent weaknesses we deliberately fix:** coaching is an afterthought (→ closed loop) · approvals scattered & block the order (→ one inbox + "held order") · bloated audits (→ minimal, channel-specific, confirm-don't-retype) · IR delivered too late (→ on-device/instant) · GPS over-trusted/editable (→ signal-stacking) · dirty master data / weak outlet governance (→ OTP + duplicate-radius + tiered approval + change-request governance, rep stays unblocked via provisional status + fast SLAs).

---

## 2. Personas & Role-Based UX

**Principle:** a role sees only the minimum UI for its job. No one-size-fits-all screens. Personas map onto **existing VANTORA roles** (no parallel role taxonomy); permissions extended only where there is a real gap. One identity can hold multiple roles; the module is another capability on the same security/governance/workflow/audit model.

> **Hard rule:** the **salesman app is never overloaded** with supervisor or manager functions. Supervisor field modes (Route Riding, Merchandising Audit) and all manager dashboards are **separate, role-gated surfaces** — a salesman never sees them. Where a supervisor also sells, the two experiences are distinct entry points, not merged screens.

Role → primary surface:

| Persona | Existing role(s) | Primary surface | Stance |
|---|---|---|---|
| Salesman | `salesman` | **Phone PWA (offline)** | Transact. Simplest experience in the platform. |
| Supervisor | `supervisor` | Phone + desktop | Manage **exceptions**, not transactions. |
| Cashier | `cashier` | Desktop (phone view) | Financial **summaries**, not field screens. |
| Warehouse | `warehouse_keeper` | Desktop + scan | **Inventory movements** only. |
| Area Manager | `area_manager` | Desktop dashboards | Consume **dashboards + approvals**. |
| Regional Manager | `regional_manager` | Desktop dashboards | Area Manager, scaled to region (roll-up). |
| Admin | `company_admin` | Desktop config | **Configuration**, never field workflows. |
| Platform Owner | `platform_owner` | Cross-tenant ops | Out of van-sales scope (platform only). |

### 2.1 Salesman
- **Daily workflow:** Start Day (confirm load + cash float) → Journey/Map → Visit (check-in) → Customer 360 → Sell (cash/credit) → Collect → Return → Print/Share → next stop → Check Van Stock → End Day (count + settlement) → done.
- **Home dashboard ("Today"):** day-status banner (Open/Closed); journey progress "12/28"; cards for *loaded items awaiting confirmation*, *overdue customers on route*, *pending collections*, *cash/stock alerts*, *yesterday closing balance*. One primary CTA changes with day state ("Start My Day" → "Next Stop" → "End My Day").
- **Required reports:** my daily sales (cash/credit), my collections, my van stock balance, my returns, my shortages/excess. All phone-readable + printable.
- **Required approvals (consumes, doesn't grant):** sees status of his credit-override / variance / out-of-route requests; gets push when decided.
- **Mobile vs desktop:** **Mobile only.** Desktop not a target.
- **Top 10 actions:** ① Start Day ② Confirm load line ③ Check in ④ Open Customer 360 ⑤ Add product to cart (search/favorite/last-bought) ⑥ Take cash/credit sale ⑦ Collect payment ⑧ Print/share invoice ⑨ Record return ⑩ End Day + count.
- **Navigation:** bottom tab bar (max 5): **Today · Journey · Sell · Collect · Stock**; "More" sheet for Returns/Transfers/Reports. No nested menus.
- **KPI widgets:** Today's sales (value), Collected today, Stops done/planned, Van stock value, Pending sync count.

### 2.2 Supervisor
- **Daily workflow:** morning exception sweep → approve/deny overrides (credit, out-of-route, day-close exceptions, variance) → watch live team board → follow up overdue/old-expiry → end-of-day review of settlements.
- **Home dashboard (exception-first):** red cards at top — *credit overrides pending*, *cash/stock variances*, *missed visits*, *overdue sold-to-without-collection*, *out-of-route check-ins*, *old/near-expiry follow-ups*, *customer-update approvals*. Then a "Team today" board (per salesman: stops done, sales, collected, sync health).
- **Required reports:** team sales by customer, distribution/coverage, route compliance, visit quality, collections follow-up, returns, cash/stock variance, salesman performance summary.
- **Required approvals (grants):** credit-overdue override, high-discount, out-of-route visit, day-close exception, stock/cash variance, customer-data-update (reuses the 8F workflow), stock-transfer approval (if configured).
- **Mobile vs desktop:** **Both.** Approvals + live board on phone; deeper reports on desktop.
- **Top 10 actions:** ① Approve/deny credit override ② Approve variance + assign responsibility ③ Approve out-of-route ④ Approve day-close exception ⑤ Open salesman day card ⑥ Drill route → outlet ⑦ Follow up overdue customer ⑧ Review old-expiry ⑨ Approve customer-update ⑩ Export team report.
- **Navigation:** **Approvals · Team · Coverage · Collections · Reports.**
- **KPI widgets:** Pending approvals, Coverage %, Strike rate, Collection vs target, Variance count, Overdue exposure.

#### 2.2a Supervisor — Route Riding Mode (field, with the salesman)
A **separate supervisor-only field mode** (never in the salesman UI). The supervisor rides along and evaluates execution against **company-configurable criteria** (reuses `erp_route_ride_criteria`, 0212 — category, weight, max_score; no hardcoded scores).
- **Flow:** Start Ride (pick salesman + date) → at each visit, score the criteria → capture coaching notes → finish → ride scorecard + action plan.
- **Evaluated:** journey-plan compliance · sales-process compliance · collection-process compliance · **FIFO compliance** · merchandising (links to audit mode below) · per-criterion scoring → weighted ride score.
- **Coaching notes + action plans:** structured notes per criterion; an **action plan** (what/owner/due) becomes a follow-up the supervisor tracks (light workflow task or form-builder form — reuse, no new engine).
- **Phone UX:** one criterion list with stepper/segmented scores (0–max), a notes chip per item, photo optional, single "Finish Ride" CTA; offline-first.
- **Data:** NEW `erp_route_rides` (+ `_scores`) reusing `erp_route_ride_criteria`; action plans tracked as form/workflow items. Audited.

#### 2.2b Supervisor — Merchandising Audit Mode (field)
A **survey-driven** in-store audit — **reuses the existing surveys engine** (`erp_surveys` / `erp_survey_responses` / `scoreSurvey`) and **Perfect Store** scoring (0231); photos via `field.attach_media`. **No new audit engine.**
- **Checks:** display checks · availability (must-stock / OOS) · **share of shelf** · competitor displays · **POSM** presence · **pricing checks** · photo capture → **merchandising score**.
- **Phone UX:** a survey form (yes/no, rating, count, photo question types already supported by the survey model) with auto-scoring; before/after photos; offline.
- **Data:** reuse surveys + perfect-store; a "merchandising audit" is a seeded **survey template** (form-builder/survey), not a new table. Competitor capture = survey fields + photo.


### 2.3 Cashier
- **Daily workflow:** receive salesman settlements → reconcile expected vs actual cash per salesman → review cheques/transfers → confirm/handover → daily close → variance review.
- **Home dashboard:** today's settlements queue (per salesman: expected/declared/variance, status); totals strip (expected cash, received, variance); cheques awaiting deposit.
- **Required reports:** cash sales, collections, expected vs actual cash, variance, per-salesman settlement, cheque register.
- **Required approvals:** confirm settlement / accept handover; flag variance to supervisor (does **not** approve field exceptions).
- **Mobile vs desktop:** **Desktop primary;** phone view for spot checks.
- **Top 10 actions:** ① Open settlement ② Verify cash by mode ③ Match cheque list ④ Confirm/accept handover ⑤ Flag variance ⑥ Reprint receipt ⑦ Close cashier day ⑧ Export cash report ⑨ View salesman history ⑩ Search collection by reference.
- **Navigation:** **Settlements · Cash · Cheques · Reports.**
- **KPI widgets:** Expected cash today, Received, Variance, Settlements pending, Cheques to deposit.

### 2.4 Warehouse
- **Daily workflow:** prepare/issue van loads → (await salesman confirmation) → receive returns → approve/confirm stock transfers → reconcile van stock at end of route → investigate variance.
- **Home dashboard:** loads to issue today; loads awaiting salesman confirmation (+variances); returns to receive; transfers pending approval; closings to receive.
- **Required reports:** loaded stock, confirmed received (salesman-accepted), sold, returned, closing, variance, items to receive.
- **Required approvals:** stock-transfer approval (van↔warehouse, van↔van) when configured; receive-returns confirmation; closing-stock acceptance handshake.
- **Mobile vs desktop:** **Desktop + handheld/scan;** mobile for the receiving handshake.
- **Top 10 actions:** ① Create/issue load ② Review load variance ③ Receive returns (good/bad) ④ Approve transfer ⑤ Accept van closing ⑥ Investigate variance ⑦ Adjust on approval ⑧ Print load sheet ⑨ Export warehouse report ⑩ View van stock ledger.
- **Navigation:** **Loads · Transfers · Returns · Reconcile · Reports.**
- **KPI widgets:** Loads to issue, Awaiting confirmation, Returns to receive, Transfers pending, Variance to investigate.

### 2.5 Area Manager
- **Daily workflow:** consume area dashboards → monitor approvals/SLAs → manage exceptions by drill-down (no transactions).
- **Home dashboard (consumption, drill-down):** ① **team performance** (salesman roll-up) · ② **supervisor performance** (per-supervisor coverage, approvals SLA, ride/audit activity) · ③ **route-riding review & coaching analysis** (ride scores, weakest criteria, open action plans) · ④ **merchandising compliance** (audit scores, availability/OOS, share-of-shelf, POSM, pricing-compliance trends) · ⑤ **coverage & distribution** tracking · ⑥ **exception management** · ⑦ **approval monitoring** (backlog/aging).
- **Required reports:** region/area sales, coverage, distribution, collections, overdue/aging, team productivity, **supervisor performance**, **route-riding scorecards & coaching analysis**, **merchandising compliance**, approval monitoring, exceptions.
- **Required approvals:** escalations only (e.g., above-cap credit, large variance) routed by workflow.
- **Mobile vs desktop:** **Desktop dashboards;** phone for escalated approvals.
- **Top 10 actions:** ① Open area dashboard ② Drill supervisor→salesman ③ Review route-riding/coaching analysis ④ Review merchandising compliance ⑤ Review overdue exposure ⑥ Approve escalation ⑦ Compare routes/coverage ⑧ Track distribution ⑨ Export area report ⑩ Watch approval SLA.
- **Navigation:** **Dashboard · Team · Supervisors · Coverage · Merchandising · Approvals · Reports.**
- **KPI widgets:** Area sales vs target, Coverage %, Distribution %, Collection vs target, Overdue exposure, Avg ride score, Merchandising compliance %, Approval backlog, Active salesmen/supervisors.

#### 2.5b Regional Manager
Same consumption model as Area Manager, **rolled up to region** (multi-area). Adds cross-area comparison (area-vs-area league), supervisor-performance benchmarking across areas, regional route-riding & merchandising-compliance trends, and top-of-funnel approval/exception monitoring. **Desktop dashboards; phone for escalations only.** Navigation: **Region Dashboard · Areas · Supervisors · Merchandising · Approvals · Reports.** KPI widgets: Region sales vs target, Area league, Coverage/Distribution %, Collection vs target, Overdue exposure, Ride/Merchandising compliance trend, Approval SLA.

### 2.6 Admin (Company Admin)
- **Daily workflow:** configure, not operate — users/roles/permissions, workflow config, governance config, forms, notifications, master data, system/company settings (incl. the van-sales policy rules).
- **Home dashboard:** config health — flag states (`KAKO_VAN_SALES` etc.), pending governance versions, workflow definitions, master-data gaps, notification templates.
- **Required reports:** audit log, permission matrix, workflow run health, config change history.
- **Required approvals:** none operational (governs the approval *configuration*).
- **Mobile vs desktop:** **Desktop only.**
- **Top 10 actions:** ① Assign roles ② Configure credit-block rules (warn/approve/block) ③ Configure variance workflow ④ Edit forms (form-builder) ⑤ Field governance ⑥ Notification templates ⑦ Master data (products/routes/lookups) ⑧ Company settings ⑨ Review audit ⑩ Toggle feature flags.
- **Navigation:** **Users & Roles · Workflows · Governance · Forms · Master Data · Settings.**
- **KPI widgets:** Flag states, Pending approvals config, Governance drafts, Audit volume, Active users by role.

---

## 3. Proposed mobile UX flow (Salesman spine)

```
START DAY ─────────────────────────────────────────────────────────────
  • Confirm Van Load (accept / reject / accept-with-variance, reasons)
  • Enter cash float (numeric pad)   • (optional) odometer
  • Review: overdue on route, pending collections, yesterday closing
  → Day is OPEN  (selling unlocked)

JOURNEY / MAP ─────────────────────────────────────────────────────────
  • Today list (sequence, distance, last visit, outstanding, aging, overdue)
  • Map toggle · "Nearest first" · unplanned visit flagged separately
  → tap a customer

VISIT ─────────────────────────────────────────────────────────────────
  • Geofenced Check-in (out-of-fence → reason)   • GPS-stamped
  • CUSTOMER 360 (credit RAG header, overdue + oldest age, last 3 orders, FOC eligible)
       ┌──────────────┬──────────────┬──────────────┐
       │  SELL        │  COLLECT     │  RETURN      │
       └──────────────┴──────────────┴──────────────┘

  SELL: pick products (search/favorites/last-bought) → qty steppers →
        auto promo/FOC line → tender (Cash | Credit) →
        credit check (warn / approve / block per company rule; credit needs NO due date) →
        confirm → PRINT or SHARE (PDF/WhatsApp; ZATCA QR)
  COLLECT: pay-by-invoice (oldest-first auto-allocate) OR pay-on-balance →
        mode (cash/transfer/cheque) → cheque photo+ref if cheque → receipt print/share
  RETURN: invoice ref (optional) → product → condition (good/damaged/expired) →
        qty → reason → photo if required → credit note

CHECK STOCK (anytime) ─────────────────────────────────────────────────
  • Live "what's on my van": open / sold / returns / expected; low-stock badges

END DAY ───────────────────────────────────────────────────────────────
  • Physical count (expected vs counted per SKU; variance + reason)
  • ONE settlement: cash (float + cash sales + collections − refunds) by mode
       AND stock (loaded − sold − returns − transfers = expected vs counted)
  • Submit → locks day; variances open the variance workflow (no auto-deduction)

REPORTS ───────────────────────────────────────────────────────────────
  • My day: sales / cash / credit / collections / stock / returns / shortages
```

Everything in this spine is **offline-first**: each transaction is written locally with a client UUID, queued FIFO, and applied exactly-once on sync; a global + per-document sync chip is always visible.

---

## 4. Screen list (by role)

**Salesman (phone):** Today/Home · Start-Day (Load Confirm, Cash Float) · **Stock Request** (request lines + suggested/avg-daily, urgent) · **New Customer** (intake: name/phone/CR-VAT/national-address, GPS, storefront photos, channel/classification/route suggestion, notes) · Journey List · Map · Customer 360 · Sell (Product Search/Cart, Tender, Credit-check modal) · Invoice Done (Print/Share) · Collect (Outstanding list, Tender, Cheque capture, Receipt) · Return (Condition, Reason, Photo) · Van Stock (live) · **Load Confirmation** (accept/reject/variance) · Transfer (send/receive) · End-Day (Count, Settlement) · My Requests & Status · My Reports · Sync/Queue.

**Supervisor:** Exceptions Inbox · Approval detail (credit / variance / out-of-route / day-close / customer-update) · Team Today board · Salesman Day card · Coverage/Route compliance · Collections follow-up · Old-expiry follow-up · **Route Riding** (Start Ride, Criteria Scorecard, Coaching Notes, Action Plan) · **Merchandising Audit** (survey form, photo capture, score) · Reports.

**Cashier:** Settlements queue · Settlement detail (by mode) · Cheque register · Cash report · Daily close · Variance review.

**Warehouse:** Loads board (approved · pending prep · prepared · dispatched · pending confirmation · rejected · variance) · Load detail + variance · Picking/Dispatch list · Returns receiving · Transfer approvals · Van reconciliation · Variance investigation · Reports.

**Area/Regional Manager:** Area/Region dashboard · Team performance · Supervisor performance · Route-riding & coaching analysis · Merchandising compliance · Coverage/Distribution · Collections/Overdue · Approvals/escalations · Reports.

**Admin:** Users & Roles · Permissions · Workflow config · Governance config · Forms · Notifications · Master data · Company/Van-sales settings · Audit.

---

## 5. Data-model impact (reuse / extend / new)

**Reuse engines as-is (no new logic):** `src/lib/workflow/*`, `src/lib/form-builder/*`, `src/lib/erp/field-governance*`, `src/lib/offline-sync/*`, `src/lib/erp/audit.ts`, notifications, `src/lib/commercial/pricing/*`, `src/lib/distribution/collections/*`, `src/lib/van-accounting/*`, export engine, PWA shell.

**Reuse tables already covering requirements:**

| Requirement | Existing table / RPC |
|---|---|
| Van as stock location | `erp_warehouses(is_van=true)`, `erp_stock_movements` |
| Suggested / planned load | `erp_suggested_loads(+lines)` (0233), `erp_van_load_manifests` (0194) |
| Stock request → van | `erp_stock_requests` + `erp_approve_stock_request()` |
| Van↔warehouse/van transfer | `erp_van_transfers` (0133) |
| Opening balances / expenses | `erp_van_opening_balances`, `erp_van_expenses(+categories)` (0229) |
| Cash reconciliation | `erp_van_cash_reconciliations` (0229) |
| Stock reconciliation | `erp_van_reconciliation` (0138) |
| Day settlement / route P&L | `erp_van_day_settlements` (0229) + `van-accounting` lib |
| Visits / check-in (offline) | `erp_visits`, `erp_check_in_visit()` (0234), `erp_visit_compliance` |
| Journey plan | `erp_journey_plans` (0129); routes `erp_routes` (0062) |
| Sales (cash/credit) | `erp_invoices(+lines)` (idempotent, 0118), `erp_sales_orders` |
| Pricing / promo / FOC | pricing engine + `erp_promotions` (0217) |
| **Credit overdue policy (warn/approve/block)** | **`erp_credit_block_rules`** (0222): `trigger='overdue_balance'` → `block_mode ∈ {warning, approval_required, soft_block, hard_block, none}` — **direct match to requirement #2** |
| Collections (by-invoice / balance) | `erp_collections(+allocations)` (0192), `erp_record_payment()` idempotent |
| Returns (reasons/photo) | `erp_sales_returns(+lines)`, `erp_return_reasons` (0140), `field.attach_media` |
| Customer 360 / timeline | `erp_customers`, `erp_entity_timeline` (0228), profitability/credit libs |
| Company toggles | `erp_fmcg_settings` |
| Offline queue | `erp_offline_mutations`, `erp_device_sessions` (0230) + APPLY_WHITELIST |

**Architecture decisions (challenging the maximal "new tables" view):**
- **No new `van_sales_orders` table.** A van sale **is an invoice** — reuse `erp_invoices` (already idempotent for offline exactly-once). Draft/quote = `erp_sales_orders`. This avoids a parallel sales ledger and duplicated pricing/credit/GL logic.
- **No bespoke "exceptions" table.** Credit overrides, variance approvals, transfer approvals are **workflow tasks** on the existing engine (don't duplicate workflow logic). The 8F form/workflow pattern (just shipped) is the template.
- **Credit-overdue behavior = `erp_credit_block_rules`** (already supports warn/approve/block). **Credit invoice with no due date:** make `due_date` optional for credit tender (terms-derived or open); a small invoice-logic change, not a new table.
- **Daily salesman summary = a query/view,** not a stored table (compute from invoices+collections+expenses for the day); add a materialized rollup later only if perf requires.
- **Stock request & load = the existing `erp_stock_requests` (0011) extended** (`origin`, per-line `approved_qty` + audited before/after) driven by a **configurable workflow chain** + the load-confirmation handshake (`erp_van_load_confirmations`) + **ledger posting (`erp_stock_movements`) only on confirmation.** No parallel loading system; no direct stock movement without an approved/confirmed transaction.
- **New customer = a draft `erp_customers` row** (`approval_status='pending'` / `is_active=false`) created via a new-outlet intake form (form-builder, governed) + the **onboarding workflow** (reuse 0088); activated by `update_record` on approval. No new customer table.
- **Approval chains = per-company workflow definitions** (Workflow Builder 8A), role-based steps, N configurable — **no approval-config table, no hardcoded users, no separate approval system.**

**Genuinely NEW (the real gaps):**

| New entity | Why it's new | Shape (sketch) |
|---|---|---|
| `erp_van_load_confirmations` (+ `_lines`) | The **two-party accept/reject/variance handshake** on a load. Manifest (0194) records what was loaded; this records the **salesman's confirmation** and is the gate so **only accepted qty enters van stock**. | header: manifest_id, salesman_id, warehouse_id(van), status(pending/accepted/rejected/accepted_with_variance); line: product_id, loaded_qty, accepted_qty, variance_qty, reason. Audited. |
| `erp_van_variances` | Unified **variance record** (stock or cash) feeding the **variance workflow** (req #14): responsibility (salesman/warehouse/system_adjustment), status, no auto-deduction. | company_id, source(load/closing/cash/transfer/return), kind(stock/cash), ref_id, qty/amount, responsibility, status(pending/confirmed/reviewed/approved/rejected), workflow_instance_id. |
| `erp_van_sales_settings` *(thin, optional)* | Company van-sales rules not covered by `erp_fmcg_settings`: require_physical_count_on_close, allow_negative_van_stock(false), discount_cap_pct, print_required, etc. | one row per company. |
| `erp_route_rides` (+ `_scores`) | **Supervisor route-riding** session + per-criterion scores. **Reuses `erp_route_ride_criteria` (0212)** for the configurable criteria/weights; coaching notes inline; **action plans** tracked as form/workflow follow-ups (no new engine). | header: supervisor_id, salesman_id, route_id, ride_date, total_score, status; score: criterion_id, score, note, photo_ref. Audited, offline. |

**Merchandising Audit = surveys, not a new table.** The audit (display/availability/share-of-shelf/competitor/POSM/pricing/photo → score) **reuses the surveys engine** (`erp_surveys`, `erp_survey_responses`, `scoreSurvey`) + **Perfect Store** scoring (0231) + `field.attach_media` photos. A "Merchandising Audit" is a **seeded survey template** (form-builder/survey question types: yes/no, rating, count, select, photo). Manager **merchandising-compliance** and **route-riding/coaching** dashboards are **queries/roll-ups** over `erp_survey_responses` / `erp_route_rides` / `erp_intel_health_snapshots` (0232) — **no new dashboard tables.**

> Net: ~**2–3 new tables**; the rest is screens + thin services + workflow definitions over existing primitives. The reuse map estimated ~70% plug-and-play, ~20% extension, ~10% new — this design pushes "new" down further by reusing invoices and the workflow engine for exceptions.

**Offline-sync plug-in (reuse the 8F/visit pattern):** add to `APPLY_WHITELIST` (create-only, idempotent, server-validated): `van_invoice`, `collection` (exists), `van_return`, `van_load_confirmation`, `van_transfer_action`, `van_stock_count`. Each gets a handler in `/api/internal/offline-sync` that reuses the **same** server services as the online path (no forked business logic), returning a verdict.

---

## 6. Workflow list (on the existing engine — no duplication)

All via `erp_workflow_start` / event dispatch + `update_record` (incl. the generic `patch_from_context` apply just shipped). Global, company-configurable definitions; `KAKO_VAN_SALES`-gated emitters.

1. **Credit override at point of sale** — emitted when `erp_credit_block_rules` returns `approval_required` (or rep overrides a warning). Routes to Supervisor; on approve, sale proceeds; logged. Offline-queued.
2. **Stock/cash variance** — on load-confirmation variance, closing variance, or cash variance: opens `erp_van_variances` + workflow → salesman confirms → warehouse reviews → supervisor approves → responsibility assigned → **adjustment posted only on approval** (no auto-deduction).
3. **Stock transfer approval** — van↔warehouse / van↔van: sender proposes → receiver accept/reject/variance → (optional) warehouse/supervisor approval → stock moves only after acceptance/approval. In-transit state prevents double-count.
4. **Day-close exception** — close with unexplained variance or unsynced docs blocked; exception routes to supervisor (`day.approve_close_exception`).
5. **Out-of-route / GPS exception** — reuse `erp_visit_compliance` + `visit.approve_out_of_route`.
6. **Returns approval (optional)** — damaged/expired above threshold → supervisor.
7. **Customer-data update** — **reuse the 8F workflow already shipped** (form → change request → approval → apply).

---

## 6A. Approval-driven field operations (one engine, configurable, role-based)

**Law:** every important field action runs on the **single VANTORA workflow engine** — **no separate Van Sales approval system.** All of them reuse the **8F pattern already shipped**:

```
Form (form-builder, governed)  →  intake/change-request row (the workflow subject)
  →  domain event (offline-queued, started on sync)  →  workflow (N role-based steps)
  →  governed apply (update_record / activate)  →  notify  →  full audit trail
```

**Configurability (per company, no hardcoding):**
- Approval **chains are workflow definitions** edited via the existing **Workflow Builder (8A)** — each company chooses **how many steps** and **which role** approves each. A **global default** definition ships; a tenant **clones + edits** it.
- Approval steps are **role-based** (`approver_type='role'`, `approver_ref=<role key>`) — **never hardcoded users**. Reassignment/escalation/SLA reuse the engine.
- **Offline-first:** submissions queue and **start on sync** (the #259 operational-completeness pattern). **Idempotent**, exactly-once.
- **Audited:** every step in `erp_audit_logs` + the run's step history; before/after captured on data changes (8F `__audit`).

**Approvals surface in the correct role dashboard** (all read the *same* workflow tasks, filtered by role/assignment — one source of truth):

| Role | Sees |
|---|---|
| Salesman | **My requests** + live status (submitted / approved / rejected / changes-requested) |
| Supervisor | **Approvals pending for my team** (+ adjust authority where granted) |
| Area / Regional Manager | **Escalations + approvals** routed to me |
| Warehouse | **Stock approvals** (load/transfer) + prepare/confirm tasks |
| Cashier | **Cash settlement approvals** |
| Admin | **Workflow configuration** (definitions, steps, roles, SLAs) |

### The field-approval flows (all on the one engine)
1. **New Customer Creation** — salesman submits a new-outlet **intake form** (name, phone, CR/VAT, national address, **GPS**, **storefront photos**, channel/classification/route suggestion, notes). Creates a **draft customer** (`erp_customers`, `is_active=false` / `approval_status='pending'`). Flow: salesman submit → supervisor review → **Approve / Reject / Request changes** → on approve the customer **becomes active** (governed `update_record`); on reject stays draft/inactive. Reuses the seeded **customer onboarding** workflow (0088) + form-builder. Full audit. **Guardrails:** live **non-editable GPS**, storefront photo, optional **OTP** phone verification, and a **duplicate guard** (phone + geo-radius) at creation; the rep stays **unblocked** (provisional/draft) while approval runs (fast SLA).
2. **Customer Data Update** — **already shipped (8F).** Salesman requests changes (phone/GPS/CR/VAT/national address/channel/classification/route) → supervisor **or** data-admin approval **per company config** → approved changes apply through the governed workflow path.
3. **Route Riding Report** — supervisor submits (salesman, route, customers visited, execution score, coaching notes, action plan) → **Area Manager review if configured** → **action plan tracked until closed** (reuses `erp_route_rides` + workflow).
4. **Merchandising Issue** — supervisor *or* salesman records (customer, photo, issue type, competitor activity, display/availability/price issue) → assigned **owner reviews** → action taken → **closed with audit** (reuses surveys/forms + workflow + `field.attach_media`).
5. **Stock / Cash Variance** — salesman/warehouse records (shortage/excess, reason, evidence) → warehouse/cashier review → supervisor approval → **responsibility assigned** → **no automatic deduction without approval** (reuses `erp_van_variances` + workflow).

---

## 6B. Van Stock Request, Supervisor Adjustment & Load Approval Workflow

A core FMCG loading loop, fully on the existing engine + ledger. **No direct stock movement without an auditable approved/confirmed transaction.**

### Entities (reuse-first)
- **`erp_stock_requests` (+ `_lines`)** — reuse/extend the existing stock-request entity (0011) as the request **and** load header. Header: salesman_id, warehouse_id, requested_date, **origin** (`salesman` | `supervisor_direct`), urgent flag, status, notes. Line: product_id, **requested_qty**, **approved_qty**, reason, plus decision context (current van stock, avg daily sales, suggested qty — from **Suggested Loads 0233** when available).
- **Approval chain = workflow definition** (configurable per company — no new config table). Role-based steps; the engine routes.
- **`erp_van_load_manifests` (0194)** — what warehouse prepares/dispatches (the physical load).
- **`erp_van_load_confirmations` (+ `_lines`)** — the salesman accept/reject/**accept-with-variance** handshake; **only confirmed qty posts to van stock.**
- **`erp_van_variances`** — variance workflow (no auto-deduction).
- **`erp_stock_movements`** — the **ledger**; van stock posts here only on confirmation; reversals only via controlled adjustment workflow.
- **Audit** — every adjustment preserves **before/after** (original_qty, adjusted_qty, adjusted_by, timestamp, reason) via `erp_audit_logs` (8F `__audit` shape).

### 1) Salesman stock request (mobile)
Request line shows **current van stock**, **avg daily sales**, **suggested qty** (0233) to make typing minimal; urgent flag; reason/notes. Submit → starts the configurable approval workflow (offline-queued, starts on sync).

### 2) Supervisor adjustment authority (audited)
At the supervisor step the supervisor may: **approve as-is**, **reject**, **add item**, **remove item**, **increase qty**, **reduce qty**, **split request**, **send back to salesman for clarification**. **Any quantity change requires a reason.** Each line keeps `requested_qty` immutable and records `approved_qty` + an **audited before/after** (original, adjusted, by, timestamp, reason). "Send back" returns the run to the salesman (a clarification step) without losing history.

### 3) Configurable approval chain (no hardcoding)
The chain is a **per-company workflow definition** (Workflow Builder). The four example companies are just different definitions of the **same** engine:

| Company | Chain (role-based steps) |
|---|---|
| A | Salesman request → **Supervisor** → Warehouse load → Salesman confirm |
| B | Salesman request → **Supervisor** → **Area Manager** → Warehouse load → Salesman confirm |
| C | Salesman request → **Supervisor** → **Warehouse approval** → Salesman confirm |
| D | Salesman request → **Supervisor** → **Area Manager** → **Warehouse approval** → Salesman confirm |

Warehouse **prepares the load only after all required approvals**.

### 4) Supervisor direct load assignment
Supervisor creates a load for any salesman on the team (origin `supervisor_direct`): select salesman + warehouse + items/qty + reason → optional **Area Manager** / **Warehouse** approval per company config → salesman gets a **load confirmation task**. **Supervisor-created loads never auto-enter van stock**; salesman confirmation is required **unless** the company explicitly enables auto-confirmation (**disabled by default**, `erp_van_sales_settings`).

### 5) Salesman load confirmation
**Accept full** / **Reject full** / **Accept with variance** (short, extra, damaged, wrong item, expiry). Variance → creates `erp_van_variances` → warehouse review → supervisor review if configured → responsibility assigned → **stock posts only the confirmed/approved qty** (ledger `transfer_in`).

### 6) Warehouse execution (desktop)
Dashboard states: **approved load requests · pending preparation · prepared · dispatched · pending salesman confirmation · rejected · variance cases.** Warehouse **cannot finalize a load into van stock until salesman confirmation is complete**, unless company policy allows **forced closure with approval** (`erp_van_sales_settings` + a supervisor/manager approval step).

### Status lifecycle
`draft → submitted → under_approval → approved → preparing → prepared → dispatched → awaiting_confirmation → confirmed → closed` (with `rejected` / `sent_back` / `variance_review` branches). Ledger posting happens **only** at `confirmed`.

---

## 7. Reports list

Reuse the **export engine** (`/api/export`, CSV/XLSX/JSON) + **van-accounting** lib + **route-intel** snapshots (0232); printable via browser print + **PDF/WhatsApp share**; ZATCA-compliant invoice template.

- **Salesman:** daily sales summary · cash sales · credit sales · collections · stock balance · returns · shortages/excess · **stock requests: requested vs approved vs received qty · pending loads · rejected loads · load variance history**.
- **Cashier:** cash sales · collections · expected cash · actual received · variance · per-salesman settlement · cheque register.
- **Warehouse:** loaded stock · confirmed received · sold · returned · closing · variance · items to receive · **approved load list · picking list · dispatch list · confirmation status · variance report**.
- **Supervisor:** sales by customer · distribution · coverage · journey-plan compliance · overdue-sold-to · returns · cash/stock variance · salesman performance · **route-riding scorecards & coaching/action-plan status** · **merchandising audit scores (availability / share-of-shelf / POSM / pricing compliance)** · **stock requests by salesman · approved/rejected/modified (adjusted qty) · pending approvals · load performance by route/salesman**.
- **Area/Regional Manager:** region/area sales · coverage · distribution · collections · overdue/aging · team productivity · **supervisor performance** · **route-riding & coaching analysis** (trend, weakest criteria, open action plans) · **merchandising compliance** (audit-score trend, OOS, share-of-shelf, pricing) · **stock-request trends · supervisor adjustments · rejected requests · shortage/excess trends · warehouse service level** · approval monitoring.

Aging buckets (**current · 1–30 · 31–60 · 61–90 · 90+**) computed from invoice dates vs payment status (no new table; a shared `aging()` helper).

---

## 8. Risks & assumptions

**Assumptions**
- Roles map to existing `salesman / supervisor / cashier / warehouse_keeper / area_manager / regional_manager / company_admin / platform_owner`; only thin new **permissions** added where a gap exists (e.g. `vansales.load.confirm`, `vansales.variance.approve` if not covered by `reconciliation.approve`).
- PWA Android-first, offline-first, single codebase; office roles on desktop.
- Saudi/GCC ZATCA invoice compliance is required for go-live in those tenants.
- Reusing `erp_invoices` for van sales is acceptable (vs a separate van order ledger).

**Risks & mitigations**
- **Offline document numbering collisions** → server-assigned numbers or reserved per-device ranges; UUID idempotency (reuse offline-sync).
- **Negative van stock** from offline over-selling → soft-block at cart on live van stock; reconcile on sync; `allow_negative_van_stock=false` default.
- **Printer dependency** (Bluetooth thermal) → PDF/WhatsApp fallback; printer is PWA-limited → may justify a later Capacitor wrapper (out of scope now).
- **Credit check staleness offline** → evaluate against last-synced balance + queue approval; supervisor sees real-time on decision.
- **Cash/stock reconciliation drift** → single settlement that must tie out; variance workflow with no auto-deduction.
- **Scope creep** → strict small-PR sequencing (below), each flag-gated + CI-green.
- **ZATCA correctness** → treat e-invoice as its own hardening PR with integration tests.

---

## 9. Implementation plan (small, flag-gated PRs)

Every PR: additive, `KAKO_VAN_SALES`-gated (default OFF), multi-tenant RLS, audited, with unit + integration tests; engine-reuse-first; CI green before the next.

**Phase A — Foundations**
1. `KAKO_VAN_SALES` flag + module skeleton (lib + i18n `van-sales.ts` + permission gaps) + nav entries (hidden by flag).
2. **Start/End Day** state machine reusing `erp_work_sessions` + day-open/close gates (no selling until open; no close until reconciled). Salesman "Today" shell.

**Phase B — Inbound stock**
3. **Van load confirmation** (`erp_van_load_confirmations`) — accept/reject/variance handshake; only accepted qty → van stock; audited; offline.
4. **Stock transfer** handshake (reuse `erp_van_transfers`) + approval workflow.

**Phase C — Field selling**
5. **Journey + Map + Check-in** (reuse `erp_journey_plans`/`erp_visits`/`erp_check_in_visit`) — salesman list/map.
6. **Customer 360** card (reuse customer/credit/aging/timeline).
7. **Sell** (reuse `erp_invoices` + pricing + promo/FOC) — cart, tender, **credit no-due-date**, **credit-overdue rule (warn/approve/block)** via `erp_credit_block_rules` + override workflow. Offline.
8. **Print/Share** invoice (browser print + PDF/WhatsApp) — ZATCA template as a follow-up sub-PR.

**Phase D — Money & goods back**
9. **Collections** (reuse `erp_collections`) — by-invoice (oldest-first) + by-balance, modes, cheque photo, receipt. Offline.
10. **Returns** (reuse `erp_sales_returns`) — good/bad/expiry, reason, photo, credit note. Offline.

**Phase E — Close the loop**
11. **Van stock (live)** view + **End-Day physical count**.
12. **Settlement** (one screen, cash+stock) + **variance workflow** (`erp_van_variances`, no auto-deduction).

**Phase F — Oversight**
13. **Supervisor** exception inbox + approvals + team board.
14. **Supervisor — Route Riding Mode** (`erp_route_rides` reusing `erp_route_ride_criteria` 0212): scorecard, coaching notes, action plans (FIFO / journey / sales / collection compliance). Offline.
15. **Supervisor — Merchandising Audit Mode** (reuse surveys + Perfect Store 0231 + photo): seeded audit template, auto-score, competitor/POSM/share-of-shelf/pricing. Offline.
16. **Cashier** settlement reconciliation + daily close.
17. **Warehouse** reconciliation + variance investigation.
18. **Reports** (salesman/cashier/warehouse + route-riding scorecards + merchandising compliance) via export engine.
19. **Area/Regional Manager** dashboards — team & **supervisor performance**, **route-riding/coaching analysis**, **merchandising compliance**, coverage/distribution, exception & approval monitoring (roll-up queries over existing data) + escalation approvals.

**Phase G — Hardening**
20. ZATCA e-invoice compliance (Saudi tenants) + integration tests.
21. Offline conflict review queue + numbering hardening.
22. Performance (daily rollups if needed) + pilot readiness checkpoint.

### Approval-driven flows (fold into the phases above; each = one small PR on the existing engine)
- **Phase B — Stock request & load approval (§6B):** ⓐ Salesman stock request (extend `erp_stock_requests`, reuse Suggested Loads 0233 for suggested/avg-daily) + **configurable approval chain** (workflow def, role-based, N steps). ⓑ **Supervisor adjustment authority** (add/remove/±qty/split/send-back, reason-required, **audited before/after**). ⓒ **Supervisor direct load** (origin `supervisor_direct`, no auto-confirm by default). ⓓ **Warehouse load execution** (prepare/dispatch states, reuse `erp_van_load_manifests`). ⓔ **Salesman load confirmation** (`erp_van_load_confirmations`, accept/reject/variance) → **ledger post on confirm only**.
- **Phase C — New Customer Creation (§6A.1):** draft `erp_customers` via new-outlet intake form (GPS + storefront photos) → onboarding approval → activate.
- The remaining §6A flows (Customer-data update [shipped], Route-riding report, Merchandising issue, Stock/cash variance) ride the **same engine** as the 8F customer-data-update — each a thin intake form + a configurable workflow definition.

---

## Open questions for sign-off
1. **Van sale = invoice (reuse `erp_invoices`)** vs a separate van order ledger — confirm the reuse decision.
2. **Exceptions via workflow tasks** (no bespoke table) — confirm.
3. New **permissions** vs reusing `reconciliation.approve` etc. — list to finalize once Phase A lands.
4. **ZATCA** required for first pilot, or fast-follow?
5. Bluetooth printing acceptable as **PDF/share-only** for the PWA phase (native wrapper later)?
