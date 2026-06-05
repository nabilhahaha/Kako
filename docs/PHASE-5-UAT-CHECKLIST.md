# Phase 5 — UAT Checklist
### Inventory Foundation + Opening Balances (Operational Readiness)

**App:** kako-fmcg · **Branch:** `claude/clinic-project-continuation-PqxGD` · **Migration:** `0163`
**Environment:** _____________  **Tester:** _____________  **Date:** _____________
**Build verified:** `tsc` ✅ · `next build` ✅ · `vitest` 694 ✅

---

## 0. Pre-conditions (do once before testing)

| # | Setup | Done |
|---|---|---|
| 0.1 | Log in as a user whose role holds `inventory.view`, `inventory.count`, `customers.manage`, `suppliers.manage`, `fashion.installments` (owner/manager). | [ ] |
| 0.2 | Company has at least **1 branch**, **1 warehouse**, **3 active products** with non-zero `cost_price`. | [ ] |
| 0.3 | At least **2 customers** and **2 suppliers** exist (active). | [ ] |
| 0.4 | Language toggle works (ar / en) — statements are Arabic-first. | [ ] |
| 0.5 | Note the **large-adjustment threshold**: default **1000** (value = \|qty\| × cost_price). Set via `erp_ops_settings.large_adjustment_value` if a custom value is needed. | [ ] |
| 0.6 | Each write action should produce a row in **Audit Log** (`/platform/audit` or company audit). Spot-check after key steps. | [ ] |

> **Reversibility rule:** every adjustment / opening balance / migrated contract has a **Reverse** action. No test below requires a destructive delete.

---

## 1. Inventory Count (opening / monthly / spot)

**Navigation:** Sidebar → **Inventory** → **الجرد / Stock Count** → `/inventory/count`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 1.1 | Page loads with a **Warehouse** selector, a new **Count type** selector (Opening / Monthly / Spot), and a list of past counts. | — | All three count-type options visible; default = **Monthly**. | [ ] |
| 1.2 | Start an **Opening** count. | Warehouse = Main, Type = **Opening** | New draft count created with a count number; editor opens with one line per active product (system qty snapshot, counted qty = system). | [ ] |
| 1.3 | Enter counted quantities and **Save**. | Product A: system 100 → counted **95**; Product B: system 50 → counted **50** | Draft saved; counted values persist on reload. | [ ] |
| 1.4 | **Finalize** the count. | (from 1.3) | Status → **Completed**; a variance **adjustment** stock movement of **−5** is posted for Product A; Product B (no variance) gets none. On-hand for A becomes **95**. | [ ] |
| 1.5 | Start a **Monthly** count, then a **Spot** count. | Type = Monthly; Type = Spot | Both created with correct type; appear in the list with their type. | [ ] |
| 1.6 | Cancel a draft count. | Any draft | Status → **Cancelled**; no movements posted. | [ ] |
| 1.7 | (Audit) After finalize, an audit/movement trail exists. | — | Variance movement visible in **Movement History** (§3) labeled *Adjustment*. | [ ] |

---

## 2. Stock Adjustments (audit trail + manager approval + reversal)

**Navigation:** Sidebar → **Inventory** → **تسويات المخزون / Stock Adjustments** → `/inventory/adjustments`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 2.1 | Page loads with a new-adjustment form (Warehouse, Product, Qty, Reason) + adjustments list. | — | Form + list render; mobile layout stacks cleanly. | [ ] |
| 2.2 | **Small** adjustment (below threshold) posts immediately. | Product (cost 4.50), Qty **+10** → value 45 < 1000, Reason "received extra" | Toast "Adjustment posted"; row status = **Posted**; on-hand increases by 10. | [ ] |
| 2.3 | Value preview updates live. | Change Qty to 20 | Preview shows value = 90 (20 × 4.50). | [ ] |
| 2.4 | **Large** adjustment (≥ threshold) is queued, **not** posted. | Product (cost 4.50), Qty **+300** → value 1350 ≥ 1000 | Toast "awaiting manager approval"; row status = **Pending**; **on-hand unchanged**. | [ ] |
| 2.5 | **Approve** the pending adjustment. | (from 2.4) | Status → **Posted**; on-hand now increases by 300; approver/time recorded. | [ ] |
| 2.6 | **Reject** a pending adjustment. | New large adj: Qty +500 → Reject | Status → **Rejected**; on-hand unchanged; no movement. | [ ] |
| 2.7 | **Reverse** a posted adjustment. | Reverse the 2.2 adjustment (+10) | Confirm dialog → Status → **Reversed**; a compensating **−10** movement posts; on-hand returns to pre-adjustment value. | [ ] |
| 2.8 | Negative (shortage) adjustment. | Qty **−7**, Reason "damaged" | Posts (if below threshold); on-hand decreases by 7; qty shown in red. | [ ] |
| 2.9 | Validation. | Qty = 0 / blank | Error toast; nothing posted. | [ ] |
| 2.10 | (Audit) Each action logged. | — | Audit log shows `stock_adjustment.posted/requested/approved/rejected/reversed`. | [ ] |

