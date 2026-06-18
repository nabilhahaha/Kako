# Admin Center Alignment — Design Package

### Bringing the platform layer to the standard (plan before execution)

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Design & plan only — *no implementation, no new features.*

Applies the P3 container decision rule (AdminWorkbench for entity collections; ModulePage for hubs/dashboards) and the shared admin primitives to the `/platform/*` surfaces. Constraints: no business-logic, permission, RLS, or workflow change; reuse existing managers/actions/data first.

---

## 1. Admin Center architecture review

Verified inventory of every `/platform/*` page, its current container, and the right target per the P3 rule:

| Surface | Shape | Current | Target (P3) | Gap |
|---|---|---|---|---|
| **Companies** | entity collection | **AdminWorkbench** + Company360 | AdminWorkbench | ✅ none (reference) |
| **Plans** | entity collection (plans) | bespoke `PlansManager` (full-page list+form) | **AdminWorkbench** | list+detail+actions |
| **Roles (global)** | entity collection (role templates) | bespoke `RolesManager` | **AdminWorkbench** | list+detail (mirror settings/authz) |
| **Staff (platform)** | entity collection (employees) | bespoke `StaffManager` | **AdminWorkbench** | list+detail+actions |
| **Entitlements** | entity collection (companies→entitlement) | bespoke drill-down | **AdminWorkbench** (or ModulePage table) | formalize list+detail |
| **Billing** | two record sets (subs/invoices) | bespoke tables | **ModulePage + TopGroupingNav** (Subscriptions · Invoices) | shell + tabs |
| **Audit** | forensic log (filter+paginate) | bespoke `AuditLog` | **ModulePage** (filtered table) | shell only |
| **Activity** | day-grouped feed | bespoke `ActivityFeed` | **ModulePage** | shell only |
| **Analytics** | dashboard (KPIs/charts) | bespoke + `StatCard` | **ModulePage** | shell only |
| **Copilot Analytics** | dashboard | bespoke + `StatCard` | **ModulePage** | shell only |
| **Drugs** | reference import/list | bespoke `DrugImporter` | **ModulePage** | shell only |
| **Overview** (`/platform`) | dashboard | bespoke | **ModulePage** | shell only |

**Primitive adoption today:** `AdminWorkbench` 1/12 · `EntityActionBar` 0 · `ActivityFeed` (right-panel) 0 · `ModulePage` 0 on the platform layer. The library exists and is proven in Settings; the platform layer just hasn't adopted it.

**Two list patterns** (to reconcile): Settings workbenches use client-side `EntityListPanel` (≤200 rows); platform pages use server-side pagination+filter. Target: one model — extend `EntityListPanel` with an **optional server-search hook** (already "windowing-ready") so both share it.

---

## 2. Before / After (container map)

This workstream changes **page containers**, not the rail. The provider nav section (Overview · Tenants · Catalog · Billing · Team & Access · Reference) is unchanged.

```
BEFORE (containers)                         AFTER (containers)
 Companies      AdminWorkbench  ✅            Companies      AdminWorkbench
 Plans          bespoke manager              Plans          AdminWorkbench  (+EntityActionBar +ActivityFeed)
 Roles          bespoke manager              Roles          AdminWorkbench
 Staff          bespoke manager              Staff          AdminWorkbench
 Entitlements   bespoke drill                Entitlements   AdminWorkbench (or ModulePage table)
 Billing        bespoke tables               Billing        ModulePage [tabs: Subscriptions · Invoices]
 Audit          bespoke log                  Audit          ModulePage (filtered table)
 Activity       bespoke feed                 Activity       ModulePage
 Analytics      bespoke dashboard            Analytics      ModulePage (+StatCards)
 Copilot Anal.  bespoke dashboard            Copilot Anal.  ModulePage (+StatCards)
 Drugs          bespoke import               Drugs          ModulePage
 Overview       bespoke dashboard            Overview       ModulePage
```

Result: **every platform surface uses a shared container**; entity pages get the 3-panel workbench + consistent actions/audit; dashboards/logs get the consistent `ModulePage` shell.

---

## 3. Reuse percentage

