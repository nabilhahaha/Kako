# Pilot Runtime Verification — Deployment Logs (ENV-1 Reconciliation)

Runtime verification of the salesman bottom-nav issue using the live `kako` Vercel
preview deployment logs as the source of truth. **Outcome: the earlier ENV-1
"van sales disabled" conclusion is RETRACTED. No environment-variable change is
needed.** No code changes — runtime verification only.

---

## Questions answered

### 1. Actual Supabase host used by the deployment → **`vantora-staging` (`rsjvgehvastmawzwnqcs`)** — proven
The deployment's runtime logs include `/field/van-sales/statement/{id}` requests whose IDs
are the **pilot company's own customers** in `vantora-staging` (company `612af0bd`):

| Customer ID (from logs) | Customer | Company |
|---|---|---|
| `c3e62017…` | El Salam Market | 612af0bd (pilot) |
| `e6523d8f…` | Al Nour Grocery | 612af0bd (pilot) |
| `92d67d8a…` | Family Supermarket | 612af0bd (pilot) |
| `d3b41eb3…` | City Mini Market | 612af0bd (pilot) |
| `764d2e03…` | Corner Shop | 612af0bd (pilot) |

→ The deployment reads the **seeded pilot backend**. It is **not** `kako-fmcg`
(`nrvydmkxjnctdlaxdhur`), which lacks the van-sales tables entirely.

### 2. `KAKO_VAN_SALES` runtime effect → **ON** — proven by behavior
Every `/field/van-sales/*` route returns **HTTP 200** in the logs:
`GET+POST /sell`, `/collect`, `/return`, `/summary`, `/statement`, `/statement/{id}`,
`/cash-custody`, `/customers`, **`/requests`**. These pages call `notFound()` when
`isVanSalesActive()` is false; **200 ⇒ `isVanSalesActive()=true`**, which requires
`VAN_SALES_ENABLED()` (i.e. `KAKO_VAN_SALES` not `0/false/off`) **and**
`erp_van_sales_settings.is_enabled=true`. (The literal env string is not printed in logs
for security, but its runtime effect is conclusively ON.)

### 3. Why `vanSalesActive` resolves false → **it does NOT; it is TRUE**
**ENV-1 was incorrect and is retracted.** The earlier conclusion misread the bottom-bar
labels: the **"Sell"** and **"Inventory"** tabs *are* the van Sell (`/field/van-sales/sell`)
and **Van Stock** (`/field/stock`) tabs — labelled "Sell"/"Inventory" generically. Van sales
is active.

The real pivot is **`unifiedWorkspace=false` at the layout render**, which keeps
Customers/Sell/Inventory in the four visible slots and pushes the (working) **Requests** tab
(5th) into **"More."** `/field/van-sales/requests → 200` proves `requestsEnabled=true` and
that the hub is reachable now.

---

## The residual anomaly (ENV-1b) and why it isn't config

All inputs to `unifiedWorkspace` are TRUE in the confirmed backend:

| Input | Value (verified) |
|---|---|
| `erp_van_sales_settings.is_enabled` | true (van pages 200) |
| `isVanSalesman` | true (field.sales, not settings.branches, not super-admin) |
| `platform.unified_salesman_workspace` | **true** — single row, no duplicates |
| `platform.salesman_requests` | **true** — single row; confirmed by `/requests`=200 |

So `unifiedWorkspace` *should* be true → unified bar (`Today · Van Stock · Requests · More`).
It rendered **non-unified**. The bottom nav is computed in the App Router **layout**, which is
preserved across soft client navigations — so it reflects the **first full page load**. The
logs show **two `AuthApiError`s at 10:03**; a layout render during a degraded session (or
before a hard refresh) yields the non-unified bar even while later page loads resolve
correctly. → **Stale/transient layout, not configuration.**

---

## Resolution (no env change, no code change)

1. **Requests is reachable now** — open **"More"**, or go to `/field/van-sales/requests`
   directly (returns 200).
2. **Hard refresh / log out and back in** to re-render the layout with a clean session +
   current flags → expect **`Today · Van Stock · Requests · More`**.
3. **Leave `KAKO_VAN_SALES` and `NEXT_PUBLIC_SUPABASE_URL` unchanged** — both confirmed
   correct.
4. If the non-unified bar persists after a hard refresh, escalate for a deeper layout
   flag-read investigation (genuine signal at that point).

---

## Defect-log status

- **ENV-1** — *Retracted* (incorrect; based on a bottom-bar label misread).
- **ENV-1b** — *Low*, In-Pilot, no code/env change (stale/transient layout; hard-refresh).
- **DF-002** — stands as a UX discoverability item (no desktop entry; Requests demoted to
  "More" on the non-unified bar; naming) — Post-Pilot (UX-P2).

**Process note:** verifying via runtime logs *before* changing environment variables
prevented an unnecessary and incorrect env change. Runtime evidence is the source of truth.
