# Authorization Architecture — Single Source of Truth

> VANTORA / Kako multi-tenant ERP. This document is the canonical reference for
> **who can see and do what**. It covers the two authorization tiers (Platform
> vendor vs. Tenant company), every role, and the five-layer enforcement chain.
>
> Source of truth in code/DB:
> - Tenant permissions & roles: `src/lib/erp/permissions.ts`, DB `erp_role_permissions`, `erp_company_role_permissions`
> - Platform permissions & roles: `src/lib/erp/platform-permissions.ts`, DB `erp_platform_role_permissions`
> - Permission resolution: `src/lib/erp/auth-context.ts`, `src/lib/erp/platform-context.ts`
> - Navigation gating: `src/lib/erp/navigation.ts` (`visibleSections`)
> - Route/API guards: `src/lib/erp/guards.ts`, `src/lib/erp/capabilities.ts`
> - Home routing: `src/lib/erp/home.ts`
> - Module/plan/pack catalogs: `erp_plan_modules`, `erp_company_modules`, `erp_business_type_modules`, `src/lib/erp/licensing-catalog.ts`

---

## 1. Two tiers

| Tier | Who | Identity source | Scope | Permission catalog |
|------|-----|-----------------|-------|--------------------|
| **Platform (vendor)** | The SaaS operator and its internal staff | `erp_profiles.is_platform_owner` + `erp_platform_staff` | Cross‑tenant (all companies) | 7 platform permissions |
| **Tenant (company)** | A customer company's own users | `erp_user_branches` membership (role per branch) | A single company | 79 tenant permissions |

A user is **never both** operationally: the platform tier sees only the vendor
panel (`/platform/*`) and **no** tenant operational sections; a tenant user sees
only their company and **no** platform items.

---

## 2. The five-layer enforcement chain

Every feature passes through these layers, in order. A deny at any layer hides/blocks it.

```
1. PLAN ENTITLEMENT      erp_plan_modules        — what the company's plan unlocks (coarse modules)
        ↓
2. COMPANY MODULE        erp_company_modules     — what the company has enabled (business-type default + overrides)
        ↓
3. ROLE PERMISSION       erp_company_role_permissions / erp_role_permissions — what the user's role grants
        ↓
4. UI VISIBILITY         visibleSections()       — which sidebar sections/items render
        ↓
5. ROUTE / API GUARD     requireModule / requirePermission / requireCapability — server-side enforcement
```

**Effective modules** = `companyModules ∩ planModules` (computed in `auth-context.ts`).
**Effective permissions** = union of the user's enabled roles' permissions (company‑scoped if the company has its own config, else global defaults).

**Apex bypass:** the **Platform Owner** and **Super Admin** bypass layers 1–3 entirely
(they hold `ALL_MODULES` and every permission). This is enforced consistently in
`requireModule`, `requirePermission`, `requireAnyPermission`, `requireCapability`,
`hasPermission`, and `can` (fixed 2026‑06 — see §9).

---

## 3. Platform tier roles

Platform permissions (`src/lib/erp/platform-permissions.ts`): `view_companies`,
`create_companies`, `manage_billing`, `export_data`, `manage_users`,
`access_support_tickets`, `access_audit_logs`.

### 1. Platform Owner
- **Identity:** `erp_profiles.is_platform_owner = true` (apex; cannot be granted by staff).
- **Permissions:** ALL platform permissions **and** ALL tenant permissions/modules (apex bypass). Never sees "Out of Plan" / "Upgrade".
- **Visible sections (sidebar):** `Platform` group → **Overview** (Overview, Activity, Analytics), **Tenants** (Companies & Subscriptions), **Billing**, **Team & Access** (Platform Staff, Audit Log), **Reference Data** (Drug List); plus `Settings` (Confusion Analytics, My Account).
- **Home:** `/platform`.
- **Restrictions:** none. Belongs to no tenant company, so does not see tenant operational sections (by design — uses the vendor panel + per‑company management).

