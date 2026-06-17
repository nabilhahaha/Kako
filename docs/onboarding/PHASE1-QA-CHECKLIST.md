# VANTORA — Phase 1 QA Checklist (P1.5 Role QA · P1.6 Mobile)

**Build:** `staging-frontend` preview (vantora-staging) — `https://kako-git-staging-frontend-123456789-s-projects.vercel.app`
**Tenant:** Nile FMCG (DEMO). **Login:** each demo user · password `Vantora#Demo1`.
**Prereq:** open the URL while logged into Vercel (owner) **or** disable Vercel Deployment Protection for the
preview so QA can reach it on a device. (That toggle is a dashboard action — not automatable here.)

> Server-side evidence (already validated this phase) is listed per area so QA only needs to confirm the
> **UI surface** matches. Forbidden-write attempts should be **rejected server-side**, not merely hidden.

---

## P1.5 — Full role QA (15 roles)

For each role: (a) menus match, (b) every screen opens (no 403/blank), (c) action buttons appear only when
permitted, (d) a deliberate **forbidden write** is rejected, (e) data scope is correct.

| Role (login) | Must SEE | Must NOT see | Forbidden-write test (must be rejected) | Server evidence |
|---|---|---|---|---|
| Platform Owner `owner@` | Platform panel only | any tenant ops | open `/customers` → blocked | nav = vendor only |
| Company Admin `admin@` | Sales, Distribution, Inventory, Purchasing, Accounting, Settings (Staff, **Branches**, Authz, Org, Regions), Warehouses | global Users/Permissions screens | create a branch in **another** company id (forge) → blocked by RLS | 2-tenant test 6/6 pass; sees 13 own branches/0 other |
| General Manager `gm@` | all operations + Reports | **Settings → Staff/Branches/Custom-Fields/Integrations** | edit a branch → **0 rows** | GM governance 0/7; GM branch UPDATE=0 |
| Sales Manager `sales.manager@` | Sales, Distribution, Reports; region's reps | finance posting, Settings admin | assign a customer to a rep **outside region** → blocked | visible users = region (51) |
| Area Manager `area.southern@` | Sales, Distribution, Reports; area reps | other areas' reps; Settings | pick a rep outside area in Visit Plan → not listed/blocked | visible users = 8 (region) |
| Supervisor `supervisor.field01@` | Supervisor Home, Reports, Van Reconciliation, team | finance/settings | reconcile another team's van → blocked | visible users = 6 (team) |
| Van Sales Rep `van.rep01@` | Today, Rep App, Journey, Invoices, **own** Customers, Van Stock, Credit Requests | other reps' customers; settings | open Visit Plan rep selector → **only self**; assign customer to another rep → blocked | sees 1 user (self); 7 own customers |
| Cash Van Rep `cash.van01@` | same as Van Rep **minus Credit Requests** | credit option on Sell | create a **credit** (future-due) invoice → blocked (DB guard) | cash-van guard verified |
| Merchandiser `merch01@` | Today, Rep App, Journey, Customers, MSL/Surveys/Grading | **Sell / Invoices / POS** | attempt a sale → no Sell screen / blocked | no sales.sell/collect |
| Warehouse Manager `warehouse.manager@` | Inventory (Transfers/Counts/Warehouses/Van Recon-manage), Purchase Orders, UOM | Sell/Accounting/Customers | record a sale → blocked | warehouse_keeper perms |
| Inventory Controller `inventory.controller@` | Inventory (Count/Adjust/Transfer/Stock), Van Recon **view** | **Purchase Orders, Suppliers, approve adjustments** | approve an adjustment / open Purchase Orders → blocked | 10/10 assertions; no purchasing/approve |
| Accountant `accountant@` | Accounting (Vouchers/post, Journal, Reports, Aging), Suppliers, Invoices(collect) | Sell/field | create a field sale → blocked | accountant perms |
| Collection Officer `collection.officer@` | **Collections** (new), Invoices, Customers | **Sell / POS** | attempt a sale → blocked; record a collection → **succeeds** | sales.collect only; new /collections screen |
| Credit Controller `credit.controller@` | Credit Requests (**approve**), Accounting (**view**), Invoices(collect), Suppliers | Accounting **Vouchers/post** | post a journal voucher → blocked | no accounting.post |
| Auditor `auditor@` | Reports, Inventory (read), Accounting (view) | any Sell/Collect/Settings; **no write buttons** | attempt any edit → no button / blocked | viewer read-only |

**Pass criteria:** all rows green; **every forbidden-write rejected server-side**; data scope per role.
Record results inline (✓/✗ + note) and file defects (expected to be minor button-level items).

### Already-proven (DB/API layer — the non-UI half of P1.5)
- Role-scoped **user visibility** (rep=self … admin=all) — verified per role.
- **Branch governance** 2-tenant isolation — 6/6 pass (cross-tenant blocked; GM/rep cannot write).
- **GM vs Admin** split — GM governance 0/7, ops intact.
- **Inventory Controller** — 10/10 (no purchasing/approvals).
- **Cash-van credit** guard — credit invoice blocked.

---

## P1.6 — Mobile FMCG validation (4 field roles)

Run on a real phone (and responsive web) against the same build. Confirm offline tolerance.

| Role | Flow to validate on mobile | Pass criteria |
|---|---|---|
| **Van Rep** `van.rep01@` | Today → GPS check-in → Sell (cash **and** credit) → Collect → Return → Day-close/Settlement | full day completes; credit allowed; numbers update; works through a short **offline** stretch then syncs |
| **Cash Van** `cash.van01@` | Today → check-in → Sell (**cash only**) → Collect → settlement | credit option hidden/blocked; cash sale + collect succeed |
| **Merchandiser** `merch01@` | Today → visit → assortment/survey/grading capture (no selling) | survey/grade capture works; **no Sell** present |
| **Supervisor** `supervisor.field01@` | team view → approvals → van reconciliation on mobile | approvals + reconcile usable on a phone |

**Checks:** GPS check-in works; offline queue + later sync is consistent (no double-posting); RTL Arabic
renders; touch targets usable. Log device/browser + any defects.

---

## How to run
1. Ensure the **staging-frontend** build is READY (latest deploy = "deploy: Phase-1 …").
2. Make the preview reachable (Vercel owner login, or disable Deployment Protection).
3. Walk P1.5 role-by-role, then P1.6 on a device. Record ✓/✗ + notes here.
4. Send defects back; Phase-1 fixes (if any) are expected to be small button-level adjustments.

> Note on automation: the database/API-layer guarantees above were validated programmatically this phase.
> The remaining UI/mobile click-through is intentionally human — it cannot be driven from the build server.
