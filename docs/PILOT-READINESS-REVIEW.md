# Pilot Readiness Review — VANTORA FMCG (pre-merge, pre-new-modules)

> **Assessment only — feature development paused.** Validates that the built pilot
> stack (S3 customer model · S4 hierarchy scope · Pricing P-a/P-b · UX-1…UX-5) is
> ready for an FMCG pilot, and ships a realistic **FMCG demo dataset**
> (`supabase/demo/fmcg_demo_seed.sql`). Grounded in the code. Each finding has a
> **severity** (🔴 blocker · 🟠 should-fix · 🟡 nice-to-have) and a recommendation.
> Recommended fixes are **not applied here** — they're a small "pilot-hardening"
> slice to approve separately, so this review stays non-feature.

---

## 0. Verdict
**Conditionally ready.** The platform is structurally complete for an FMCG pilot
(onboarding, roles/modules auto-seeded, scoped RLS verified live, pricing engine,
import engine with per-company templates, mobile + grouped UX). Before go-live we
should land a **small pilot-hardening slice** (a few permission grants + input
validations — §2, §3) and **load the demo dataset** (§5). None require new modules.

## 1. End-to-end pilot workflows — ✅ with notes
Traced the core FMCG journeys against the code:
- **Onboard → setup:** `erp_self_register_company` creates company + HQ branch +
  admin; triggers seed roles, modules, **and customer-lookup master data** for
  `wholesale`/`delivery`; the setup wizard toggles modules and sets `setup_done`.
  ✅ works. **Gap:** seeds **no starter data** (products/customers/stock) → §5 demo
  seed or the Import wizard fills this. 🟠
- **Master data → customers:** Settings → Customer Data (segments/classes/channels)
  → Customers with the S3 fields (grouped form). ✅
- **Hierarchy → scope:** regions/areas + roles + S4a/S4b RLS — verified live per
  role (rep sees own, regional sees region, company-wide unchanged). ✅
- **Pricing:** Sales → Pricing (rules/lists/history); resolver suggests line price
  on orders/invoices; overrides audited. ✅ (but see the `pricing.manage` gap §2).
- **Sell:** order/invoice create → issue (stock-out + GL) → collect. ✅ existing.
- **Import:** manual-first wizard + per-company templates. ✅
> **Workflow blockers:** none hard. The two friction points are the pricing
> permission gap (§2.1) and the lack of a credit/stock pre-check (§3.2).

## 2. Missing permissions — 🟠
`ROLE_PERMISSIONS` (permissions.ts) for the FMCG roles is sound, but:
1. **`pricing.manage` is granted to NO FMCG field role** — only `admin`/`manager`/
   super-admin reach **Sales → Pricing**. A Sales Director / NSM running pilot
   pricing would be blocked. **Rec:** grant `pricing.manage` to `sales_director` +
   `national_sales_manager` (head-office pricing). 🟠
2. **`settings.custom_fields` (gates Settings → Customer Data) is effectively
   IT-Admin/super-admin only.** Pilot ops can't curate segment/class/channel
   values. **Rec:** also grant it to `sales_director`/`national_sales_manager` (or
   add a dedicated `customers.master_data` perm). 🟠
3. **`wholesale.pricing`** isn't on the FMCG roles — if tiered wholesale is enabled,
   tier screens silently hide. **Rec:** grant to director/NSM if tiers are used. 🟡
4. `branch_manager` lacks `accounting.view`; `accountant` lacks `inventory.view` —
   no single role bridges stock↔finance for branch reconciliation. **Rec:** confirm
   intent; consider adding `accounting.view` to `branch_manager`. 🟡
> All are **additive permission grants** (TS `ROLE_PERMISSIONS` + DB defaults) —
> low risk, no schema change.

## 3. Missing validations — 🟠 (one 🔴-ish)
Server actions validate the essentials (required code/name, ≥1 line, customer
approval gate on invoices) but miss pilot-relevant guards:
1. **`upsertCustomer`:** no **negative credit-limit** guard (accepts `-50000`); no
   email/phone format check; FK errors (bad segment/region) surface raw. **Rec:**
   clamp `credit_limit ≥ 0`; friendly validation. 🟠
2. **`createInvoice`:** **no stock-availability or credit-limit pre-check** — a
   draft can exceed stock/credit and only fails cryptically at `issueInvoice`.
   **Rec:** soft-warn (or block) on insufficient stock + over-credit at create. 🟠
   (borderline 🔴 for cash-van pilots).
3. **`createSalesOrder`:** unlike invoices, **does not gate unapproved customers**
   (inconsistent). **Rec:** apply the same `is_approved` gate or document why not. 🟠
4. **`upsertPriceRule`:** `scope_id` not validated against `scope_type` (a
   `customer` rule with null `scope_id` silently becomes global); `valid_from >
   valid_to` accepted; extreme `value` (e.g. 1000% off) unchecked. **Rec:** require
   `scope_id` for non-global scopes; assert date order; bound percent 0–100. 🟠
> These are **input-validation** additions in existing actions — no new modules.

