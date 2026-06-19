# VANTORA Route Planner — Demo Experience

**Goal:** a dedicated demo account that feels like a standalone Route Planning SaaS product, not a module inside the VANTORA ERP.
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19

---

## 1. Auth-model findings

- Users are **Supabase auth users** mirrored into `erp_profiles` (`id = auth.users.id`, holds `email`, `is_super_admin`, `is_platform_owner`).
- Roles are **branch-scoped**: `erp_user_branches.role` (a `BranchRole`); effective `permissions` resolve from `erp_role_permissions` (global) or `erp_company_role_permissions` (per-tenant override).
- `getUserContext()` returns the `UserContext` consumed everywhere; `(app)/layout.tsx` renders the sidebar / top bar and runs the onboarding / setup / subscription gates.
- **Consequence:** the cleanest, most reversible lockdown is a single derived boolean on `UserContext` (`isRoutePlannerDemo`), consumed by the layout, the login redirect, and the page — implemented exactly this way.

## 2. Role / permission mapping

- New permissions: **`route_planner.view / upload / edit / export`** (added to the `Permission` type + labels). `admin` / `manager` inherit them via the `*` wildcard.
- The **“Route Planner Demo role”** is realized today as the **email-detected account** granted route-planner access.
- Detection is **isolated in one helper** — `src/lib/erp/route-planner-demo.ts → isRoutePlannerDemoAccount()` — with `ROUTE_PLANNER_DEMO_EMAIL = 'demo@vantora.com'` and a `ROUTE_PLANNER_DEMO_ROLE = 'route_planner_demo'` constant plus a commented v2 branch. **To upgrade email → role later, edit only that function** — no UI / navigation / layout / page changes (your requested clean upgrade path).

## 3. Navigation & layout changes

- `(app)/layout.tsx`: when `ctx.isRoutePlannerDemo`, it **short-circuits to a chrome-free, full-bleed shell** — no Sidebar, Top Bar, Bottom Nav, or Command Palette — and **bypasses** the onboarding / setup / subscription gates.
- `resolveHomePath()` → `/distribution/route-planner` for the demo, so **login lands directly** on the planner.
- The page allows the demo (or `route_planner.view` / `reports.view`), sets the **browser title “VANTORA Route Planner”**, and renders the **focus** experience.
- **All existing advanced screens remain in the platform**, only hidden from this account.

## 4. Presentation (focus) mode

- **Branding header** on every screen: a **VANTORA / Route Planner** wordmark + a **“Route Planner Demo”** badge.
- **Welcome hero** before upload: headline, **Upload / Download-template** CTAs, a lightweight inline territory illustration (no images, no animation — fast), and the four product capabilities as cards:
  - **Route Planning** · **Territory Optimization** · **Current Allocation Review** · **Journey Planning**.
- Centered, max-width layouts for the upload / mapping / method screens so it reads like a standalone product.
- The full Route Planner workflow underneath (column mapping, assisted split, current-allocation review, map select / move, sales metrics, Excel export) is unchanged.

## 5. Final demo user flow

```
Login (Demo@vantora.com)
  → resolveHomePath → /distribution/route-planner
  → chrome-free shell (no sidebar / menu)
  → branded welcome (capabilities)
  → Upload Excel → Map columns
  → Current Allocation Review  OR  Assisted Split
  → select & move customers on the map (box / draw / click → Apply / right-click)
  → sales metrics surface automatically if a sales column exists
  → Approve → Export Excel
```
No sidebar and no other screens are reachable from the UI.

---

## 6. Creating the demo auth user (one step — must be done outside code)

Supabase hashes passwords via its Admin API / GoTrue, **not plain SQL**, so the auth user is **not** created from code (to avoid corrupting production auth). Create it once (~20 seconds):

**Supabase Dashboard → Authentication → Users → Add user**
- Email: `Demo@vantora.com`
- Password: `test.123`
- **Auto-confirm: ON**

That is all the code needs — the email detection takes over (no company / branch / role required, because the layout bypasses the tenant gates). If your project does not auto-create the profile row on signup, also run:

```sql
insert into erp_profiles (id, email, full_name, is_active)
select id, email, 'Route Planner Demo', true
from auth.users where lower(email) = 'demo@vantora.com'
on conflict (id) do update set email = excluded.email;
```

---

## 7. Demo URL & credentials

- **URL:** `https://kako-git-claude-pilot-ux-…vercel.app/distribution/route-planner` (the live preview deployment)
- **Email:** `Demo@vantora.com`
- **Password:** `test.123`

---

## 8. Validation checklist

| Check | Status | How it’s satisfied |
| :--- | :--: | :--- |
| Demo can log in | ✅ | Standard auth once the user is created |
| Lands on Route Planner | ✅ | `resolveHomePath` → planner |
| No sidebar / old menu | ✅ | layout short-circuit (chrome-free shell) |
| Upload Excel | ✅ | welcome → Upload (xlsx / csv / json) |
| Map columns | ✅ | column-mapping step (auto-detect) |
| Current allocation review | ✅ | offered when Route / Salesman column present |
| Assisted split | ✅ | route count → Generate |
| Select + move | ✅ | box / draw / click → Apply / right-click |
| Sales if present | ✅ | popup, toolbar, route rows, diff, export |
| Export Excel | ✅ | Approve → Export |
| Other screens hidden | ✅ | only `route_planner.*` access; no nav |

**Notes:** (1) create the auth user (Section 6) to run the end-to-end click-through on the preview; (2) screenshots can’t be captured from the build environment — the preview URL is the demo to screenshot; (3) validated via `tsc`, the full test suite, and the Vercel build (all green).

---

## 9. Optional next polish (not started — awaiting go-ahead)

- Vertical **route-card** layout for focus mode: *Route 7 · 154 customers · 425,000 SAR · 18% of total · quick-focus*.
- Deeper focus-mode styling (floating action bar, larger map, modern card chrome).
