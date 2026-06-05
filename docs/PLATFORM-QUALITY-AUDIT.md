# Full-Platform Quality Audit

Date: 2026-06. Scope: entire platform (RLS, guards, navigation, modules, plans,
permissions, roles, audit logging, architecture). Method: 3 parallel code audits
(page guards · server-action guards · dead routes/orphans) + direct DB/RLS audit.

## Method & coverage
- **RLS**: all 129 `erp_*` tables checked — RLS enabled + ≥1 policy on every one;
  every `company_id` table has a company-scoped read policy; no permissive reads
  on tenant tables except intentional global reference catalogs.
- **Page guards**: every `(app)/**` page mapped to its guard (module / permission /
  auth / RLS).
- **Server actions**: ~69 `'use server'` files mapped for guard + company scope +
  audit coverage.
- **Architecture**: nav ↔ routes ↔ modules ↔ permissions ↔ packs cross-checked.

## Findings & dispositions

### 🔴 Security — FIXED
1. **Cross-tenant leak: `erp_supplier_payments`** — sole policy was
   `FOR ALL USING (auth.uid() IS NOT NULL)`, exposing every company's supplier
   payments (read + write) to any authenticated user. Table was empty (no data
   leaked). **Fixed** in migration **0151**: scoped via `supplier_id →
   erp_suppliers.company_id` (or platform owner). Verified policy in place.

### 🟠 Governance / defense-in-depth — FIXED
2. **`settings/organization/actions.ts`** (departments/teams/job-titles/employee
   assignment) — used a weak inline `role==='admin'` check and **no audit
   logging**. Not a live cross-tenant vuln (RLS on these tables already enforces
   `erp_is_company_admin(company_id)` and `erp_user_branches` writes are
   branch-scoped), but inconsistent + unaudited. **Fixed**: shared `guard()`
   (requireAuth + `settings.users` permission) + `logAudit` on all 7 mutations,
   incl. employee assignment (reporting-line changes).
3. **Unaudited destructive actions** — `deletePriceRule` (revenue-affecting) and
   `deleteEntityNote`. **Fixed**: both now `logAudit`.

### 🟢 Verified safe (no change needed)
- **IDOR on `customerActivity(customerId)`** — relies on RLS; `erp_customers` is
  company-scoped (`erp_is_platform_owner() OR company_id = erp_user_company_id()`),
  so an out-of-scope id returns nothing. Defense-in-depth note only.
- **Dynamic `[id]` routes** (customers/suppliers/orders/patients/…): all rely on
  company-scoped RLS — no IDOR.
- **Global reference tables** readable by any authenticated user
  (`erp_plans`, `erp_plan_modules`, `erp_roles`, `erp_role_permissions`,
  `erp_business_type_modules/roles`, `erp_clinic_reference`) — intended; no
  tenant data.
- **Platform pages**: every `/platform/**` page has an owner/permission guard at
  the top (layout is intentionally guard-free).

### 📋 Architecture debt — DOCUMENTED (not changed; needs product decision or is high-risk)
- **`integrations` module is orphaned from nav** — licensable (`ALL_MODULES`) but
  no nav section/item gates on it (surfaced via `integrations.manage` permission
  in Settings). Now **guarded by a pinned test** (`architecture-integrity.test.ts`)
  so no *new* module can be silently orphaned.
- **`pos` plan gap** — `pos` is plan-gateable but in no plan → effectively always
  off for tenants. Product decision needed.
- **Naming**: `accounting` module is `finance` in the licensing catalog (bridged
  by `coreModuleDbKey`); `market` module is labeled "Supermarket"; `field_ops` vs
  `distribution` boundary is blurry. Rename is high-risk across seeds/guards/tests
  — documented, not renamed.
- **Abstract packs** `retail` / `electrical` have no DB module (permission-gated).
- **Duplicate module-filter logic** in `visibleSections` vs `resolveBottomNavTabs`
  — candidate for a shared helper (low-risk refactor, deferred).
- **Bottom-nav has no vendor scoping** — a platform user on mobile would see
  tenant tabs (they use desktop; not a security issue). Deferred.
- **Code↔DB role divergence** (`ROLE_PERMISSIONS` admin/manager = ALL vs DB 35/29)
  — runtime uses DB; harmless (documented in AUTHORIZATION.md §7).

## Tests added (regression / architecture / navigation integrity)
- `architecture-integrity.test.ts` (5): no dead permissions in nav · no unknown
  module gates · module & permission label completeness · **orphan-module guard**
  (pinned allowlist `{integrations}`).
- (earlier) `navigation-routes.test.ts` (3): no dead nav links · provider items
  vendor-scoped · no `/platform/*` leak to non-privileged tenants.

## Migrations
- **0151** `erp_supplier_payments` RLS scope fix (reversible; rollback in file).

## Roadmap execution (post-audit)
- **#1 Global Roles & Permissions UI** — ✅ `/platform/roles` (migration 0152: owner write access to the role catalog). Create/rename/clone/delete, grouped permission editor, danger flags, role compare. `role-admin.ts` (+8 tests).
- **#2 View As Company** — ✅ `/platform/companies/[id]/view-as`: read-only per-role tenant experience preview (no impersonation / no RLS change). Audited.
- **#3 Tenant Audit Viewer** — ✅ `/settings/audit-log` (migration 0153: company-admin read of own audit log). Closes the tenant self-audit gap.
- **#4 Integrations Module UI** — ✅ **done (approved)**. Backfill-then-gate: migration 0154 enables the `integrations` company-module for all non-clothing companies + adds it to non-clothing business-type templates; the 6 Integrations settings nav items are now gated by `module: 'integrations'`. The effective gate stays company ∩ plan, so free-plan companies correctly don't see it. The orphan-module guard allowlist is now **empty** — every licensable module has a nav surface. Migration 0155 also normalized the clothing template to fashion-only (correct-by-construction) and re-tightened drifted clothing companies.
- **#5 Architecture cleanup** — ✅ Extracted the duplicated module-gate logic (`visibleSections` + `resolveBottomNavTabs`) into one shared, tested `isModuleGateOpen(modules, gate)` in `navigation.ts`. Behavior-preserving (all nav/bottom-nav tests green) + 4 new unit tests.

## Residual risk register
| Risk | Severity | Status |
|------|----------|--------|
| `erp_supplier_payments` cross-tenant | High | ✅ Fixed (0151) |
| Org actions unaudited / weak guard | Medium | ✅ Fixed |
| `integrations` orphan module | Low | Documented + test-guarded |
| `pos` plan gap | Low | Documented (product decision) |
| Naming debt (finance/market/field_ops) | Low | Documented |
| Bottom-nav vendor scoping | Low | Documented |
