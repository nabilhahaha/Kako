# VANTORA — Repository Audit & Platform Maps

Final audit after the Platform Governance + Scalability program and the PR split.
Companion to `AUTHORIZATION.md`, `PLATFORM-PLANS-MODULES.md`,
`PLATFORM-QUALITY-AUDIT.md`, and `SCALABILITY-REVIEW.md`.

**Branch topology (post-split)**
- `claude/fashion-store-pack` → PR #121 → `main` — Fashion Store Industry Pack (clothing vertical).
- `claude/platform-governance` → PR #122 → `claude/fashion-store-pack` — governance, authorization, module architecture, scalability. Stacked so each PR is independently reviewable; all history preserved.

---

## 1. Current platform architecture map

```
                         ┌─────────────────────────────────────────────┐
                         │  Next.js App Router (RSC + Server Actions)    │
                         │  src/app/(app)/**  ·  src/components  ·  i18n │
                         └───────────────┬─────────────────────────────┘
        request                          │ getUserContext() / getPlatformContext()
        (memoized via React cache)        │  → resolves identity, company, modules, perms
                         ┌───────────────▼─────────────────────────────┐
                         │  Authorization layer (src/lib/erp)            │
                         │  guards.ts · permissions.ts · capabilities.ts │
                         │  navigation.ts (visibleSections / gates)      │
                         │  home.ts · plan-admin · role-admin            │
                         └───────────────┬─────────────────────────────┘
                                         │ Supabase JS (user JWT)
                         ┌───────────────▼─────────────────────────────┐
                         │  Postgres + RLS  (129 erp_* tables)           │
                         │  every tenant table scoped by company_id /    │
                         │  branch; vendor tier via erp_is_platform_owner │
                         │  RPCs (SECURITY DEFINER) for atomic ops        │
                         └───────────────────────────────────────────────┘
                         Supabase Auth (auth.users) · Storage (files)
```

**Two tiers.** *Platform (vendor)* — `is_platform_owner` + `erp_platform_staff`; sees only `/platform/*`. *Tenant (company)* — `erp_user_branches` membership; scoped to one company.

**Five-layer entitlement chain** (enforced top-to-bottom):
`Plan entitlement (erp_plan_modules) → Company module (erp_company_modules) → Role permission (erp_company_role_permissions/erp_role_permissions) → UI visibility (visibleSections) → Route/API guard (requireModule/requirePermission)`. Apex (platform owner / super admin) bypasses 1–3.

**Request path.** RSC/layout/page + server actions call `getUserContext()` (now `cache()`-memoized → one resolution/request). Reads go through user-JWT Supabase client (RLS-enforced); mutations are guarded server actions, audited via `erp_log_audit`. Multi-write operations use SECURITY DEFINER RPCs (e.g. `erp_fashion_checkout`, `erp_issue_invoice`).

**Key directories.**
- `src/app/(app)/platform/**` — vendor control center (overview, companies/360, plans, roles, billing, staff, audit, analytics, view-as).
- `src/app/(app)/{sales,inventory,purchases,accounting,clinic,restaurant,salon,laundry,pharmacy,hotel,wholesale,fashion,…}` — tenant verticals, each layout-guarded by module or permission.
- `src/lib/erp/**` — the authorization/entitlement/domain core.
- `supabase/migrations/**` — schema + RLS (0001…0158).

---

## 2. Module map

**Plan-gateable modules (`ALL_MODULES`, 20)** — effective only if `company_module ∩ plan_module`:

| Group | Modules | Nav surface | In plans |
|-------|---------|-------------|----------|
| **Core capabilities** | sales, inventory, purchasing, accounting, pos, crm, workflow, analytics, field_ops, integrations | Sales/Inventory/Purchasing/Accounting sections; POS quick-sale; Customers (crm∨sales); Approvals (workflow); Sales report (analytics∨sales); rep app (field_ops∨distribution); Settings→Integrations (integrations) | standard/pro/unlimited (free = sales+inventory+verticals only) |
| **Industry verticals (packs)** | hotel, clinic, restaurant, salon, pharmacy, laundry, market, wholesale, distribution, fashion | dedicated nav section each | all paid; most in free too |

**Item-level refinement modules (not in `ALL_MODULES`, never plan-gated)**: `sales_orders`, `returns`, `warehousing` — gate individual items inside the Sales/Inventory sections by business-type config.

**Abstract packs (no DB module)**: `retail`, `electrical` — `electrical` is permission-gated (`electrical.rma`); `retail` preselects core modules. Documented; not a `Module`.

**Gating invariant (test-guarded):** every `Module` has a nav surface — the orphan-module allowlist is now **empty** (`architecture-integrity.test.ts`). Business-type templates (`erp_business_type_modules`) seed new companies; clothing is normalized to **fashion-only**.

---

## 3. Role hierarchy map

