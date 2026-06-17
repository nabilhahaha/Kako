# Customer Account Statement — Design (FMCG)

> **Design-first. No code in this doc; no new platform engine.** Everything below
> reuses existing tables, helpers, components, print templates and the Collect-Now
> deep link. Additive and flag-safe.

---

## 1. Goal

A **full customer account statement** (not a flat report): a summary header,
running debit/credit/balance ledger, open invoices, AR aging, print/PDF, and a
**Collect Now** action — with a **role-specific UX** for Salesman, Supervisor and
Company Admin. Built entirely on existing invoices, collections, allocations,
customer balances and the existing aging logic.

## 2. The one data-sourcing rule (critical)

The current customer page (`customers/[id]/page.tsx`) builds the ledger’s credits
from **`erp_payments`** — which is empty for FMCG/van-sales, where payments live
in **`erp_collections` + `erp_collection_allocations`** (this is the same root
cause as the print-receipt bug we just fixed). The Account Statement therefore
sources the ledger from **both**, authoritatively:

| Ledger side | Source | Amount |
|-------------|--------|--------|
| **Debit** (what the customer owes) | `erp_invoices` (status ≠ draft/cancelled) | `net_amount` |
| **Credit** (what they paid) | `erp_collections` (+ allocations for invoice linkage) | `amount` (or `applied_amount` per allocation) | 
| Credit (legacy) | `erp_payments` | `amount` |

Running balance = Σ debits − Σ credits, ordered by date. The closing running
balance must reconcile to `erp_customers.balance` (a built-in self-check we can
surface to admins). Credit notes (returns) appear as credits too
(`/print/credit-note` already exists).

## 3. Server builder (one helper, reused by all roles + print)

A single read-only server function (no new engine — just a query + the existing
aging math):

```
loadCustomerStatement(customerId, { from?, to? }) → {
  customer:  { name, code, phone, credit_limit, balance, payment_terms_days, credit_control_enabled, customer_status },
  summary:   { creditLimit, currentBalance, availableCredit, overdueAmount, openInvoiceCount, oldestInvoiceDays },
  aging:     { current, d30, d60, d90, d90p },              // reuse bucketFor()
  openInvoices: [{ invoice_number, date, due_date, net, paid, outstanding, status, daysOverdue, bucket }],
  ledger:    StatementEntry[] // { date, ref, description, debit, credit }  → running balance in the table
  openingBalance?: number     // when a date range is set (Σ before `from`)
}
```

- **Reuses:** `bucketFor()` / bucket defs from `accounting/aging/page.tsx`;
  `availableCreditFor`, `creditStatusOf`, `overdueDays` from `van-sales/sell.ts`;
  `loadCustomerOutstanding` shape from `collect-server.ts`; `StatementEntry` from
  `components/statement-table.tsx`; `INVOICE_STATUS_LABELS` / method labels from
  `constants.ts`.
- **No writes.** RLS-scoped by the caller’s client (branch isolation is automatic).

## 4. Sections (the statement screen)

1. **Customer summary** — name/code/phone, status badge, and the credit panel we
   already built: **Credit limit · Current balance · Available credit · Overdue
   amount** (+ the 🟢/🟡/🔴/💵 status + reason from `CreditStandingCard`).
2. **Aging buckets** — Current / 1-30 / 31-60 / 61-90 / 90+ (reuse `accounting.aging.*`
   labels and `bucketFor`). Small bar/row, each clickable to filter open invoices.
3. **Open invoices** — number, date, due date, net, paid, **outstanding**, status,
   days overdue. Sorted oldest-first (matches the collect flow).
4. **Running statement (ledger)** — the reusable `StatementTable`
   (date · reference · description · debit · credit · **running balance**), fed by
   §3’s `ledger`. Optional **date-range** filter with **opening balance** carried
   forward.
5. **Actions** — **Print / PDF** and **Collect Now** (see §5–6).

## 5. Print / PDF (reuse, no PDF engine)

- **Reuse** `/print/statement/[id]` (already bilingual, running balance, BrandLogo,
  PrintButton) — **enhanced** to render the full statement: summary + aging + open
  invoices + ledger, fed by the **same** `loadCustomerStatement` builder (so screen
  and print never diverge). Fix its credit source to collections (per §2).
- **PDF = browser “Save as PDF”** from that print route (the existing pattern; no
  new dependency/engine). Optional `?from=&to=` for a period statement.

## 6. Collect Now (reuse the deep link)

