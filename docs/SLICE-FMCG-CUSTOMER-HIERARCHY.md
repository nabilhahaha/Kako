# Slice FP-0: FMCG Customer Hierarchy — First-Class Business Entity (Design — Review First)

*VANTORA multi-tenant ERP · grounded in the live schema (migrations 0001–0111) · **design only — do not implement yet**, no merge, no production migrations.*

> Companion to `docs/SLICE-FIELD-PERMISSIONS.md` (the field engine consumes this hierarchy). This doc is the authoritative design for the hierarchy itself.

---

## 1. Goal

Model **Head Office → Branch** as a real FMCG business relationship — the single backbone reused by **AR, credit, pricing, trade spend, rebates, promotions, and approvals** — with **zero regression** for existing tenants (everything additive, nullable, default-off).

**Confirmed decisions carried in:**
- Single-level hierarchy for the pilot; **schema is depth-N ready** (no future redesign).
- `customer_business_type` is an **independent, company-managed lookup** (master-data philosophy — like segment/classification/channel; **not** a hard enum; **kept separate** from segment & channel).
- Company **`credit_model` defaults to `per_branch`** (today's behavior); `shared_head_office` is opt-in.
- Build **structural first (FP-0)**, then **credit + consolidation (FP-0c)** as a separate staging-validated slice.

## 2. Structural model (additive on `erp_customers`)

```
parent_customer_id     uuid references erp_customers(id)    -- branch → its Head Office; null = top-level
customer_account_type  text default 'independent'           -- 'head_office' | 'branch' | 'independent'
business_type_id       uuid references erp_customer_lookups(id)   -- company-managed lookup (new kind)
-- master flags (all nullable / safe defaults):
is_vat_registered        bool
payment_type             text         -- 'cash' | 'credit'
credit_control_enabled   bool default true
customer_status          text default 'active'  -- 'active'|'inactive'|'suspended'|'blocked'
requires_customer_approval bool        -- null = inherit company default
```

**`customer_business_type` lookup:** extend `erp_customer_lookups.kind` CHECK to add `'business_type'` (new migration; the 0103 CHECK is immutable, so a new migration drops/recreates it to include the value). Seed FMCG defaults (company-editable): Retail, Wholesale, HORECA, Key Account, E-Commerce, Distributor.

**Guards (enforced by trigger + app):**
- `parent_customer_id` must reference a **same-company** customer (FK can't express this → trigger check).
- **Single level (pilot):** a `branch` may point only to a `head_office` (or `independent` promoted to HO); a `head_office` has no parent; no cycles. Schema permits deeper nesting — the rule is an app/trigger guard we relax later.
- A customer with children cannot be downgraded to `branch`; a `head_office`/`branch` cannot be deleted while it has children (or reparent first).

**Hierarchy helpers (recursive CTE — depth-1 today, depth-N ready):**
- `erp_customer_ancestors(p_id uuid) returns setof uuid` — self + parents up to root.
- `erp_customer_descendants(p_id uuid) returns setof uuid` — self + all branches.
- `erp_customer_credit_node(p_id uuid) returns uuid` — the node that owns the credit decision (self under `per_branch`; the Head Office under `shared_head_office`).

All `SECURITY DEFINER`, tenant-guarded (operate only within `erp_user_company_id()`), so they’re safe to reuse in RLS-bound queries.

## 3. Credit model — shared vs per-branch (FP-0c)

Company setting: `erp_companies.credit_model text not null default 'per_branch'` (`'per_branch' | 'shared_head_office'`).

| | `per_branch` (default) | `shared_head_office` |
|---|---|---|
| Credit owner | the customer itself | the Head Office node |
| Limit used | `customer.credit_limit` | `head_office.credit_limit` |
| Exposure | customer’s own open AR | **consolidated** open AR over HO + all branches |
| Branch limits | authoritative | informational only (HO governs); per-branch sub-limits = future |

**One resolver** drives all credit holds regardless of policy:
```
erp_customer_available_credit(p_customer uuid) returns numeric
  node      := erp_customer_credit_node(p_customer)
  if not credit_control_enabled(node) -> return NULL  (unlimited / skip check)
  limit     := node.credit_limit
  exposure  := per_branch ? branch_balance(node)
                          : consolidated_balance(node)
  return limit - exposure
```
> **Enforcement vs display:** the credit-hold path computes **true** consolidated exposure via `SECURITY DEFINER` (accurate even when a rep can’t see sibling branches), while **display** of consolidated figures is **permission-gated** (finance/admin/company-wide roles). A scoped salesman still gets a correct credit decision without seeing other branches’ numbers.

## 4. Consolidated vs branch AR / Aging / Balance (FP-0c, read models)

Computed from transactions (invoices/payments) — **no denormalized columns → no drift.** Branch = the single customer; Consolidated = roll-up over `erp_customer_descendants(ho)`.

| Function | Returns |
|---|---|
| `erp_customer_balance(id)` | branch outstanding balance |
| `erp_customer_consolidated_balance(id)` | self + descendants |
| `erp_customer_aging(id)` | buckets 0-30 / 31-60 / 61-90 / 90+ |
| `erp_customer_consolidated_aging(id)` | rolled-up buckets |
| `erp_customer_ar(id)` / `_consolidated_ar(id)` | open-invoice list / totals |

UI: a **Group / Branch toggle** on a Head Office record (read-only); branch records show their own figures. Statements/aging reports gain a "consolidated by key account" option later.

## 5. Pricing inheritance (readiness — not built now)

Existing engine: `erp_price_rules` + `erp_resolve_price(product, customer, branch, qty, date)` (0106), rules targetable by customer.

**Hierarchy integration (drop-in later):** when resolving a price for a **branch**, walk `erp_customer_ancestors` and consider rules on the Head Office. **Precedence (most-specific wins):**
```
branch-specific rule  >  Head-Office rule  >  business-type/segment/channel rule  >  company default
```
FP-0 ships the helpers; the pricing slice extends `erp_resolve_price` to be ancestor-aware. No pricing change in FP-0/FP-0c.

## 6. Trade spend / rebate readiness (readiness — not built now)

Future `erp_trade_spend_agreements` / `erp_rebate_accruals` will key on a **node (typically Head Office)** and **accrue at HO, redeem/visible across branches** using `erp_customer_descendants`. FP-0 guarantees the backbone (hierarchy + consolidated roll-up) exists so these tables plug in without redesign. No trade-spend tables in this slice.

## 7. Approval workflow impact

Existing: customer `approval_status` + company `customers_require_approval` + `erp_customer_change_requests` for sensitive edits (0109).

**Hierarchy interactions:**
- **Effective approval requirement** = `customer.requires_customer_approval ?? company.customers_require_approval` (per-customer override; null inherits).
- **New branch under an approved Head Office:** for the pilot, a branch still follows the effective requirement (HO membership does **not** silently auto-approve branches — safer). "Approve HO ⇒ auto-apply to branches" is a documented **future option**.
- **Sensitive credit change under `shared_head_office`:** the field that matters is the **Head Office** `credit_limit`; its change routes through the existing change-request/approval path. Branch `credit_limit` edits are informational under shared model.
- **Status gating:** `customer_status ∈ {suspended, blocked}` can block new orders (enforced in order entry later); `inactive` hides from pickers. FP-0 stores the field; enforcement is a small follow-up hook.

## 8. RLS / tenant & scope considerations

- All new columns/functions are tenant-scoped (`company_id = erp_user_company_id()`); helpers are `SECURITY DEFINER` but **filter to the caller’s company**.
- Same-company parent guard (trigger).
- Consolidated **display** gated by permission; consolidated **credit enforcement** computed accurately regardless of the viewer’s scope.
- Existing scoped-role RLS on `erp_customers` is unchanged; a Head Office and its branches may sit in different branches/regions and remain individually scoped.

## 9. Migrations plan (additive; staging-validated; production held)

- **FP-0 (structural)** — one migration: add the columns above; extend `erp_customer_lookups.kind` to include `'business_type'` + seed defaults; create `erp_customer_ancestors/descendants/credit_node`; add same-company + single-level guard trigger; backfill `customer_account_type='independent'` for existing rows. **Zero behavior change** until a company sets parents/types.
- **FP-0c (credit + consolidation)** — one migration: add `erp_companies.credit_model`; create balance/aging/AR functions (branch + consolidated) and `erp_customer_available_credit`; (UI/read-only surfacing in app code).

*(Migration numbers assigned at build time on the active branch; both are additive `IF NOT EXISTS`/nullable.)*

## 10. Example FMCG setup (Panda / Lulu style)

```
Panda Retail Co.            account_type=head_office   credit_model=shared_head_office
                            business_type=Key Account  credit_limit=5,000,000  credit_control=on
 ├─ Panda – Riyadh Olaya    account_type=branch  parent=Panda HO  payment_type=credit
 ├─ Panda – Jeddah Tahlia   account_type=branch  parent=Panda HO  payment_type=credit
 └─ Panda – Dammam          account_type=branch  parent=Panda HO  payment_type=credit

LuLu Hypermarket            account_type=head_office   business_type=Key Account ...
 ├─ LuLu – Riyadh
 └─ LuLu – Khobar

Al Baik (single site)       account_type=independent   credit_model n/a (per_branch)  payment_type=cash
```
- **Shared HO credit:** group available = 5,000,000 − (sum of all Panda branch balances). A branch order that would breach the group limit is held even if that branch alone is under limit.
- **Consolidated AR/aging:** Panda HO screen → Group view shows the combined statement; each branch screen shows only its own.
- **Per-branch tenant (default):** Al Baik behaves exactly as today.

## 11. Impact summary

| Area | FP-0 (now) | FP-0c (next) | Later |
|---|---|---|---|
| Head Office / Branch structure | ✅ columns + helpers + guards | — | multi-level |
| Consolidated AR / Aging / Balance | — | ✅ read functions + Group view | consolidated statements/reports |
| Shared vs branch credit | flag stored | ✅ `credit_model` + `available_credit` | per-branch sub-limits |
| Pricing inheritance | helpers ready | — | ancestor-aware `erp_resolve_price` |
| Trade spend / rebates | backbone ready | roll-up ready | accrual/redemption tables |
| Approvals | `requires_customer_approval` override stored | — | HO→branch approval cascade |
| Customer status gating | field stored | — | order-entry block on suspended/blocked |

## 12. Build sub-slices & status

1. **FP-0 — structural + flags + helpers** (this design). *Approved in principle; awaiting review of this expanded doc before coding.*
2. **FP-0c — credit model + consolidation read layer.**
3. Then the field engine: FP-a → FP-b → FP-c (`SLICE-FIELD-PERMISSIONS.md`).

## 13. Decisions — confirmed / open

**Confirmed:** single-level (depth-N ready); business_type = independent company-managed lookup; `credit_model` default `per_branch`; structural-first build; consolidation as computed read models; flags additive/nullable.

**For your confirmation in this review:**
- A. **New branch does NOT auto-approve** from an approved Head Office in the pilot (HO→branch approval cascade deferred). → *Recommend.*
- B. **Shared-model branch `credit_limit` is informational** (HO governs); per-branch sub-limits deferred. → *Recommend.*
- C. **Consolidated figures display = permission-gated**, credit **enforcement** = always accurate via SECURITY DEFINER. → *Recommend.*
- D. **`customer_status` enforcement** (block orders on suspended/blocked) is a **small follow-up hook**, not in FP-0. → *Recommend.*

---

*Design only. Nothing implemented, nothing merged, no production migrations. Production remains on hold pending your review of this expanded FP-0 design.*
