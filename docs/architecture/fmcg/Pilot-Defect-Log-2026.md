# FMCG Pilot — Defect Log

Live log of findings from real-user pilot execution. Freeze is in effect: code is
written mid-pilot **only** for **Blocker / High / Security**; everything else is
logged **Post-Pilot**. Each entry: Role · Screen · Expected · Actual · Severity ·
Category · Disposition (In-Pilot / Post-Pilot) · Notes.

| ID | Role | Screen | Severity | Category | Disposition | Status |
|---|---|---|---|---|---|---|
| DF-001 | Salesman | My Day / Mobile Navigation | Medium | Usability / Navigation | **Post-Pilot** | Open |
| DF-002 | Salesman | Change Requests / Requests Hub | Medium | Workflow / Discoverability | **Post-Pilot** | Open — functionality exists & enabled (discoverability/naming) |
| ENV-1 | All (salesman) | Mobile nav / van-sales UI | High (pilot blocker) | Configuration / Environment | **In-Pilot (config fix)** | Open — deployment `KAKO_VAN_SALES` off / backend mismatch → `vanSalesActive=false` |

---

## DF-001 — Closed-day state is not action-oriented; operational requests hard to find

- **Role:** Salesman
- **Screen:** My Day (`/today`) / Mobile Navigation
- **Expected:** When the day is closed, the user immediately understands which actions
  remain available and how to continue working.
- **Actual:** The system shows "Your day is closed", but the navigation still lists many
  operational entries (Sell, Collect, Sales Orders, Invoices, Cashbox, …). It is not
  obvious which actions remain available, nor where operational requests (Load Requests /
  Change Requests) live.
- **Severity:** Medium
- **Category:** Usability / Navigation
- **Disposition:** **Post-Pilot** (Medium; not Blocker/High/Security → freeze preserved).

**Triage / verification (read-only):**
- The closed state is rendered by `src/app/(app)/today/salesman-workspace.tsx`
  (`vanSales.dayClosedTitle` / `dayClosedBody` + reopen gate).
- The transactional pages (Sell / Collect / Return) are **gated server-side by the
  day-open gate** — they cannot be executed on a closed day. So the operations are
  correctly **blocked**; the issue is that the **nav does not reflect the closed state**
  (entries are permission/flag-gated, not day-state-gated), leaving the user to discover
  the block only after navigating.
- **Not a permission or security defect** — no closed-day action is actually permitted.
  This is purely presentation/discoverability. Confirms Medium, not High/Security.

**Recommended fix (Post-Pilot, scoped — no new workflow):**
- Make the closed-day card **action-oriented**: show **Allowed** (e.g. Load Request,
  Change/Customer Request, view Statements/Summary, request Reopen) vs **Blocked** (Sell,
  Collect, Return — until reopen), with a single clear **primary next action**.
- Improve discoverability of operational requests (Load Requests / Change Requests) from
  the closed-day state (surface them on the card rather than buried in the menu).
- Optionally **dim/disable** day-state-dependent nav entries when the day is closed (a
  presentation filter; no permission/workflow change).
- Effort: UI/copy + a nav presentation filter on day state. No schema, no new
  permission, no new workflow. Fits the freeze as a post-pilot UX item.

**Backlog:** UX-P1 (closed-day action-oriented experience). See Prioritized Backlog
(end-of-pilot deliverable).

---

## DF-002 — Request creation not discoverable ("Change Requests" vs "Requests"; no desktop entry)

- **Role:** Salesman
- **Screen:** "Change Requests" (generic) vs Requests Hub (`/field/van-sales/requests`)
- **Expected:** Salesman can create New Customer / Data Change / Transfer / Route Change /
  other master-data requests from an obvious place.
- **Actual:** Tester opened a "Change Requests" page showing an empty state with no create
  action.
- **Severity:** Medium · **Category:** Workflow / Discoverability · **Disposition:** **Post-Pilot**

**Implementation status (verified — answer: the functionality EXISTS and is enabled):**
- `platform.salesman_requests` = **ENABLED** on the pilot tenant.
- Salesman role **has** `customer.request` (and `field.sales`) → `canCustomer = true`.
- The create workflow is **fully implemented** in the Requests Hub
  (`/field/van-sales/requests` → `requests-hub.tsx` + `customer-request-forms.tsx`):
  kinds `new` (New Customer), `update` (Data Change), `gps`, `credit`, `terms`,
  `route` (Transfer/Route Change), `reactivate`, `close` — all via `requestCustomerChange`.
