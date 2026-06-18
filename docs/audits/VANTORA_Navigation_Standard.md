# VANTORA Platform Navigation Standard

### A platform-wide UX architecture decision ("Navigation Constitution")

**Status:** Design review & recommendation — *no implementation*. **Branch:** `claude/pilot-ux`. **Date:** 2026-06-18.

This document elevates a single observation — *"multiple side-navigation layers consume width and add depth"* — into a binding, reusable navigation standard so that **every future VANTORA module automatically follows the same architecture and cannot introduce additional navigation layers**. It is provider/tenant-agnostic and applies to Admin Center, Companies, Users, Roles, Branches, Features, Settings, Integrations, and all future modules (CRM, Warehouse, Accounting, HR, Pharmacy, POS, AI Center).

---

## 1. The problem, named precisely

Today VANTORA can stack **two persistent vertical rails plus a horizontal facet** before any content appears:

```
CURRENT (anti-pattern when fully stacked)
┌───────────────────────────────────────────────────────────────┐
│ L0  Platform bar: tenant · role · search · quick-create · 🔔    │
├──────────┬──────────────┬────────────────────────────────────-─┤
│ L1       │ L2           │  L3 Content                           │
│ Module   │ Module       │                                       │
│ Rail     │ Sub-Rail     │  (what's left of the width)           │
│ (side)   │ (side)       │                                       │
│          │              │                                       │
│ ~240px   │ ~220px       │  ← two rails = ~460px of chrome       │
└──────────┴──────────────┴────────────────────────────────────-─┘
```

Two side rails cost ~460px before content, and they create a 4-deep path (Platform → Module → Sub-nav → Content). On a 1280px laptop that is **36% of width spent on chrome**; on tablet it is unusable.

**Target shape** — collapse the second *rail* into a horizontal *top grouping* wherever the content allows:

```
TARGET (default)
┌───────────────────────────────────────────────────────────────┐
│ L0  Platform bar                                                │
├──────────┬────────────────────────────────────────────────────┤
│ L1       │  Page Title                                          │
│ Module   │  [ Group A | Group B | Group C | Group D ]  ← top    │
│ Rail     │ ─────────────────────────────────────────────────── │
│ (side)   │  L3 Content (full remaining width)                  │
└──────────┴────────────────────────────────────────────────────┘
```

One rail, ~240px of chrome, a 3-deep path, and the content gets the width back.

---

## 2. The Constitution: five articles

### Article I — Name the layers (shared vocabulary)

| Layer | Name | Role | Persistence |
|------|------|------|-------------|
| **L0** | **Platform Bar** | Identity, tenant/role context, global search, command palette (`Ctrl-K`), quick-create, notifications | Always |
| **L1** | **Module Rail** | The platform's modules — **one level only**, collapsible to icons | Always (collapsible) |
| **L2** | **Section Nav** | Navigation *within* a module — see Article III for the form it takes | Per screen |
| **L3** | **Content** | The work surface; a record here may carry **Record Tabs** (facets of one object) | Always |

### Article II — The Prime Directive

> **"One rail, then rise."**
> After the Module Rail (L1), navigation must **rise to the top** (horizontal grouping) rather than spawn a second vertical rail — **unless** the content is an *unbounded collection* (which earns a Master List) or a *true hierarchy* (which earns a Secondary Rail, by exception).

**Two persistent side rails at the same time is prohibited** outside the Article IV exceptions.

### Article III — The L2 decision rule (the heart)

L2 takes exactly one of four forms, chosen by **cardinality × homogeneity × hierarchy**:

| Destinations at L2 | Nature | Hierarchy | **L2 form** | Why |
|---|---|---|---|---|
| ≤ 7, stable | facets/sections of one context | flat | **Top Grouping** (segmented tabs) | Fits horizontally; preserves width; shallow |
| 8 – 12 | mixed | flat | **Top Grouping + overflow** ("More ▾") | Still horizontal; rare items fold away |
| > 12, heterogeneous | a *hub* of pages | flat | **Grouped into ≤ 7 top groups**, each revealing its sub-set | Re-chunk before reaching for a rail |
| Unbounded | homogeneous *records* | flat list | **Master List** (in the content area, not chrome) | A list of entities is content, not a 2nd rail |
| Unbounded | homogeneous *records* | tree | **Secondary Rail / Tree** (exception) | Only a tree needs vertical nesting |

**Key reframing:** a workbench's list panel is **not** a second navigation rail — it is the *master* pane of a master–detail view, i.e. content. The ban in Article II is on *chrome* rails (menus of menus), not on master–detail.

### Article IV — Sanctioned exceptions (when a side rail *is* correct)

A Secondary Rail (L2 as a vertical list/tree) is justified **only** when at least one holds:

1. **True hierarchy / tree** — Chart of Accounts, Org Chart, the Admin Navigation Tree. Depth needs vertical space.
2. **Unbounded, frequently-scanned set** with no natural ≤7 grouping (rare).
3. **Cross-entity power navigation** — a launcher that spans entity *types* (the Navigation Tree). Must **consolidate**, never **stack** (Article VI).

