# VANTORA Admin UX Standardization — Design System & Architecture

A unified administration design system applied to **all** admin screens — Roles & Permissions is **not** a special case. One three-panel **Admin Workbench** pattern, one component set, consistent behavior, tablet-friendly, future-proof. **UX architecture only — no implementation.**

---

## 1. Admin Design System

### The pattern: a three-panel **Admin Workbench**
Every admin module renders the same shell — `AdminWorkbench` — parameterized per entity. The selected item is always on screen; configuration happens in the center; context lives on the right.

```
┌───────────────┬───────────────────────────────┬──────────────────┐
│ LEFT          │ CENTER                         │ RIGHT            │
│ Entity list   │ Selected entity                │ Context          │
│ • Search      │ • Header (name, status, actions)│ • Summary       │
│ • Filters     │ • Tabs (Details / Config / …)  │ • Activity       │
│ • Quick create│ • Forms / configuration         │ • Audit          │
│ • Grouping    │ • Section cards (no long pages) │ • Shortcuts      │
│               │                                 │ • Related objects│
└───────────────┴───────────────────────────────┴──────────────────┘
   ~280px            fluid (max ~860px)              ~320px
```

### Principles
1. **Selected item always visible** — list (left) + detail (center) coexist; no navigate-away-and-back.
2. **No long vertical pages** — center content is **tabbed + section-carded**; each tab is one screenful, scannable.
3. **Faster navigation** — keyboard (↑/↓ list, ⌘K jump, `/` search), URL-addressable selection (`?id=`), no full reloads.
4. **Consistent experience** — identical chrome, spacing, controls, and interaction grammar across every module.
5. **Tablet friendly** — three panels collapse responsively (below); large touch targets; right panel becomes a drawer.
6. **Future-proof** — new admin modules (incl. UAO, Role Overrides, Workspace Designer, Approval Matrix, Integrations) are just a config of the same workbench.

### Interaction grammar (uniform)
- **Select** in left → center loads that entity; right loads its context.
- **Quick create** (left, top) → inline create row / modal → new entity selected.
- **Save** is per-section (autosave-on-blur or explicit Save in the section card) — never one giant page submit.
- **Destructive / outward actions** confirm; every mutation is **audited** and surfaced in the right panel's Audit tab.
- **Empty / disabled / loading** states are standardized (skeleton list + center placeholder).

---

## 2. Screen inventory (all migrate to the workbench)

| Module | Route (today) | Left = list of | Center tabs | Right context |
|--------|---------------|----------------|-------------|---------------|
| **Users** | `/settings/users`, `/settings/staff` | users | Profile · Roles & Branches · Access Overrides · Activity | Summary · Audit · Sessions · Related (branches, role) |
| **Roles & Permissions** | `/settings/authz`, `/permissions`, `/role-overrides` | roles | Permissions matrix · Role Overrides · Data scope · Members | Summary · Audit · Related (members, capabilities) |
| **Companies** | `/platform/companies` | companies | Profile · Plan & Entitlements · Branches · Settings | Summary · Activity · Audit · Related (users, plan) |
| **Branches** | `/settings/branches`, `/settings/regions` | branches | Details · Hierarchy · Members · Config | Summary · Audit · Related (region, staff) |
| **Plans & Units** | `/platform/plans`, `/settings/uom`, `/settings/outlet-grades` | plans / units | Definition · Entitlements · Limits | Summary · Usage · Audit |
| **Features & Applications** | `/settings/features`, `/settings/entitlements` | features | Toggle · Templates · Per-company | Summary · Dependencies · Audit |
| **Integrations** | `/settings/integrations`, `/integration-hub`, `…/api-keys`/`connections`/`webhooks`/`sync` | connections | Config · Webhooks · Sync · Logs | Health · Last run · Audit · Related (keys) |
| **Reference Data** | `/settings/numbering`, `/tax-registrations`, `/customer-data`, `/product-structure`, `/organization-structure`, `/msl`, `/surveys` | records | Definition · Mappings | Summary · Usage · Audit |
| **System Settings** | `/settings`, `/settings/finance`, `/day-close`, `/go-live`, `/returns`, `/action-policies`, `/approval-matrix`, `/numbering` | setting groups | Form sections | Audit · Related |
| **Future** | UAO `/access-overrides`, Role Overrides `/role-overrides`, Workspace Designer, Approval Matrix, Integrations | per entity | per module | Summary · Audit · Diff |

