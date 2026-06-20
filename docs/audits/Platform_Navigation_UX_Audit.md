# Platform-Wide Navigation & UX Consistency Audit

### Continuing the single-source methodology beyond Settings

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Findings & recommendations — *no implementation.*

Applies the audit methodology proven on Settings (single source of truth, canonical taxonomy, VP1–VP4 vocabulary, gate-identity) to the rest of the platform. Four parts: **(A) navigation duplication beyond Settings, (B) Admin Center consistency, (C) platform-wide taxonomy, (D) CRM architecture.** Constraints maintained: no business-logic, permission, RLS, or workflow change. Priority: **architecture & UX consistency before new features.**

---

## Part A — Navigation duplication (beyond Settings)

### A1. Shared label keys pointing at *different* routes (true echoes)
Grep of `navigation.ts` — one i18n label key reused for two distinct destinations:

| Label key | Route 1 | Route 2 |
|---|---|---|
| `nav.items.dailySummary` | `/field/van-sales/summary` | `/distribution/daily-summary` |
| `nav.items.expiryNear` | `/inventory/expiry` | `/pharmacy/expiry` |
| `nav.items.appointments` | `/clinic/appointments` | `/salon/appointments` |
| `nav.items.services` | `/clinic/services` | `/salon/services` |

Two of these (`dailySummary`, `expiryNear`) **can co-appear for one tenant** (inventory + pharmacy; van-sales + distribution) — a genuine VP3 violation (same word, two places). The clinic/salon pairs are vertical-exclusive (lower risk) but still share a key. **Fix = distinct labels (label-only, M2-style, safe).**

### A2. Same label *and* same route, two entries
`nav.items.auditLog → /platform/audit` appears twice (provider section for platform staff; settings section for tenant super-admins). Same destination, same label, two audiences. Acceptable by audience, but worth a comment so it isn't "fixed" into a single gate by mistake.

### A3. Cross-module concept scatter (no single home)
A concept recurs across many sections with near-identical labels:

| Concept | Surfaces (examples) |
|---|---|
| **Reports / Summary** | `/reports` · `/sales/report` · `/distribution/report` · `/accounting/reports` · `/pharmacy/reports` · `/clinic/reports` · `/fashion/reports` · several `*summary` |
| **Approvals** | `/approvals/queue` (unified) · `/field/van-sales/approvals` (returns) · `/field/van-sales/day-close-approvals` · settings `approval-matrix` (config) |
| **Returns** | `/sales/returns` · `/field/van-sales/my-returns` · `/purchases/returns` · `/pharmacy/returns` · `/distribution/returns-analysis` |
| **Customers** | `/customers` · `/wholesale/customers` · `/fashion/customers` · clinic `patients` |
| **Dashboard** | generic `/dashboard` + 7 vertical `*Dashboard` items |

Most are contextually gated (a tenant sees only its vertical), so this is **not** a per-user duplication like Settings was — but it *is* a vocabulary-consistency issue (VP1 operational-vs-config for Approvals/Returns; consistent "Reports" naming). **Fix = naming convention + per-section "Reports" sub-grouping, not consolidation.**

### A4. Over-stuffed sections (need "rise to top grouping")
Item counts per module section:

| Section | Items | Verdict |
|---|---|---|
| **sales** | 28 | ❌ Far over the ≤7 guideline — top-group |
| **distribution** | 24 | ❌ Top-group |
| **main** | 14 | ⚠️ Trim / group |
| **pharmacy** | 13 | ⚠️ Borderline |
| inventory | 10 | ⚠️ |
| (others) | ≤9 | ✅ |

These are flat vertical lists in the rail — exactly the "one rail, then rise" target. Recommended top groups (design only): **Sales** → *Selling · Field/Van Sales · Customers · Reports*; **Distribution** → *Execution · Coverage & MSL · Perfect Store · Trade Spend · Reports*.

---

## Part B — Admin Center consistency

Inventory (read-verified): the shared admin library (`src/components/admin/`, 11 components — AdminWorkbench, EntityListPanel, EntityHeader/EntityTabs, EntityActionBar, TopGroupingNav, ContextPanel, ModulePage, SettingsGroupNav, SectionCard, ActivityFeed, audit-feed-actions) is **heavily used in Settings workbenches but almost absent on the Platform layer.**

| Primitive | Platform (`/platform/*`) | Settings workbenches |
|---|---|---|
| AdminWorkbench | **1 / 9** (Companies only) | 4 / 5 |
| EntityListPanel / EntityHeader / EntityTabs | 0 | 4–5 |
| EntityActionBar | 0 | 3 |
| ActivityFeed (right-panel audit) | 0 | 4 |
| TopGroupingNav | 0 | 4 |

### Findings
- **B1. Platform entity surfaces are bespoke.** `/platform/plans`, `/roles`, `/staff`, `/billing` are custom managers (their own list/filter/actions) instead of the 3-panel workbench. `Companies` is the lone exception (full workbench + Company360).
- **B2. Two list patterns.** Settings `EntityListPanel` is client-side (≤200 rows); platform pages do server-side pagination+filter. Inconsistent capacity and UX.
- **B3. Undocumented dual container.** `Features` intentionally uses `ModulePage` (hub/grid), the others use `AdminWorkbench` (list+detail). The *rule* for which to use isn't written down.
- **B4. Audit/action surfaces diverge.** `EntityActionBar` and `ActivityFeed` exist but aren't used on the platform layer.

