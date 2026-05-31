# VANTORA — Design System

> Powerful like an ERP. Simple like a modern SaaS. Premium enough for enterprise
> customers across GCC and Arab markets.

A token-driven, **RTL/LTR + light/dark** design language. Build screens by
composing the shared primitives — never bespoke one-off styling — so every
module inherits the same look. Live reference: **`/design`**.

## Permanent UI/UX principles
- **Mobile-first** — design for small screens first, scale up.
- **Premium enterprise appearance** — calm, high-contrast, uncluttered.
- **Fast & simple workflows** — minimise clicks; sensible defaults.
- **Consistent navigation** — the same shell, nav, and patterns everywhere.
- **Role-based dashboards** — surface what each role needs.
- **Industry-specific experience on a shared core** — config, not forks (see
  `PRODUCT_PRINCIPLES.md`).
- **Arabic RTL and English LTR are first-class** — both fully supported and tested.

## 1. Palette (deep navy + premium cyan + white + cool neutrals)
Defined as HSL CSS variables in `src/app/globals.css` (`:root` + `.dark`). Never
hard-code hex in components — use the Tailwind token classes.

| Token | Light | Role |
|---|---|---|
| `--primary` | deep navy `216 64% 22%` | brand, primary actions |
| `--accent` | premium cyan `190 90% 42%` | highlights, focus ring |
| `--background` / `--foreground` | white / navy ink | canvas / text |
| `--secondary` / `--muted` | cool neutral `214 32% 95%` | subtle fills |
| `--success` / `--warning` / `--destructive` / `--info` | emerald / amber / red / cyan-blue | status |
| `--border` / `--input` / `--ring` | neutral / cyan | lines / focus |

Dark mode lifts navy to a brighter navy-blue and keeps cyan as the accent.
Status colors render as **soft tints** (`bg-*/10 text-*`) for badges/chips.
Avoid playful/startup hues — stay in the navy/cyan/neutral family.

## 2. Foundations
- **Radius:** `--radius: 0.625rem` (rounded, not pill).
- **Typography:** IBM Plex Sans Arabic; `.tabular-nums` for financial figures.
- **Focus:** every interactive primitive shows a **cyan focus-visible ring**
  (`focus-visible:ring-2 ring-ring`) — keyboard accessible.
- **Contrast:** target WCAG AA; foregrounds chosen against each surface.

## 3. Primitives (`src/components/ui`)
Single source of truth — compose, don't re-style:
`Button` (default / secondary / outline / ghost / destructive / link; sizes),
`Badge` (default / secondary / success / warning / info / destructive / outline),
`Input`, `Label`, `Card`, `Dialog`/Confirm, `Table`, `Tabs`, `Toast` (sonner),
`Skeleton`, `PageHeader`, `EmptyState`. All token-driven, RTL-aware (use logical
classes: `ms-`/`me-`, `text-start`/`text-end`, `rtl:rotate-180` for directional
icons).

## 4. Composition patterns
- **Page**: `<PageHeader title description />` then content cards.
- **Tables**: header in `bg-secondary/50`, `text-start`, empty + loading states.
- **Forms**: label + control + helper; the **Dynamic Forms** renderer for custom
  fields; server-authoritative validation.
- **Status**: use `Badge` variants; never raw colored text.

## 5. Rollout
1. ✅ Foundation: tokens (navy/cyan), brand mark recolor, `/design` showcase, this doc.
2. 🔜 Apply to highest-traffic screens: **Dashboard · Customers · Workflow Inbox ·
   Approvals · Billing** — then the rest.

Adding a screen: compose primitives + tokens; if you reach for a hex or a one-off
component, stop and add/extend a primitive instead.
