# VANTORA Route Planner — Brand & Product Package

**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19

A practical, code-first brand kit for the standalone Route Planner product. Everything
here is implemented in the app (no external image assets), so it stays crisp at any size
and theme-aware.

---

## 1. Logo

- **Component:** `src/components/route-planner/brand-logo.tsx`
  - `<RoutePlannerMark size />` — the icon only (a rounded "map tile" with a route line
    threading three visit stops: *territory + sequence + visit points* in one glyph).
  - `<RoutePlannerLogo size tone showProduct />` — full lockup `[mark] VANTORA Route Planner`.
    `tone="invert"` for dark / coloured backgrounds.
- **Favicon:** `icon.svg` is provided for each product segment — `/planner`,
  `/planner-login`, `/planner-admin` — so the browser tab shows the route mark, not the
  ERP favicon.
- **Clear space / min size:** keep padding ≥ the mark's corner radius; don't render the
  full lockup below 20 px mark height (use the mark alone instead).

## 2. Colour palette

The product inherits VANTORA's design tokens (so light/dark themes just work). Primary
brand actions use the `--primary` token; the planner adds a few fixed accents:

| Role | Token / value | Use |
| :--- | :--- | :--- |
| Primary | `--primary` (royal blue, ~`#2563eb`) | logo, CTAs, active route, hero |
| Foreground / Muted | `--foreground` / `--muted-foreground` | text hierarchy |
| Card / Border | `--card` / `--border` | surfaces, dividers |
| Trial / OK | `emerald-500/600` | "Trial Active", top-decile routes |
| Notice | `amber-500` | ≤ 7 days, Needs Review |
| Warn | `orange-500` | ≤ 3 days |
| Renew / Expired | `red-500/600` | ≤ 1 day, expired, bottom-decile |
| Suspended | `zinc-500` | suspended tenants |
| WhatsApp | `#25D366` | renewal / contact button |

Route colours on the map come from a fixed categorical ramp (`routeColors`) so adjacent
territories stay visually distinct.

## 3. Typography

- **Family:** the app's existing sans (Geist / system stack) — no new web fonts (speed).
- **Scale:** Hero `text-4xl/5xl` bold · Section `text-2xl` bold · Card title
  `font-semibold` · Body `text-sm` · Meta `text-xs`/`text-[11px]`. Numbers use
  `tabular-nums` everywhere they're compared (route stats, days remaining, sales).
- **Tracking:** headings `tracking-tight`. **Direction:** fully bidi — every screen is
  validated in Arabic (RTL) and English (LTR); the i18n parity test enforces symmetric
  dictionaries.

## 4. Screens (all implemented)

| Screen | Route | Notes |
| :--- | :--- | :--- |
| Marketing landing | `/planner` (public) | hero, features, how-it-works, CTA, WhatsApp |
| Standalone login | `/planner-login` (public) | split brand panel + sign-in, AR/EN |
| Welcome / empty | planner focus mode | branded hero + 4 capability cards before upload |
| Planner workspace | `/distribution/route-planner` | chrome-free, map-as-hero, compact route cards |
| Admin console | `/planner-admin` | tenants, subscription controls, search/filter |

## 5. Empty states

- **Before upload (welcome):** branded hero with the four product capabilities
  (Route Planning · Territory Optimization · Current Allocation Review · Journey Planning)
  and Upload / Download-template CTAs — never a blank screen.
- **No routes yet:** the route list shows a centered `—` placeholder.
- **Admin, no tenants:** "No tenants yet — create your first one."

## 6. Trial & subscription

See `src/lib/erp/route-planner-subscription.ts`. 30-day trial, warning ramp
(ok → ≤7d → ≤3d → ≤1d → expired), capability gating (view stays; upload / split / approve /
export lock on expiry), and a WhatsApp renewal deep-link pre-filled with company + tenant.
Configure the number with `NEXT_PUBLIC_ROUTE_PLANNER_WHATSAPP`.

## 7. Demo screenshots

Screenshots **cannot be captured from this headless build environment** (no browser). The
live preview deployment IS the demo to screenshot:

- **Marketing:** `…/planner`
- **Login:** `…/planner-login`
- **Planner:** `…/distribution/route-planner` (sign in as a Route Planner tenant / the demo)
- **Admin:** `…/planner-admin`

(Preview URL: the Vercel `kako-git-claude-pilot-ux-…` deployment on PR #319.)

## 8. Architecture note (important)

The Route Planner experience is driven by the **tenant**, not an email:

```
Route Planner company (plan_key route_planner*)  →  Route Planner experience
```

`src/lib/erp/route-planner-experience.ts` is the single driver; the demo email is a
temporary trigger layered on top and removable in one line. Real tenants created by the
Admin Console automatically get the full branded experience (no "Demo" badge).