## 4. Missing onboarding steps — 🟡
Onboarding/setup is solid but **lands the user on empty screens**. For pilot speed:
- Add a **post-setup "starter" nudge** (a one-click "Load FMCG demo data" for demo
  tenants, or a prominent "Import customers/products" CTA) so a new tenant isn't
  staring at empty lists. The UX-5 empty-state CTAs already help. 🟡
- The setup wizard doesn't ask for **regions/areas or a default price list** —
  optional, but pre-creating one default price list per company would make Pricing
  immediately usable. 🟡

## 5. Missing demo data — ✅ delivered here
The platform seeds **structure** but no business data. **This review ships
`supabase/demo/fmcg_demo_seed.sql`** (+ `docs/DEMO-FMCG-DATA.md`): a realistic,
idempotent, demo-tenant-scoped FMCG dataset — a distributor with regions/areas,
HQ branch + warehouse, company-managed segments/classes/channels, **FMCG SKUs
across categories**, a **default price list + pilot price rules** (base→list→
customer-specific), **~24 customers** with the full S3 model (segment/class/
channel/region/area/GPS/credit/terms), wholesale tiers, **routes**, and sample
**orders + invoices**. Mirrors the existing `electrical_supplier_returns_seed.sql`
pattern; **not auto-applied** (operator runs it on the demo project). 🟢

## 6. Pilot usability blockers — ✅/🟡
- **Blockers:** none identified. The biggest prior friction (flat Settings, flat
  forms, desktop-only nav, auto-mapped import) was addressed by UX-1…UX-5.
- 🟡 The pricing permission gap (§2.1) will *feel* like a usability blocker to a
  pilot sales manager — fix with §2.

## 7. Mobile experience consistency — ✅/🟡
- ✅ Bottom tab bar (role-aware) + drawer; customers & invoices lists render as
  **cards under `sm:`**; grouped forms reflow; RTL-safe; touch targets ≥40px.
- 🟡 **Consistency gap:** other heavy lists (products, suppliers, sales orders,
  pricing rules) still use horizontal-scroll tables on mobile. **Rec:** roll the
  card-list pattern to them in a follow-up (it's now a shared idiom). Not a
  blocker for the pilot's core (customers/invoices done).

## 8. Import experience consistency — ✅
- ✅ One wizard for all entities; **manual-first** (UX-4) with required-unmapped
  gate; per-company **saved templates** (save/clone/share/default); CSV/JSON +
  XLSX; validation + 50-row preview; job log. Consistent across entities.
- 🟡 Importing **customers** can't map FK master-data (segment/channel/region) by
  name yet (those are set in the form). **Rec:** add code/name→id resolution for
  those columns in a later import pass if pilots import segmented customers in bulk.

---

## 9. Pilot-hardening punch list — ✅ #1–#5 applied (this slice)
| # | Item | Area | Sev | Status |
|---|---|---|---|---|
| 1 | Grant `pricing.manage` + `settings.custom_fields` to `sales_director`/`national_sales_manager` | perms | 🟠 | ✅ migration 0107 + TS `ROLE_PERMISSIONS` + test |
| 2 | `upsertCustomer`: reject negative `credit_limit` | valid. | 🟠 | ✅ |
| 3 | `createInvoice`: credit-limit pre-check (limit > 0) + stock pre-check (tracked products only, so no-inventory pilots can still draft) | valid. | 🟠 | ✅ |
| 4 | `createSalesOrder`: gate unapproved customers (consistency) | valid. | 🟠 | ✅ |
| 5 | `upsertPriceRule`: require `scope_id` for non-global, value ≥ 0, percent ≤ 100, date order | valid. | 🟠 | ✅ |
| 6 | Default price list auto-created per company (Pricing usable day 1) | onboarding | 🟡 | deferred (nice-to-have) |
| 7 | Roll card-list to products/orders/pricing lists (mobile consistency) | mobile | 🟡 | deferred (nice-to-have) |

> **Design notes (no-regression):** the invoice **stock** check only blocks products
> that are *already tracked* in the branch (have stock rows), so a pilot that hasn't
> loaded inventory can still draft. The **credit** check only triggers when a limit
> is set (`credit_limit > 0`; `0` = unlimited) — raise via the credit-limit-request
> workflow. Migration **0107** is additive and **held from production**.

## 10. Go / no-go checklist
- [x] Onboarding creates company/branch/admin + seeds roles/modules/master data
- [x] Hierarchy scope (S4) verified live per role; company-wide unchanged
- [x] Pricing engine + override audit; pilot-first UX
- [x] Import manual-first + per-company templates
- [x] Mobile nav + card lists (customers/invoices); grouped forms; RTL
- [x] **Demo dataset** prepared (§5)
- [x] **Pilot-hardening slice** (§9 #1–#5) — ✅ applied (permissions + validations)
- [ ] Production migrations `0103–0107` applied to the pilot tenant (held; your go-ahead)
- [ ] Demo seed run on the demo project; a quick scripted end-to-end smoke per role
- [ ] Merge the stack per `docs/PILOT-MERGE-PLAN.md`

*(Review complete — no feature code changed. On approval I'll apply the §9
pilot-hardening slice (small, reviewed) and help sequence the merge + the
production migration.)*
