# Enterprise UX / Navigation / Grouping — Review (design, before pilot)

> **Decisions approved (all recommended). UX-1 built; UX-2…UX-5 phased.**
> UX-1 groups the flat 17-item Settings section into the five approved labeled
> subsections (Organization / Data & Fields / Integrations / Governance / Personal),
> ordered most-used first, via an additive `group` on nav items + sidebar
> subsection headers. No routes/permissions changed.

> A pilot-readiness UX
> pass over navigation, grouping, forms, pages, workflow, and mobile, plus the
> **Manual Import Mapping Wizard**. Grounded in the current code. Each
> recommendation is additive/non-breaking and phased; nothing is built until you
> pick from §11.

---

## 1. Method & principle
Reviewed the live nav tree (`navigation.ts`), the app shell (`layout/sidebar`,
`topbar`), the management-screen form pattern, and the existing import engine.
Guiding principle for the pilot: **fewer decisions per screen, logical grouping,
mobile-first, reuse what exists.** No data-model changes — this is presentation.

## 2. Current state (grounded)
- **Navigation:** ~17 sections (3 cross-functional: Sales/Inventory/Accounting +
  Purchasing; ~10 vertical packs: Clinic/Restaurant/Salon/…; Provider; Main).
  Gated by `module` + `perm` (already clean). **Settings = a flat 17-item list.**
- **Shell:** desktop sticky left sidebar (`lg:`); **mobile = a single FAB → full
  drawer** (no bottom-nav, no per-screen quick actions).
- **Forms:** every manager uses the same **flat** `grid sm:grid-cols-2
  lg:grid-cols-3` of fields with a **locally-redefined `Field`** component — **no
  section grouping**, no shared `FormSection`. The S3-expanded **customer** form
  now has ~16 fields in one flat grid (Identity + contact + commercial + segment/
  class/channel + region/area + GPS) — the clearest grouping opportunity.
- **Tables:** horizontal-scroll tables on mobile (`min-w-[…]`), no card fallback.
- **Import:** a real **6-step wizard** already exists (entity → upload → mapping →
  validate → import → done), with **CSV/JSON** parsed client-side, **XLSX**
  server-side, required-field/email/number/date validation, a 50-row preview,
  insert/update/upsert modes, `erp_import_jobs` tracking, **and saved
  per-company mapping templates** (`erp_import_mappings`, 0082: save/clone/share/
  default). It currently **auto-guesses** the mapping (then allows manual edits).

## 3. Navigation structure + menu grouping + module organization
**Findings:** the module gating is good; the pain is **Settings overload** and a
long flat module list with no super-grouping.
**Proposed (non-breaking):**
- **Group Settings into labeled subsections** (headers within the section, no route
  changes): **Organization** (Branches, Users, Staff, Permissions, Regions,
  Organization) · **Data & Fields** (Customer Data, Custom Fields, Pricing?*) ·
  **Integrations** (Integrations, Data Import, Data Export) · **Governance**
  (Workflows, Audit Log, E-Invoice) · **Personal** (My Account, Design System).
- **Sidebar super-groups:** collapse the vertical packs under their active one
  (a tenant only sees its own pack today via module gating, so this is minor);
  keep cross-functional **Sales / Inventory / Purchasing / Accounting** always
  visible. Optional: a "Pinned / Frequent" group at top.
- *Decision: keep **Pricing** under Sales (current) vs also surface under Settings
  → Data.

## 4. Field grouping + field ordering
**Findings:** flat grids; order is insertion order, not task order.
**Proposed:** introduce a shared **`FormSection`** (titled group) and **group +
order** fields by task. Reference grouping for the **customer** form:
1. **Identity** — code, name, name_ar, status
2. **Contact** — phone, email, contact_person, contact_phone, address, city,
   national_address
3. **Commercial** — credit_limit, payment_terms_days, tax_number (VAT), cr_number,
   price tier
4. **Classification** (pilot-simple) — segment, classification, channel
5. **Hierarchy / assignment** — branch, region, area, route, sales rep, visit day
6. **Location** — latitude, longitude
Apply the same "group by task, required first" rule to suppliers/products/invoice.

