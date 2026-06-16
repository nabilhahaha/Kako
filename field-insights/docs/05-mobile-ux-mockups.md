# 05 — Mobile UX Mockups (wireframes)

Low-fidelity ASCII wireframes of the load-bearing screens. Device frame ≈ 390×844 (modern phone). Bottom nav is persistent; the blue **●** marks the FAB / primary action.

## B1 — Home / Today
```
┌─────────────────────────────┐
│ Field Insights      ◔ ⚙︎ 🔔   │  ← header: sync status, settings, alerts
├─────────────────────────────┤
│ Good morning, Sara          │
│ ▸ 3 visits today  ▸ 5 sync ⏳ │
│                             │
│ ┌─────────────────────────┐ │
│ │   ▶  START VISIT        │ │  ← big primary button (one-tap)
│ └─────────────────────────┘ │
│                             │
│ TODAY'S VISITS              │
│ ┌─────────────────────────┐ │
│ │ Carrefour City  ✓ synced│ │
│ │ Follow-up · 09:30       │ │
│ ├─────────────────────────┤ │
│ │ Metro Mart    ⏳ pending │ │
│ │ Competitor Check · 11:00│ │
│ └─────────────────────────┘ │
│ ACTIONS DUE (2)        ›    │
├─────────────────────────────┤
│ 🏠   📋   🗺   📊   ⋯        │  ← Home Visits Map Dash More
└─────────────────────────────┘
```

## C2/C3 — Start Visit (customer → location + GPS)
```
┌─────────────────────────────┐
│ ‹ New Visit          1 of 3 │
├─────────────────────────────┤
│ 🔎 Search customer…         │
│ RECENT                      │
│  • Carrefour City           │
│  • Metro Mart               │
│  • Al Noor Trading          │
│  ＋ New customer            │
├─────────────────────────────┤
│ LOCATION                    │
│ ┌───────────[ map ]───────┐ │
│ │        📍 (you)         │ │
│ │      ◯ geofence 150m    │ │
│ └─────────────────────────┘ │
│ 📍 Use my location          │
│ GPS: 25.197, 55.274 ±8m  ✓  │  ← ✓ in range / ⚠ out of range
│ ┌─────────────────────────┐ │
│ │        CONTINUE         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

## C4 — Visit Detail (tabbed hub)
```
┌─────────────────────────────┐
│ ‹ Carrefour City     ⏳      │
│ Follow-up · in progress     │
├─────────────────────────────┤
│ Overview Photos Comp Opp ⋯  │  ← scrollable tabs
├─────────────────────────────┤
│ OBJECTIVE                   │
│ [ Check shelf share + promo]│
│ SUMMARY                     │
│ [ ………………………… ]         │
│ OUTCOME                     │
│ [ ………………………… ]         │
│                             │
│ QUICK CAPTURE               │
│  📷 Photo  🏷 Competitor    │
│  💡 Opp    ⚠ Issue          │
│  🎤 Voice  ✅ Action        │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │       END VISIT         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

## D1/D2 — Camera capture + annotate
```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│        [ live camera ]      │    │ ‹ Tag photo                 │
│                             │    │ ┌───────[ thumb ]────────┐  │
│                             │    │ │                        │  │
│  cat: ◉Shelf ○Display ○…    │    │ └────────────────────────┘  │
│                             │ →  │ CATEGORY                    │
│        25.197,55.274        │    │ [Store][Shelf*][Display]…   │
│   ┌───┐    (◯)    ┌───┐     │    │ DESCRIPTION                 │
│   │📁 │   shoot   │↺ │     │    │ [ Competitor endcap promo ] │
│   └───┘           └───┘     │    │ 📍25.197,55.274 · 09:42 ✓   │
│                             │    │ [   SAVE   ] [  RETAKE  ]    │
└─────────────────────────────┘    └─────────────────────────────┘
```

## E2 — Competitor observation
```
┌─────────────────────────────┐
│ ‹ Competitor observation    │
├─────────────────────────────┤
│ Competitor  [ Brand X    ▼] │
│ Product     [ 1L Juice    ] │
│ Price       [ 4.50 ] AED    │
│ Promotion   [ Buy2Get1    ] │
│ Display     ○Poor ◉Good ○Exc│
│ Notes       [ ……………… ]    │
│ 📷 Attach photos (2)        │
│ ┌─────────────────────────┐ │
│ │          SAVE           │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

## F1 — Opportunity pipeline (kanban, swipeable)
```
┌─────────────────────────────┐
│ Opportunities        ＋  ⚙︎  │
│ Pipeline value: AED 1.2M    │
├─────────────────────────────┤
│ OPEN (4)            �$420k › │
│ ┌─────────────────────────┐ │
│ │ New chiller @ Metro     │ │
│ │ ▲ High · due Jun 30     │ │
│ ├─────────────────────────┤ │
│ │ Listing 3 SKUs          │ │
│ │ ● Med · due Jul 12      │ │
│ └─────────────────────────┘ │
│ IN PROGRESS (2)     �$300k › │
│ CLOSED WON (3)      �$480k › │
├─────────────────────────────┤
│ 🏠   📋   🗺   📊   ⋯        │
└─────────────────────────────┘
```

## K1 — Executive dashboard
```
┌─────────────────────────────┐
│ Dashboard      Region ▾  ⚙︎  │
├─────────────────────────────┤
│ ┌───────┐ ┌───────┐         │
│ │ 128   │ │  17   │         │
│ │ Visits│ │ Opps  │         │
│ └───────┘ └───────┘         │
│ VISITS BY CITY              │
│  Dubai     ▆▆▆▆▆▆ 54        │
│  Abu Dhabi ▆▆▆▆ 38          │
│  Sharjah   ▆▆▆ 24           │
│ PIPELINE                    │
│  Open ▆▆▆  Prog ▆▆  Won ▆▆▆ │
│ ISSUES BY CATEGORY          │
│  OOS ▆▆▆▆  Price ▆▆ Vis ▆   │
│ ACTIONS DUE (7)        ›    │
├─────────────────────────────┤
│ 🏠   📋   🗺   📊   ⋯        │
└─────────────────────────────┘
```

## J1 — Visits map
```
┌─────────────────────────────┐
│ Map        Filters ▾   📍me │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │   ⑤        ②            │ │  ← clustered counts
│ │       📍                │ │
│ │            ③      ①     │ │
│ │   [ OSM tiles ]         │ │
│ └─────────────────────────┘ │
│ Tap a pin → visit card      │
├─────────────────────────────┤
│ 🏠   📋   🗺   📊   ⋯        │
└─────────────────────────────┘
```

## B5 — Sync center
```
┌─────────────────────────────┐
│ ‹ Sync               Sync ⟳ │
│ 5 pending · 0 failed        │
├─────────────────────────────┤
│ ⏳ Visit: Metro Mart        │
│ ⏳ Photo ×3 (Metro Mart)    │
│ ⏳ Voice note (1)           │
│ ✓ Carrefour City — synced   │
│ ⚠ Issue — failed   [Retry]  │
└─────────────────────────────┘
```

## UX principles applied
- **Thumb zone:** primary actions (Start Visit, Save, End Visit, FAB) sit in the lower third.
- **Large targets:** ≥ 44px controls; category/priority as chips, not tiny dropdowns where possible.
- **Glanceable status:** sync (⏳/✓/⚠) and GPS (✓/⚠) badges everywhere data is captured.
- **Minimal typing:** defaults, recents, chips, and voice notes reduce keyboard use in the field.
- **RTL/i18n-ready:** layouts mirror cleanly for Arabic.