- NOT a permissions gap; NOT unimplemented.

**Exact root cause (not the symptom):**
1. **No desktop/sidebar entry exists for the Requests Hub.** `navigation.ts` has **zero**
   nav items pointing to `/field/van-sales/requests`. Its *only* navigational entry point
   is the **mobile bottom-nav "Requests" tab** (`bottom-nav-tabs.ts:73`, `requestsOnly`).
   There is also no link from `/today`. On desktop the hub is reachable only by typing the URL.
2. **Naming collision.** The create hub is labelled **"Requests"** (`nav.bottom.requests`),
   while the tester looked under **"Change Requests"** — a *separate, list-only* module
   (deployment flag `KAKO_CHANGE_REQUESTS`, no create action) that is **not enabled** for
   the pilot (`change_requests` company flag not set). The mental model didn't map.
3. The hub's **My Requests** list is empty for a new salesman ("no requests"), which can be
   mistaken for "nothing here / no create" if the create cards above aren't recognised.

**Reachability classification (Q4):** the hub **IS** reachable from **mobile** (Requests tab,
within the visible first-4 → `Today · Van Stock · Requests · More`). It is **NOT** reachable
from **desktop navigation** at all. → **Discoverability defect** (missing desktop entry +
naming mismatch), not a functional/permission defect.

**Recommended fix (Post-Pilot, no new workflow):** (a) add a **desktop sidebar entry** for
the Requests Hub (e.g. under Sales/Field, flag `platform.salesman_requests`); (b) align
**naming** so "Requests / Change Requests" don't compete (rename or cross-link); (c) make the
**create actions prominent** above the My Requests list and add an empty-state CTA
("Create a request"). Effort: nav entry + labels/copy. No schema, no permission, no new
workflow → fits the freeze.

**Backlog:** UX-P2 (request-creation discoverability: desktop entry + naming + empty-state CTA).

---

## ENV-1 — Pilot deployment not reflecting seeded van-sales config (`vanSalesActive=false`)

- **Role:** All field roles (observed as Salesman) · **Screen:** Mobile bottom nav + entire van-sales UI
- **Expected:** `salesman@pilot.test` sees the unified field nav (`Today · Van Stock · Requests · More`)
  and can reach `/field/van-sales/*`.
- **Actual:** Bar renders `Today · Customers · Sell · Inventory · More` — no Van Stock, no Requests.
- **Severity:** High (pilot blocker — the whole van-sales UI is suppressed) · **Category:** Configuration / Environment
- **Disposition:** **In-Pilot** — this is a deployment **config** fix (env var), not product code; the freeze is preserved.

**Root cause (verified):** `isVanSalesActive = VAN_SALES_ENABLED() && erp_van_sales_settings.is_enabled`.
- In `vantora-staging` (`rsjvgehvastmawzwnqcs`), the pilot company has `is_enabled=true` and all
  flags ON; `salesman@pilot.test` has a single membership there with every gate TRUE.
- The other org projects don't hold the pilot: **`kako-fmcg`** (`nrvydmkxjnctdlaxdhur`) has no
  `salesman@pilot.test`, no pilot company, and not even the `erp_van_sales_settings` /
  `erp_feature_flags` tables.
- Login as `salesman@pilot.test` works → the deployment reads `vantora-staging`. With the DB gates
  true, the only thing that forces `vanSalesActive=false` is the **global kill-switch
  `KAKO_VAN_SALES`** being `0`/`false`/`off` in the deployment env (or the deployment binding to a
  non-seeded project). → `vanSalesActive=false` cascades to `unifiedWorkspace=false` and
  `requestsEnabled=false`.

**Fix (deployment-side; owner/devops):** in the `kako` Vercel project env (Preview): ensure
`NEXT_PUBLIC_SUPABASE_URL = https://rsjvgehvastmawzwnqcs.supabase.co` and `KAKO_VAN_SALES` is not
`0`/`false`/`off` (unset = ON); redeploy + hard-refresh. Re-test → bar should be
`Today · Van Stock · Requests · More`.

**Note:** DF-001 and DF-002 were triaged against the *intended* (correctly-configured) tenant.
ENV-1 means the live pilot UI has not been exercising that configuration — re-validate UI findings
after the env fix.