## 5. Form layouts
- Ship a reusable **`FormSection` + `FieldGroup`** (replacing the per-file `Field`)
  so every form gets consistent spacing, section titles, required markers, and
  error placement.
- **Required-first** ordering; primary action bottom-left (RTL-aware); destructive
  actions separated.
- Long forms → **collapsible advanced sections** (mirrors the pilot "show advanced"
  pattern already in Pricing).

## 6. Page layouts
- Standardize three templates: **List** (toolbar + filters + responsive table),
  **Detail** (header + summary cards + tabs), **Form** (sectioned). Most screens
  already use `PageHeader` + `Card`; formalize the three so new screens are
  consistent and pilot demos look uniform.

## 7. Workflow simplification
- **Sensible defaults** (single branch auto-selected; today's date; default price
  list/template) to cut clicks.
- **Inline create** of obvious dependencies (e.g., add a customer mid-invoice).
- Reduce empty-state friction: every list's empty state offers the primary CTA.
- Collapse rarely-used actions into an overflow menu to de-clutter rows.

## 8. Mobile usability
- Add a **bottom tab bar** (Home · Customers · Sell · Inventory · More) for the
  field/cashier roles, alongside the existing drawer for full nav.
- **Responsive tables → card list** under `sm:` (the customer/invoice/rules tables
  currently horizontal-scroll; cards read better on phones).
- Larger touch targets (≥44px), sticky form action bar, and verify **RTL** on every
  new component (the app is RTL-first).

## 9. Manual Import Mapping Wizard
**Key finding: this is ~90% already built.** The existing wizard already does
**upload → read headers → column mapping → required-field validation → preview →
execute → save template per company**. Mapping templates persist per company
(`erp_import_mappings`: save/clone/share/default). So this is mostly a **fit +
manual-first polish**, not a new build.

| Your requirement | Status today | Proposed |
|---|---|---|
| Upload Excel/CSV | ✅ CSV/JSON + XLSX | keep |
| Read file headers | ✅ parsed to `{headers, rows}` | keep |
| **Manual column mapping** | ✅ manual dropdowns (**+ auto-guess**) | **Manual-first:** make auto-guess **optional** (off by default per "no auto-mapping"), start every field unmapped, user maps explicitly |
| Required-field validation | ✅ blocks on missing required | surface a clear "N required fields unmapped" gate before preview |
| Import preview | ✅ 50-row dry-run + issue badges | keep |
| Import execution | ✅ insert/update/upsert + job log | default the pilot to **upsert on the entity's unique key** |
| **Save mapping template per company** | ✅ `erp_import_mappings` (save/share/default) | keep; surface "Save this mapping" prominently at the end |

**Recommended UX-Import changes (small):** (a) a **manual-first toggle**
(auto-guess off by default), (b) a prominent **unmapped-required** indicator, (c)
one-click **Save as template** at the end, (d) a short "different ERP? map your
columns once, reuse next time" helper. No schema change (the table exists).

## 10. Proposed phasing (each its own reviewed slice → build → verify → PR)
- **UX-1 — Navigation & Settings grouping** (subsection headers; low risk, high
  clarity).
- **UX-2 — Shared `FormSection` + customer field grouping/ordering** (then roll to
  suppliers/products).
- **UX-3 — Mobile: responsive tables→cards + bottom tab bar + touch targets.**
- **UX-4 — Import manual-first polish** (toggle + required gate + save-template
  prominence).
- **UX-5 — Page-layout templates + workflow defaults** (inline create, empty-state
  CTAs).

## 11. Decisions to confirm
1. **Scope/order** — confirm the UX-1…UX-5 phasing and which to build first
   (recommend **UX-1 → UX-4 → UX-2** for fastest pilot value).
2. **Settings grouping** — approve the 5 subsections in §3 (Organization / Data &
   Fields / Integrations / Governance / Personal)?
3. **Customer field groups** — approve the §4 six-group ordering as the template?
4. **Shared `FormSection`** — build the shared component and migrate forms
   incrementally (recommended) vs leave per-file `Field`?
5. **Mobile** — add a **bottom tab bar** for field/cashier roles + card tables
   under `sm:`? Confirm the 5 bottom-tab destinations.