### 2. Platform Admin (staff role `admin`)
- **Identity:** row in `erp_platform_staff`, role `admin`, `is_active = true`.
- **Permissions:** all 7 platform permissions (via `erp_platform_role_permissions`).
- **Visible sections:** Companies, Platform Staff, Audit Log.
- **Home:** `/dashboard` (neutral; no tenant company).
- **Restrictions:** cannot become Platform Owner; cannot grant a permission they don't hold (DB escalation guard `erp_platform_staff_perm_guard`). Billing & platform Overview/Analytics pages are **owner‑only**.

### 3. Platform Staff (roles `sales` / `support` / `implementation` / `finance`)
- **Identity:** `erp_platform_staff` with a limited role; effective perms = `(role defaults ∪ grants) − denies` (`erp_platform_my_permissions()`).
- **Default permission slices:**
  - `sales` → view_companies, create_companies
  - `support` → view_companies, access_support_tickets
  - `implementation` → view_companies, create_companies, export_data, access_support_tickets
  - `finance` → view_companies, manage_billing, export_data, access_audit_logs
- **Visible sections:** only the platform items their `platformPerm` unlocks (e.g. support → Companies only).
- **Home:** `/dashboard`.
- **Restrictions:** cross‑tenant read is **all-or-nothing** (no per‑company staff scoping); owner‑only pages (Billing, Overview, Analytics) remain hidden unless owner.

---

## 4. Tenant tier roles

Tenant roles live in `erp_roles`; per‑company enablement in `erp_company_roles`;
permissions in `erp_company_role_permissions` (company override) → falls back to
global `erp_role_permissions`. **Runtime permissions come from the DB**, listed below.

> The 10‑role list requested maps onto the system as: **Company Owner = Company
> Admin = the `admin` role** (there is one top tenant role, not two). The other
> roles map 1:1.

### 4. Company Owner / 5. Company Admin — role `admin`
- **Permissions (35, DB):** all sales (`sales.sell/discount/collect/return`, `customers.manage`), all inventory (`inventory.view/adjust/transfer/count`, `stock_request.create/approve`), purchasing (`purchasing.manage/return`, `suppliers.manage`), accounting (`accounting.view/post`, `reports.view`), **every vertical `*.manage`** (hotel/clinic/restaurant/salon/laundry/market/pharmacy/wholesale/electrical/fashion), and `settings.users` + `settings.branches`.
- **Visible sections:** Main, Sales, Inventory, Purchasing, Accounting, Settings — **plus** the section for whichever vertical module the company enabled (e.g. Fashion for a clothing store). Verticals the company has **not** enabled are hidden by module gating.
- **Visible modules:** all modules the company's plan + business type enable.
- **Restrictions:** does **not** hold FMCG field‑ops granular perms (`field.sales`, `visit.*`, `day.*`, `target.*`), `integrations.manage`, `workflow.manage`, `settings.custom_fields`, or P6 high‑risk capabilities unless explicitly granted. Scoped to its own company (RLS). Cannot see other companies or platform tools.

### 6. Manager — role `manager`
- **Permissions (29, DB):** same as admin **minus** the granular `fashion.*` set (keeps `fashion.manage` umbrella) — i.e. full operational control of sales/inventory/purchasing/accounting + all vertical `*.manage` + `settings.users/branches`.
- **Visible sections:** Main, Sales, Inventory, Purchasing, Accounting, Settings (+ enabled vertical).
- **Restrictions:** same company scope as admin; same exclusions (no field‑ops/integrations/workflow granular perms).

### 7. Cashier — role `cashier`
- **Permissions (12, DB):** `sales.sell`, `sales.collect`, `customers.manage`, `market.pos`, plus vertical front‑desk `*.manage` for hotel/laundry/restaurant/salon/pharmacy, and `fashion.sell/installments/cashbox`.
- **Visible sections:** Main (Dashboard/Attention/Notifications), Sales (Invoices, Customers), Settings (My Account); for a clothing store → Fashion (POS, Customers, Installments, Cash box).
- **Visible modules:** sales/pos (+ fashion for clothing).
- **Restrictions:** no inventory management, no purchasing, no accounting, no settings.users/branches, no reports. Sell + collect only.

