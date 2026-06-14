# Collection-in-Sell — Phase 1 (Build + Validation)

> **Status:** BUILT · server-validated on staging · flag-gated (default OFF).
> Enabled for the **VANTORA Pilot FMCG (DEMO)** tenant only for UAT.
> Additive & reversible — `erp_van_sell`, `erp_settle_collection` and the
> standalone Collect screen are untouched.

---

## 1. Architecture summary

**Flow:** `Customer → Products → Review → Payment → Issue Invoice` (the Payment
step appears only when the flag is ON; otherwise the flow is the original
`Review → Issue`).

**Feature flag:** `platform.collect_in_sell` (platform pack, domain `pos`).
Default OFF (no template seeds it). `collectInSellEnabled(flags)` gates the server
action, the page, and the UI step.

**Atomic RPC:** `erp_van_sell_with_payment(p_branch_id, p_customer_id, p_lines,
p_tenders, p_idempotency_key, p_due_date, p_notes)` (migration `0306`). A faithful
superset of `erp_van_sell` (auth, branch, idempotency, customer, van, discount
cap, UoM, stock guard, invoice + issue) plus:

- **Tenders** (`p_tenders` = `[{method, amount, reference}]`) are posted as
  **standard `erp_collections` rows** (one per method) allocated to the new
  invoice via `erp_collection_allocations` — the **exact existing posting model**,
  so every report/statement/reconciliation keeps working unchanged.
- **Order of operations (key design point):** tenders are applied **before**
  `erp_issue_invoice`, lowering the customer balance first, so issue's own credit
  check evaluates the **true post-payment exposure** `(balance − paid) + net =
  balance + unpaid` — not the full net. Then the invoice status is set to
  `paid` / `partially_paid` from the real `paid_amount` (issue forces `issued`).
- **Idempotent** via the invoice `idempotency_key`: a repeat returns the existing
  invoice + its current `paid_amount`/`status` without re-issuing or re-charging.
- **Returns** `invoice_id, invoice_number, net_amount, paid_amount, status`.

**Tender methods** are the DB-canonical `erp_collections.method` codes:
`cash`, `credit_card` (Card), `bank_transfer`, `check` (Cheque). Cheque/transfer
require a reference.

**Credit control (server-enforced; salesman cannot override — Phase 1):**

| Rule | Logic |
|------|-------|
| No overpayment | Σ tenders ≤ net (`payment_exceeds_total`) |
| Cash-only (limit = 0) | any unpaid remainder ⇒ `over_credit` (must be fully paid) |
| Credit limit (limit > 0) | `unpaid ≤ available = credit_limit − balance`; else `over_credit` |
| Credit days / overdue | credit control on + terms set + oldest unpaid invoice age > `payment_terms_days` ⇒ `customer_overdue_blocked` for any unpaid remainder; a fully-paid (cash) sale is still allowed |

**Credit status badge (customer selection + Payment step):** `Good`,
`Near credit limit` (available < 10% of limit — **warning only, non-blocking**),
`Over credit limit`, `Overdue`, `Cash only`. The Payment step shows credit limit,
current balance, available credit, oldest unpaid date, overdue days, allowed
credit days, remaining invoice balance, live status chip + new AR balance, and a
blocking warning (“Customer is blocked for credit sales. Collection only.”) that
disables **Issue Invoice** while any remaining balance would breach control.

**Permissions:** `field.sales` to sell; `sales.collect` to enter tenders (a rep
without it gets a credit-only Payment step). No new permission introduced; no
master-data grants. A supervisor override is explicitly **out of Phase-1 scope**.

**Files:**
`supabase/migrations/0306_van_sell_with_payment.sql` ·
`src/lib/erp/feature-catalog.ts` · `src/lib/van-sales/sell.ts` (pure payment +
credit core) · `src/lib/van-sales/sell-server.ts` (`vanSellWithPayment`) ·
`src/app/(app)/field/van-sales/sell/{page,sell-screen}.tsx` ·
`src/lib/i18n/messages/{van-sales,features}.ts` · tests in
`src/lib/van-sales/sell.test.ts`.

---

## 2. Staging validation report

Project `rsjvgehvastmawzwnqcs` (staging). All RPC scenarios run as the pilot
salesman inside **rolled-back transactions** (no pilot data changed). Unit base
price: 1 unit = **79.80** net (70.00 + 14% VAT); 2 units = **159.60**.

### Payment scenarios

| Scenario | Tenders | Result |
|----------|---------|--------|
| Full cash (1u) | cash 79.80 | ✅ `paid`, paid 79.80 |
| Full credit (2u) | — | ✅ `issued`, paid 0 |
| Partial (2u) | cash 60 | ✅ `partially_paid`, paid 60 |
| Mixed (2u) | cash 100 + card 59.60 | ✅ `paid`, paid 159.60 |

### Credit-control matrix (19/19 PASS)

| Scenario | Full Cash | Full Credit | Partial |
|----------|-----------|-------------|---------|
| **A · Good** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **B · Near limit** (avail < 10%) | ✅ Allowed | ✅ Allowed | ✅ Allowed (warning only) |
| **C · Over limit** (balance ≥ limit) | ✅ Allowed | ⛔ Blocked `over_credit` | ⛔ Blocked `over_credit` |
| **D · Overdue** (age > terms) | ✅ Allowed | ⛔ Blocked `customer_overdue_blocked` | ⛔ Blocked `customer_overdue_blocked` |
| **E · Cash-only** (limit 0) | ✅ Allowed | ⛔ Blocked `over_credit` | ⛔ Blocked `over_credit` |

