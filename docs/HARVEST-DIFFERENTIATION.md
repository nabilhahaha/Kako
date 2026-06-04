# VANTORA — Differentiation Harvest & UX Review

> Review + planning, plus the low-risk wins implemented this sprint. No production
> change, no migration, no AI enablement. Prepared `2026-06-04`. Comparison set:
> **ERPNext, Odoo Community, Dolibarr, Tryton, Metasfresh.**

---

## Phase 6 — Differentiation review (classified)

Lens: where a **mobile-first FMCG distribution / route-to-market** product beats
generic open-source ERPs. Classes: **CA** = Competitive Advantage · **MD** =
Market Differentiator · **NI** = Nice Improvement · **IG** = Ignore.

| # | Opportunity | vs. the field | Class |
| --- | --- | --- | --- |
| 1 | **GPS-geofenced visit check-in** with out-of-route + override workflow | ERPNext/Odoo CE/Dolibarr/Tryton have no native GPS visit compliance; Odoo needs paid/3rd-party | **MD** ✅ already built |
| 2 | **Day-close coverage gate** (can't close below min coverage; approval exception) | None of the five enforce route coverage at close | **MD** ✅ built |
| 3 | **Van-to-van stock transfer** with availability guard + value-threshold auto-approve | Metasfresh has strong WMS but not mobile van-centric; others weak | **CA** ✅ built |
| 4 | **Multi-UOM price resolution** (customer › channel › generic, qty tiers, effective windows) | Odoo pricelists exist but less FMCG-route-tuned; others basic | **CA** ✅ built (Wave 1) |
| 5 | **Exceptions-first Attention Center + route-health score** | Generic ERPs bury exceptions in lists/reports | **MD** ✅ **implemented this sprint** |
| 6 | **Deterministic Help Copilot** (why-blocked / explain-screen / role training), bilingual, no AI cost | None ship an in-product, permission-aware "why can't I…" explainer | **CA** ✅ built |
| 7 | **Journey planning + today's optimized route** (nearest/optimized/hybrid sort) | Odoo/ERPNext lack native rep journey optimization | **MD** ✅ built |
| 8 | **Territory/hierarchy-scoped RLS** (rep sees own customers; supervisor own team) enforced in DB | Open-source ERPs rely on app-layer record rules; weaker tenancy | **CA** ✅ built |
| 9 | **Payment/invoice idempotency** (retry-safe financial writes) | Rarely first-class in OSS ERPs | **NI** ✅ built (0118) |
| 10 | **Supervisor "team alerts / pending approvals summary"** surfaced per role | Generic ERPs = separate report screens | **MD** ◻ partially via Attention Center; expand |
| 11 | **Arabic-first, RTL, bilingual mirrored i18n** with parity enforcement | OSS ERPs translate but not Arabic-first FMCG UX | **CA** ✅ built |
| 12 | **Trade-spend / promotions / claims** (FMCG money-maker) | Not native in any of the five | **MD** ◻ future wave (not now) |
| 13 | **Replenishment / suggested-order** at the shelf | Not native | **MD** ◻ future wave |
| 14 | Full double-entry GL depth | All five are strong here | **IG** (don't compete; reuse our posting) |
| 15 | Manufacturing/MRP depth | Odoo/Metasfresh strong | **IG** for FMCG distribution focus |

**Takeaway:** VANTORA's durable edge is **mobile field execution + route/GPS
compliance + supervisor exception visibility + Arabic-first UX** — not GL/MRP
breadth. The sprint win (#5) reinforces the exception-visibility moat.

---

## Phases 7–12 — UX review & quick-win ledger

Legend: ✅ implemented this sprint · ◻ proposed (low-risk backlog) · ⏳ larger.

### Phase 7 — Mobile excellence (fewer taps)
- ◻ Customer/Product search: **recent + suggested** entries in the existing
  `SearchCombobox` (additive reducer state) — cut typing on repeat lookups.
- ◻ Journey visit: collapse check-in into a **single sticky primary action** with
  inline reason on violation (avoid modal hop).
- ◻ Route selection: remember **last route** per rep (local pref) → one tap.
- ⏳ Replace multi-step modals (stock transfer, credit request) with single-scroll forms.

### Phase 8 — Supervisor & manager experience
- ✅ **Attention Center** (`/attention`) — exceptions-first, role-tailored, with
  **urgent count + route-health score** (reuses `nextBestActions` + new
  `attention.ts`).
- ◻ "Pending approvals summary" and "coverage summary" cards on the manager
  dashboard (reuse the same RLS-scoped counts).
- ◻ Team alerts digest (per supervisor) — surface from existing compliance data.

### Phase 9 — Dashboard modernization
- ✅ Health-score signal (pure `summarizeAttention` / `coverageBand`) ready to wire.
- ◻ Add optional **trend + hint** props to `StatCard` (additive, backward-compatible)
  for ▲/▼ deltas and achievement %.
- ◻ Consistent **empty states** via the shared `EmptyState` on every overview.

### Phase 10 — Search excellence
- ◻ Recent searches (per entity, local) + result **grouping** (e.g., by channel/route).
- ◻ Match **highlighting** in combobox results; keyboard up/down already partial.
- ◻ "No results → create new" affordance inline.

### Phase 11 — Copilot UX (no external AI)
- ◻ Surface **suggested questions** as tappable chips on every screen header (data
  already in the KB `SCREENS[].questions`).
- ◻ "Why is this disabled?" inline on disabled buttons → opens the deterministic
  why-blocked explanation (engine already computes it).
- ◻ Context cards: show the screen purpose + top action inline (KB-backed).

### Phase 12 — Design consistency
- ◻ Normalize status badges to one variant map (invoice/visit/approval) — several
  local maps exist; centralize.
- ◻ Standardize page scaffolding on `PageHeader` + `space-y-6` (most pages already).
- ◻ Button sizes/tones audit (primary vs secondary usage) across forms.

---

## Phase 13 — Implemented this sprint (high-value / low-risk / additive)

1. **`src/lib/erp/attention.ts`** — pure exceptions-first ranking + health/coverage
   scoring (the supervisor-visibility differentiator logic). Unit-tested.
2. **`/attention` — Attention Center page** — reuses the existing RLS-scoped
   `nextBestActions`; renders urgent/health StatCards + a ranked, one-tap list;
   bilingual; mobile-first; empty state. Additive (no existing page changed).
3. **Nav + i18n** — discoverable nav entry (after Dashboard) + `attention` i18n
   namespace (ar/en mirrored) + `nav.items.attentionCenter`.

All other items above are deliberately deferred as a **low-risk backlog** (next
sprint) rather than rushed into the release branch — each is additive and scoped.

---

## Top remaining opportunities (next)
1. Dashboard manager widgets (pending-approvals + coverage summary) reusing the same data.
2. Recent/suggested search + result grouping in the shared combobox.
3. `StatCard` trend/achievement props (additive) + dashboard wiring.
4. Inline "Why is this disabled?" on gated buttons (deterministic Copilot).
5. Status-badge + button-tone consistency pass.
6. (Future waves) Trade-spend/promotions; replenishment suggestions — the biggest FMCG MD plays.
