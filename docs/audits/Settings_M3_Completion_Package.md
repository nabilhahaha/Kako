# Settings M3 — Completion Package & M3-D Permission Validation Report

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18
**Commits:** M3-A `5a66ae2` · M3-B `855fc87` · M3-C `ef629b6` · M3-D `ebb3ade`

All approved M3 merges shipped one-at-a-time with validation between each. Reuse-only: every manager unchanged; no business-logic, RLS, or workflow change; permissions preserved (M3-D detailed below); all old routes redirect (deep links preserved).

---

## 1. Before / After (capture points)

Authenticated screenshots can't be captured from the sandbox; these are the exact shots to take on the live preview (`ebb3ade`). Toggle EN/AR for RTL.

| Page | Before | After |
|------|--------|-------|
| **Workflows** `/settings/workflows` | 3 separate nav items (Approval Matrix · Workflows · Templates) | One page, tabs **Approvals · Builder · Templates** |
| **Custom Fields** `/settings/custom-fields` | 3 items (Custom Fields · Field Governance · Customer Data) | One page, tabs **Fields · Governance · Customer Data** |
| **Data Exchange** `/settings/import` | 2 items (Import · Export) | One page, tabs **Import · Export** (nav entry "Data Exchange") |
| **Roles & Permissions** `/settings/authz` | 3 items (Roles · Permissions · Action Policies) | One page, tabs **Roles · Permissions\* · Action Policies** (\* super-admin only) |

Deep-link checks (each old URL redirects, gate re-checked):
`/settings/approval-matrix→?tab=approvals` · `/settings/workflows/templates→?tab=templates` · `/settings/field-governance→?tab=governance(&entity=…)` · `/settings/customer-data→?tab=customer-data` · `/settings/export→?tab=export` · `/settings/permissions→?tab=permissions` · `/settings/action-policies→?tab=action-policies`.

---

## 2. Updated navigation map (Settings)

```
SETTINGS  (single rail link → in-page Top Grouping)
 ├ Organization        Branches · Reporting Lines · Org Structure · Regions
 ├ Finance & Compliance Tax & Currency · Tax Registrations · Document Numbering · E-Invoicing
 ├ People & Roles      Users · Staff · ★Roles & Permissions[Roles·Permissions*·Action Policies] · Audit Log
 ├ Products & Data     Product Structure · Units of Measure ·
 │                     ★Custom Fields[Fields·Governance·Customer Data] · MSL · Surveys ·
 │                     Outlet Grading · Features · Marketplace
 ├ Automation & Policies ★Workflows[Approvals·Builder·Templates] · Return Policy · Day-Close Policy
 ├ Integrations        Integration Hub · Connections · Onboarding · Go-Live ·
 │                     Data Onboarding · ★Data Exchange[Import·Export] · Van Sales
 └ Personal            (Copilot Analytics · Design System · My Account)   [M4 deferred]
```
★ = consolidated tabbed page (M3). Net: **7 settings nav entries removed**, folded into **4 tabbed pages**; the page-level "Approvals → Routes" stutter is gone.

---

## 3. Validation results

| Merge | tsc | Suite | Build | Routes |
|------|-----|-------|-------|--------|
| M3-A Workflows | ✅ | ✅ 1592 | ✅ | merged 15.1kB + 2 stubs |
| M3-B Custom Fields | ✅ | ✅ 1592 | ✅ | merged 13.9kB + 2 stubs |
| M3-C Data Exchange | ✅ | ✅ 1592 | ✅ | merged 13.4kB + 1 stub |
| M3-D Roles & Permissions | ✅ | ✅ **1596** (+4 perm test) | ✅ | merged 10.6kB + 2 stubs |

Route-coverage test (no dead nav links) green throughout; redirect stubs confirmed present in the build manifest.

---

## 4. M3-D — dedicated permission validation report