### Platform tier
| Role | Source | Permissions |
|------|--------|-------------|
| **Platform Owner** | `erp_profiles.is_platform_owner` | apex — all platform + all tenant (bypass) |
| **Platform Admin** | `erp_platform_staff` role `admin` | all 7 platform perms |
| **Platform Staff** | `erp_platform_staff` roles `sales`/`support`/`implementation`/`finance` | `(role defaults ∪ grants) − denies`; escalation-guarded |

Platform perms: `view_companies, create_companies, manage_billing, export_data, manage_users, access_support_tickets, access_audit_logs`.

### Tenant tier (by `ROLE_RANK`, runtime perms from DB)
```
admin (8)  ── Company Owner/Admin · all sales/inv/purch/acct + every vertical *.manage + settings.users/branches
 │
manager (7) · sales_director (7) · national_sales_manager (7)
 │
branch_manager (6) · regional_manager (6) · supervisor (6) · it_admin (6)
 │
accountant (5) · area_manager (5) · doctor (5)
 │
warehouse_keeper (4)
 │
cashier (3) · technician (3) · stylist (3)
 │
salesman (2) · driver (2) · receptionist (2)
 │
staff (1) · housekeeping (1)
 │
viewer (0)  ── read-only
```
- **Permissions** resolve company-scoped (`erp_company_role_permissions`) if the company has its own config, else global defaults (`erp_role_permissions`). `ROLE_RANK` selects the top role for nav display only — it does **not** grant.
- **Permission groups** (16): sales, inventory, purchasing, accounting, settings, field_ops, hotel, clinic, restaurant, salon, pharmacy, market, wholesale, electrical, fashion (+ umbrella `fashion.manage`).
- **System roles** (21) are protected from deletion; custom roles are owner-managed via `/platform/roles` (clone/compare/danger-flags).

---

## 4. Remaining technical debt
| Item | Severity | Notes |
|------|----------|-------|
| **Naming divergence** `finance`↔`accounting` (catalog vs DB), `market` labeled "Supermarket" | Low | Bridged by `coreModuleDbKey`. Rename = high blast-radius (seeds/guards/tests/i18n) → **deliberate reviewed pass**, not yet done (per instruction). |
| **`field_ops` over-provisioned** (39/44 TEST companies) | Low | Field-rep nav driven by perm `field.sales`, which DB admin lacks → not a live leak, but the module is broadly enabled. Re-scope as a product decision. |
| **Code↔DB role divergence** (`ROLE_PERMISSIONS` admin/manager = ALL vs DB 35/29) | Low | Runtime uses DB; code map only feeds a copilot hint + tests. Documented; harmless. |
| **`/platform/copilot-analytics` namespace** | Low | Shared with company admins but under the vendor namespace → move to `/insights/*`. Test-allowlisted. |
| **150 `multiple_permissive_policies`** (advisor) | Low | Multiple OR'd SELECT policies per table (e.g. owner + company-admin audit reads). Minor planner overhead; consolidate opportunistically. |
| **Scalability (trigger-based)** | Planned | `(company_id, created_at)` composites, retention, monthly range-partitioning, platform-analytics rollups, read replica — documented in `SCALABILITY-REVIEW.md`; do when data justifies. |
| **PR stacking depth** | Process | Many long-running stacked PRs predate this work; #122 stacks on #121. Land #121 → #122 in order. |

No correctness or security debt outstanding: tenant isolation verified (reads+writes, all 129 tables), the one real leak fixed (0151), all sensitive mutations audited, FK coverage 100%, no per-row RLS auth.

---

## 5. Recommended next phase

**A. Land the split & stabilize (now)**
1. Merge #121 (Fashion) → then #122 (Governance) → `main`. CI green on both.
2. Confirm app uses the Supabase **transaction pooler** (serverless connection ceiling).

**B. Customer-onboarding readiness (pre-pilot)**
3. **Request-context** already memoized; add catalog (plans/roles/modules) short-TTL caching.
4. **Naming reconciliation** pass (reviewed): pick canonical `accounting`/`market` keys, migrate seeds + i18n + code behind the existing bridges.
5. Move `copilot-analytics` out of `/platform/*`; finalize `field_ops`/`pos`-per-vertical defaults via the Plans editor.

**C. Scale-readiness (trigger-based — when volume appears)**
6. `(company_id, created_at)` composite indexes on the big-5 (CONCURRENTLY).
7. Retention policies + **monthly range-partitioning** of `audit_logs`/`notifications`/`visits`/`stock_movements` (cheap now, costly later).
8. Platform-analytics **rollup tables**; then a **read replica** for reporting.

**D. Product surface (customer-facing)**
9. Self-serve plan/upgrade flows on top of the Plans entitlement model.
10. Tenant-facing dashboards/reporting on the rollup foundation.

**Definition of done for "production-grade" (status):** clean governance ✅ · clean authorization ✅ · verified tenant isolation ✅ · audited mutations ✅ · consistent entitlement chain ✅ · FK/RLS perf hygiene ✅ · CI architecture guards ✅ · scale plan documented ✅. Remaining = naming polish + trigger-based scale work + customer-facing product surface.
