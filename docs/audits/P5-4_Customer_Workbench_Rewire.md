# P5-4 — /customers Rewired onto the Customer Workbench

### Final wiring · deep-link redirects · completion sign-off

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** Implemented · validated · pushed

`/customers` now runs entirely on the canonical `CustomersWorkbench`. The bespoke `CustomersManager` is removed; the old detail routes redirect into the workbench. Reuse-first: same server query, same actions, same gates. No business-logic, permission, RLS, or workflow change; no functional reduction.

---

## 1. Scope delivered

| Item | Outcome |
|------|---------|
| Rewire `/customers/page.tsx` | Renders `CustomersWorkbench` (was `CustomersManager`) |
| Server search | `ListSearch` → `?q` → whole-table re-query |
| 3 existing filters | Segment · Classification · Channel selects → `?segment/classification/channel` |
| Pagination | `Pager` inside the list panel → `?page`, preserving filters + selection |
| `[id]` redirect stub | → `/customers?id=<id>&tab=statement` |
| `[id]/360` redirect stub | → `/customers?id=<id>&tab=activity` |
| URL-addressable selection | `?id=&tab=` preserved across every list interaction |

---

## 2. End-to-end navigation flow

- **List → detail:** click a row → `?id=&tab=overview`; the detail bundle lazy-loads; tabs switch via `?tab=` (back/forward works).
- **Search / filter / paginate:** each updates the URL → the server re-queries the **whole table**; the `?id=&tab=` selection is preserved.
- **Create:** **+ New** → `CustomerForm` (create) in the center → save refreshes the list.
- **Import:** **Import** → existing CSV dialog → refresh.
- **Deep links:** `/customers/[id]` and `/customers/[id]/360` redirect into the workbench (Statement / Activity facets). A bookmarked id resolves even if it is not on the current list page — the page fetches the selected record directly.

---

## 3. Final gap-matrix — no functional reduction

| Capability (old) | New home |
|------------------|----------|
| Server search + 3 filters + pagination | Workbench list panel (server-driven) |
| New customer (form + custom fields + attachments) | **+ New** → `CustomerForm` |
| Import CSV | **Import** → extracted `ImportDialog` |
| Edit | Profile tab |
| Activate / Deactivate · Approve / Reject | EntityActionBar (same actions) |
| Statement (aging / invoices / ledger) + Notes | Statement tab |
| Status-reason context | Statement tab |
| WhatsApp reminder (balance > 0) | **Carried into** Statement tab |
| FMCG credit-request (`credit.request.create`) | **Carried into** Statement tab |
| 360 timeline (now richer: + requests + visits) | Activity tab |
| Credit-limit / GPS / request-approval | Profile tab sub-forms |
| Transfer · Print | EntityActionBar |
| Receivable total | List panel badge |
| Deep links to `[id]`, `[id]/360` | Redirects |

---

## 4. Performance observations

- Route weight shifted as designed: `/customers` 12.6 -> **22.4 kB** (full 3-panel workbench); `/customers/[id]` 5.67 kB -> **523 B** and `/[id]/360` 1.79 kB -> **522 B** (now redirect stubs).
- The detail bundle is **lazy-loaded per selection** (not in the list payload) and **cached in client state** — list search / filter / paginate do **not** refetch it (selection unchanged), so list interaction stays cheap.
- The list + support queries run in **one `Promise.all`** (+1 for the deep-linked record, only when `?id` is present).

---

## 5. Mobile behavior

Below `xl`: Customer 360 is **full-width**, the context panel collapses to the **Info drawer** (one tap), dense tabs are full-bleed, and the list stacks above — identical responsive contract to the other workbenches.

---

## 6. Preview captures

```
/customers?id=<cid>&tab=overview          (wide layout · context shown)
+-256px------+-------- Customer 360 (focus) --------+-300px context-+
| [+ New][I] |  o Acme Trading  [Active]  actions   | Summary       |
| receivable |  Overview/Profile/Statement/Activity | balance ...   |
| search     |  /Related/Audit                      | credit ...    |
| segment v  |  [ balance ][ credit ][ overdue ]    | status [v]    |
| > Acme [v] |  identity / quick-actions            | Related chips |
| < 1/8 >    |                                      |               |
+------------+--------------------------------------+---------------+

/customers?id=<cid>&tab=statement         (dense tab · rail dropped -> full width)
+-256px------+----------- Customer 360 — Statement (full) -----------+
| list/search|  status context · [WhatsApp] [Credit request]         |
| > Acme [v] |  summary · aging · open invoices · ledger · notes     |
+------------+-------------------------------------------------------+
```

---

## 7. Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | clean |
| `vitest run` | 1601 passed / 192 skipped |
| `next build` | compiled successfully (63s); routes as above |
| Constraints | no business-logic / permission / RLS / workflow change |

---

## 8. Status

**P5-4 complete.** The Customer Workbench (P5-1 -> P5-4) is fully delivered and live on `/customers`. Recommended next step: the **Customer Workbench Completion Review** before the next major workstream.
