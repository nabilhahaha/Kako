# DF-003 — Requests Hub Access: Direct Runtime Verification

End-to-end verification from the **running deployed application** (Vercel preview, branch
`claude/fmcg-sell-collect-loop`, backend `vantora-staging`). Source of truth = the actual
UI + deployment runtime logs. No code/flag inference.

**User-reported UI (salesman@pilot.test):**
- Bottom nav: `Today · Customers · Sell · Inventory · More`
- "More" menu: no "Requests" entry; only **"Change Requests"**.

---

## Runtime evidence (deployed preview logs, last ~90 min)

| Time(s) | Path | Status | Meaning |
|---|---|---|---|
| 09:41 … 11:02 (repeated) | **`/change-requests`** | 200 | The user keeps landing on the generic, list-only "Change Requests" module (no create) |
| 09:42 … 11:02 (several) | `/inventory/requests` | 200 | Load Requests page (separate) |
| **09:37:35** (only) | **`/field/van-sales/requests`** | **200** | The real Requests Hub — served once by direct URL, not since |

---

## Answers (runtime only)

### 1. Where can salesman@pilot.test access the Requests Hub in the current deployed UI?
**Nowhere through navigation.** The session repeatedly reaches `/change-requests` and has not
reached `/field/van-sales/requests` since 09:37. The Hub is reachable only by entering the URL
directly.

### 2. Exact click path?
**There is no click path in the current rendered UI.** No "Requests" tab in the bottom nav, and
the "More" menu's **"Change Requests"** → `/change-requests` is **not** the Hub. No visible
element links to `/field/van-sales/requests`.

### 3. Exact route + proof reachable
- **Route:** `/field/van-sales/requests`
- **Runtime proof:** `GET /field/van-sales/requests → 200` (09:37:35, deployed preview).
- **One-click proof URL (≈23h):**
  `https://kako-git-claude-fmcg-sell-collect-loop-123456789-s-projects.vercel.app/field/van-sales/requests?_vercel_share=nZpKuBbpPEHohKgTy6u6rTPZ0k0AE9X9`
  Loads the Hub with the create forms (New Customer, Update, GPS, Credit, Payment Terms, Route
  Transfer, Reactivate, Close). Reachable by URL — **not** by UI navigation.

### 4. Classification
**Navigation / discoverability defect (runtime-confirmed).** The Hub is functional and
URL-reachable (200) but the deployed UI exposes **no user-accessible navigation path** to it.
The only "Requests"-style item surfaced is "Change Requests" (`/change-requests`) — a different,
list-only module with no create action.

### 5. Why the current UI differs (runtime only)
The deployed app serves the **non-unified** bottom nav for this session (logs show the salesman
reaching `/change-requests`, `/inventory/requests`, and generic Customers/Sell/Inventory routes,
not a unified van bar). In that rendered state the app exposes **no link to
`/field/van-sales/requests`**; the only "Requests" page the UI routes to is `/change-requests`.
The Hub route was served once (09:37, 200) and not since.

---

## Clear statement
In the current deployed UI there is **no user-accessible navigation path** to the Requests Hub
for `salesman@pilot.test`. It is reachable **only** by directly opening
`/field/van-sales/requests` (proven 200). The "Change Requests" item in "More" is a different
page (`/change-requests`) that does not create requests.

## Disposition
- **DF-003** — Navigation / Discoverability, **High** (blocks discoverable access to a core
  workflow). **Fix = nav-only:** add a sidebar/"More" entry pointing to the existing
  `/field/van-sales/requests` (gated `platform.salesman_requests` + `field.sales`) and
  disambiguate "Requests" vs "Change Requests". No new workflow — the Hub already exists and
  works. Can be done in-pilot (nav-only) on approval, or held Post-Pilot (UX-P2).
