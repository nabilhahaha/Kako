# DF-003 — True Root Cause: Role Nav-Profile Allowlist (`applyNavProfile`)

The "Field Requests" entry was not visible in the salesman's menu **even in a clean browser
session**, which correctly ruled out caching as the cause. Proof was taken from the **actual
rendered-menu source** (post-profile), not `visibleSections()`.

---

## Answers to the four questions

### 1. Where does the mobile drawer get its menu items?
From the **`Sidebar`** component (`src/components/layout/sidebar.tsx`), which renders **both** the
desktop sidebar and the **mobile drawer** (opened via the `useMobileNav` store). Its items come
from `sidebar.tsx:44`:
```
applyNavProfile( visibleSections(...), roles, { isSuperAdmin, isPlatformOwner } )
```

### 2. Is it the same tree `visibleSections()` returns?
**No.** It wraps `visibleSections()` in **`applyNavProfile()`** (`src/lib/erp/nav-profiles.ts`),
which re-curates the permission-filtered tree into a per-role **Primary + More** menu. The earlier
`visibleSections()`-only check was therefore incomplete — that was the gap.

### 3. Final rendered menu for `salesman@pilot.test` (as the drawer receives it) — BEFORE fix
- **Primary:** Today · Sell · Collect · Customers · Van
- **More:** attention, coaching, route, alerts, changeRequests, notifications, repApp,
  repSettlement, salesOrders, invoices, cashbox, journey, todayJourney, fieldOffline,
  loadRequests, expiryNear, vanReconciliation, vanTransfer
- **`fieldRequests` → ABSENT** (matches the reported screenshots exactly)

### 4. The exact code path that removes it
`applyNavProfile()` — the **salesman** profile defines a `more` **allowlist** (`SALESMAN_MORE`),
and the function drops any visible item whose href is not on it:
```
const allow = profile.more ? new Set(profile.more) : null;
...
if (allow && !allow.has(item.href)) continue;   // ← removes Field Requests
```
`SALESMAN_MORE` contained `/rep`, `/sales/orders`, `/sales/invoices`, `/cashbox`,
`/sales/journey`, `/field/journey`, … (the visible items) **but not** `/field/van-sales/requests`.
The same allowlist was also hiding `/field/van-sales/{my-returns,statement,summary,cash-custody}`.

---

## Fix (shipped `fd65ff9` — navigation-only)

Added the FMCG van-sales field hrefs to `SALESMAN_MORE`:
```
'/field/van-sales/requests', '/field/van-sales/my-returns', '/field/van-sales/statement',
'/field/van-sales/summary', '/field/van-sales/cash-custody',
```

### Proof — rendered menu AFTER fix (post-`applyNavProfile`)
```
RENDERED 'More' van-sales items:
   myReturns      -> /field/van-sales/my-returns
   statementHub   -> /field/van-sales/statement
   dailySummary   -> /field/van-sales/summary
   cashCustody    -> /field/van-sales/cash-custody
   fieldRequests  -> /field/van-sales/requests
>>> fieldRequests in RENDERED menu? true
```
`tsc` clean · **679/679 tests pass**. UI-only — no permission, URL, workflow, or schema change.

---

## Full chain of the three commits

1. `6e9b458` — added the `Field Requests` nav item to `navigation.ts` (needed so it's in
   `visibleSections()`).
2. `917d7ce` — bumped the service-worker cache (`ams-v1 → ams-v2`) so installed PWAs stop serving
   the stale bundle (a real but secondary delivery issue).
3. **`fd65ff9` — the actual fix:** added the van-sales hrefs to the salesman nav-profile allowlist
   so `applyNavProfile` stops stripping them.

## Status

- **DF-003 — fix shipped and proven at the rendered-menu source.** Deployed and Ready on
  vantora-staging (preview).
- **Not closed** until the user confirms the item is visible in the live UI.
- After reload as `salesman@pilot.test`, **More** should list **Field Requests** (+ My Returns,
  Customer Statements, Daily Summary, Cash Custody — all previously hidden by the same allowlist).