---

## 3. Movement History

**Navigation:** Sidebar → **Inventory** → **حركة المخزون / Stock Movements** → `/inventory/movements`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 3.1 | Ledger loads, newest first (up to 300). | — | Table: Date, Type (badge), Product, Warehouse, Qty (±), Note. | [ ] |
| 3.2 | Movements from §1 and §2 appear. | — | Variance adjustment (−5), posted adjustments (+10/+300/−7), reversal (−10) all listed with correct type label. | [ ] |
| 3.3 | Movement type labels localize. | Toggle ar/en | Types translate (Adjustment / تسوية, Opening balance / رصيد افتتاحي, etc.). | [ ] |
| 3.4 | Sign coloring. | — | Positive qty green, negative red. | [ ] |
| 3.5 | Empty/access state. | Warehouse with no movements / no permission | Shows "No movements." or is not in nav for unauthorized roles. | [ ] |

---

## 4. Variance Report

**Navigation:** Sidebar → **Inventory** → **تقرير الفروقات / Variance Report** → `/inventory/variance`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 4.1 | Report lists **completed** counts that have variances. | (uses §1 count) | The Opening count from §1 appears with count number + type badge + warehouse + date. | [ ] |
| 4.2 | Per-line variance is correct. | Product A: system 100, counted 95 | Row shows System 100, Counted 95, Diff **−5**, Value = −5 × cost. | [ ] |
| 4.3 | Count-level total variance value. | — | Header shows total variance value (red if negative). | [ ] |
| 4.4 | Counts with **no** variance are excluded. | A count where counted = system everywhere | Not shown in the report. | [ ] |
| 4.5 | Empty state. | No completed counts with variance | Shows "No variances." | [ ] |

---

## 5. Customer Opening Balances

**Navigation:** Sidebar → **Customers** → click a customer → `/customers/[id]` → **Opening Balance** card

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 5.1 | Opening Balance card visible (requires `customers.manage`). | — | Card with Type (Previous debt / Customer credit / Opening installment), Amount, As-of, Note. | [ ] |
| 5.2 | Add a **debit** (previous debt). | Type = Previous debt, Amount **500**, As-of today, Note "migration" | Toast saved; customer **balance increases by 500**; appears under "Current opening balances". | [ ] |
| 5.3 | **Replace** (not stack) same type. | Re-enter Previous debt = **700** | Prior 500 reversed + new 700 applied → net balance reflects **700**, not 1200. Only one active debit row. | [ ] |
| 5.4 | Add a **credit** (advance). | Type = Customer credit, Amount **200** | Customer balance **decreases by 200**. | [ ] |
| 5.5 | Add **opening installment** (informational). | Type = Opening installment, Amount **1000** | Recorded, but **does not** change the AR running balance (real schedule comes from §7). | [ ] |
| 5.6 | **Reverse** an opening balance. | Reverse the 700 debit | Confirm → status Reversed; balance drops by 700. | [ ] |
| 5.7 | Validation. | Amount blank / negative | Error; nothing saved. | [ ] |
| 5.8 | Opening balance flows into the statement (§8). | — | A "Opening balance / رصيد افتتاحي" row appears in the customer statement. | [ ] |
| 5.9 | (Permission) Non-manager role. | Login as sales rep without `customers.manage` | Card hidden; statement still viewable. | [ ] |

---

## 6. Supplier Opening Balances

**Navigation:** Sidebar → **Purchasing** → **Suppliers** → click a supplier → `/suppliers/[id]` → **Opening Balance** card

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 6.1 | Opening Balance card visible (requires `suppliers.manage`). | — | Card with Type (Previous payable / Advance to supplier), Amount, As-of, Note. | [ ] |
| 6.2 | Add a **credit** (previous payable — we owe). | Type = Previous payable, Amount **800** | Supplier **balance increases by 800** (payable). | [ ] |
| 6.3 | **Replace** same type. | Re-enter Previous payable = **1000** | Net payable reflects **1000**, not 1800 (replace-not-stack). | [ ] |
| 6.4 | Add a **debit** (advance to supplier). | Type = Advance, Amount **150** | Supplier balance **decreases by 150**. | [ ] |
| 6.5 | **Reverse** an opening balance. | Reverse the 1000 credit | Confirm → status Reversed; payable drops by 1000. | [ ] |
| 6.6 | Opening balance flows into the supplier statement (§9). | — | "Opening balance" row appears; raises payable in the running balance. | [ ] |

---

## 7. Existing Installments Migration