The current standalone long-form pages (e.g. `authz`, `features`, `access-overrides`, `role-overrides`) become **tabs/configs within the workbench**, not separate scroll pages.

---

## 3. Unified layout rules

- **Grid:** `grid-cols-[280px_1fr_320px]` on desktop; center `max-w-[860px]` centered with comfortable gutters.
- **Left panel:** sticky; search at top, filter chips below, grouped/virtualized list, quick-create affordance pinned top-right. Selected row highlighted; keyboard navigable.
- **Center panel:** sticky header (entity name + status badge + primary actions overflow), a **tab bar**, then **section cards** (`≤ ~6` fields each) — never a single long form. Each card owns its save.
- **Right panel:** sticky; ordered **Summary → Activity → Audit → Shortcuts → Related**. Collapsible sections; deep-links into Audit Log and related entities.
- **Density:** one spacing scale (`p-3/4`, `gap-2/3`), one control height (≈40px), token-driven colors; RTL-aware (ar/en) throughout.
- **Responsive / tablet:**
  - ≥1280px: all three panels.
  - 768–1279px (tablet): left + center; **right panel becomes a drawer** (info button in the header).
  - <768px: single column — left list → tap → center; right via drawer; back affordance.
- **URL:** selection is query-addressable (`/settings/users?id=…&tab=roles`) so admin views are shareable/bookmarkable and survive refresh.
- **No long vertical pages** is a hard rule: if a center tab exceeds one comfortable screen, split into more tabs or section cards.

---

## 4. Reusable components

A small admin component library (`src/components/admin/`), composed by every module:

| Component | Responsibility |
|-----------|----------------|
| `AdminWorkbench` | The 3-panel shell + responsive behavior + URL/selection state. Props: `list`, `detail`, `context` render-slots. |
| `EntityListPanel` | Search + filter chips + grouping + virtualized rows + quick-create + keyboard nav. |
| `EntityHeader` | Name, status badge, primary/secondary actions, breadcrumb. |
| `EntityTabs` | Tab bar wired to the URL (`?tab=`). |
| `SectionCard` | A titled card with optional per-card Save / inline edit. |
| `ContextPanel` | Right-panel container with ordered, collapsible sections. |
| `ActivityFeed` / `AuditList` | Reuse `erp_audit_logs`; per-entity filtered feed + "View in Audit Log". |
| `RelatedObjects` | Linked-entity chips that deep-link to other workbenches. |
| `QuickCreate` | Inline/modaled create with validation. |
| `EffectivePermissionsDiff` | Reused from UAO/Role Overrides for authz modules. |
| `TriStateOverrideRow`, `ReasonModal`, `LockedRow` | Reused from the overrides consoles. |
| `EmptyState` / `WorkbenchSkeleton` | Standard empty/loading. |

Everything is token-driven and reuses existing primitives (`Card`, `Button`, `Badge`, `Input`, `Select`, `Tooltip`) — no new design language, no new color system.

---

## 5. Mockups

### 5.1 Users
```
┌ Users ─────────────┬ Sara Ali  ·  [Active] ▾  [Edit][⋯] ──┬ CONTEXT ───────────┐
│ 🔍 search          │ ┌ Profile │ Roles & Branches │ Access │ Summary           │
│ [Active][Admins]   │ │ Overrides │ Activity ┐              │ • Salesman · Cairo │
│ ● Sara Ali  Salesm │ │                                     │ • Last seen 2h     │
│ ○ Omar N.   Superv │ │ SECTION: Identity                   │ Audit             │
│ ○ Ahmed K.  Salesm │ │  Name [Sara Ali]  Email […]         │ • role changed…   │
│ ○ …                │ │ SECTION: Status                     │ Shortcuts         │
│ [+ New user]       │ │  Active ◉   Branch [Cairo ▾]        │ • Reset password  │
│                    │ └                                     │ Related: Cairo, … │
└────────────────────┴───────────────────────────────────────┴────────────────────┘
```
*(The "Access Overrides" tab embeds the existing UAO editor for that user.)*

