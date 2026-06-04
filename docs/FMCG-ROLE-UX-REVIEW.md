# VANTORA — FMCG Role / UX / Platform Standards Review

> Review-only (no features added). Two lenses: **(I)** the platform from each of
> the 8 requested FMCG roles; **(II)** internal structure vs. enterprise-SaaS /
> FMCG best practices. Grounded in the actual codebase — including an honest map
> of which requested FMCG concepts **exist vs. don't**, since that shapes both the
> review and the future demo-data request.

---

## 0. Reality map — requested FMCG concepts vs. what exists

| Requested concept | In platform? | Evidence / note |
|---|---|---|
| Branches (Riyadh/Jeddah/Dammam) | ✅ | `erp_branches` (multi-branch supported) |
| Role hierarchy Director→Regional→Area→Branch→Supervisor→Rep | 🟡 **partial** | Roles are **flat** (`erp_user_branches.role`); `reports_to` exists (0009) so a manager chain is possible, but there are **no Director/Regional/Area role keys** and no org-tier UI |
| Routes (16+) | ✅ | `erp_routes` (rep, van warehouse, visit day) + `/distribution/routes` |
| Customers (100, retail/wholesale/key/discount) | ✅ data; 🟡 typing | `erp_customers` exists; **no `customer_type`/segment column** — "retail/wholesale/key/discount" would be modeled via the **wholesale tier** assignment, not a native classification field |
| Customer classification A/B/C | ❌ | no classification/grade column on customers |
| Products (50 SKUs) | ✅ | `erp_products_catalog` |
| Categories (Croissant/Pastries/…) | ✅ | `erp_product_categories` (category_id on products) |
| Brands | ❌ | no `brand` field/table on products |
| Sales history (3 mo, 1000+ lines) | ✅ | `erp_invoices` / `erp_invoice_lines` |
| Rep targets | ✅ | `erp_rep_targets` (target_amount, commission_pct, month) + `/distribution/targets` |
| Route targets | ❌ | targets are **per rep**, not per route |
| Category targets | ❌ | no per-category target |
| Promotions (10%/5+1/10+2/bundle/customer-specific) | 🟡 **shell only** | `promotions` table exists (name/status/dates/product_ids/ROI/trade_spend) but **no promo-type engine** (no %off / N+M / bundle logic) and **no promotions UI/nav** |
| Returns | ✅ | `erp_sales_returns` (+ supplier returns from the Electrical work) |
| Commissions (achievement levels, qualified/disqualified) | 🟡 **basic** | `commission_pct` per rep + a distribution report computes sales/achievement/commission; **no tiered achievement levels, no qualify/disqualify rules** |
| Incentives (new-customer / category / multi-condition) | ❌ | no incentive feature at all |
| Governance (draft/pilot/published/rollback) | ❌ | no governance/change-management feature |
| Scheduler (ERP sync / promo activation / daily digest) | 🟡 **partial** | sync engine + pg_cron exist for **ERP sync** and webhooks; **no promo-activation or daily-digest scheduler UI** |

**Implication for the demo-data request:** roughly half the requested dataset
(customer A/B/C classification, brands, route/category targets, the promo-type
engine, incentives, governance, promo/digest scheduler, achievement-tiered
commissions) **has no underlying feature** to populate. Seeding it would require
**building those features first** — which is out of scope for "demo data." This
review flags exactly which, so we can decide feature-by-feature later.

---

## I. Role-by-role review (8 FMCG roles)

> Reminder: roles are **flat + single data scope per company** in this build.
> Regional/Area/Director are not distinct role keys — they currently map to
> `manager` (full access). So today the meaningful distinctions are: **admin/
> manager (full)** · **supervisor** · **sales rep** · **finance** · **viewer**.

| Lens | Admin / Manager (Dir/Reg/Area/Branch) | Supervisor | Sales Rep | Finance | Viewer |
|---|---|---|---|---|---|
| **Navigation visibility** | full sidebar | sales + inventory-view + reports | sales + customers + stock-view + rep app | accounting + suppliers + reports | reports + accounting-view + stock-view |
| **Page access** | all tenant pages | sales/customers/inventory(view)/reports | sales/customers/products(view)/rep | accounting/suppliers/reports | read-only pages |
| **Create/Edit/Delete** | full CRUD | sell/discount/collect/returns; approve loads | sell/collect; manage customers; request loads | post journals; collect | **none** (read-only) |
| **Scope visibility** | whole company | whole company (single branch demo) | whole company | whole company | whole company |
| **Hidden vs denied** | n/a | settings/purchasing/accounting **hidden** (not just denied) | accounting/purchasing/settings **hidden** | sales-edit/settings **hidden** | all edit hidden |
| **Mobile** | responsive; rep app for field | responsive | **rep app `/rep`** (field-first) | responsive | responsive |

**Findings (correct today):**
- Permission gating is **clean** — unauthorized items are **hidden** from the
  sidebar (not shown-then-denied), which is the right UX.
- Sales Rep correctly gets `field.sales` (rep app / journey / settlement) — the
  FMCG field persona works.