### 8. Accountant — role `accountant`
- **Permissions (9, DB):** `accounting.view`, `accounting.post`, `reports.view`, `sales.collect`, `suppliers.manage`, `fashion.cashbox/installments/purchase/reports`.
- **Visible sections:** Main, Sales (Invoices, Sales Report), Purchasing (Suppliers), Accounting; for fashion → Reports/Cash box/Installments/Suppliers.
- **Restrictions:** **cannot create invoices** (`sales.sell` not granted — by design), no inventory adjust, no settings, no user management.

### 9. Warehouse Keeper — role `warehouse_keeper`
- **Permissions (8, DB):** `inventory.view/adjust/transfer/count`, `stock_request.approve`, `purchasing.manage`, `fashion.inventory/purchase`.
- **Visible sections:** Main, Inventory (Products, Stock, Low‑stock, Expiry), Purchasing (Orders); for fashion → Inventory/Suppliers.
- **Restrictions:** no sales, no accounting, no settings, no reports center. Stock & purchasing only.

### 10. Viewer — role `viewer`
- **Permissions (3, DB):** `accounting.view`, `inventory.view`, `reports.view` (read‑only).
- **Visible sections:** Main (Dashboard, Reports, Attention), Sales (Sales Report), Inventory (read‑only views).
- **Restrictions:** no write actions anywhere. Pure read‑only.

> Other tenant roles exist for FMCG/verticals (`sales_director`, `national_sales_manager`,
> `regional_manager`, `area_manager`, `branch_manager`, `it_admin`, `supervisor`,
> `salesman`, `driver`, `technician`, `doctor`, `receptionist`, `stylist`,
> `housekeeping`, `staff`). Their default permissions are in `erp_role_permissions`.

---

## 5. Inheritance & gating rules

### Permission inheritance
- **Role → permissions:** a user's effective permissions = the **union** of all their enabled roles' permissions across branches (`auth-context.ts`).
- **Company override → global fallback:** if the company has its own role config (`erp_company_roles`), it is authoritative (`erp_company_role_permissions`); otherwise the global defaults (`erp_role_permissions`) apply. This lets a pharmacy and a distributor give the same `manager` role different capabilities.
- **Umbrella expansion:** holding `fashion.manage` auto‑implies the full granular `fashion.*` set (`applyFashionUmbrella`). Granular capabilities also expand from legacy flat perms via `expandAliases` (`capabilities.ts`).
- **Apex:** Super Admin → all permissions; Platform Owner → all permissions + all modules (bypass).

### Role inheritance / ranking
- Roles do **not** inherit from each other hierarchically; each role is a flat permission set.
- `ROLE_RANK` (`auth-context.ts`) only picks the **top role** (highest rank across branches) for nav‑gating display — it does **not** grant permissions.

### Module gating
- A section/item with a `module` renders only if that module is in the user's **effective modules** (`companyModules ∩ planModules`). Array = ANY‑of.
- `requireModule(m)` redirects tenants to `/upgrade?module=m`; Platform Owner & Super Admin bypass.

### Plan gating
- `erp_plans`: `free`(rank 0), `standard`(1), `pro`(2), `unlimited`(3).
- `erp_plan_modules` lists the coarse modules a plan unlocks. Finer per‑item modules (`pos`, `sales_orders`, `returns`, `warehousing`) pass through from the company config.

### Industry‑pack / business‑type gating
- `erp_business_type_modules` seeds a new company's default enabled modules from its `business_type` (e.g. `clothing → fashion`; `hotel → hotel + accounting`).
- Industry packs (`licensing-catalog.ts`: clinic, pharmacy, distribution, retail, electrical, restaurant, hotel, salon, laundry, fashion) preselect a module bundle.
- A clothing company is tightened to **fashion‑only** modules + curated Fashion role permissions on insert (trigger `erp_companies_zz_clothing_perms`, migrations 0147/0148).

