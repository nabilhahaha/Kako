# Daily Summary & Time Tracking — Design & Preparation

**Status:** DESIGN ONLY — not implemented. Large, multi-part feature; captured here with a phased plan so we build the right thing.
**Goal:** a read-only **"ملخص اليوم"** (Daily Summary) tab on the Today screen showing the salesman's productivity, timing, and efficiency — live while the day is open, frozen when closed — plus the same timing KPIs in supervisor reports.

---

## 1. What we can build on (today)

- **Day session:** `erp_work_sessions` already has day open/close (+ close status). → day start/end, total working hours.
- **Visit outcomes:** `erp_visit_outcomes` (per visit: outcome + reason + created_at). → outcome counts.
- **Visit metrics (client, ephemeral):** `visit-metrics.ts` (sessionStorage: clicks/transitions/duration) + `active-visit.ts` (localStorage, survives restart → Resume) + telemetry `erp_field_ux_events` (`visit_started` / `visit_completed`). → partial visit timing.
- **Transactions:** `erp_invoices`, `erp_collections`, `erp_sales_returns` carry `created_at`. → counts + amounts + confirmed-at.

## 2. What's MISSING (needs new capture — system-generated, non-editable)

| Metric | Gap | Capture plan |
| --- | --- | --- |
| Invoice **started-at** (open → confirm duration) | Not stored | Stamp when the sell screen opens for a customer (client start) → persist with the invoice on commit (`started_at` column or a timing event). |
| Visit **started/ended** server-side | Only client + telemetry | Persist visit start/end into a `erp_visit_sessions` row (or extend `erp_visits`) so reports/refresh/resume are authoritative. |
| **Transition time** between customers | Derived only client-side | Compute server-side from consecutive visit end → next visit start. |
| **Productive vs idle** time | Not aggregated | Productive = Σ(visit durations + txn-creation durations); idle = day span − productive − between-visit gaps over a threshold. |

**Rules (from spec):** all timestamps **system-generated**, **no manual editing** by the salesman; consistent device/server clock; **persist on refresh**; **resume continues the same visit timer**; offline → store local timestamp + sync later (future). The summary is **read-only** for reps, available in **reports** for supervisors/admins.

## 3. Daily Summary tab — content

Today screen tabs/cards: **My Day · Truck Stock · ملخص اليوم**.

**Cards:** بداية اليوم · نهاية اليوم · إجمالي ساعات العمل · ساعات العمل الفعلية · وقت الانتقال بين العملاء · متوسط وقت الزيارة · متوسط وقت الفاتورة · عدد الزيارات · عدد الفواتير · عدد التحصيلات · عدد المرتجعات · عدد لا يوجد مبيعات · عدد العملاء غير المتاحين · عدد العملاء المغلقين.

**Invoice list:** per invoice → number · time (HH:MM → HH:MM) · duration (min) · customer · amount.
> Example: `INV-PILOT-000044 · 09:14 → 09:22 · 8 min · 79.80`

## 4. Open-day LIVE mode vs closed-day FINAL (addendum)

While the day is **open** (not yet closed), the summary is **live/temporary**:
- Title: **"ملخص اليوم حتى الآن"** (or "حتى آخر عملية").
- Day status = **Open**; End time = **—**.
- Total working hours = day-open → **now**.
- Productive hours = up to the **latest completed action**.
- **Last activity** = latest invoice / collection / return / visit outcome.
  - With activity: `آخر عملية: فاتورة INV-PILOT-000044 · آخر تحديث: 14:35`
  - None yet: `آخر عملية: لا يوجد · آخر تحديث: وقت فتح اليوم`
- Marked visibly as **live / temporary**.

On **day close**: **freeze** the final figures; title → **"ملخص اليوم النهائي"**.

**Supervisor view:** Open day → "Open Day / Live"; Closed day → "Closed Day / Final".

## 5. Supervisor report KPIs

Per salesman: Working hours · Productive hours · Idle time · Avg visit duration · Avg invoice duration · Long gaps between customers · **Visits per hour** · **Sales per productive hour**. Live for open days, final for closed.

## 6. Computation (pure, testable)

A pure `daily-summary.ts` module computes the summary from inputs (day session, visit sessions, invoices/collections/returns, outcomes, `now`):
- `workingHours = (end ?? now) − start`.
- `productiveHours = Σ visit durations (+ txn-creation durations)`.
- `transitionTime = Σ gaps(prevVisitEnd → nextVisitStart)`; `avgTransition`; `longGaps = gaps > threshold`.
- `avgVisitDuration`, `avgInvoiceDuration`.
- counts by outcome type.
- `live = !dayClosed`; `lastActivity = max(created_at across txns/outcomes)`.
Unit-tested with fixed clocks (no manual-edit path; timestamps are inputs only).

## 7. Data model additions

- `erp_invoices.started_at timestamptz null` (sell-screen open time; duration = confirmed_at − started_at).
- `erp_visit_sessions` (or extend `erp_visits`): `salesman_id, customer_id, work_session_id, started_at, ended_at, source` — authoritative visit timing (supersedes client-only metrics for reporting; client still drives Resume).
- All additive + nullable → backward compatible. Flag-gated `platform.daily_summary` (default OFF).

## 8. Phased plan

| Phase | Deliverable | Notes |
| --- | --- | --- |
| **1 — Read-only summary (recommended first)** | "ملخص اليوم" tab from EXISTING data: day open/close, counts (visits via outcomes, invoices/collections/returns + amounts), invoice list (time + customer + amount), open-day LIVE vs FINAL label + last activity. | No schema change; ships value immediately. Invoice *duration* and transition/productive split deferred to Phase 2/3. |
| **2 — Invoice + visit timing** | `erp_invoices.started_at` + `erp_visit_sessions`; invoice durations; avg visit/invoice duration; resume continues timer; persist on refresh. | Schema + capture wiring. |
| **3 — Productive vs idle + transitions** | Transition times, long gaps, productive vs idle hours, visits/hour, sales/productive-hour. | Pure `daily-summary.ts` aggregation + tests. |
| **4 — Supervisor reports** | Timing KPIs per salesman (live/final) in supervisor reports + dashboards. | Read side. |

## 9. UI placement

Today screen: a tab/segmented control (My Day · Truck Stock · ملخص اليوم). Read-only for the salesman; the same computed KPIs feed supervisor reports.

---

*Design-only. No schema/UI changes made. Recommended next step: implement Phase 1 (read-only summary from existing data) behind `platform.daily_summary`, then layer timing capture in Phases 2–4.*