- Finance is correctly scoped to books (post journals, suppliers, collections),
  no selling/settings.
- Viewer is genuinely read-only (no create/edit buttons render).
- **Data isolation** across companies is enforced by RLS (verified earlier) —
  solid.

**Gaps (FMCG-specific):**
- **No regional/area data scoping** — a "Regional Manager" sees the *whole*
  company, not "their region's branches." With multi-branch + `reports_to` this
  is *possible* but **not implemented** (no branch-group / region entity, no
  scope-by-subtree filter).
- **Manager == Admin** — Branch Manager currently has the **same full access as
  Company Admin** (incl. settings/permissions). For FMCG you'd usually want a
  Branch Manager **below** admin (no company settings/billing).
- Supervisor/Rep can't be **scoped to specific routes/customers** — they see all
  company customers.

---

## II. Structure vs. enterprise-SaaS / FMCG best practices

### 1. What is correct now
- **Multi-tenant + RLS on every table** — enterprise-grade isolation.
- **Clean platform/tenant separation** — Provider panel hidden from customers;
  three tiers (Platform Owner / Super Admin / Company Admin) well-defined.
- **Permission-gated, hidden-not-denied navigation** — correct pattern.
- **Bilingual (ar/en) + RTL throughout**, consistent `PageHeader`/empty-state/
  `EmptyState` components (recently standardized).
- **Field-first rep app** (`/rep`) — right for FMCG van sales.
- **Per-business-type modules + setup wizard** — good multi-vertical foundation.
- **Subscription/plan/module control** in the owner panel — solid SaaS admin.

### 2. What should be fixed
- **Role tiering:** introduce a real gap between **Company Admin** (settings/
  billing/permissions) and **Branch Manager** (operations only). Today they're
  identical (`manager: ALL`). *(Permission-model change, not a new feature — low
  risk, high value.)*
- **Customer typing:** add a lightweight **customer segment** (Retail/Wholesale/
  Key/Discount) + **A/B/C class** field. Today "type" is implied only by wholesale
  tier. *(One column + a filter — small.)*
- **Promotions:** the `promotions` table is a **shell with no engine and no UI** —
  either build a minimal promo-type model (%/N+M/bundle) **or** stop presenting
  promotions as a capability until built. *(Don't demo a hollow feature.)*

### 3. What should be simplified
- **Regional/Area language:** the platform is flat — avoid promising a 5-level
  hierarchy in demos. Either (a) keep it simple (Admin/Manager/Supervisor/Rep/
  Finance/Viewer), or (b) add **region as a branch-group** + scope filter (a real
  but contained feature) before claiming regional management.
- **Targets:** consolidate the target story — today only **rep monthly targets**
  exist; "route targets / category targets" should be **descoped or built**, not
  implied.
- **Manager role names:** `manager` is labeled "Branch Manager" but has admin
  powers — align the **name with the actual scope** to avoid confusion.

### 4. What should be restructured
- **Org hierarchy:** to support Director→Regional→Area→Branch, add a **branch-
  group / region** entity and scope visibility by the `reports_to` subtree. This
  is the single biggest FMCG-enterprise gap. *(Real feature — schedule explicitly,
  don't fake with data.)*
- **Trade module grouping:** Routes, Targets, Promotions, Commissions are
  scattered (some under Distribution, promotions nowhere). Group a coherent
  **"Trade / Field Sales"** section in nav once the features exist.
- **Customer master:** add segment + class + (optionally) brand/category affinity
  so dashboards (growth, achievement, mix) have real dimensions to slice.

### 5. Recommended next steps
1. **Decide the role model** (P-now, small): split Admin vs Branch Manager; keep
   Regional/Area as labels only **or** commit to building region scoping.
2. **Add two small customer fields** (segment + A/B/C class) — unlocks realistic
   FMCG dashboards with minimal change.
3. **Promotions: build-or-hide** — a minimal promo engine (10% / N+M / bundle) is
   a **real feature**; until then, don't seed/demo it.
4. **Then** enrich demo data **only for what exists** (branches, 100 customers w/
   segment+class, 50 SKUs across the 8 categories, 3-month invoice history, rep
   targets, returns, basic commission) — internally consistent and meaningful.
5. **Defer** (need features first): route/category targets, incentives,
   governance (draft/pilot/published/rollback), promo/daily-digest scheduler,
   tiered/qualified commissions, brands, region scoping.

---

## Bottom line
The platform's **foundations are strong** (isolation, permissions, bilingual,
field app, SaaS admin). The honest gap for a **full FMCG enterprise demo** is that
a meaningful share of the requested dataset (A/B/C class, brands, route/category
targets, promo engine, incentives, governance, scheduler, tiered commissions,
region scoping) **maps to features that don't exist yet** — so it can't be
"seeded," only **built**. Recommended path: make the **3 small fixes** (role
split, customer segment+class, promotions build-or-hide), then enrich demo data
**for the existing features**, and schedule the larger FMCG features (region
hierarchy, promo engine, incentives, governance) as explicit, reviewed slices.

*Review only — no code changed, no features added. Awaiting your decisions on §5
before resuming demo-data enrichment.*
