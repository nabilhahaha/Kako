# DF-002 — Mobile Bottom-Nav "Requests" Visibility: Discrepancy Root-Cause Analysis

Investigation of why the salesman's mobile bottom nav shows
**`Today · Customers · Sell · Inventory · More`** (no visible **Requests** tab),
versus the code/test prediction of **`Today · Van Stock · Requests · More`**.
Runtime UI is the source of truth.

---

## 1. How the bottom bar is resolved (code facts)

- The bar renders **only the first 4** resolved tabs; the rest fall into **"More"**.
  `src/components/layout/bottom-nav.tsx:46` → `…resolveBottomNavTabs(…).slice(0, 4)`.
- Tab order in `BOTTOM_NAV_TABS` (`src/components/layout/bottom-nav-tabs.ts`):
  `Today → Customers → Sell → Inventory → Requests`. **Requests is the 5th tab.**
- The **unified salesman workspace** collapses the generic Customers/Sell tabs into the
  van workflow, which *promotes* Requests into the visible four:
  unified → **`Today · Van Stock · Requests · More`**.
- Gates (`src/app/(app)/layout.tsx:52–55`):
  ```
  isVanSalesman    = field.sales && !settings.branches && !isSuperAdmin
  vanSalesActive   = isVanSalesActive(supabase, ctx)            // KAKO_VAN_SALES (default ON) AND erp_van_sales_settings.is_enabled
  requestsEnabled  = flags['platform.salesman_requests']        && vanSalesActive && isVanSalesman
  unifiedWorkspace = flags['platform.unified_salesman_workspace'] && vanSalesActive && isVanSalesman
  ```
- The Requests tab itself: `bottom-nav-tabs.ts:73` — `requestsOnly` (shows only when
  `requestsEnabled`). **There is no desktop sidebar entry for the Requests Hub** — the
  bottom-nav tab is its only navigational entry.

## 2. The observed bar decoded

`Today · Customers · Sell · Inventory · More` is the **non-unified** resolution: Customers +
Sell + Inventory occupy all four visible slots, so **Requests (5th) is pushed into "More."**
→ Therefore **`unifiedWorkspace` resolved `false`** in the environment under test.

Two runtime states produce this exact bar:

| Cause | Bar | Requests location |
|---|---|---|
| `platform.unified_salesman_workspace` OFF (requests ON) | Today·Customers·Sell·Inventory | **in "More"** (below the slice-4 fold) |
| `vanSalesActive` OFF | generic Today·Customers·Sell·Inventory | **filtered out entirely** |

## 3. Why the prediction differed (staging vs rendered env)

In the **provisioned pilot tenant** (`612af0bd…`, staging `rsjvgehvastmawzwnqcs`) every gate is
satisfied — verified live:

| Gate | Value (staging pilot) |
|---|---|
| `erp_van_sales_settings.is_enabled` | **true** → `vanSalesActive=true` |
| `isVanSalesman` (field.sales, not settings.branches) | **true** |
| `platform.salesman_requests` | **true** → `requestsEnabled=true` |
| `platform.unified_salesman_workspace` | **true** → `unifiedWorkspace=true` |

So *that* backend renders the **unified** bar with **Requests visible**. The live UI shows the
**non-unified** bar → the rendered deployment is reading **at least one gate as false**, i.e. a
**different flag / tenant / backend state** than the staging tenant I seeded.

## 4. Root cause

**Environment/configuration discrepancy, not a code defect.** The salesman in the rendered
deployment is resolving `unifiedWorkspace=false` (and possibly `vanSalesActive=false`), whereas
the provisioned pilot tenant has all gates true. Most likely:
1. The preview deployment's `NEXT_PUBLIC_SUPABASE_URL` points at a **different backend** than the
   staging project that holds the pilot tenant + flags; or
2. The tester is signed in to a **different salesman/company** where
   `platform.unified_salesman_workspace` is OFF; or (least likely) a stale cached session.

Independently, even when fully enabled, the **non-unified** layout demotes Requests into "More",
and there is **no desktop entry** — that is the standing DF-002 discoverability issue.

## 5. One-tap diagnostic to pin it down

Open **"More"** on the salesman's mobile nav:
- **Requests is listed there** → `requestsEnabled=true`; cause = non-unified ordering demotes it
  below the 4-tab fold (unified flag off in that environment).
- **Requests absent from "More" too** → `requestsEnabled=false` → `vanSalesActive` or the
  `salesman_requests` flag is off in that environment.

Also confirm the exact **URL + login** used. If it was the preview share link, verify that
deployment's Supabase backend matches `rsjvgehvastmawzwnqcs` (the seeded tenant). If it points
elsewhere, the flags/settings I configured do not apply to what the UI is reading.

## 6. Disposition

- **Discrepancy itself:** environment/config — verify backend + flags for the tested deployment
  (no code change; freeze preserved).
- **DF-002 (standing):** request-creation discoverability — Medium, **Post-Pilot** (UX-P2):
  add a desktop nav entry, reconcile "Requests/Change Requests" naming, ensure Requests is not
  buried in "More" on the non-unified bar, add an empty-state CTA.
