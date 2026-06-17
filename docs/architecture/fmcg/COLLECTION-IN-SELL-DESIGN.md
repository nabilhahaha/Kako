# FMCG — Collection-in-Sell Design (Payment before Invoice Issuance)

> **Status:** DESIGN ONLY — no product code. To be built after pilot UAT is
> complete and the freeze is lifted. The current pilot stays untouched.
> **Scope owner:** Van-Sales (field) primary; POS as a secondary beneficiary.
> **Flag (planned):** `platform.collect_in_sell` (default OFF, reversible).

---

## 1. Goal

Let a van salesman finalize **payment at the same moment** he issues the
invoice, so he leaves the customer with the **invoice number AND the final
payment status** already settled — no separate "go back and collect" step.

Proposed flow:

```
Customer → Products → Review → Payment / Collection → Issue Invoice → Done
```

Today the flow is `Customer → Products → Review → Issue`, and collection is a
**separate** screen (`/field/van-sales/collect`) run later against outstanding
invoices.

---

## 2. Requirements covered

| # | Scenario | Total | Paid | Resulting status |
|---|----------|------:|-----:|------------------|
| 1 | Cash (full) | 1,000 | 1,000 | **Paid** |
| 2 | Full credit | 1,000 | 0 | **Credit** (issued, unpaid) |
| 3 | Partial | 1,000 | 400 | **Partially Paid** |
| 4 | Mixed tenders | 1,000 | 600 (400 cash + 200 card) | **Partially Paid** (or **Paid** if Σ = 1,000) |

Tender types: **Cash, Card, Bank transfer, Cheque** (each tender may carry a
reference / cheque-no / bank ref). **Credit** = zero tenders. **Mixed** =
two-or-more tenders on one invoice.

---

## 3. Current building blocks (reuse, do not reinvent)

| Block | What it does | Reuse |
|-------|--------------|-------|
| `vanSell` RPC (mig 0305) | Issues invoice + decrements van stock atomically; server-authoritative pricing; base-unit invariant; U2 UoM snapshot | Wrap, don't replace |
| `erp_settle_collection` RPC | Records ONE collection, allocates across invoices (`p_method`, `p_reference`, `p_specified`, idempotent) | Multi-tender = call pattern / new wrapper |
| `erp_collections` / `erp_collection_allocations` | Collection header + per-invoice allocation rows | Unchanged schema |
| `loadCustomerOutstanding` | Customer open invoices oldest-first | Reused for AR preview |
| Permission `sales.collect` | Gates recording payments | Gates the new Payment step |
| `EVENT.PAYMENT_RECEIVED` | Domain event on collection | Emitted per tender |

**Key constraint:** `erp_settle_collection` takes a **single** `p_method` per
call. True mixed-tender-in-one-atomic-transaction therefore needs a new RPC (see
§6).

---

## 4. Workflow (target)

### 4.1 Step machine

```
customer ─▶ products ─▶ review ─▶ payment ─▶ (issue) ─▶ done
                           ▲          │
                           └──back────┘
```

- **Payment** is a NEW step inserted between Review and the terminal Issue.
- Entering Payment requires a **priced preview** (already produced by
  `previewVanSale` at Review), so the Net total is known before any tender.
- **Issue** becomes "issue invoice **+ apply tenders**" as ONE atomic unit.

### 4.2 Payment step logic

1. Show **Net total** (from the Review preview).
2. Rep adds 0..N **tenders**. Each tender = `{ method, amount, reference? }`.
3. Running totals: `Paid = Σ tender.amount`, `Remaining = Net − Paid`.
4. Quick actions: **"Pay full in cash"** (one tap → single cash tender = Net),
   **"Credit / pay later"** (zero tenders), **"Split"** (add tender rows).
5. Guardrails:
   - `Paid ≤ Net` (no overpayment in-sell; change/credit-on-account is a later
     enhancement, explicitly out of scope here).
   - Each tender `amount > 0`.
   - Cheque/transfer tenders **require a reference** (configurable).
6. **Live status chip** computes the would-be invoice status (Paid / Partially
   Paid / Credit) and the **new AR balance** (§5) BEFORE issuing.

### 4.3 Issue (atomic)

On confirm:

1. `erp_van_sell_with_payment(...)` (new RPC, §6):
   - Issues the invoice (same body as `vanSell`).
   - For each tender, writes a collection + allocation **against the just-created
     invoice** (specified allocation, not oldest-first).
   - Recomputes `invoices.paid_amount` and sets status:
     `paid_amount = 0 → issued (Credit)`,
     `0 < paid_amount < net → partially_paid`,
     `paid_amount = net → paid`.
   - All in **one transaction**; on any failure nothing commits (no orphan
     invoice, no orphan collection).
