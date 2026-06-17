# FMCG Sales-Entry Point Review — inventory, classification, recommendations

> **Review only. Nothing removed or hidden.** This establishes the **Van Sales
> workspace as the canonical FMCG salesman experience** and lays out a safe,
> reversible path to one obvious selling flow for the pilot:
> **Customer → Statement → Collect → Sell → Invoice → Print.**

---

## 1. Inventory of all sales-entry points (classified)

| Route | Classification | Gating (perm · module · flag) |
|-------|----------------|-------------------------------|
| `/field/van-sales` (hub) | **Field Sales (Van Sales) — CANONICAL** | `field.sales` · `van_sales` · Van Sales active |
| `/field/van-sales/sell` | **Field Sales** | `field.sales` · `van_sales` · active |
| `/field/van-sales/collect` | **Field Sales** | `field.sales` · `van_sales` · active |
| `/field/van-sales/return` | **Field Sales** | `field.sales` · `van_sales` · active |
| `/field/van-sales/statement/[id]` | **Field Sales** (new) | `field.sales` · `van_sales` · active |
| `/field/van-sales/readiness · /reports · /confirm · /warehouse · /request` | **Field Sales** (support) | `field.sales` / supervisor · `van_sales` |
| `/sales/invoices` | **Back Office Invoicing** | `sales.sell` \| `sales.collect` · `sales` |
| `/sales/orders` | **Back Office Invoicing** | `sales.sell` · `sales_orders` |
| `/sales/returns` | **Back Office Invoicing** | `sales.return` · `returns` |
| `/collections` | **Back Office Invoicing** | `sales.collect` · `sales` |
| `/customers/[id]` (statement) | **Back Office Invoicing** | customers nav · RLS |
| `/accounting/aging` | **Back Office Invoicing** | `accounting` · RLS |
| `/sales/settlement` · `/distribution/credit-requests` | **Back Office Invoicing** | `field.sales`/`reports.view` · `credit.request.*` |
| `/sales/pos` (Quick Sale) | **POS / Quick Sale** | `sales.sell` · `pos` |
| `/pharmacy/pos` | **POS / Quick Sale** (vertical) | `sales.sell`\|`sales.collect` · `pharmacy` |
| `/market/pos` | **POS / Quick Sale** (vertical) | `market.pos` · `market` |
| `/fashion/sell` | **POS / Quick Sale** (vertical) | `fashion.sell` · `fashion` |
| `/wholesale/order` | **Back Office** (vertical) | `wholesale.pricing` · `wholesale` |
| `/restaurant/orders` · `/salon/tickets` · `/laundry/orders` · `/clinic/visits` | **Vertical POS/Order** | vertical perms · vertical module |
| Print: `/print/receipt · /print/invoices · /print/statement · /print/collection · /print/credit-note` | **Shared output** (used by all) | auth · RLS |

**Legacy / Duplicate (for an FMCG van-sales tenant only):** `/sales/invoices`,
`/sales/pos`, `/sales/orders`, `/collections`, `/customers/[id]` are **not legacy
globally** (back-office and other verticals need them) but are **redundant for the
FMCG salesman** because the Van Sales workspace already covers sell, collect,
statement, invoice and print. They should be **hidden by role for field reps**, not
deleted.

---

## 2. Duplicated workflows (FMCG salesman)

| Job | Canonical (Van Sales) | Duplicate(s) the salesman can currently reach |
|-----|------------------------|-----------------------------------------------|
| Create a sale | `/field/van-sales/sell` | `/sales/invoices` (editor), `/sales/pos` (Quick Sale), `/sales/orders` |
| Collect cash | `/field/van-sales/collect` | `/collections` |
| Customer statement | `/field/van-sales/statement/[id]` | `/customers/[id]` |
| Returns | `/field/van-sales/return` | `/sales/returns` |

**Root cause (verified on the pilot):** the **salesman role holds `sales.sell` and
`customers.manage`** (both role-default and company-override). Those two
permissions light up the entire **back-office Sales section** (Quick Sale, Sales
Orders, Invoices, Collections) **and** the **Customers master-data** section in the
sidebar — so the rep sees three ways to sell and a master-data editor, on top of
the Van Sales workspace. This also contradicts the standing guardrail *"do not give
the salesman master-data permissions."*

---

## 3. Redundant menu entries (sidebar) for the FMCG salesman

Visible today because of `sales.sell` + `customers.manage`:

