# Settings M3 — Final Design Package

### Page consolidation (facet-pages → tabbed pages) — design for approval

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18 · **Status:** Design only — *no implementation until approved.*

Grounded in a full read of all 18 candidate pages. Principles honoured: reuse-first, consolidation over proliferation, reuse existing engines, and **preserve all permissions, flags, routes (via redirects), RLS, and workflows**.

---

## 0. Key grounding facts (from the page inventory)

- **Two tab shells already exist and are reused as-is:** `/settings/authz` (`RolesWorkbench`, 7 `EntityTabs`) and `/settings/integrations` (`IntegrationsWorkbench`, tabs Connections·API Keys·Webhooks·Sync).
- **`/settings/integration-hub` and `/settings/onboarding` are dashboards/cockpits** that *link out* — entry points, **not** merge targets (per the container rule P3: ModulePage hubs stay).
- **⚠ One gate nuance:** in Group 1, `/settings/authz` + `/settings/action-policies` are **company-admin**-gated, but `/settings/permissions` is **super-admin**-gated. Merging is fine **only if** the Permissions tab keeps its stricter super-admin gate (render + server guard unchanged). This is the single security-sensitive point and is called out in the risk table.
- Every other group shares one gate, so tabs don't change access.

---

## 1. Before / After navigation map (Settings Top Grouping)

```
GROUP: Automation & Policies
  BEFORE: Approval Matrix · Workflows · Workflow Templates · Return Policy · Day-Close Policy
  AFTER:  Workflows [tabs: Approvals · Builder · Templates] · Return Policy · Day-Close Policy

GROUP: Products & Data
  BEFORE: … · Custom Fields · Field Governance · Customer Data · …
  AFTER:  … · Custom Fields [tabs: Definitions · Governance · Customer Data] · …

GROUP: Integrations
  BEFORE: Integration Hub · Connections · Onboarding · Go-Live · Data Onboarding · Import · Export · Van Sales
  AFTER:  Integration Hub (dashboard) · Connections (already tabbed) · Data Exchange [tabs: Import · Export] ·
          Onboarding (cockpit) · Go-Live · Van Sales      [Data Onboarding folds into Integration Hub]

GROUP: People & Roles
  BEFORE: Users · Staff · Roles · Permissions · Action Policies · Audit Log
  AFTER:  Users · Staff · Roles & Permissions [tabs: Roles · Permissions* · Action Policies] · Audit Log
          (* Permissions tab stays super-admin-only)
```

Net: **9 settings entries → 3** in those groups; the page-level "Approvals → Routes" stutter disappears.

---

## 2. Page merge plan

| Merge | New page (route kept) | Tabs (reused components, verbatim) | Gate | New code |
|------|----------------------|-------------------------------------|------|----------|
| **M3-A Workflows** ⭐ | `/settings/workflows` | Approvals (`ApprovalMatrixManager`) · Builder (`WorkflowBuilder`) · Templates (`TemplatesClient`) | `workflow.manage` (shared) | tab shell only |
| **M3-B Custom Fields** | `/settings/custom-fields` | Definitions (`CustomFieldsManager`) · Governance (`FieldGovernanceManager`) · Customer Data (`CustomerDataManager`) | `settings.custom_fields` (shared) | tab shell only |
| **M3-C Data Exchange** | `/settings/import` → relabel **Data Exchange** | Import (`ImportWizard`) · Export (`ExportPanel`) | `integrations.manage` (shared) | tab shell only |
| **M3-D Roles & Permissions** | `/settings/authz` (already tabbed) | + Action Policies (`ActionPoliciesManager`, admin) · + Permissions (`PermissionsMatrix`, **super-admin tab**) | admin; Permissions tab super-admin | add 2 tabs to existing shell + conditional render |
| **M3-E Integrations (light)** | `/settings/integrations` (already tabbed) | optional: fold `data-onboarding` card into Integration Hub | `integrations.manage` | minimal |
| **M3-F Onboarding** | *no merge* | keep `onboarding` cockpit + `go-live` checklist as siblings (different journeys) | — | none |

**Recommended scope:** ship **A, B, C** first (clean, shared-gate, highest stutter-removal), then **D** (with the super-admin tab nuance), and treat **E/F** as already-consolidated (dashboards stay per P3).

The tab shell is the existing `EntityTabs`/`TopGroupingNav` primitive — **no new framework**. Each tab renders its existing manager **unchanged**; each manager keeps its own server action(s), data loader(s), perms, and RLS.

---

## 3. Redirect strategy (preserve every bookmark)

Each retired sibling route becomes a **thin server redirect** to the merged page with the tab pre-selected (URL-addressable tab state, like the existing workbenches):