### Recommendations (consistency, not rewrite)
- **B-R1. Write the container decision rule** (cheapest, highest leverage): *AdminWorkbench* for an **entity collection** (list + detail + facets: Companies/Plans/Roles/Staff/Users); *ModulePage + StatCards* for a **dashboard/hub** (Analytics/Activity/Copilot/Overview/Features). This legitimizes the bespoke dashboards and targets only the *entity* pages for alignment.
- **B-R2. Sequence the entity-page alignments** (plans/roles/staff → AdminWorkbench), each a separate UX-standardization task reusing existing managers/actions — no logic change. Defer; not now.
- **B-R3. Unify list capacity** by adding the (already "windowing-ready") server-search hook to `EntityListPanel` so settings + platform share one list model.

---

## Part C — Platform-wide taxonomy

The Settings canonical-taxonomy method generalizes to the whole rail:
- **C1. Apply VP1–VP4 platform-wide.** Operational ≠ configuration everywhere (Approvals queue vs Approval Matrix; Returns vs Return Policy — already fixed in Settings); a group is never named for a page; no label repeats in a path; one catalog per area.
- **C2. Top-group the over-stuffed sections** (Part A4) using the same `TopGroupingNav` primitive already shipped.
- **C3. The rail's vertical/capability mix is fine.** Hotel/Clinic/Salon/Pharmacy/Fashion/etc. are contextually gated (a tenant sees only its pack), so they are *not* duplication — leave as is.
- **C4. Reports taxonomy.** "Reports" is the most-scattered concept; recommend a consistent per-module *Reports* sub-group (not a global merge — the reports are module-specific), with one naming pattern ("<Module> Reports").

---

## Part D — CRM architecture review

### Current state (read-verified)
- **There is no CRM section.** `crm` is a *licensable module gate* only; its surfaces live inside **Sales** (`/customers`, `/customers/transfer`, both gated `module: ['crm','sales']`).
- **CRM concepts are scattered across five sections:**

| Concept | Path | Surfaced under |
|---|---|---|
| Customers (list/detail/360/statement) | `/customers*` | Sales |
| Customer master data (segment/class/channel) | `/settings/customer-data` | Settings → Products & Data |
| Customer requests (new/update/GPS/credit) | `/field/van-sales/customer-requests` | Field/Van Sales |
| Customer onboarding | `/settings/onboarding` | Settings → Integrations |
| Visit outcomes | `/distribution/visit-outcomes` | Distribution |
| Credit requests | `/distribution/credit-requests` | Distribution |
| Surveys | `/settings/surveys` (+ `/field/survey/[id]`) | Settings / Field |
| Loyalty | `/pharmacy/loyalty` | Pharmacy (module-locked) |

- **`/customers` is bespoke** (`CustomersManager`), not the AdminWorkbench pattern.
- **`/customers/layout.tsx` gates on `sales` only, not `crm`** — a latent gating inconsistency (a CRM-only tenant wouldn't see Customers). *Flagged, not changed (gate change is out of scope).*
- **Sales-funnel objects do not exist:** no Leads, Opportunities/Pipeline, Accounts, or Activities pages (the `/contacts` dir is empty). The 360 timeline is **financial-only** (invoices/payments), not interactions/requests/surveys.

### Recommendations — *consistency first, features later* (honoring the stated priority)
- **D-R1 (architecture/UX, reuse-only): a CRM umbrella that surfaces what already exists.** Introduce a coherent CRM grouping (a section or top-grouping) that *links* the already-built pages — Customers · Customer Requests · Credit Requests · Visit Outcomes · Surveys · Onboarding · Transfer — under one roof. **Pure navigation reorganization; reuses existing pages; no new features, no logic/permission/RLS/workflow change.** This is the single highest-value CRM move and fits "consistency before features."
- **D-R2 (UX-standardization, sequence): migrate `/customers` to the AdminWorkbench pattern** (list + Customer360 facets), reusing existing actions/data — consistency with the other entity surfaces. Defer as its own task.
- **D-R3 (gating note):** reconcile `customers/layout` gate (`sales` vs `crm`) when permission changes are back in scope — *not now.*
- **D-R4 (FUTURE, design-first — explicitly NOT now): the CRM sales funnel.** Leads, Opportunities/Pipeline, Accounts, unified Activity timeline are **new features** → out of scope under "architecture before features." Note: the data layer already has activity-like primitives (`erp_customer_requests`, `erp_visit_outcomes`, surveys, credit requests) a future unified timeline could consolidate. Treat as a separate, later, design-first workstream.

---

## Prioritized roadmap (no implementation; for your selection)

| # | Item | Type | Risk | Constraint posture |
|---|------|------|------|--------------------|
| **P1** | De-duplicate the 4 shared label keys (A1) | Label-only (M2-style) | Low | No gate/route change |
| **P2** | CRM umbrella surfacing existing pages (D-R1) | Nav reorg, reuse pages | Low | No new features/logic |
| **P3** | Write the Admin Center container decision rule (B-R1) + add to the Navigation Constitution | Doc/governance | None | — |
| **P4** | Top-group Sales & Distribution (A4/C2) | Nav (TopGroupingNav) | Low–Med | Reuse items; no logic change |
| **P5** | Align platform entity pages + `/customers` to AdminWorkbench (B-R2, D-R2); unify list pagination (B-R3) | UX-standardization build | Med | Reuse actions; sequence individually |
| **P6** | CRM sales-funnel (Leads/Opportunities/Pipeline/Activities) (D-R4) | **New feature — design-first** | — | Deferred, separate workstream |

**Suggested order:** P1 + P3 first (safe, immediate), then P2 (CRM umbrella) and P4 (top-grouping) as reuse-only nav reorganizations, then P5 as sequenced UX-standardization tasks. P6 stays a future design-first workstream — consistent with *architecture & UX consistency before new features.*

M3 Settings page-merges remain deferred and independent of the above.