| Element | Reused | New |
|---|---|---|
| Server actions / data loaders (Plans/Roles/Staff/Billing/…)| ✅ 100% | — |
| Manager **logic** (forms, mutations, filters) | ✅ 100% | — |
| Dashboard/chart/feed/log components (Analytics, Activity, Audit, Copilot, Drugs, Overview) | ✅ ~100% (re-parented into ModulePage) | thin shell |
| Primitives (`AdminWorkbench`, `EntityListPanel`, `EntityActionBar`, `ContextPanel`, `ActivityFeed`, `ModulePage`, `TopGroupingNav`) | ✅ existing | — |
| **New code** | — | ModulePage wrappers; workbench composition (split each manager's list vs detail); `EntityListPanel` server-search hook |

- **ModulePage standardization (7 pages):** ~**95%** reuse (presentational wrapper; content unchanged).
- **Workbench migration (Plans/Roles/Staff/Entitlements):** ~**80–85%** reuse (all actions/data/logic reused; the list/detail layout is recomposed from the existing manager's pieces).
- **Blended Admin Center reuse: ~88–90%.** Zero business-logic / permission / RLS / workflow change.

---

## 4. UX consistency findings (what alignment fixes)

| # | Finding | Fixed by |
|---|---|---|
| 1 | Platform entity pages are bespoke full-page list+form (no list/detail, no shared header) | AC-2 workbench migration |
| 2 | No `EntityActionBar` on platform — each page rolls custom action buttons | AC-2 (reuse existing actions) |
| 3 | No right-panel `ActivityFeed`/audit on platform entity detail | AC-2 |
| 4 | Two list/pagination models (client ≤200 vs server) | AC-3 (EntityListPanel server-search hook) |
| 5 | No consistent page shell (titles/spacing/nav slot vary) | AC-1 ModulePage standardization |
| 6 | Container rule undocumented in code → drift | already fixed (P3 `README.md`); enforced by adoption |
| 7 | Billing renders two side-by-side tables (no grouping) | AC-4 ModulePage + tabs |

No functional gaps are introduced or removed — purely presentation/consistency.

---

## 5. Implementation plan (phased, each validated, reuse-first)

> Sequenced cheapest-and-safest first; every step is its own commit with tsc · suite · build, like M3.

### AC-1 — ModulePage shell standardization *(low risk, presentational)*
Wrap the **dashboard/log** pages in `ModulePage` (consistent title/subtitle/actions + optional nav slot), content components reused verbatim: **Overview, Analytics, Activity, Copilot Analytics, Audit, Drugs**. No behaviour change.

### AC-2 — Entity workbench migration *(one page per commit)*
Migrate the **entity-collection** pages to `AdminWorkbench`, reusing each manager's existing actions/data and recomposing into list + detail (+ `EntityActionBar` for existing actions, + `ActivityFeed` right panel):
1. **Plans** (`PlansManager` → workbench)
2. **Roles** (`RolesManager` → workbench; mirrors the settings/authz pattern)
3. **Staff** (`StaffManager` → workbench)
4. **Entitlements** (formalize list+detail)
Each preserves the exact platform gates (`platformOwnerOnly` / `platformPerm`) unchanged.

### AC-3 — Unify the list model
Extend `EntityListPanel` with an **optional server-search/pagination hook** (additive, default = current client behaviour), then adopt it on the largest platform lists so Settings + Platform share one list primitive.

### AC-4 — Billing & reference finalize
**Billing** → `ModulePage` + `TopGroupingNav` (Subscriptions · Invoices tabs, reusing the existing tables). **Drugs/Entitlements/Audit** final shell pass.

### Sequence & effort
| Phase | Scope | Effort | Risk |
|---|---|---|---|
| AC-1 | 6 dashboard/log shells | S | Low |
| AC-2 | 4 entity → workbench | M (per page) | Med |
| AC-3 | EntityListPanel hook | M | Low–Med |
| AC-4 | Billing tabs + finalize | S–M | Low |

**Recommended start:** AC-1 (immediate consistency, near-zero risk), then AC-2 page-by-page (Plans → Roles → Staff → Entitlements), then AC-3, then AC-4. Each phase shippable and reversible.

---

## 6. Validation & guardrails (per phase)
- tsc · full suite (incl. the platform-governance invariants in `navigation-routes.test.ts`: provider items stay vendor-scoped; no `/platform/*` leak to tenants) · build.
- Platform gates (`platformOwnerOnly` / `platformPerm`) asserted unchanged — same approach as the M1/M3 gate proofs.
- No route changes (no redirects needed; containers swap in place).

**No implementation until this plan is approved.** On approval I'll start with **AC-1**.
