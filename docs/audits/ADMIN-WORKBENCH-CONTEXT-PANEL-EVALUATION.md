# Admin Workbench — Right Context Panel: Permanent vs. Collapsible (UX Evaluation)

Evaluation of replacing the **permanent right Context Panel** with a **collapsible slide-out drawer** across the Admin Workbench. Design/evaluation only — no implementation. Your instinct is right; recommendation up front below.

> **Recommendation: make the Context Panel a collapsible slide-out, hidden by default, with an optional pin on wide screens — persisted per user.** Reserve the third column only when the user pins it. This returns ~300px of workspace to the primary editing task without losing Activity/Audit/Related, which are occasional.

---

## 1. Permanent right panel vs. collapsible panel

| Dimension | Permanent column (~320px) | Collapsible drawer (recommended) |
|-----------|---------------------------|----------------------------------|
| Workspace width | Always −320px from the center | Full center width by default |
| Context access | Always visible | One click (`Context`/`Activity` button) or keyboard `]` |
| Cognitive load | Constant peripheral content | Surfaced on demand |
| Forms/config | Cramped on 1280–1440px laptops | Comfortable |
| Discoverability | High (always there) | Slightly lower (button + tooltip mitigate) |
| Wide screens (≥1800px) | Fine | Pin option gives the same as permanent |

Net: for **editing/configuration** (the dominant admin task) the center width matters more than constant context. Collapsible wins on the common case; the pin preserves the permanent experience for those who want it.

---

## 2. Screen-space efficiency

- On a 1366–1440px laptop, a permanent 320px right column leaves the center ~700–760px after the 280px tree — tight for two-column forms and tables. Collapsing it yields **~1000–1080px** of center — a ~40% workspace gain exactly where edits happen.
- Companies already proves the point: the **Company360 detail is full-width** (no right panel) and reads far better for the dense detail.

---

## 3. Power-user workflows

- Power users edit fast and check audit/activity **occasionally and deliberately**. A keyboard toggle (`]` to open/close, `Esc` to close) + remembered state suits them better than a permanent column.
- Pinning is available for the minority who keep an eye on activity continuously (e.g., during incident triage).

---

## 4. Platform Owner workflows

- Cross-company oversight: Activity/Audit matter, but usually **per investigation**, not constantly. A drawer that opens to the selected entity's live feed (already built: `ActivityFeed`) covers this; pin during an audit session.
- The wide monitors Platform Owners often use make the **pin** a good default for them specifically (role-based default, below).

---

## 5. Company Admin workflows

- Day-to-day: manage users/roles/branches/features — almost entirely center-panel editing. Audit is reviewed rarely. **Collapsed-by-default is clearly better** here; more room for forms, fewer distractions.

---

## 6. Desktop / tablet behavior

- **≥1800px (wide):** drawer collapsed by default; **pin** docks it as a column (≈ today). Remembered per user.
- **1280–1799px (standard desktop/laptop):** drawer collapsed; opens as an **overlay slide-out** from the end side; closes on select/Esc. (Recommended primary mode.)
- **768–1279px (tablet):** already a drawer today — unchanged, just becomes the standard everywhere.
- **<768px (mobile):** full-screen sheet — unchanged.
- Direction-aware (RTL/LTR): slides from the inline-end side.

---

## 7. Are ActivityFeed & Audit worth permanent width?

- **No, not permanently — but yes, worth one click.** They are high-value *occasionally* (investigations, "who changed this?"), low-value *continuously*. Permanent width taxes every editing session to serve an occasional need.
- The right answer is **fast, contextual access** (a live feed scoped to the selected entity, which we already have) rather than **constant presence**. Summary/Related can move into the center header (a compact summary strip) so the most-glanced bits stay visible without the column.

---

## 8. Mockups

**Default (drawer collapsed) — most of the time**
```
┌ Nav Tree ─────┬ Workbench (full width) ───────────────[ Context ▸ ]┐
│ ▼ Companies   │ Header · Tabs                                       │
│ ▼ Users       │ ┌ Section ┐ ┌ Section ┐                            │
│ ▼ Roles       │ │ form    │ │ form    │   ← ~40% more width        │
│ …             │ └─────────┘ └─────────┘                            │
└───────────────┴────────────────────────────────────────────────────┘
```

**Context opened (slide-out overlay)**
```
┌ Nav Tree ─────┬ Workbench ───────────────┬ Context (slide-out) ───┐
│ …             │ form …                   │ Summary                │
│               │                          │ Activity (live)        │
│               │                          │ Audit · Related   [📌] │
└───────────────┴──────────────────────────┴────────────────────────┘
```

**Pinned (wide screens / Platform Owner default)** = today's three-column layout, by choice.

---

## 9. Implementation sketch (when approved)

- `AdminWorkbench`: add `context` visibility state — `collapsed | overlay | pinned`; a header **Context/Activity** button + `]` shortcut; **persist per user** (localStorage first; a tiny `erp_admin_prefs` row later for cross-device).
- **Role-based default:** Company Admin → collapsed; Platform Owner on ≥1800px → pinned. Overridable + remembered.
- Move a compact **Summary strip** into `EntityHeader` so key facts stay visible without the column.
- Reuse the existing drawer mechanics already in `AdminWorkbench` (the tablet drawer) — extend to all breakpoints. No backend; pure UX.

Estimated ~0.5–1 day, additive, behind a flag for A/B if desired.

---

## 10. If permanent is still preferred

It would only be justified if admins **continuously monitor** Activity/Audit while editing (e.g., a live ops/SOC-style console). That is not the described workflow (Activity/Audit/Related/Summary are "occasional"). Given that, the **additional ~40% center width for editing outweighs constant context**, so the **collapsible drawer with an optional pin** is the recommended standard — it delivers the permanent experience on demand without taxing every session.

*UX evaluation only — no implementation. Mockups + recommendation as requested.*