If none hold, top grouping is mandatory.

### Article V — Focus / Kiosk mode (chrome suppression)

Transactional, single-task screens (**POS checkout**, label printing, guided counts) enter **Focus Mode**: L1 is *hidden*, L0 reduces to an exit/identity strip, and L2 (if any) is the task's own steps. Maximum content, zero wayfinding noise. This is a first-class state, not an afterthought.

---

## 3. Responsive rules — "each step down removes one persistent rail"

The number of **simultaneously visible navigation surfaces** decreases by one at each breakpoint. At mobile, the user sees **at most one** navigation surface at a time; everything else is one tap away.

### Desktop ≥ 1024px
- L0 full · L1 expanded (collapsible to 56px icon rail) · L2 **Top Grouping** horizontal · L3 may be **master + detail side-by-side** (3-pane permitted).
- Record Tabs render as a horizontal tab strip.

```
[L0 ───────────────────────────────────────────────────────────]
[L1▾][ Title  ·  Group A | Group B | Group C ]
[   ][ ── master ──┬── detail (record tabs across top) ──────── ]
```

### Tablet 768 – 1023px
- L1 **collapses to icon rail** (or off-canvas drawer). L2 Top Grouping stays horizontal but **scrolls / overflows**. 3-pane **collapses to drill-down** (master *or* detail).
- Two persistent rails are never shown.

```
[L0 ──────────────────────────────────]
[▣][ Title · A | B | C ›  (scroll) ]
[ ][ master  →  (tap)  →  detail   ]
```

### Mobile < 768px
- L1 → **bottom tab bar** (≤ 5 primary modules) or hamburger. L2 → **scrollable chips** or a **"Section ▾" dropdown**. L3 single column; detail is a **full-screen push**. Record Tabs → **swipeable segmented control** or a `select`.
- Touch targets ≥ 44px; primary action as a thumb-reachable FAB or sticky bottom button.

```
[L0 compact ───────────────]
[ Title          Section ▾ ]
[ « A »  B   C   (chips)    ]
[ content (1 col)          ]
[ 🏠  📦  ✚  🔔  ☰  ] ← bottom
```

**Rule of thumb:** Desktop may show L1+L2+content; Tablet shows L1(icons)+L2+content **or** L2+content; Mobile shows one of {L1, L2, content} at a time.

---

## 4. When to use which — quick reference card

| Use **Top Grouping** when… | Use **Side / Secondary Rail** when… |
|---|---|
| ≤ ~7 sibling sections of one context | The set is a genuine **tree** (depth > 1) |
| Switching *facets* of the same object | Cross-entity **launcher** spanning types |
| Sections are stable and named | An unbounded set with no ≤7 grouping |
| You want to preserve content width | Persistent wayfinding across many peers is the core job |
| Mobile parity matters (tabs → chips) | (and you accept the width cost on desktop) |

| Use a **Master List (content)** when… | Enter **Focus Mode** when… |
|---|---|
| The screen is a collection of records | The task is transactional & single-purpose (POS) |
| You need master–detail on one entity type | Wayfinding would distract (checkout, counts) |

---

## 5. Evaluation — existing Admin Workbench screens

| Screen | Current L2 | Verdict | Action |
|---|---|---|---|
| **Companies** | Master List (content) + Company360 **Record Tabs** (top) | ✅ **Compliant** | None — exemplary master–detail + top facets |
| **Users** | Master List + Record Tabs (Profile / Roles & Branches) | ✅ **Compliant** | None |
| **Roles** | Master List + Record Tabs | ✅ **Compliant** | None |
| **Branches** | Master List + Record Tabs | ✅ **Compliant** | None |
| **Features** | Master List (capability domains) + Record Tabs | ✅ **Compliant** | None |
| **Integrations** | **Top Grouping** (Connections / API Keys / Webhooks / Sync) | ✅ **Compliant** | None — already the target shape |
| **Settings** | **Persistent side sub-nav** over ~18 pages | ⚠️ **Exception by volume** | **Re-chunk** into ≤ 7 top groups (below); side list survives only *inside* a group |
| **Admin Nav Tree** (`/admin`) | Secondary tree rail (flag-gated) | ✅ **Sanctioned exception** (Art. IV.1/3) | Keep **opt-in**; must **consolidate** not stack (§7) |

### Settings — recommended re-chunking (top grouping)

18 flat side items → **5 top groups**, each revealing a small list/grid:

```
Settings
[ Organization | Commerce | Field Ops | Governance | System ]
 ── Organization → Branches · Staff · UoM · Tax Reg · Territory …
 ── Governance   → Roles & Permissions · Users · Features · Audit …
```

This removes the long flat rail, keeps each group ≤ ~6 items, and gives Settings the same shape as every other module. *(Reorganization only — no logic/permission/RLS change; deferred until approved.)*