**Navigation:** Sidebar → **Fashion** → **ترحيل الأقساط / Installment Migration** → `/fashion/installments/migrate`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 7.1 | Page loads with Customer, Branch, Total, Remaining, Remaining count, Frequency, First due, Reference, Contract date. | — | Form renders; migrated-contracts list below. | [ ] |
| 7.2 | Migrate a contract. | Customer = (any), Branch = Main, Total **1500**, Remaining **1200**, Count **6**, Freq Monthly, First due = next month, Ref "OLD-1" | Toast "Contract migrated (6 installments)"; customer **balance +1200**. | [ ] |
| 7.3 | Schedule is built correctly. | (from 7.2) | 6 schedule rows, monthly due dates from first-due, amounts summing to **1200** (last row absorbs rounding). | [ ] |
| 7.4 | Migrated plan visible in **Installments board** (`/fashion/installments`). | — | New active plan appears with the remaining schedule. | [ ] |
| 7.5 | **Print installment statement.** | Click Print on the migrated row → `/print/installment/[id]` | Printable statement: customer, reference, contract date, total/financed/remaining, per-installment seq/due/amount/paid/remaining/status, totals. Browser **Print → Save as PDF** works. | [ ] |
| 7.6 | **Reverse** a migrated contract (no payments yet). | Reverse 7.2 | Confirm → plan **Cancelled**; customer balance −1200. | [ ] |
| 7.7 | Reverse blocked after collection. | Record an installment payment, then try Reverse | Error: cannot reverse after a payment was collected. | [ ] |
| 7.8 | Validation. | Remaining = 0 / Count = 0 | Error; nothing created. | [ ] |

---

## 8. Customer Statement (opening · sales · collections · installments · returns · current)

**Navigation:**
- In-app: **Customers** → customer → `/customers/[id]`
- Print/PDF: **طباعة كشف الحساب** button → `/print/statement/[id]`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 8.1 | Statement shows all activity types. | Customer with: opening debit 500, 1 invoice, 1 collection, 1 installment payment, 1 sales return | Rows present for **Opening balance, Sales invoice, Collection, Installment collection, Sales return**, sorted by date. | [ ] |
| 8.2 | Debit/credit columns correct. | — | Opening debit & invoice → **Debit**; collection, installment, return → **Credit**. Running balance = Σ(debit − credit). | [ ] |
| 8.3 | Current balance summary. | — | "Current balance" card = authoritative `erp_customers.balance`. | [ ] |
| 8.4 | Print version matches. | Open `/print/statement/[id]` | Same rows incl. opening/returns/installments; company header; **Print → PDF** works. | [ ] |
| 8.5 | WhatsApp reminder (if balance > 0). | — | Reminder button appears (pre-existing). | [ ] |
| 8.6 | Empty customer. | New customer, no activity | "No movements" / empty statement; no crash. | [ ] |

---

## 9. Supplier Statement (purchases · payments · returns · outstanding · aging)

**Navigation:**
- In-app: **Suppliers** → supplier → `/suppliers/[id]`
- Print/PDF: **طباعة / PDF** button → `/print/supplier-statement/[id]`

| # | Test scenario | Sample data | Expected result | P/F |
|---|---|---|---|---|
| 9.1 | Statement shows all activity. | Supplier with: opening credit 800, 1 received PO, 1 payment, 1 purchase return | Rows for **Opening balance, Goods receipt (purchase), Payment, Purchase return**, sorted by date. | [ ] |
| 9.2 | Sign convention. | — | Opening credit & received PO → **Debit** (raises payable); payment & purchase return → **Credit**. | [ ] |
| 9.3 | Outstanding summary. | — | Balance card = `erp_suppliers.balance` (payable). | [ ] |
| 9.4 | **Aging buckets** (FIFO). | Old PO (>90d) partially paid | 0–30 / 31–60 / 61–90 / 90+ buckets sum to the outstanding; oldest-unpaid lands in the right bucket; 90+ flagged. | [ ] |
| 9.5 | **Print/PDF.** | Open `/print/supplier-statement/[id]` | Printable supplier statement with company header, all rows, running balance; **Print → PDF** works. | [ ] |
| 9.6 | Empty supplier. | New supplier | Empty statement; aging all zero; no crash. | [ ] |

---

## 10. Cross-cutting checks

| # | Check | Expected | P/F |
|---|---|---|---|
| 10.1 | **Mobile** (≤ 390px). | All §1–§9 forms/tables usable; tables scroll horizontally; no overflow. | [ ] |
| 10.2 | **RTL/LTR.** | Arabic RTL correct; numbers/dates stay `dir="ltr"`. | [ ] |
| 10.3 | **Tenant isolation.** | Logged into Company A cannot see Company B's adjustments/opening balances/contracts. | [ ] |
| 10.4 | **No FMCG regression.** | Trade-spend / field-sales modules unchanged and working. | [ ] |
| 10.5 | **Audit completeness.** | Every post/approve/reject/reverse/opening/migration produced an audit row. | [ ] |
| 10.6 | **Idempotent/no-data-loss.** | Re-running migration 0163 (if redeployed) does not error or duplicate. | [ ] |

---

### Sign-off

| Result | Count |
|---|---|
| Total test cases | 60 |
| Passed | ____ |
| Failed | ____ |
| Blocked | ____ |

**Overall Phase 5 UAT:** ☐ PASS ☐ FAIL
**Tester signature:** _____________ **Date:** _____________
**Notes / defects raised:** ____________________________________________