The statement’s **Collect Now** button routes to the existing
`/field/van-sales/collect?customer=<id>` (which now auto-loads outstanding). For
desktop accounting users without a van, it routes to `/collections` preselected to
the customer (the Collections workspace). Shown when the user holds `sales.collect`
and the customer has outstanding > 0; on **blocked** customers it is the primary
CTA (consistent with the Van-Sell credit card).

## 7. Role-specific UX

One builder, three entry points / scopes:

| Aspect | **Salesman** (`field.sales`) | **Supervisor** | **Company Admin / Accountant** (`accounting.view`) |
|--------|------------------------------|----------------|-----------------------------------------------------|
| Entry point | From Van-Sell customer card / Collect screen → “Statement”; and a customer row in **Today/route** | Branch AR list / aging → drill into a customer | **Accounting → Aging / Customers** → drill into a customer; or `/customers/[id]` |
| Scope | **His route/branch** customers only (RLS) | **His branch(es)** | **All branches** |
| Layout | **Mobile-first**, single column: summary → aging chips → open invoices → ledger; big **Collect Now** | Mobile/desktop; same data + a **“who’s overdue”** lens (sort by overdue, aging) | **Desktop**, dense; period filter, opening balance, **Export/PDF**, reconciliation check (ledger close vs `balance`) |
| Primary action | **Collect Now**, Print receipt | Monitor + Collect Now (if `sales.collect`) | **Print/PDF statement**, period statements, no field-collect by default |
| Write actions | none (read + collect) | none (read + collect) | none from the statement (credit-limit changes stay in their own approval flow) |

All three render the **same** statement component with role props
(`canCollect`, `scope`, `showPeriodFilter`, `showReconCheck`) — no divergent logic.

## 8. Permissions & routing

- New route (additive): `/customers/[id]/statement` (or a tab on the existing
  customer page). Gate: **`customers.manage` OR `accounting.view` OR `field.sales`**.
  Branch isolation via RLS (salesman/supervisor see only their branch).
- **Collect Now** gated by `sales.collect`. **Print/PDF** available to all who can
  view. No new permission string required (reuse the above).
- Optional feature flag `platform.customer_statement` (default ON for FMCG) only if
  you want a kill-switch; otherwise it’s a plain additive screen.

## 9. Reuse map (nothing new built from scratch)

| Need | Reused asset |
|------|--------------|
| Ledger table + running balance | `src/components/statement-table.tsx` |
| Statement print + PDF | `src/app/(print)/print/statement/[id]/page.tsx` (+ BrandLogo, PrintButton) |
| Aging buckets + math | `src/app/(app)/accounting/aging/page.tsx` (`bucketFor`, bucket labels) |
| Credit summary + status + reason | `CreditStandingCard` / `creditStatusOf` / `availableCreditFor` (van-sales/sell.ts) |
| Outstanding invoices | `loadCustomerOutstanding` (collect-server.ts) |
| Collections + allocations | `erp_collections`, `erp_collection_allocations`, supabase-gateway |
| Collect Now | `/field/van-sales/collect?customer=` · `/collections` |
| Status/method labels | `INVOICE_STATUS_LABELS`, `PAYMENT_METHOD_LABELS` (constants.ts) |
| i18n | `customers.stmt*`, `accounting.aging.*`, `vanSales.collect.*` (+ a few new keys) |

## 10. Build plan (when approved — additive, reversible)

1. `loadCustomerStatement` server builder (read-only; invoices ⊕ collections ⊕
   credit-notes ⊕ legacy payments → summary + aging + openInvoices + ledger).
   Also **repoint the existing customer-statement page** to it (fixes the
   collections-missing gap).
2. `CustomerStatement` component (sections §4) with role props; reuse StatementTable
   + CreditStandingCard.
3. Routes/entry points per role (§7) + the `Collect Now` / `Print/PDF` actions.
4. Enhance `/print/statement/[id]` to the full statement via the same builder.
5. i18n (new keys, ar/en parity); unit-test the pure parts (running balance, aging
   bucketing, available-credit, reconciliation check).
6. Staging validation on the CRDEMO-* customers (Good/Near/Over/Overdue/Cash) — the
   ledger closing balance must equal `erp_customers.balance`.

## 11. Recommendation

Build it as **one read-only statement builder + one component, three role entry
points**, and **fix the existing statement’s credit source to collections** at the
same time (it’s currently under-reporting FMCG payments). This is the highest-value
“light reporting” item from the readiness refresh (B2) and needs **no new engine** —
only reuse of invoices, collections, allocations, aging and the print/Collect-Now
infrastructure already in place.
