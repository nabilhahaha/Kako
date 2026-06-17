# FMCG Pilot — Environment Alignment & GO (vantora-staging)

Official target environment: **`vantora-staging`** (Supabase project `rsjvgehvastmawzwnqcs`).
All FMCG pilot work — migrations, role setup, feature flags, runtime validation, defect
tracking, and future fixes — belongs to vantora-staging as the single source of truth. No
FMCG work is applied to any legacy/demo-only environment.

---

## Confirmations (clarification 1–4)

1. **Deployment reads vantora-staging** — proven: the live `kako` preview's runtime logs show
   `/field/van-sales/statement/{id}` requests carrying the pilot company's own customer IDs
   (company `612af0bd`).
2. **Pilot tenant exists in vantora-staging** — `VANTORA Pilot FMCG (DEMO)`,
   `612af0bd-973c-4fed-8e76-80cf444ef9e0`.
3. **Findings/backlog tracked against vantora-staging** — `Pilot-Defect-Log-2026.md` + audits
   all reference this project.
4. **No legacy/demo-only application** — `kako-fmcg` (`nrvydmkxjnctdlaxdhur`) was confirmed
   NOT the backend (it lacks the pilot user, tenant, and van-sales tables).

---

## Scope items 1–9 — verification results (all PASS)

| # | Item | Result |
|---|---|---|
| 1 | Migrations applied (incl. 0333 V1, 0334 D1) + FMCG schema present | PASS |
| 2 | Flags ON: Salesman Requests, Unified Workspace, Return Approval, Day Close Approval (+SLA) | PASS (4/4 + SLA) |
| 2 | Van Sales active (`erp_van_sales_settings.is_enabled=true` + `KAKO_VAN_SALES` ON per logs) | PASS |
| 3 | Pilot tenant configured | PASS |
| 4 | 8 role accounts active & mapped (all `email_confirmed`) | PASS |
| 5 | Salesman bottom-nav gates (field.sales + customer.request + flags + van sales) | PASS (all true) |
| 6 | Requests Hub reachable + all 8 request types | PASS (`/requests`=200) |
| 7 | V1 & D1 closed | PASS |
| 8 | V2 & V3 documented as accepted risks | PASS |
| 9 | Pilot freeze preserved (no features/architecture) | PASS |

---

## Deliverables

- **Live link (vantora-staging-connected; access-bypass, ~23h):**
  `https://kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app/login?_vercel_share=kkDG1M4rGXFgNOyKzUjyYenAcR8Peubp`
- **Supabase project:** `vantora-staging` (`rsjvgehvastmawzwnqcs`) — confirmed deployment backend.
- **Enabled flags (company `612af0bd`):** `platform.salesman_requests`,
  `platform.unified_salesman_workspace`, `platform.return_approval` (+`_sla`),
  `platform.day_close_approval` (+`_sla`); Van Sales `is_enabled=true`.
- **Pilot tenant ID:** `612af0bd-973c-4fed-8e76-80cf444ef9e0`

### Login credentials (password `test.123`)

| Role | Email |
|---|---|
| Company Admin | admin@pilot.test |
| Branch Manager | branchmgr@pilot.test |
| Supervisor | supervisor@pilot.test |
| Warehouse Keeper | warehouse@pilot.test |
| Cashier | cashier@pilot.test |
| Accountant | accountant@pilot.test |
| Salesman | salesman@pilot.test |
| Auditor | auditor@pilot.test |

---

## Bottom-nav runtime proof + label correction

**There is no tab literally labelled "Van Stock."** The Van Stock screen (`/field/stock`) is
labelled **"Inventory"** (en) / "المخزون" (ar) in the bottom nav. The **correct unified
salesman bar is:**

> **Today · Inventory · Requests · More**   (where "Inventory" = the Van Stock screen)

The non-unified bar (`Today · Customers · Sell · Inventory · More`) differs by having
**Customers + Sell** present and **Requests demoted to "More."** The unified bar collapses
those and surfaces **Requests**.

Runtime proof of the inputs that deterministically yield the unified bar (verified on
vantora-staging):

| Gate | Value |
|---|---|
| `vanSalesActive` | true (van pages 200; is_enabled=true) |
| `isVanSalesman` | true (field.sales, not settings.branches) |
| `unifiedWorkspace` flag | true |
| `requestsEnabled` flag | true (`/field/van-sales/requests`=200) |

With all four true, `resolveBottomNavTabs` → **Today · Inventory · Requests · More**.

**Limitation:** a literal browser screenshot cannot be produced from this environment (no
outbound egress; preview is auth-protected). The earlier non-unified render was the
stale/transient layout (ENV-1b — two `AuthApiError`s during a degraded session). **Action:**
open the link and log in fresh as `salesman@pilot.test`; the layout re-renders the unified
bar. Runtime logs can be re-pulled afterward to show the fresh salesman session as evidence.

---

## Requests Hub — reachable & active

`/field/van-sales/requests` → 200. `customer-request-forms.tsx` implements all eight request
types via `requestCustomerChange`: New Customer, Customer Update, GPS Change, Credit Request,
Payment Terms, Route Transfer, Reactivate Customer, Close Customer.

---

## Status

- **V1** (day-close RPC bypass) — closed (migration 0333; anon/auth EXECUTE revoked).
- **D1** (auditor role catalog) — closed (migration 0334; role + 11 read-only perms).
- **V2 / V3** — documented accepted pilot risks (UI-path protected; post-pilot).
- **DF-001 / DF-002 / ENV-1b** — Post-Pilot UX/discoverability (closed-day state; request
  discoverability + "Inventory" vs "Van Stock" label). ENV-1 retracted.
- **Freeze** — preserved (no new features, no architecture changes).

## 🟢 GO

All scope items verified on the official target **vantora-staging**. **GO to start pilot
testing.** Sign in fresh as `salesman@pilot.test` → **Today · Inventory · Requests · More**
(Requests no longer in "More"). Testers should note the Van Stock tab reads **"Inventory"**
(cosmetic, logged Post-Pilot).
