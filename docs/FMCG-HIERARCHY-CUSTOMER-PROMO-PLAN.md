# VANTORA — FMCG Hierarchy + Customer Model + Promotions — Review-First Plan

> **Design for approval — no implementation yet.** Three workstreams you approved:
> (1) a real **FMCG sales hierarchy** (Director→Regional→Area→Supervisor→Rep),
> (2) an **expanded customer model** for FMCG + ERP integrations, (3) **Promotions
> as a first-class built module**. Grounded in the actual schema. Additive +
> idempotent; no architecture rewrite; protected verticals untouched.

---

## ✅ LOCKED DECISIONS (owner-approved)
1. **Branch Manager** = a real role, **distinct from Company Admin**. Full FMCG
   role set:
   `Sales Director → National Sales Manager (NSM) → Regional Manager → Area
   Manager → Branch Manager → Supervisor → Sales Rep`, plus **Company Admin,
   Finance, IT Admin, Viewer**.
2. **Build Region + Area entities now** (not later). Management spans:
   NSM → one+ **Regions** · Regional Mgr → one+ **Areas** · Area Mgr → one+
   **Branches** · Branch Mgr → **one Branch** · Supervisor → **Routes + Reps** ·
   Rep → **assigned Customers + Routes**.
3. **Customer fields** (decision 3) — code, name, branch, region, area, route,
   sales rep, channel, classification, CR number, VAT number, national address,
   GPS, phone, email, contact person, credit limit, payment terms, status.
4. **Promotions** = dedicated `erp_promotions` module; **Phase 1** = define,
   list, activate, pause, resume, expire, performance tracking.
5. **One slice at a time**, review → validation → rollback verification before
   the next. Never skip review.

### Revised sequence (Region/Area first — customers + scope depend on them)
| Slice | Scope | Why this order |
|---|---|---|
| **S1** | **Region + Area entities** (+ branch.region/area links) | foundation for customers (geo fields) AND hierarchy scope |
| **S2** | **Roles** (Director/NSM/Regional/Area/Branch + IT Admin) + reposition `manager`→Branch Manager (branch-scoped, not admin) | needs nothing but the role layer |
| **S3** | **Expanded customer model** (decision 3 fields, incl. region/area FKs from S1) | depends on S1 |
| **S4** | **Hierarchy scope + RLS** (NSM→regions, Regional→areas, Area→branches, Branch→branch, Supervisor/Rep→routes/customers) | depends on S1 + S2; the heaviest, RLS-verified |
| **S5** | **Promotions module** (`erp_promotions` + CRUD/list/activate/pause/resume/expire + performance) | independent; sized as its own build |
| **S6** | **Promo pricing application** + **FMCG demo-data enrichment** | depends on S3 + S5 |

> Each slice: design review (this format) → build → tsc/test/build → rolled-back
> live verification → draft PR → review package → approval → merge. No production
> migration applied without approval.

---

## Grounding (what exists today)
- **Roles:** `erp_user_branches.role` is **free-text** (TS `BranchRole` union) →
  new roles are **additive** (no enum migration). `reports_to` already exists on
  `erp_user_branches` (0009) — a manager chain is already modeled, just unused.
- **Org:** `erp_departments` / `erp_teams` / `erp_job_titles` + `department_id`,
  `team_id`, `job_title_id` on `erp_user_branches` (0077) — structure exists.
- **Branches:** `erp_branches` (company-scoped). No "region/area" grouping yet.
- **Customers:** `erp_customers` has code/name/phone/email/address/city/tax_number/
  credit_limit/balance/route_id/salesman_id/visit_day/is_approved. **No segment,
  class, brand, channel, geo, or price-group fields.**
- **Promotions:** ⚠️ the `promotions` table is **legacy/orphaned** — it lives in
  `public`, references `public.users` (old schema, **not** `erp_profiles`), has
  **no `company_id`**, no RLS tied to `erp_companies`, and is **unused in the
  app**. It cannot be used as-is for a tenant module.

---

## Workstream 1 — Real FMCG sales hierarchy

### Goal (revised — 6 levels, Branch Manager included)
`Sales Director → Regional Manager → Area Manager → Branch Manager → Supervisor →
Sales Rep`, with **scope** (a manager sees their level, not the whole company).

**Branch Manager is the keystone level** and the natural first scope tier: it
maps to the existing **branch** entity (`erp_branches` / `erp_user_branches`),
so "see everything for my branch" = a trivial, secure **branch-level scope**
(reuses existing branch RLS — no recursion). It also *is* the existing `manager`
role (already labeled "Branch Manager") repositioned from admin-level → branch
ops. Regional/Area sit **above** branches (multi-branch grouping) and are the
harder scope slice (region entity or `reports_to` subtree). Director = company.

**Scope ladder (build outward-in):** Branch (native/easy) → Area/Regional
(grouping/harder) → Director (company).

