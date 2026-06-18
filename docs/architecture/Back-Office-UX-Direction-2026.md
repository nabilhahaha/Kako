# Back Office UX Direction — Standard (binding)

**Status: APPROVED standard. All upcoming Back Office screens (onboarding builders,
settings, admin actions) MUST follow this.** Extends the frozen Core UX principle to the
entire admin area: **simple, elegant, fast, business-friendly — never technical, crowded,
or database-driven.** A non-technical Company Admin manages the company comfortably without
developer support.

## 1. Dashboard
- **Cards, not tables** — clear summary cards + primary actions; surface only what matters.
- **Simple navigation** — a short, sectioned menu (see §3); no deep technical trees.
- **Fast access** — top quick actions (see §4) reachable in one tap.
- **Mobile-first, excellent on desktop** — the same layout scales up gracefully.
- Tables appear **only when truly needed** (lists), always with search + pagination.

## 2. Company setup
Wizard-driven · visual builders · guided forms · **autosave + resume** (powered by
`erp_onboarding_state`) · clear progress rail · **zero technical terms**. (Detailed in the
Onboarding Wizard UX package.)

## 3. Settings information architecture (business sections)
Replace any flat/technical settings list with these business sections (each a card on a
Settings home):

| Section | Contains (reuses existing screens) |
|---|---|
| **Company** | Basics, logo, **Finance: Tax/VAT/Currency**, **Document Numbering** |
| **Users & Roles** | Users, invites, roles & permissions (plain-language) |
| **Organization Structure** | Visual org chart, levels, branches/teams, reporting |
| **Products & Units** | Product structure, units/UoM, import |
| **Routes & Territories** | Routes, territories, journey plans |
| **Workflows & Approvals** | Workflow/operating templates, approval matrix |
| **Finance & Numbering** | Tax/VAT/currency, document numbering (also linked from Company) |
| **Integrations** | Connections, API keys, webhooks, sync |
| **Modules & Features** | Enable/disable modules & features |

Each section opens to **cards** (not a wall of toggles); advanced items sit under a
collapsible "Advanced".

## 4. Fast admin actions (global quick actions)
A persistent **+ Quick action** menu (and dashboard shortcuts):
Add user · Add branch · Add product · Import data · Create route · Edit role · Open
approvals · Go-live checklist. Each opens a focused form/bottom sheet, not a full page.

## 5. Visual, not technical
- **Drag & drop** where natural (org chart, product tree, reordering).
- **Cards** over dense tables; lists use rows with clear primary/secondary text + an action.
- **Bottom sheets** on mobile for editors (one-handed); side panels on desktop.
- **Search everywhere** (users, products, branches, settings).
- **Empty states with examples** ("Add your first branch — e.g., Cairo Branch").
- **Plain-language labels** everywhere (see §7).

## 6. Performance standard (must feel fast)
- **Never load huge tables by default** — paginate/lazy-load; default to a small page.
- **Search + filters + pagination** on every list; server-side where large.
- **Skeleton loaders** on first paint; optimistic UI for quick edits.
- **Responsive forms** — instant validation, no spinner-blocking on keystrokes.
- **Avoid full-page reloads** — use in-place updates / RSC + client transitions.
- Budget: first meaningful paint fast on mobile; list views render < ~1s with skeletons.

## 7. Business-friendly language (label standard)
**Use** (questions/plain phrases):
- "Who can see what?" · "Who approves this?" · "How are products packed?" ·
  "Where does this user work?" · "What modules does this company use?" · "Who reports to
  whom?" · "Next document number".

**Never show** (technical jargon — engine layer only):
- RLS · policy · table/column names · `node_id` · `reports_to` · permission **key** ·
  function name · SQL · `company_id` · migration.

Mapping (what the engine calls it → what the admin sees):
| Engine | Admin label |
|---|---|
| RLS / scoping | "Who can see what" |
| `reports_to` | "Who reports to whom" (org chart) |
| permission keys | capability groups with descriptions + on/off |
| `erp_sequences` | "Document numbering" |
| `erp_org_levels/nodes` | "Organization levels" + the chart |
| `erp_product_levels/nodes` | "Product structure" |
| UoM `factor`/`is_case` | "1 carton = N units" |
| modules/entitlements | "Modules & features" |

## 8. Component & interaction standards (design system)
- `SectionCard`, `QuickActions`, `ListRow` (search/paginate), `HierarchyTree` (drag),
  `NodeEditor`/bottom sheet, `PersonPicker`, `CapabilityGroup`, `GuidedForm`,
  `VisibilityPreview` ("X will see…"), `SkeletonList`, `EmptyState`, `UndoToast`,
  `ProgressRail`, `GoLiveChecklist`.
- **Accessibility**: keyboard nav, screen-reader labels, contrast, drag alternatives.
- **i18n / RTL**: Arabic + English, mirrored, localized examples.

## Acceptance (applies to every Back Office screen)
- No technical/database terminology visible anywhere.
- Lists are searchable + paginated; nothing loads "everything" by default.
- Primary actions reachable in ≤ 2 taps; editors are forms/bottom sheets, not raw tables.
- Skeletons on load; no unnecessary full-page reloads.
- Works one-handed on mobile and looks excellent on desktop.
- A non-technical admin can complete the task **without docs or developer help**.

## Application to the current build
- **Phase 1 (onboarding state)** — backend/persistence only; **no admin-visible jargon**
  introduced; it powers the wizard's autosave/resume + progress per this standard.
- **Phases 2–5 (Org builder · Product builder · Numbering · Tax/Currency)** — every screen
  built to this standard: visual builders, guided forms, cards, search, skeletons,
  plain-language labels, mobile-first.

**This document is the Back Office UX standard. Approved. Binding on all upcoming screens.**