- **Sales** section: Quick Sale, Sales Orders, Invoices, Collections, Sales Returns.
- **Customers** master-data (create/edit) section.

All are duplicated by the Van Sales workspace + the field statement/collect. The
bottom-nav already collapses the **Sell** tab to Van-Sell (good) — but the
**sidebar / command palette** still expose the back-office equivalents.

---

## 4. What can be hidden — by role, entitlement, or flag (reversible)

Ordered by precision (most targeted first); **all reversible, none destructive:**

1. **By role permission (recommended, highest impact):** tighten the **salesman**
   role for the pilot to **`field.sales` + `sales.collect` (+ `customers.view` for
   statements)** and **remove `sales.sell` and `customers.manage`.**
   - Effect: the back-office **Sales** and **Customers-master** sidebar sections
     disappear for the rep; the Van Sales workspace (and the Sell bottom-tab, gated
     by `field.sales`) remains. Selling still works (van-sell uses `field.sales`).
   - Reversible: re-add the permissions. Scope: company-override row for the pilot
     only — other tenants unaffected.
2. **By entitlement (module):** if the pilot doesn't need them, disable the
   `pos` and `sales_orders` modules for the tenant → Quick Sale + Sales Orders nav
   vanish for everyone in the company (not just the rep). Keep `sales` (needed for
   back-office invoices/collections by the accountant/admin).
