# Slice S4b — Transactional Scope + Write-Scope — Design + Build

> **Owner decisions locked (B1 + all recommended) — built (migration 0105).**
> Company-wide roles keep today's branch-scope (B1, zero change); reps/supervisors
> narrow to their customers' transactions; write-scope (`WITH CHECK`) added on
> customers/routes; table set = invoices/orders/returns/payments/visits; branch
> managers stay branch-level. **S4 is now complete (S4a + S4b).**

> Completes S4: extends the S4a customer
> scope to **transactional** rows (invoices / orders / returns / payments / visits)
> for the scoped FMCG roles, and adds **write-scope** (`WITH CHECK`) on customers /
> routes (deferred from S4a). Reuses the S4a resolver. RLS-enforced; regression
> safety on the existing branch-scoped commercial layer is the central concern.

---

## 1. Grounding — how transactional RLS works **today** (important)
Unlike `erp_customers` (company-wide until S4a), the **commercial tables are
already BRANCH-scoped** for everyone:
- `erp_invoices`, `erp_sales_orders`, `erp_visits`, `erp_payments`,
  `erp_sales_returns` → `USING (branch_id = ANY(erp_user_branch_ids()))`
  (0005/0014). A user sees rows only for **branches they're assigned to** in
  `erp_user_branches` — no role/customer distinction.
- So a salesman in branch X already sees **all** of branch X's invoices (not just
  their own customers'); an admin assigned only to branch X sees only X.

**Implication:** S4b is not "add scope to unscoped tables" — it's "**narrow** the
existing branch scope for reps/supervisors to their customers, and decide whether
company-wide roles should be **broadened** beyond their assigned branches." Both
are behavior changes that must be deliberate.

## 2. Reusable building block
S4a's `erp_customer_in_scope(branch_id, region_id, area_id, salesman_id,
route_id)` + `erp_user_is_company_wide()` already encode the rule. For a
transactional row we resolve via its `customer_id`:
`erp_customer_id_in_scope(p_customer_id uuid)` → look up the customer's
branch/region/area/salesman/route and delegate to `erp_customer_in_scope(...)`.
One new SECURITY-DEFINER STABLE function; everything else reuses S4a.

## 3. Proposed design (per decision)
**A. Read scope on transactional tables.** Replace each
`USING (branch_id = ANY(erp_user_branch_ids()))` with:
```
USING ( erp_is_platform_owner()
        OR ( company_id_or_branch_company = erp_user_company_id()
             AND ( erp_user_is_company_wide()        -- see option B
                   OR erp_customer_id_in_scope(customer_id) ) ) )
```
Net effect: **scoped roles** (rep/supervisor/area/regional/branch) see only their
customers' transactions; **company-wide roles** keep broad visibility (option B
decides exactly how broad).

**B. Company-wide roles on transactional tables — the key decision.** Today they
are **branch-limited** (`erp_user_branch_ids()`). Two options:
- **B1 (keep, recommended):** company-wide roles stay **branch-scoped exactly as
  today** (no behavior change) — i.e. `erp_user_is_company_wide() AND branch_id =
  ANY(erp_user_branch_ids())`. Only reps/supervisors get *narrowed*. **Zero
  change for admin/finance/etc.**; lowest risk.
- **B2 (broaden):** company-wide roles (esp. Finance/admin) see **all company
  branches'** transactions (consistent with S4a customers). More intuitive but a
  **behavior change** for existing tenants (they'd suddenly see other branches).

**C. Write-scope (`WITH CHECK`) on `erp_customers` / `erp_routes`.** S4a left writes
company-only. Proposed: scoped roles may INSERT/UPDATE only **in-scope** rows —
e.g. a rep can create a customer **only if they self-assign** (`salesman_id =
auth.uid()`) and cannot reassign it to another rep. Company-wide roles unchanged.
*(Recommended, but it changes create/edit flows for reps — confirm.)*

**D. Tables in scope for S4b.** Recommend the customer-linked commercial set:
`erp_invoices`, `erp_sales_orders`, `erp_sales_returns`, `erp_payments`,
`erp_visits`. **Line tables** (`erp_invoice_lines`, …) inherit via their parent's
policy (no direct `customer_id`) — unchanged. Inventory/accounting/journal tables
**out of scope** (not customer-partitioned).

## 4. Risk & verification
- Honest risk: this rewires the **money tables'** RLS. Must be rolled-back-live
  verified per role AND assert **no company-wide role loses rows** (B1) — e.g.
  Finance sees exactly what they see today.
- Resolver stays STABLE/SECURITY DEFINER; `customer_id`/`branch_id` are indexed.
- `tsc`/unit/integration (extend `customer-scope.test.ts` with an invoice-scope
  case per role) + `next build`. Migration held from production.

## 5. Decisions to confirm (S4b)
1. **Company-wide breadth (B)** — **B1 keep current branch-scope for company-wide
   roles** (recommended, zero change) or **B2 broaden** to all company branches?
2. **Reps/supervisors narrowing** — narrow their transactional view to **their
   customers** (recommended), or leave transactional at branch level and only
   scope customers (S4a)? *(Recommended: narrow.)*
3. **Write-scope (C)** — enforce in-scope `WITH CHECK` on customers/routes now
   (rep self-assign on create; no cross-rep reassignment)? *(Recommended.)*
4. **Table set (D)** — confirm invoices/orders/returns/payments/visits; lines
   inherit; inventory/accounting excluded. *(Recommended.)*
5. **Branch managers on transactions** — keep at **branch level** (their branch's
   transactions, as today) rather than customer-level? *(Recommended: branch
   level — they own the branch.)*

*(S4b design — paused for your §5 decisions, especially #1 and #3. On approval I
build it on the S4a resolver → tsc/test/integration/build → rolled-back-live
verify per role (incl. "company-wide loses nothing") → draft PR → approval,
holding the migration from production. Then the **Pricing** design review.)*