**Headline:** 6 of 8 Admin surfaces are **already compliant** with the proposed standard. The standard largely *ratifies* the Workbench pattern and fixes one outlier (Settings).

---

## 6. Evaluation — future modules

Each is mapped to the standard so it is built right the first time.

| Module | L1 entry | L2 (Top Grouping unless noted) | Exceptions | Focus Mode |
|---|---|---|---|---|
| **CRM** | CRM | Pipeline · Leads · Accounts · Contacts · Opportunities · Activities | Each group → Master List + record facets | — |
| **Warehouse** | Warehouse | Inventory · Receiving · Transfers · Counts · Bins | Inventory = Master List | Guided Count → Focus |
| **Accounting** | Accounting | Transactions · Records · Reports · Periods · Setup | **Chart of Accounts = tree (Secondary Rail)** | — |
| **HR** | HR | People · Org · Attendance · Leave · Payroll | **Org Chart = tree** | — |
| **Pharmacy** | Pharmacy | Dispense · Inventory/Batches · Prescriptions · Offline | Batches = Master List | **POS/Dispense = Focus** |
| **POS** | POS | (cart → payment steps only) | — | **Always Focus Mode** (no L1) |
| **AI Center** | AI Center | Insights · Assistants · Automations · Settings | — | — |
| **Integrations** | Integrations | Connections · API Keys · Webhooks · Sync | — | — |

**Every future module resolves to Top Grouping by default**, with the two tree modules (Accounting CoA, HR Org) and POS Focus Mode as the only principled deviations — each pre-justified by Articles IV/V rather than invented per-screen.

---

## 7. Does the Navigation Tree change this recommendation?

**No — and the relationship must be stated explicitly, because they pull in opposite directions.**

- The **Standard** removes vertical layers (rail → top grouping).
- The **Navigation Tree** *adds* a vertical layer (a cross-entity tree rail).

They reconcile under Article IV/VI:

1. **The Tree is an exception, not the default.** It qualifies (tree + cross-entity launcher), so it is *allowed* — but it is **not** the in-module navigation pattern any module should copy. Modules still default to Top Grouping.
2. **The Tree must consolidate, never stack.** In today's **Model B** the tree is a *standalone launcher* — clicking a node leaves `/admin` for the workbench, so no two rails coexist. ✅ Compliant. If/when it becomes the **embedded Model A shell**, the tree must **replace** each workbench's Master List (becoming the single L2), not sit *beside* it. A tree **plus** a list **plus** facets would violate Article II.
3. **The Tree stays opt-in / role-scoped.** It is a power surface for platform-owners/admins who traverse many entities — flag-gated, not imposed on every user as permanent chrome.

So the Navigation Tree is fully consistent with the Constitution **provided** it remains (a) opt-in and (b) consolidating. This is the governing rule for the later "embedded `/admin` shell" evaluation.

---

## 8. Migration impact assessment

| Area | Impact | Effort | Risk |
|---|---|---|---|
| Companies / Users / Roles / Branches / Features | None — already compliant | — | None |
| Integrations | None — already top grouping | — | None |
| **Settings re-chunk** to 5 top groups | Reorg of links only | **S–M** | Low (no logic change) |
| **Shared `ModulePage` primitive** (renders L1 slot + Top Grouping + content; bans a 2nd rail by construction) | New layout component reusing existing `EntityTabs` as the grouping control | **M** | Low (additive) |
| **Responsive rules** baked into the primitive | Tablet icon-rail + mobile chips/bottom-bar handled once | **M** | Low |
| Future modules (CRM…AI Center) | Build *on* the primitive from day one | n/a | Prevents debt |
| Navigation Tree (Model A, later) | Must consolidate the list when embedded | **M** | Med — governed by §7 |

**The cheapest, highest-leverage move is governance, not rework:** promote the existing `EntityTabs` into a platform **`TopGroupingNav`** primitive and wrap modules in a **`ModulePage`** shell that *structurally cannot* render a second persistent rail (no API for it). New modules then inherit the standard automatically — satisfying the goal that *"any new module automatically follows the approved navigation standard."* No business logic, permissions, RLS, or workflows are touched by any of this.

---

## 9. Recommendation

1. **Adopt** this Standard as the VANTORA Navigation Constitution (Articles I–V + responsive rules).
2. **Ratify** the 6 compliant Admin surfaces; **schedule** only the Settings re-chunk.
3. **Build** the `ModulePage` + `TopGroupingNav` primitives (reusing `EntityTabs`) so compliance is the path of least resistance.
4. **Bind** all future modules (CRM, Warehouse, Accounting, HR, Pharmacy, POS, AI Center, Integrations) to the per-module mappings in §6.
5. **Govern** the Navigation Tree by §7 — opt-in, consolidating — when the embedded shell is evaluated.

*No code in this phase. On approval, the first concrete step is the `ModulePage`/`TopGroupingNav` primitive (additive, reuse-only), followed by the Settings re-chunk.*