3. **By feature flag / nav rule (optional, broader):** introduce a tenant flag
   (e.g. `fmcg.field_primary`) that, when on for `van_sales` tenants, suppresses the
   generic **Sales** sidebar section **for field roles** while leaving it for
   office roles. This is the most "product-ized" option but the largest change;
   role-permission tightening (#1) achieves the pilot goal today with no code.

**Office roles keep everything:** Accountant / Company Admin retain `/sales/*`,
`/collections`, `/customers`, `/accounting/aging` — Back Office Invoicing is a
legitimate, separate experience, not a duplicate for them.

---

## 5. Recommended FMCG salesman role model (keep / remove)

The pilot salesman holds **18 permissions** today. Recommended posture so the rep
operates **exclusively** through the Van Sales workspace:

### 5.1 KEEP — field workspace (15)

| Permission | Why it stays |
|------------|--------------|
| `field.sales` | Van-Sell (core selling path) |
| `sales.collect` | Collections + in-sell payment |
| `day.close` | Close the field day |
| `reconciliation.view` | Van reconciliation / settlement |
| `stock_request.create` | Request a van load |
| `stock.transfer` | Van load / return transfers |
| `stock.view`, `inventory.view` | See van stock (read-only) |
| `product.search` | Find products while selling |
| `pricing.view` | See prices (read-only) |
| `target.view`, `report.aggregate.view` | Own targets & performance (read-only) |
| `field.attach_media` | Visit photos |
| `change_requests.create` | Request a customer GPS/data change → **approval** |
| `credit.request.create` | Request a credit-limit change → **approval** |

> Note: the rep changes **nothing** in master data directly — `change_requests.*`
> and `credit.request.*` only **submit requests** that a supervisor/admin approves.

### 5.2 REMOVE — back-office / master-data (3)

| Permission | Effect of removing | Breaks the field flow? |
|------------|--------------------|------------------------|
| `sales.sell` | Hides **Quick Sale, Invoices, Sales Orders** (back-office selling) + the generic Sell fallback tab | **No** — Van-Sell is gated by `field.sales` |
| `customers.manage` | Hides **Customers master-data** (create/edit) + the generic Customers tab | **No** — Van-Sell / Collect / Statement load customers by branch (RLS), no perm needed |
| `customer.create` | No master-data customer creation | **No** — see option below |

> **Decision point — new outlets on the route:** if reps must onboard new customers
> in the field, do **not** restore `customer.create` (full master-data). Instead
> enable a **lightweight quick-create** (`platform.quick_customer_create`) that
> writes a minimal record **pending approval** — a separate, controlled path, not
> master-data maintenance. Default recommendation: **remove**, add quick-create only
> if the pilot needs it.

### 5.3 Menus / screens hidden by this role change (rep only)

- **Sales** sidebar section: Quick Sale, Sales Orders, Invoices, Collections (back
  office), Sales Returns (back office).
- **Customers** master-data section + the generic **Customers** bottom-tab.
- **POS / Quick Sale**.
- The **generic invoice-entry editor** (`/sales/invoices`).
- Command-palette entries for the above (they inherit nav visibility).

All of these **remain fully available to Accountant / Company Admin** — Back Office
Invoicing is their legitimate workspace, untouched.

### 5.4 What remains available — via the Van Sales workspace

The complete field flow, unchanged:

```
Customer → Statement → Collect → Sell → Invoice → Print
 (pick)   (/field/van-sales/statement)
                       (/field/van-sales/collect)
                                     (/field/van-sales/sell → issue)
                                                     (/print/receipt + /print/invoices)
```

Plus, all within the canonical workspace: **returns** (`/field/van-sales/return`),
**My Day** hub (route, visits, load, settlement), **reconciliation**, **credit
status + Collect Now**, and **credit/data change requests** (submitted for
approval).

### 5.5 Mechanism (reversible, pilot-scoped)

Delete the three rows (`sales.sell`, `customers.manage`, `customer.create`) from
**`erp_company_role_permissions`** for *(pilot company `612af0bd…`, role
`salesman`)*. This is **company-scoped** — the role-default template
(`erp_role_permissions`) and every other tenant are untouched — and **reversible**
(re-insert the rows). No code or schema change required.

---

## 6. Target FMCG navigation structure

**Principle:** Van Sales is the **canonical salesman workspace**; every future FMCG
enhancement extends it rather than adding a parallel sales flow.

**Salesman (field role) — one workspace, one obvious path:**

```
Bottom nav:  [ Today ] [ Sell ] [ Customers ] [ Inventory ] [ More ]
                 │         │          │
                 │         │          └─ customer → Statement → Collect → Sell
                 │         └─ Van-Sell (Customer → Products → Review → Payment → Issue → Print)
                 └─ My Day hub: route, visits, load, settlement

Van Sales workspace (/field/van-sales) links, in flow order:
  Customer  →  Statement  →  Collect  →  Sell  →  Invoice  →  Print
  (pick)       (/statement) (/collect)  (/sell)  (issued)    (receipt + invoice)
```

- The **canonical flow already exists end-to-end** (sell, collect, statement,
  credit status, Collect-Now, invoice issue, invoice print, receipt print). The
  only gap is **navigation cohesion**: surface Statement + Collect on the Van Sales
  hub and from the customer context, so the rep never needs the back-office menus.
- **Back office (Accountant/Admin)** keeps a separate **Sales / AR** section:
  Invoices, Sales Orders, Collections, Customers, Aging, Credit Requests, Returns.
- **Other verticals** (Fashion/Pharmacy/Market/Restaurant/…) are **unaffected** —
  their POS/order screens stay gated by their own module + business type.

**Recommended sidebar grouping for the pilot:**

| Group | Salesman (field) | Accountant / Admin |
|-------|------------------|--------------------|
| **Van Sales** (canonical) | Sell · Collect · Returns · Statement · My Day · Settlement | (visible, read/oversight) |
| **Sales / AR** (back office) | hidden (no `sales.sell`) | Invoices · Orders · Collections · Returns · Aging · Credit Requests |
| **Customers** | Statement only (`customers.view`) | full master-data (`customers.manage`) |
| POS / Quick Sale | hidden (no `pos`/perm) | optional |

---

## 7. Recommended next steps (in order; each safe + reversible)

1. **Tighten the pilot salesman role** → `field.sales` + `sales.collect` +
   `customers.view`; remove `sales.sell` + `customers.manage` (company-override
   only). Re-test that Van-Sell, Collect, Statement still work and the back-office
   Sales/Customers sections disappear for the rep.
2. **Add Statement + Collect entries to the Van Sales hub** (`/field/van-sales`)
   and a customer-context drilldown, so the canonical flow is reachable without the
   sidebar. (Small, additive UI — extends the canonical workspace.)
3. **Decide POS/Sales-Orders entitlement** for the pilot: disable `pos` +
   `sales_orders` modules if unused (hides Quick Sale + Orders company-wide).
4. **(Optional, later)** productize the `fmcg.field_primary` nav flag so this is a
   one-switch posture for any FMCG van-sales tenant, not a per-pilot role edit.
5. **Only after sign-off**, consider deprecating truly unused generic screens —
   but nothing is deleted now.

**Net:** for the FMCG pilot salesman, the result is a **single canonical Van Sales
workspace** delivering Customer → Statement → Collect → Sell → Invoice → Print,
with the duplicate back-office and Quick-Sale entries hidden by role/entitlement —
all reversible, with no impact on other tenants or verticals.