2. Idempotency: one `idempotency_key` per sale attempt (reuse the existing
   `saleKey` seam) covering BOTH the sale and its tenders, so a retry never
   double-issues or double-pays.
3. Emits `INVOICE_ISSUED` + one `PAYMENT_RECEIVED` per tender.

---

## 5. AR calculations (before issuance)

Let:

- `Net` = invoice net (from priced preview).
- `Bal₀` = customer balance before this sale.
- `Paid` = Σ tenders.

Then:

```
Invoice outstanding  = Net − Paid
New customer balance = Bal₀ + Net − Paid      (= Bal₀ + invoice outstanding)
Status               = Paid == 0      → Credit (issued)
                       Paid >= Net    → Paid
                       else           → Partially Paid
```

Worked examples (Bal₀ = 0):

| Net | Tenders | Paid | Outstanding | New balance | Status |
|----:|---------|-----:|------------:|------------:|--------|
| 1,000 | cash 1,000 | 1,000 | 0 | 0 | Paid |
| 1,000 | — | 0 | 1,000 | 1,000 | Credit |
| 1,000 | cash 400 | 400 | 600 | 600 | Partially Paid |
| 1,000 | cash 400 + card 200 | 600 | 400 | 400 | Partially Paid |

The preview is **display-only**; the server recomputes authoritatively on issue
(never trust client math). Credit-limit check (`Bal₀ + outstanding ≤ limit`) runs
server-side at issue, exactly as `vanSell` does today.

---

## 6. Data model & RPC

**No schema change to `erp_collections` / `erp_collection_allocations`.** Mixed
tender = **N collection rows** (one per method), each allocated to the new
invoice. This keeps every existing report, statement, and reconciliation query
working unchanged (a collection still has exactly one method).

New atomic RPC (planned):

```
erp_van_sell_with_payment(
  p_branch_id, p_customer_id, p_lines jsonb,
  p_tenders jsonb,          -- [{method, amount, reference}]
  p_idempotency_key text
) returns (invoice_id, invoice_number, net_amount, paid_amount, status)
```

- Internally calls the **existing** sell body, then loops tenders inserting
  collection+allocation against the new invoice, then sets status. `SECURITY
  DEFINER`, `FOR UPDATE` on the customer/van rows, fully idempotent — same
  hardening profile as `erp_van_sell` / `erp_settle_collection`.
- **Zero tenders** ⇒ behaves identically to today's `vanSell` (Credit).
- Migration is **additive**; the legacy `vanSell` + separate `collect` path stays
  intact and is the fallback when the flag is OFF.

---

## 7. UI mockups (mobile-first)

### 7.1 Stepper

```
[Customer ✓] › [Products ✓] › [Review ✓] › [Payment •] › Issue
```

### 7.2 Payment step

```
┌─────────────────────────────────────────┐
│ Net total                     1,000.00   │
├─────────────────────────────────────────┤
│  [ Pay full · Cash ]   [ Credit (later) ]│
│                                           │
│  Tenders                          + Add   │
│  ┌─────────────────────────────────────┐ │
│  │ Cash      400.00              [🗑]   │ │
│  │ Card      200.00   ref ····   [🗑]   │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  Paid                            600.00   │
│  Remaining                       400.00   │
│  Status                  ● Partially Paid │
│  New balance (AR)                400.00   │
└─────────────────────────────────────────┘
  ┌── sticky bar (above bottom-nav) ──────┐
  │ [ ◀ Back ]      [ Issue Invoice ▶ ]   │
  └───────────────────────────────────────┘
```

- **Add tender** opens a small sheet: method (Cash/Card/Bank transfer/Cheque) +
  amount + reference (required for Cheque/Transfer).
- Sticky action bar follows the **fixed `bottom-14` above bottom-nav** rule
  (already applied to Sell/Journey) so the Issue button is never hidden.
- Status chip + New balance update live as tenders change.

### 7.3 Done (receipt)

Receipt already shows totals; add a **Payment status** line + **paid / remaining**
and per-tender breakdown, then the existing Print / Share / New Sale actions.

---

## 8. Permission model

| Action | Permission | Notes |
|--------|-----------|-------|
| Sell (issue invoice) | `field.sales` | unchanged |
| Take payment in the sell flow | `sales.collect` | same permission as the standalone Collect screen |
| Credit (zero tender) sale | `field.sales` only | a rep without `sales.collect` can still sell on credit; the Payment step then **only** offers "Credit / pay later" (tender entry hidden) |
| Discount within sell | existing discount-cap rule | unchanged |