| Surface | Gate BEFORE | Gate AFTER | Verdict |
|---------|-------------|------------|---------|
| Page (authz) | Company-Admin OR Platform-Owner | **same** | ✅ unchanged |
| **Roles** tab (RolesWorkbench) | admin (authz page) | **same** | ✅ unchanged |
| **Action Policies** tab | admin (action-policies page: `isAdmin` else redirect) | **same** admin | ✅ unchanged |
| **Permissions** tab — view | nav: super-admin-only; *standalone page: ungated view* | **super-admin only** (tab listed + rendered only when `isSuperAdmin`; non-super `?tab=permissions` → Roles) | ⚠ tightened — see note |
| **Permissions** — edit (`setRolePermission`) | `requireSuperAdmin` server guard | **same** (unchanged) | ✅ unchanged |

**Evidence:**
- View gate: `const showPerms = ctx.isSuperAdmin === true` controls both the tab list (`...(showPerms ? […] : [])`) and the active-tab resolution (`sp.tab === 'permissions' && showPerms`).
- Write gate: `src/app/(app)/settings/permissions/actions.ts` still calls `requireSuperAdmin()` in each mutating action (verified).
- Locked by `src/lib/erp/m3d-roles-permissions.test.ts` (4 invariants, passing): super-admin tab gate · super-admin write guard · admin gate on Roles/Action-Policies · nav consolidation.

**⚠ The one behavioural delta (for your explicit sign-off):**
The **old standalone `/settings/permissions` page had no view gate** — any logged-in user who navigated directly to that URL saw the global permission matrix **read-only** (the nav only ever exposed it to super-admins). After M3-D, that route redirects into the admin-gated authz page where the Permissions tab is super-admin-only. **Effect:** a non-admin who *direct-URL'd* `/settings/permissions` no longer sees the read-only matrix. This is a **tightening** (more restrictive), intentional and aligned with the long-standing `superAdminOnly` nav intent (and removes a minor read-only info exposure). It is **not** a loosening and affects no one's *edit* rights. If you would prefer to preserve the old read-only-for-anyone view, say so and I'll render the Permissions tab read-only for admins while keeping edit super-admin-only.

**Conclusion:** No access was loosened anywhere. The only change is a deliberate, documented *tightening* of read-only view on a previously ungated route — flagged here for your sign-off as requested.

---

## 5. Remaining UX inconsistencies (post-M3)

| # | Inconsistency | Track |
|---|---|---|
| 1 | Platform entity pages bespoke (Plans/Roles/Staff/Billing not AdminWorkbench) | **Admin Center Alignment** |
| 2 | Two list patterns — client `EntityListPanel` vs server pagination | Admin Center Alignment |
| 3 | `/customers` is bespoke, not the workbench | **P5** |
| 4 | Customer 360 timeline financial-only | **CRM Evolution** (features) |
| 5 | EntityActionBar / ActivityFeed absent on platform layer | Admin Center Alignment |
| 6 | Integration Hub / Onboarding / Go-Live still separate (M3-E/F intentionally deferred — dashboards per P3) | optional later |
| 7 | No consistent "Reports" naming across modules | naming convention (later) |
| 8 | Personal items still inside Settings (M4) | M4 (deferred) |
| 9 | `/customers` layout gates `sales` not `crm` (latent) | reconcile w/ P5 |

The Settings page-level stutter (previously #5) is now **resolved** by M3.

---

## 6. Recommended next workstream

Per "consistency before features" and largest-gap-first, my recommendation among your three options:

1. **Admin Center Alignment** ← recommended next. Biggest remaining consistency gap (inconsistencies #1, #2, #5); raises the whole platform layer to the standard using the P3 container rule + existing primitives (reuse-only).
2. **P5 Customer Workbench** — do after #1 so `/customers` can reuse the same aligned primitives.
3. **CRM Evolution** — last (new features; design-first), per the standing priority.

**Settings M3-E/F** remain deferred (Integrations already tabbed; Onboarding/Go-Live dashboards stay). **M4** (Personal relocation) also deferred.

Awaiting your pick of the next workstream.