6. **Import manual-first** — make auto-guess **off by default** (fields start
   unmapped) per "no auto-mapping," keeping it as an optional convenience? Confirm.
7. **No data-model changes** — confirm this review stays presentation-only (the
   import mapping-template table already exists; nothing new required).

## 12. Additional review lenses (owner) — make it feel simple, keep enterprise depth
These cut across the phases; the principle is **progressive disclosure** (simple by
default, advanced on demand — the pattern already used in Pricing's "show advanced").
- **Navigation simplicity** — UX-1 subsections (done) + collapse non-active vertical
  packs; a top **"Frequent"** group of the 4–6 most-used links per role.
- **Action-based menus** — lead each screen with its primary **verb** (New Invoice,
  Add Customer, Import) as a prominent button; demote secondary actions into an
  overflow (⋯) menu so rows/toolbars aren't crowded (UX-5).
- **Page-clutter reduction** — move rarely-used fields/actions behind
  collapsible "Advanced" sections (UX-2 FormSection supports this); tables show the
  few decision columns, details on the row's open/expand.
- **Most-used actions first** — order nav items and toolbar actions by real
  frequency for the role (rep: Sell/Customers/Visits first; admin: Setup first).
- **Pilot-user friendliness** — empty states that teach + offer the primary CTA;
  sensible defaults (branch/date/template); short inline hints; the import
  "map once, reuse" helper (UX-4).

## 13. Status
- **UX-1 (Settings/nav grouping)** — ✅ built: `group` on nav items + sidebar
  subsection headers + `nav.groups.*` (ar/en).
- **UX-4 (Import manual-first)** — ✅ built: the import wizard no longer
  auto-guesses on upload — **fields start unmapped** and require explicit mapping;
  a saved **default template** still pre-fills ("map once, reuse"); an opt-in
  **Auto-map** button + a manual hint remain; a **required-unmapped gate** blocks
  advancing to preview with a clear count. No schema change (templates already in
  `erp_import_mappings`).
- **UX-2 (FormSection + customer field grouping)** — ✅ built: shared
  `components/shared/form-section.tsx`; the customer form is now six labeled
  sections (Identity / Contact / Commercial / Classification / Hierarchy /
  Location) instead of one flat 24-field grid. Same field names → server action
  unchanged. Reusable for suppliers/products next.
- **UX-3 (Mobile)** — ✅ built: a role-aware **bottom tab bar** (Home · Customers ·
  Sell · Inventory · More) replaces the lone FAB; "More" opens the full drawer via
  a shared store; content gets bottom clearance. The **customers list** renders as
  **cards under `sm:`** (no horizontal scroll) with larger touch targets. RTL-safe.
- **UX-5 (Page templates + workflow defaults)** — ✅ built: list **empty states**
  standardized on the shared `EmptyState` with a **primary-action CTA** (customers
  → "New Customer", invoices → "New Invoice") so an empty list starts the main task
  in one tap; the **mobile card-list** treatment rolled to **invoices** (consistent
  with customers). With UX-2's `FormSection` (form template), the **card-list**
  (mobile list template), and `EmptyState` (empty template), the three page
  templates are now shared. Existing workflow defaults reaffirmed: single-branch
  auto-select on create, price auto-resolve on line entry (P-b), import manual-first
  default (UX-4). **The pilot UX package (UX-1…UX-5) is complete.**

### Page-template conventions (for new screens)
- **List:** `PageHeader` + action-based toolbar (primary "New …" verb first) +
  filters + responsive table that becomes a **card list under `sm:`** +
  `EmptyState` (with the primary CTA) when empty.
- **Form:** `FormSection` groups (required-first; advanced behind a toggle).
- **Detail:** header + summary cards + tabs (as in Pricing).
- **Defaults:** pre-select the only branch; resolve prices; manual-first import;
  every empty state offers its next step.

*(UX-1 is built and verified. The next slice — recommended **UX-4 (import
manual-first)** then **UX-2 (FormSection + customer field grouping)** — proceeds on
approval through design → build → tsc/test/build → mobile + RTL check → PR. The
Import Wizard work is mostly polish since the engine + per-company templates already
exist.)*