### 5.2 Roles & Permissions
```
┌ Roles ─────────────┬ Salesman  ·  [System] ──┬ CONTEXT ──────────────┐
│ 🔍 search          │ Permissions │ Role Overrides │ Data scope │ Members │
│ ● Salesman         │                                  │ Summary: 18 perms   │
│ ○ Cashier          │ SECTION: Capability matrix       │ 12 members          │
│ ○ Supervisor       │  [✓] sales.sell  [✓] customer…   │ Audit: cap enabled… │
│ ○ Pharmacist       │ SECTION: Role Overrides (grouped) │ Related: members,   │
│ [+ New role]       │  Requests ▸ customer.request (Grant)│   capabilities     │
└────────────────────┴───────────────────────────────────┴──────────────────────┘
```
*(Role Overrides tab = the R3 console; Permissions tab = the capability matrix — same workbench.)*

### 5.3 Companies
```
┌ Companies ─────────┬ Nile FMCG (DEMO) · [Active] ┬ CONTEXT ──────────────┐
│ 🔍 search          │ Profile │ Plan & Entitlements │ Summary: Pro plan   │
│ [DEMO][Active]     │ │ Branches │ Settings          │ 5 branches · 42 users│
│ ● Nile FMCG (DEMO) │ │                              │ Activity: login peak │
│ ○ City Care Pharm  │ │ SECTION: Profile             │ Audit: entitlement…  │
│ ○ Body for trading │ │  Name […] Tax# […] Currency  │ Shortcuts: View-as   │
│ [+ New company]    │ │ SECTION: Plan  [Pro ▾]       │ Related: plan, users │
└────────────────────┴───────────────────────────────┴───────────────────────┘
```

### 5.4 Branches
```
┌ Branches ──────────┬ Cairo Main · [Active] ┬ CONTEXT ────────────┐
│ 🔍 search          │ Details │ Hierarchy │ Members │ Config         │
│ [Region: Cairo ▾]  │                          │ Summary: 14 staff   │
│ ● Cairo Main       │ SECTION: Details         │ Region: Greater Cairo│
│ ○ Giza Depot       │  Code [CAI] Name […]     │ Audit: moved region… │
│ ○ Alex Hub         │ SECTION: Hierarchy       │ Related: region,     │
│ [+ New branch]     │  Region [Cairo ▾] …      │   warehouse, staff   │
└────────────────────┴──────────────────────────┴──────────────────────┘
```

---

## 6. Future-proofing (named modules)

| Module | Fit into the workbench |
|--------|------------------------|
| **User Access Overrides** | A **tab** on the Users workbench (per-user) + standalone entry; reuses `TriStateOverrideRow`, `ReasonModal`, `EffectivePermissionsDiff`. |
| **Role Overrides** | A **tab** on the Roles workbench (per-role); same components; 4-column diff in the right/center. |
| **Workspace Designer** | Left = workspaces/layouts; center = canvas tabs (sections, visibility); right = preview + audit. |
| **Approval Matrix** | Left = matrices/dimensions; center = rules grid; right = affected roles + audit. |
| **Integrations** | Left = connections; center = Config/Webhooks/Sync/Logs tabs; right = Health/Last-run/Audit. |

Each is a configuration of `AdminWorkbench` — no bespoke layout, no new engine.

---

## 7. Rollout (design → build, later)

1. **Build the `AdminWorkbench` shell + component library** (one reference module — Users — as the proving ground).
2. **Migrate authz modules** (Roles, UAO, Role Overrides) onto the workbench — they already share components.
3. **Migrate the rest** (Companies, Branches, Plans, Features, Integrations, Reference Data, System Settings) module-by-module behind the same shell.
4. Keep each migration behaviorally identical (no logic change) — pure UX standardization; audit/RLS/permissions untouched.

Estimated shell + library: ~1 sprint; per-module migration: S each (mostly re-slotting existing forms).

---

*UX architecture & design system only — no implementation. Reuses existing UI primitives, audit, and permissions; introduces no new design language or backend.*