---

## 6. Verification matrix (computed from the real gating code)

| Account | Home | Sidebar sections | Bottom nav |
|---------|------|------------------|------------|
| **Platform Owner** | `/platform` | Platform (Overview/Tenants/Billing/Team & Access/Reference) + Settings | (desktop admin) |
| **Platform Admin (staff)** | `/dashboard` | Platform: Companies, Staff, Audit | (desktop admin) |
| **Platform Support (staff)** | `/dashboard` | Platform: Companies | (desktop admin) |
| **Company Admin/Owner** | `/dashboard` | Main, Sales, Inventory, Purchasing, Accounting, Settings (+ enabled vertical) | Home, Today*, Customers, Sell, Inventory |
| **Manager** | `/dashboard` | same as Admin | Home, Customers, Sell, Inventory |
| **Accountant** | `/dashboard` | Main, Sales, Purchasing, Accounting | Home |
| **Cashier** | `/dashboard` | Main, Sales, Settings | Home, Customers, Sell |
| **Warehouse Keeper** | `/dashboard` | Main, Inventory, Purchasing | Home, Inventory |
| **Viewer** | `/dashboard` | Main, Sales (report), Inventory (read) | Home, Inventory |
| **Fashion Owner** | `/fashion` | Fashion (9 items), Settings | Home, Customers, Sell, Inventory |
| **Fashion Manager** | `/fashion` | Fashion (9 items), Settings (My Account) | Home, Customers, Sell, Inventory |
| **Fashion Cashier** | `/fashion` | Fashion (5: Store, Sell, Customers, Installments, Cash box), Settings | Home, Customers, Sell |

\* Field‑rep items (`/today`, `/coaching`, `/field/route`, `/supervisor`) require `field.sales`/`visit.*` perms which only FMCG field roles hold — a generic admin does **not** see them.

No tenant account sees any `/platform/*` item; no account sees an "Out of Plan"/"Upgrade" screen for a module it shouldn't, and the Platform Owner never sees one at all.

---

## 7. Governance changelog & remaining gaps

### ✅ Applied — `erp_profiles` RLS apex consistency (migration 0149)
- **Change:** added `erp_is_platform_owner()` to the `erp_profiles` SELECT, UPDATE, and DELETE policies.
- **Before:** only `is_super_admin` (+ self + branch‑mates) could read; only super admin (+ self) could update/delete. A *pure* platform owner (`is_platform_owner=true`, `is_super_admin=false`) saw only itself.
- **After:** the platform owner reads/updates/deletes any profile — consistent with its existing cross‑tenant access to companies/customers/modules/roles.
- **Tenant isolation:** unchanged. Verified — pure owner: 61 profiles / 44 companies; tenant cashier: 4 profiles / 1 company.
- **Rollback:** re‑run the three `ALTER POLICY` statements without the `OR (SELECT erp_is_platform_owner())` clause.

### ✅ Applied — Plans & Modules editor (migration 0150 + new platform page)
- Built `/platform/plans` (owner‑only): manage plans, plan module entitlements (with **impact preview**), and business‑type templates. RLS already owner‑gated; every write audited. See `docs/PLATFORM-PLANS-MODULES.md`.

### Remaining gaps / recommendations

1. **Remaining platform‑side UI** for: Plans editor, Modules/Industry‑Packs catalog, global Roles & Permissions, Feature flags (no system exists), Platform Settings, "View as company"/impersonation. Per‑company role/module/plan management already exists in the Company‑360 page.
3. **Code vs DB divergence:** `ROLE_PERMISSIONS` in `permissions.ts` maps `admin`/`manager` → ALL, but DB `erp_role_permissions` seeds 35/29. Runtime uses the DB; the code map is used for tests/seeding only. Consider reconciling to avoid confusion.
4. **Permission naming overlaps** (`inventory.* vs stock.*`, `customers.manage vs customer.*`) are intentional legacy aliases resolved via `expandAliases`; recommend documenting rather than renaming (rename is high‑risk across seeds/guards/tests).