### Two parts: roles (easy) + scope (the real work)

**1A. New role keys (additive).** Add to `BranchRole` + `ROLE_PERMISSIONS` +
`BRANCH_ROLES` labels + `ROLE_RANK`:
| New role | Rank | Default permissions |
|---|---|---|
| `sales_director` | high (≈7) | broad sales+reports+approvals, no company settings/billing |
| `regional_manager` | 6 | sales+reports+approvals within scope |
| `area_manager` | 5 | sales+reports within scope |
| (existing) `supervisor`, `salesman` | 6/2 | unchanged |

> **Decision A:** also **demote `manager`** from `ALL` so Branch Manager ≠ Admin?
> *(Recommended — separates ops from company-admin.)* Confirm, since it changes an
> existing role's powers (additive-safe: existing admins keep `admin`).

**1B. Scope by hierarchy (the substantive change).** Today every tenant user sees
the whole company. Options:
- **Option A — `reports_to` subtree (recommended):** a manager sees data for the
  users beneath them (their reps' customers/invoices/routes). Reuses the existing
  `reports_to`. Requires a **scope resolver** (`erp_visible_user_ids(uid)` =
  recursive subtree) used by list queries + (ideally) RLS.
- **Option B — region/area entities:** add `erp_regions` / `erp_areas` +
  `branch.region_id` and scope by geography. More structure; better for true
  multi-branch geography.
- **Recommendation:** **Option A first** (smaller, reuses `reports_to`,
  immediately meaningful), **Option B later** if geographic regions are needed.

> **Risk (honest):** scope filtering is **non-trivial** — to be *secure* it should
> be enforced at **RLS**, not just in queries, or it's cosmetic. RLS recursion is
> doable (a SECURITY DEFINER subtree function) but is the heaviest piece here and
> needs careful rolled-back-live verification. **This is a real feature slice, not
> a config change.**

### Scope of slice 1
Roles + ranks + labels (1A) is small and safe. **Scope (1B) is its own reviewed
slice** with RLS verification. Recommend shipping **1A first** (so the demo shows
the titles), then **1B** as a dedicated, verified slice.

---

## Workstream 2 — Expanded customer model (FMCG + ERP-ready)

### Additive columns on `erp_customers` (one migration, all `ADD COLUMN IF NOT EXISTS`, nullable/defaulted → zero regression)
| Field | Type | Purpose |
|---|---|---|
| `segment` | text (`retail`/`wholesale`/`key_account`/`discount`) | FMCG customer type |
| `class` | text (`A`/`B`/`C`) | ABC classification (value/priority) |
| `channel` | text (`traditional`/`modern`/`horeca`/`wholesale`) | trade channel |
| `price_group_id` | uuid → `erp_wholesale_tiers` | link pricing tier (reuse existing) |
| `region` / `area` | text (or fk later) | geo grouping (light now) |
| `latitude` / `longitude` | numeric | visit mapping / route optimization |
| `payment_terms_days` | int | AR terms (ERP-relevant) |
| `tax_id` | text | already have `tax_number`; confirm reuse |
| `external_ref` | text | ERP coexistence id (complements `external_id`) |
| `contact_person` / `contact_phone` | text | FMCG ordering contact |
| `is_active` | bool | already implied; confirm |

- **ERP mapping:** these line up with the adapter presets (NetSuite/SAP/Dynamics/
  Odoo customer objects) — `segment`/`class`/`channel`/`payment_terms`/`external_
  ref` are common ERP customer attributes, improving the coexistence story.
- **UI:** add the new fields to the Customers create/edit form + a **segment/class
  filter** on the list; show as columns/badges. Add to the **entity registry**
  field map so import/export/API pick them up automatically.
- **Risk:** low — purely additive columns + form fields. No existing data changes.

---

## Workstream 3 — Promotions as a first-class module

### The honest starting point
The current `promotions` table is **unusable as a tenant module** (no
`company_id`, wrong `users` FK, no `erp_*` RLS, unused). **Building "around it" is
not viable** — we should **build a proper tenant-scoped promotions feature** and
either **drop or ignore** the orphan table (it holds no real data).

### Proposed minimal-but-real promotions model (new, tenant-scoped)
- `erp_promotions` — `id, company_id, name, name_ar, type, status (draft/active/
  paused/ended), start_date, end_date, priority, scope (product_ids[]/category_
  ids[]/customer_segment/customer_ids[]), value (jsonb per type), created/updated`.
- **Promo types (phase 1):** `percent_discount` (e.g. 10%), `quantity_free`
  (5+1, 10+2), `bundle` (buy X get Y price), `customer_specific` (segment/customer
  scoped) — matching your list.
- **Application:** phase-1 = **define + list + activate** (the module is visible,
  manageable, reportable) with a **pricing hook** at invoice/order line (apply the
  best eligible promo). Full auto-application engine can be phased.
- **Module + nav + permission:** new `promotions` capability (or under a "Trade"
  section); permission e.g. `promotions.manage`; gated like other modules.
- **Governance later:** draft/active/paused/ended covers basic lifecycle now;
  full draft→pilot→published→rollback governance is a **separate future slice**
  (don't conflate).

### Scope of slice 3
This is a **genuine feature build** (schema + RLS + RPC for apply + UI + nav +
i18n + tests), the largest of the three. Recommend phasing:
- **3a:** `erp_promotions` schema + CRUD UI + list + activate (visible module).
- **3b:** invoice/order **pricing application** of eligible promos.
- **3c (later):** full governance + scheduler (promo activation cron).

---

## Recommended sequencing (each its own reviewed slice → build → test → PR)

| Order | Slice | Size | Risk | Notes |
|---|---|---|---|---|
| 1 | **W2 — customer fields** | Small | Low | additive columns + form/filter; immediate dashboard value |
| 2 | **W1a — new role keys + ranks/labels** | Small | Low | additive; demotes `manager` (Decision A) |
| 3 | **W3a — promotions module (schema+CRUD+list+activate)** | Med | Low–Med | new tenant-scoped table; visible module |
| 4 | **W1b — hierarchy scope (reports_to subtree + RLS)** | Med–High | Med | the substantive scope change; RLS-verified |
| 5 | **W3b — promotion pricing application** | Med | Med | invoice/order hook |
| 6 (later) | regions/areas (W1 Option B), governance, scheduler, incentives, route/category targets, brands | — | — | separate future features |

Then **enrich the FMCG demo data** for everything that now exists (branches, 100
customers w/ segment+class+channel, 50 SKUs × 8 categories, 3-mo invoices, rep
targets, promotions, returns, basic commissions) — internally consistent.

---

## Decisions needed before building
1. **Demote `manager`** so Branch Manager ≠ Company Admin? *(Recommended.)*
2. **Hierarchy scope = `reports_to` subtree (Option A)** first, regions later?
   *(Recommended.)* Or commit to **regions/areas entities (Option B)** now?
3. **Customer fields** — confirm the list (segment/class/channel/price_group/geo/
   payment_terms/external_ref/contact) and any to add/drop.
4. **Promotions** — confirm **new `erp_promotions`** (ignore/drop the legacy
   orphan table) and the **phase-1 scope** (define+list+activate, apply later)?
5. **Sequencing** — confirm the 1→6 order (smallest/safest first), each as its own
   review→build→test→PR slice with rolled-back-live verification for migrations.

*(Plan only — nothing built. On your §Decisions answers I'll start with the
smallest slice, bring its design/verification back per slice, and hold every
production migration for approval.)*

---

## Program status & reviewed backlog (updated)

| Slice | Status | Notes |
|---|---|---|
| **S1** — Region + Area entities | ✅ merged (#59) | `erp_regions`/`erp_areas` + branch links |
| **S2** — Roles (Branch Manager ≠ Admin) | ✅ merged (#60) | Option B, zero regression |
| **S3** — Expanded customer model | ✅ built (#61) | + **company-managed master data** (segment/class/channel as `erp_customer_lookups`). `docs/SLICE-S3-CUSTOMER-MODEL.md` |
| **S4** — Hierarchy scope + RLS | ⏳ design review | the heaviest, RLS-verified. `docs/SLICE-S4-SCOPE-RLS.md` |
| **S3b** — Company-configurable role labels | 🔒 decisions locked; build **after S4** | labels over fixed role keys. `docs/SLICE-S3b-ROLE-LABELS.md` |
| **Pricing** (own slice) | 📋 backlog — reviewed slice **after S4** | see below |
| **S5** — Promotions module | 📋 backlog | `erp_promotions` + lifecycle |

### Future reviewed slice — Pricing (separate module, independent of customer master)
Owner-requested as its own reviewed slice **after S4**. Pricing is a **standalone
module**, not part of the customer record. Proposed scope (to be designed
review-first when reached, additive on top of the existing `erp_price_lists` /
`erp_price_list_items` / `erp_wholesale_tiers`):

- **Price Lists** + **Price List Items** (per product/UoM).
- **Customer-specific** pricing · **Channel-specific** · **Segment-specific** ·
  **Branch-specific** pricing (keys off S3 master data + S1 geo + branches).
- **Effective dates** (valid_from / valid_to) + **price change history** (audit of
  every change).
- **Promotion pricing** (integrates with S5 promotions).
- **Price priority rules** — deterministic resolution when multiple prices match
  (e.g. customer > segment > channel > branch > list), the core design question.

> Kept deliberately **separate from the customer master**: customers reference
> segment/channel/branch; the pricing engine reads those to resolve a price. This
> slice will get its own design review (model + priority-rule semantics +
> effective-dating + history) → build → verify → PR, after S4.
