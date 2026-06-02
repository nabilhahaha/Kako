# VANTORA — Platform UX / Navigation / Performance Review

*Read-only review grounded in the live app (App Router pages, `navigation.ts`, layout/sidebar/bottom-nav, list pages, dashboard, onboarding) · no code changed · no merge · no production migrations.*

---

## Executive summary

The platform has a **solid UX backbone**: a grouped sidebar + command palette (⌘K), a mobile bottom-nav + drawer, card-vs-table responsive lists, a shared `EmptyState`, an app-level error boundary (Sentry + retry) and loading skeleton, and **CI-enforced ar/en parity**. Transactional lists (Invoices, Orders) are **server-paginated with debounced search**.

The gaps are concentrated in **a few high-volume list screens** (Customers, Products, Suppliers, Inventory) that **load all rows unbounded**, some **without search or empty states** — and the Customers list now also runs **per-row governance redaction**. None are architectural; all are contained, well-understood fixes. **Verdict: pilot-ready after a small Must-Fix set**, with a clear path to scale.

## Per-persona findings

### 1. Platform Owner
- Dedicated provider nav section (5 items) + redirect to `/platform`; companies, audit log, billing reachable. **Good.**
- Cross-company field-template/copy actions exist (DFG) but **no Platform UI** for company→company copy yet (server action only). *(Should-Fix; already noted in DFG.)*

### 2. Company Admin
- Settings is **18 items across 5 labeled subsections** (Organization / Data & Fields / Integrations / Governance / Personal) — discoverable. **Good.**
- Field Governance, Customer Data, Custom Fields, Workflows, Audit all present and permission-gated. **Good.**
- Onboarding (`/onboarding` self-service company creation) → `/setup` wizard (business-type profiles) → app, with layout redirects. **Good.**

### 3. Operational users (Sales Rep / Supervisor / Finance / Collection / Warehouse)
- Module + permission gating keeps each role's nav tight; mobile bottom-nav gives Home/Customers/Invoices/Inventory quick tabs. **Good.**
- **All roles land on the same general sales dashboard** — not tailored (a collector wants overdue/AR; a warehouse keeper wants low-stock/transfers; a rep wants today's route/visits/collections). *(Should-Fix.)*
- Reps browse **Products with no search** and an **unbounded list** — painful at FMCG SKU counts. *(Must-Fix.)*

## 13-point lens

| # | Lens | Status | Note |
|---|---|---|---|
| 1 | Navigation structure | ✅ Good | 16 module sections + grouped Settings; module/permission gated; ⌘K palette |
| 2 | Screen grouping | ✅ Good | Settings subsections labeled; module sections clear |
| 3 | Click-count reduction | ◐ Fair | ⌘K helps; **no dashboard quick-create / mobile "＋"**; palette searches nav only, not records |
| 4 | Search experience | ◐ Mixed | Server search on Invoices/Orders; **client-only on Customers; none on Products/Suppliers/Inventory** |
| 5 | Quick actions | ◐ Fair | Per-list primary buttons exist; no global/dashboard quick actions |
| 6 | Empty states | ◐ Mixed | Shared component widely used; **missing on Products/Suppliers/Inventory** |
| 7 | Error messages | ✅ Good | App `error.tsx` (Sentry+retry), `loading.tsx` skeleton, toasts, friendly server-action errors; **no `not-found.tsx`** |
| 8 | Mobile usability | ✅ Good | Cards vs tables, bottom-nav + drawer, `pb-24` safe-area; responsive top-bar |
| 9 | Arabic / English | ✅ Strong | CI-enforced parity + keys-usage; locale-aware currency/date; 1 intentional AR WhatsApp template |
| 10 | Performance bottlenecks | ◐ Watch | **Unbounded Customers `select('*')` + per-row `resolveLayout` redaction**; dashboard full-table `balance`/stock scans |
| 11 | Large-list handling | ◐ Mixed | Invoices/Orders paginated (`.range`, 20/pg); **Customers/Products/Suppliers/Inventory load all rows**; no virtualization |
| 12 | Dashboard usability | ◐ Fair | Good stat cards + getting-started checklist + recent invoices/low-stock; **not role-tailored** |
| 13 | Onboarding | ✅ Good | `/onboarding` + `/setup` wizard + layout guards; getting-started checklist |

## Triage

### 🔴 Must Fix Before Pilot
- **M1 — Search + empty state on the Products list.** FMCG SKU volumes make an unbounded, search-less Products screen unusable for reps/admins. Reuse the existing `ListSearch`/in-memory filter + `EmptyState`. *(Lens 4, 6, 11.)*
- **M2 — Empty states on Suppliers & Inventory** (and a basic search box). First-run pilot screens otherwise render blank/“broken”. Cheap (shared `EmptyState`). *(Lens 6.)*
- **M3 — Customers-list scale guard.** Unbounded `select('*')` + **per-row governance redaction** is fine at the pilot's ≤~2–3k customers but degrades beyond. Either confirm the pilot book stays under that, or paginate before loading a large customer base (see S1). *(Lens 10, 11.)*

### 🟠 Should Fix Before First Paying Customer
- **S1 — Uniform server pagination + debounced search** for Customers, Products, Suppliers, Inventory (mirror the Invoices/Orders `.range()` + `ListSearch` pattern). Removes the in-memory ceiling. *(Lens 4, 11.)*
- **S2 — Redact governance per rendered page** once Customers is paginated (resolve only the visible rows). *(Lens 10.)*
- **S3 — Role-tailored dashboards** (rep: route/visits/collections today · finance: AR aging/overdue · collection: due list · warehouse: low-stock/transfers/requests). *(Lens 12.)*
- **S4 — Global quick-create** (dashboard + mobile "＋"): New Invoice / New Customer / Record Payment; extend ⌘K to **jump to a record** (customer/invoice by code). *(Lens 3, 5.)*
- **S5 — `not-found.tsx`** with app chrome for unknown routes/records. *(Lens 7.)*
- **S6 — Platform UI for company→company field-config copy** (server action exists). *(Platform Owner.)*

### 🟢 Can Wait Until Later
- **C1 — Row virtualization** (react-window) for very large tables.
- **C2 — Saved filters / column preferences** per user.
- **C3 — Dashboard drill-downs & charts.**
- **C4 — Offline/PWA + mobile-camera for reps** (camera already in the attachments backlog).
- **C5 — Localize the WhatsApp renewal template** (currently AR-only by design).
- **C6 — Archived-record filters** on dashboard scans (exclude inactive from `balance`/stock aggregates).

## Recommended sequence
1. **M1–M3** (small, high-impact) before the pilot.
2. **S1–S2** (pagination/search/redaction) as the first hardening sprint — this is also the main **performance** lever and dovetails with the DB scalability review's large-list findings.
3. **S3–S6**, then **C-items** as scale/feedback warrant.

---

*Review only — no code changes, no merge, no production migrations.*