| Old route | →  Redirect to |
|-----------|----------------|
| `/settings/approval-matrix` | `/settings/workflows?tab=approvals` |
| `/settings/workflows/templates` | `/settings/workflows?tab=templates` |
| `/settings/field-governance` | `/settings/custom-fields?tab=governance` |
| `/settings/customer-data` | `/settings/custom-fields?tab=customer-data` |
| `/settings/export` | `/settings/import?tab=export` |
| `/settings/permissions` | `/settings/authz?tab=permissions` |
| `/settings/action-policies` | `/settings/authz?tab=action-policies` |
| `/settings/data-onboarding` | `/settings/integration-hub` |

- Implemented with Next.js `redirect()` in each old `page.tsx` (server component) — **permanent, gate-free passthrough** (the destination re-checks the gate). No `next.config` rewrites needed.
- `navigation.ts` settings catalog drops the merged siblings, keeping ONE entry per merged page (the canonical taxonomy already groups them). The command palette continues to index the merged page.
- Tab state read from `?tab=` (defaulting to the first tab) so external deep links land correctly.

---

## 4. Reuse percentage

| Element | Reused verbatim | New |
|--------|------------------|-----|
| Manager components (10: WorkflowBuilder, ApprovalMatrixManager, TemplatesClient, CustomFieldsManager, FieldGovernanceManager, CustomerDataManager, ImportWizard, ExportPanel, ActionPoliciesManager, PermissionsMatrix) | ✅ 100% | — |
| Server actions / data loaders / RLS | ✅ 100% | — |
| Tab primitive (`EntityTabs`/`TopGroupingNav`) | ✅ existing | — |
| Per-merge **tab shell** | — | ~30–50 lines each |
| **Redirect stubs** (8 routes) | — | ~3 lines each |
| nav.ts + i18n tab labels | — | small |

**Estimated reuse: ~90–95%** of touched surface is existing components/logic; new code is thin tab shells + redirect stubs + label keys. **Zero** business-logic, action, RLS, or workflow rewrite.

---

## 5. User impact

| Aspect | Impact |
|--------|--------|
| Functionality | **Unchanged** — every manager works exactly as today |
| Navigation | **Fewer entries** (9→3 in affected groups); related screens are now tabs, not separate nav items — removes the "Approvals → Routes" stutter |
| Bookmarks / deep links | **Preserved** via redirects to `?tab=` |
| Clicks | Same or fewer (siblings one tab-click away vs. back-to-nav) |
| Permissions | **Identical** — shared-gate groups unchanged; Permissions stays super-admin |
| Muscle memory | Minor: direct old URLs now redirect (transparent) |
| Mobile | Tabs scroll (TopGroupingNav already responsive) |

Net: a cleaner, shallower Settings with **no capability loss**.

---

## 6. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Permissions tab gate (super-admin) leaks under admin** | **High (security)** | Render the Permissions tab only when `isSuperAdmin`; keep `PermissionsMatrix`/`setRolePermission` super-admin server guard unchanged. Verify with a permission test. |
| Broken bookmark on a retired route | Med | `redirect()` stub for **every** old route incl. deep `/workflows/templates`; covered by the route-coverage test |
| `/settings/workflows/templates` is a child route of `/settings/workflows` | Med | Convert the child route to a redirect stub; the parent reads `?tab=templates` |
| Initial-load weight if one page loads all tabs' data | Low–Med | Reuse the **integrations-workbench pattern**: client tab switching, each manager fetches its own data on demand |
| i18n parity for new tab labels | Low | ar/en added together; key-usage + parity tests gate it |
| Tab state lost on refresh | Low | URL-addressable `?tab=` (existing `useWorkbenchSelection` pattern) |
| Validation regressions | Low | tsc · full suite (incl. navigation route-coverage + gating) · build, per shipped cadence |

**Overall risk: Low–Medium**, concentrated almost entirely in the single super-admin Permissions-tab gate (M3-D). Shipping A/B/C first (no gate nuance) de-risks the rollout; D follows with the explicit guard.

---

## 7. Recommended execution (on approval)

1. **M3-A Workflows** (highest value — kills the original stutter), **M3-B Custom Fields**, **M3-C Data Exchange** — clean shared-gate merges, each its own commit with redirects + validation.
2. **M3-D Roles & Permissions** — add Action Policies + (super-admin) Permissions tabs to the existing `authz` shell; extra permission test.
3. **M3-E/F** — minimal/none: Integrations is already tabbed; Onboarding/Go-Live dashboards stay (P3).

Each merge is independently shippable and reversible (delete the shell, restore the sibling page — but redirects make that unnecessary).

**No implementation until this package is approved.**
