# UX Gap Analysis — Field Sales (VANTORA vs reference)

Analysis only — **no structural changes made**. References are SalesBuzz-style field screens
(customer cockpit). Used as inspiration, not a visual copy.

## What the reference does (the pattern)

- **Persistent customer header** on every visit sub-screen: `Customer name (bold) · CODE · Area ·
  status badge (Pending / In Visit / No Sale / Collection)`. The rep always knows *who*.
- **Compact financial status grid** (2×3, glanceable): Credit limit (+ "Cash only" flag),
  Outstanding, Overdue, Last invoice date, and a green **Available credit** banner.
- **One obvious primary** (maroon, full width): *Start Visit* (pending) or *Next Customer* (My Day).
- **Equal-weight action grid** (icon + label tiles): New Sale · Collection · Return · **No Sale** ·
  **History** · **Navigate**. Every action visible at once; the *suggested* one is highlighted
  (e.g. Collection when there's outstanding).
- **Next Customer** always at the bottom of a visit — keep moving.
- **Today Route** = a numbered, status-badged, scannable list (`1/6` progress).
- **My Day dashboard** = small KPI tiles at the top, then the big *Next Customer*, then the action
  grid, then *End Day*. Near-zero text/alerts.

## 1. Why the reference is understandable in < 2 seconds

- **Identity is pinned.** The customer name + status badge sit at the very top of every visit
  screen, so "Who am I visiting?" is answered instantly and stays answered while selling/collecting.
- **Status is structured, not prose.** Five labelled numbers (credit / outstanding / overdue / last
  invoice / available credit) in a fixed grid — the eye lands in the same place every time.
- **Actions are a fixed palette.** The same 6 tiles in the same positions → muscle memory; the rep
  never hunts for "where's Return / No Sale / Navigate".
- **One primary, colour-coded.** Nothing competes with Start Visit / Next Customer.
- **No dashboard noise.** No recommendation feed, no big charts, no competing cards.

## 2. VANTORA elements creating unnecessary cognitive load

| Element | Where | Problem |
| --- | --- | --- |
| Attention / copilot list | My Day workspace | A recommendation feed on the operational home — not "who/what next". Pure noise for a rep mid-route. |
| Customer Picker (tabs + search) | My Day | A heavy searchable list as the primary route surface; the rep mostly wants *the next stop* + the *route order*, not a filter UI. |
| Balance-first visit screen | Visit (`customer-statement` field) | Leads with **balance** and a credit *badge*, not the **customer identity** + structured status grid. The customer name is only in the small page header. |
| Inline ledger / aging / open-invoices | Visit Level-2 | Accounting detail inline; the reference puts this behind a **History** action. |
| KPI strip placement | My Day bottom | Fine but not framed as a quick top-of-screen snapshot like the reference. |
| Missing actions | Visit | **No Sale**, **History**, **Navigate** are not first-class visit actions (reference treats them as equal tiles). |

## 3. KPIs / cards to demote, collapse, or move

- **Remove from the My Day spine:** the attention/copilot list → move to a separate *Alerts* entry
  (or drop for reps). It is the single biggest source of noise.
- **Demote to an action ("History"):** the running **ledger**, **aging**, and **open invoices** —
  off the default visit view, opened on demand (matches the reference History tile).
- **Compact + reposition KPIs:** keep the 6 KPIs but as a **small top strip** on My Day
  (Planned · Visited · Remaining · Productive · Sales · Collection), not large cards.
- **Replace the picker as the primary route surface** with a **Today Route** numbered list
  (status badges per stop); keep the searchable "All customers" picker behind an *off-route* entry.

## 4. Primary vs secondary actions (target)

**Visit screen (cockpit):**
- **Primary:** *Start Visit* (when pending) → then the action grid becomes active.
- **Action grid (equal weight):** New Sale · Collection · Return · No Sale · History · Navigate.
- **Suggested-action highlight:** Collection when overdue/outstanding > 0; New Sale otherwise.
- **Bottom:** *Next Customer* (secondary-styled but always present).

**My Day:**
- **Primary:** *Next Customer* (already the case via the hero). 
- **Action grid:** Customers · New Sale · Collection · Returns · Van Stock · Invoices.
- **Bottom:** *End Day* (secondary).

## 5. Duplicate navigation paths (to consolidate)

1. **Four ways to reach a visit:** My Day hero → Start Visit; Customer Picker → statement; Smart
   Next (`/field/next`) → statement; Journey route (`/field/journey`) → statement.
2. **Three ways to "go to the next customer":** hero *Next Customer* (`/field/next`), *Continue
   Route* (`/field/journey`), and the embedded picker.
3. **Two route entry labels:** *Continue Route* vs *View Route* vs the picker.
4. **Van Stock** appears both as a My Day tile and in the bottom nav.

→ Consolidate to **two** surfaces: **Today Route** (the list) and the **Visit cockpit** (the
actions), with a single *Next Customer* that routes to the next stop's cockpit.

---

## Proposed structural direction (for approval — not yet built)

All flag-gated (`platform.smart_next_customer` / a new `platform.field_cockpit`), reversible,
staging-only, no business-logic/permission/route changes to the underlying actions.

- **A. Visit Cockpit** — rebuild the field visit screen as: persistent customer header (name ·
  code · area · status badge) + compact status grid (Credit limit +Cash-only · Outstanding ·
  Overdue · Last invoice · Available credit) + 6-tile action grid (New Sale · Collection · Return ·
  **No Sale** · **History** · **Navigate**) + Next Customer. Ledger/aging/open-invoices move behind
  **History**.
- **B. My Day** — compact KPI strip on top · big *Next Customer* · action grid · *End Day*; remove
  the attention/copilot feed from the spine; surface a **Today Route** numbered list (status badges)
  in place of the searchable picker as the default.
- **C. No Sale** — add as a first-class visit action (reason-coded → counts toward coverage).
- **D. Route status badges** — Pending / In Visit / Visited / No Sale / Collection per stop.
- **E. Navigation consolidation** — single *Next Customer* + *Today Route*; retire the duplicate
  route/next entry points.

### Suggested sequencing
1. Visit Cockpit (A) — biggest "who am I visiting / what next" win.
2. No Sale (C) + route status badges (D).
3. My Day recompose (B).
4. Navigation consolidation (E).

**Awaiting your go / priorities before implementing.**