So `field.sales` + `sales.collect` = full in-sell collection; `field.sales`
alone = sell-on-credit only. No new permission is introduced. Salesman keeps **no
master-data** permissions (consistent with the pilot rule).

---

## 9. Mobile UX principles

- One-tap happy paths (**Pay full cash**, **Credit**) cover the 80% case; Split
  is progressive disclosure.
- Numeric `inputMode="decimal"`, large tap targets, sticky primary action above
  the tab bar.
- Offline: payment capture is **online-only at first** (mirrors today's
  `previewVanSale`/`vanSell` online requirement) — a queued/offline tender is a
  later phase, explicitly out of scope.
- RTL/AR + EN parity for all new strings (`vanSales.pay.*`).

---

## 10. Accounting impact

- Each tender → a collection posting (cash/bank/card/cheque clearing) exactly as
  the standalone Collect screen does today; **no new GL semantics** — we reuse
  the proven posting path, just triggered at issue time.
- Invoice `paid_amount` / status set from real allocations (not a flag), so AR
  aging, customer statements, and the trial balance stay correct.
- Cheque/transfer land in their existing **undeposited/clearing** treatment;
  settlement/deposit is unchanged downstream.
- Cash tenders flow to the rep's **van/shift cash** position identically to a
  standalone collection (same `erp_collections` rows) — so day-end
  reconciliation already accounts for them with **no change**.

## 11. Reporting impact

- **Positive:** "collected-at-sale" becomes measurable — same-visit cash
  conversion, credit-issued vs paid mix, tender-method split per route/rep.
- **Neutral/safe:** because mixed tender = N standard collection rows, all
  existing reports (collections by method, AR aging, van reconciliation,
  statements) keep working unchanged.
- New optional reports (post-build): **Sale-time payment rate**, **Tender mix by
  route**, **Credit exposure created per day**.

---

## 12. Rollback strategy

1. **Flag OFF** (`platform.collect_in_sell` = false) → sell flow reverts to
   Review→Issue; the standalone Collect screen remains the collection path.
   Instant, no deploy.
2. The new `erp_van_sell_with_payment` RPC is **additive**; dropping it does not
   touch `erp_van_sell`, `erp_settle_collection`, or any table.
3. No schema migration to reverse (no new columns/tables). Data already written
   (collections+allocations) stays valid because it uses the existing model.
4. Net: rollback = one switch; worst case = drop one function.

---

## 13. Comparison — Separate vs In-Sell collection

| Dimension | (A) Separate Collection (today) | (B) Collection inside Sell (proposed) |
|-----------|-------------------------------|---------------------------------------|
| Steps to "customer settled" | 2 visits/screens (sell, then collect) | 1 continuous flow |
| Risk of unpaid-but-forgotten | Higher (collect is a separate action) | Lower (payment is in the issue path) |
| Multi-invoice collection (pay off old debt) | **Strong** — designed for it (oldest-first / specify) | Not its job (it pays the new invoice) |
| Mixed tender | One method per collection today | Supported via N collections, atomic |
| Cognitive load on rep | Two mental models | One linear model |
| Cash-at-sale visibility | Indirect | Direct |
| Build cost | 0 (exists) | New RPC + Payment step (flagged) |

### Recommendation

**Make (B) Collection-inside-Sell the DEFAULT FMCG selling experience**, and
**keep (A) the standalone Collect screen** for what it's uniquely good at:
collecting against **previously issued / older** invoices (debt recovery,
multi-invoice settlement, payments on a day the rep isn't selling).

They are complementary:
- **In-Sell payment** = settle *this* invoice now (the 80% field case).
- **Standalone Collect** = settle *outstanding* invoices later (debt recovery).

Default the Sell flow to include the Payment step (flag ON for FMCG tenants once
validated); never remove the standalone Collect screen.

---

## 14. Build plan (when freeze lifts)

1. `platform.collect_in_sell` flag (additive).
2. `erp_van_sell_with_payment` RPC + staging validation (invariants: stock
   conservation, AR consistency, idempotency, no overpayment, tenant isolation).
3. `previewVanSale` already gives Net; add tender state + AR preview to
   `sell-screen` Payment step (flag-gated; OFF = current Review→Issue).
4. i18n `vanSales.pay.*` (ar/en parity).
5. Receipt: payment status + tender breakdown.
6. E2E across the 4 scenarios + mixed tender; reconciliation regression.
7. Pilot readiness note + rollback rehearsal.

**Not started. No code until UAT completes and the freeze is lifted.**