**F · Mixed tender** (remaining still validated):

| Combo | Result |
|-------|--------|
| cash + credit (good customer) | ✅ Allowed `partially_paid` |
| cash + transfer + credit (good) | ✅ Allowed `partially_paid` |
| cash + card + credit (good) | ✅ Allowed `partially_paid` |
| mixed where remaining > available | ⛔ Blocked `over_credit` |

### Invariants (partial sale, 2u cash 60, + idempotent replay)

| Check | Expected | Got |
|-------|----------|-----|
| net / paid / status | 159.60 / 60 / partially_paid | ✅ |
| stock decrement (base units) | 2 | ✅ 2 (no double-decrement on replay) |
| customer AR balance delta | +99.60 (net − paid) | ✅ 99.60 |
| collection allocation rows | 1 | ✅ 1 |
| invoices for idempotency key | 1 | ✅ 1 |
| idempotent replay → same invoice | true | ✅ true |

### Real-world edge case — limit 5,000 · balance 4,900 · invoice 1,000

Available credit = 5,000 − 4,900 = **100**. Status = **Near credit limit**
(100 < 10% of 5,000 = 500). Net forced to exactly 1,000 (price 1,000, tax 0).

| Test | Remaining | Expected | Result |
|------|-----------|----------|--------|
| 1. Full credit (paid 0) | 1,000 > 100 | Blocked | ⛔ `over_credit` |
| 2a. Partial 900 | 100 = avail 100 | Allowed | ✅ `partially_paid`; **final AR = 5,000** |
| 2b. Partial 500 | 500 > 100 | Blocked | ⛔ `over_credit` |
| 3. Full cash 1,000 | 0 | Allowed | ✅ `paid`; **final AR = 4,900** (unchanged) |

Confirms: available-credit calc (100), near-limit warning, credit-limit blocking
(remaining must be ≤ available), and the final AR balance (prior + net − paid).

**Pure-core unit tests:** 1385 passed (incl. payment math, credit-limit examples
1–4, overdue/credit-days, near-limit, status classification). `tsc` clean,
`build` green.

Bugs found & fixed during validation: (1) a non-matching idempotency
`SELECT…INTO` nulled `v_paid` → reset before the tender loop; (2) `erp_issue_invoice`
re-checked the full net → tenders now applied before issue; (3) tender method
codes aligned to the `erp_collections.method` CHECK constraint
(`credit_card`/`check`).

---

## 3. UAT guide (per role)

Enabled on the pilot tenant; host = current preview / staging. Demo password
`test.123`.

**Salesman** (`field.sales` + `sales.collect`):
1. Bottom-nav **Sell** → pick a customer; note the **credit status badge**.
2. Add products + units; **Review**; tap **Payment**.
3. Try each: **Pay full · Cash** → status *Paid*; **Credit (pay later)** → *Credit*;
   a partial cash amount → *Partially paid*; **Add payment** twice for a mixed
   tender (cash + card / transfer / cheque — reference required for the last two).
4. Confirm the live **status chip**, **remaining**, **new balance**, and the
   credit panel (limit / outstanding / available / oldest unpaid / overdue days).
5. On an **over-limit / overdue / cash-only** customer, confirm a remaining
   balance disables **Issue Invoice** with the “Collection only” warning, while a
   **full-cash** sale still issues.
6. Issue → receipt shows the status badge + paid amount; Print / Share / New sale.

**Supervisor:** review the issued invoices + collections in the day’s activity;
confirm blocked-credit customers were not sold to on credit; confirm the standalone
**Collect** screen still works for debt recovery on those customers.

**Accountant:** verify AR — invoice `paid_amount`/status, the per-tender
`erp_collections` rows (method + reference), allocations against the invoice, and
that the customer balance moved by exactly `net − paid`. Confirm cash vs
card/transfer/cheque land in their existing treatments and reconciliation is
unaffected.

**Company Admin:** toggle `platform.collect_in_sell` in Company Settings →
Features and confirm the Payment step appears/disappears accordingly (the rest of
the sell flow is unchanged when OFF).

**Acceptance:** every matrix cell behaves as in §2; AR/stock invariants hold;
standalone Collect remains available for blocked customers.

---

## 4. Rollback procedure

All rollbacks are instant and non-destructive (no schema change, no data
transform):

1. **Per tenant (fastest):** Company Settings → Features → turn
   **Collect-in-Sell** OFF, or:
   `update erp_feature_flags set enabled=false where company_id=:co and feature_key='platform.collect_in_sell';`
   The sell flow reverts to `Review → Issue`; the standalone Collect screen stays.
2. **Platform-wide:** leave the flag unset for all tenants (default OFF) — nothing
   calls the new RPC.
3. **Remove the engine (optional):** `DROP FUNCTION public.erp_van_sell_with_payment(uuid,uuid,jsonb,jsonb,uuid,date,text);`
   No table/column changes to reverse. Invoices and collections already written by
   it remain valid (they use the standard model).
4. **Code revert:** the UI Payment step, server action, and pure helpers are all
   additive; reverting the commit restores the prior behaviour with no migration
   down-step required.

**Out of Phase-1 scope (future):** supervisor credit-override approval workflow,
on-account overpayment/change, offline tender capture.
