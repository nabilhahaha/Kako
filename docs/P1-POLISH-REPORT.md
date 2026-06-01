# VANTORA — P1 Demo-Readiness Polish Report

> Scope: **P1 demo-readiness polish only** — presentation/consistency over
> already-built screens, limited to the approved **demo paths**. No P2, no P3, no
> new business features, no permission/integration/tenant-behaviour changes.
> Branch: `claude/clinic-project-continuation-7P1NJ` (based on `2onKn`).

## Summary of what changed

| # | Item | Result |
|---|---|---|
| 1 | Shared **BackLink** + adoption | ✅ RTL-aware back link; 8 detail/sub screens |
| 2 | Shared **EmptyState** + adoption | ✅ consistent empty states; 13 list screens |
| 3 | **Button-label** audit | ✅ already verb-first / masdar-consistent — no churn |
| 4 | **Mobile + RTL** fixes | ✅ table scroll wrapper + 2 back-arrow RTL fixes |
| 5 | **Demo accounts** (reviewable) | ✅ seeder + plan delivered — **not applied** |
| 6 | **Demo cheat sheets** | ✅ one scenario per vertical |

## New shared components

- **`src/components/shared/back-link.tsx`** — one back link with an RTL-aware
  chevron (`ArrowLeft` + `rtl:rotate-180`), `href` + translated `label` props.
  Replaces ad-hoc inline links that mixed `ArrowLeft`/`ArrowRight` and had
  inconsistent RTL handling.
- **`src/components/shared/empty-state.tsx`** — icon + title + optional
  description + optional primary action; dashed framing. `border-0` variant for
  use inside an existing Card.
- i18n: added parity-safe `shared.back` (ar `رجوع` / en `Back`).

## Screens affected

**BackLink adopted (8):** clinic patient detail · customer statement · supplier
statement · salon ticket editor · restaurant order editor · laundry order editor
· pharmacy dispense editor · (inventory stock-count back button — arrow made
RTL-correct; stays a `<button>` because it's in-component navigation, not a route).

**EmptyState adopted (13):** electrical Serials / Warranties / RMA · supplier
returns · inventory Low-Stock / Expiry · restaurant Orders / Tables · salon
Tickets / Appointments · laundry Orders · pharmacy Dispense list · clinic
Patients / Appointments.

**Mobile + RTL:** clinic Reports table wrapped in `overflow-x-auto` (was
unscrollable on small screens) and its amount column aligned `text-end`;
pharmacy dispense + inventory count back affordances made RTL-correct.

**Docs added:** `docs/DEMO-ACCOUNTS.md`, `docs/DEMO-CHEATSHEETS.md`, this report.
**Script added (reviewable, unapplied):** `supabase/demo/seed_demo_accounts.mjs`.

## Demo improvements (what a customer now sees)

- Every demo list screen shows a **consistent, intentional empty state** (icon +
  message) instead of mixed bare text / cards — so a fresh or filtered tenant
  still looks finished.
- Every detail/sub screen has the **same back affordance**, correct in both RTL
  and LTR.
- The clinic **Reports** table no longer overflows on a phone.
- A complete **per-vertical demo script** (cheat sheets) and a reviewable
  **all-tenants demo-account** plan make the environment presentable end-to-end.

## Verification

- `npm run typecheck` — green.
- i18n **parity** + **key-usage** tests — green (new `shared.back` key in both
  locales; all adopted screens reuse existing keys → no missing keys).
- Full `next build` runs in CI ("Typecheck & build" job). Demo-account commit's
  CI was green; the polish commits run the same pipeline.
- No data, permission, integration, module, or tenant behaviour was changed.

## Demo-readiness checklist

- [x] Shared back link everywhere on demo detail screens (RTL-correct).
- [x] Shared empty state on demo list screens.
- [x] Button labels audited (verb-first / masdar-consistent).
- [x] Demo tables scroll on mobile; back arrows mirror in RTL.
- [x] Per-vertical demo cheat sheets.
- [x] Reviewable all-tenant demo-account plan + seeder (apply on approval).

---

## Remaining P2 items (before first pilot — NOT started)

From `docs/P1-REVIEW-AND-PLATFORM-PLAN.md`:
1. Group Platform-Owner per-company toggles into Core Modules / Industry Packs /
   ERP Integrations (`classifyModuleKey`).
2. Per-company ERP-connector allow-list (CSV/SFTP · Dynamics · SAP · Odoo · NetSuite).
3. Owner per-company integrations view (read-only audit on company detail).
4. Companies-list polish — is_active/suspended clarity, filter active demos, quick search.
5. Built-feature visibility map — audit every built feature is reachable from the right admin location.
6. Empty-state pass across **all** list screens (this P1 pass covered demo paths only).
7. Button-label audit across **all** forms (P1 covered demo paths only).

## Remaining P3 items (v1.1 — NOT started)

8. Cash Customer workflow (walk-in sale without a saved customer).
9. Global Search (customers/products/invoices/serials).
10. Quick Actions menu (new invoice / customer / RMA).
11. Feature Flags (per-company toggles beyond modules).
12. Impersonation / "View as Company Admin" (read-only, audited).
13. Company-admin-scoped permission editor.
14. Role-template admin UI (`erp_business_type_roles`).
15. Per-vertical dashboard layout polish.

*P1 demo-readiness polish complete. Scope held strictly to demo-path UX. P2/P3
tracked above, not started.*
