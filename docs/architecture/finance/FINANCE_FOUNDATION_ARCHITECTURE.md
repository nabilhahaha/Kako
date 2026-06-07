# VANTORA — Finance Foundation Architecture (Proposal)

**Status:** Architecture only — **no code, no migrations, no implementation
branches.** Architecture review first.
**Goal:** a **generic, industry-neutral double-entry finance foundation** that
serves distribution, retail, manufacturing, clinics, pharmacies, services and
future verticals — one ledger, one posting engine, reused everywhere.
**Discipline (same as Workflow/Search):** *reuse over rebuild; additive; flag-gated;
multi-tenant + permission model preserved; one engine, zero duplicate logic.*

> **Key context — this is NOT greenfield.** A working double-entry core already
> exists on `main`: `erp_chart_of_accounts`, `erp_journal_entries` /
> `erp_journal_lines`, `erp_account_map` (posting map), `erp_fiscal_periods`,
> `erp_cost_centers`, plus `erp_payments`/`erp_supplier_payments`/
> `erp_payment_vouchers`/`erp_expenses` and `accounting.view/post/export`. This
> proposal **formalizes and generalizes** that foundation and fills three gaps
> (multi-currency, a generalized tax engine, a first-class posting-rule engine),
> rather than building a second ledger.

---

## 1. Chart of Accounts (COA)

**Exists:** `erp_chart_of_accounts` (id, code, name/name_ar, **account_type**,
**parent_id**, is_group, is_system, branch_id, balance, is_active) — a hierarchical
COA with system accounts.
**Formalize / extend:**
- **Account classes** standardized to the 5 roots (Asset, Liability, Equity,
  Income, Expense) with a normal-balance rule per class (drives debit/credit
  validation and reporting sign).
- **Industry-neutral seed COA** + per-vertical overlay packs (e.g., clinic vs
  distribution) layered on the same structure — no schema fork.
- **Currency** field per account (functional by default; see §4); `balance` becomes
  a derived/cached figure, the journal is the source of truth.
- **Tenant scoping** standardized (see §9): company-level COA with optional
  branch scoping, not branch-only.

---

## 2. Fiscal Periods

**Exists:** `erp_fiscal_periods` (name, start_date, end_date, **status**, branch_id).
**Formalize:**
- **Fiscal year → periods** hierarchy (year + 12/13 periods), with status lifecycle
  **open → closed → locked** (and a soft "adjusting period" for year-end).
- **Period guard:** posting is rejected into a closed/locked period; reopening is an
  **approval point** (Workflow §10).
- **Period close** = a Workflow process: validation (unbalanced/unposted checks) →
  approval → lock → roll-forward of balances. Year-end close zeroes P&L into
  retained earnings.

---

## 3. Cost Centers

**Exists:** `erp_cost_centers` (code, name, branch_id) + `journal_lines.cost_center_id`.
**Formalize:**
- **Dimensional accounting:** cost center as the first analytic dimension on every
  journal line; design leaves room for additional dimensions (project, branch,
  campaign) as optional line tags — without new line columns per dimension
  (a `dimensions jsonb` or a dimension-tag table).
- Cost-center hierarchy (parent) + allocation rules (future, Budgeting-adjacent).

---

## 4. Multi-currency support (GAP — design)

Not present today. Design:
- **Three currency layers:** *transaction currency* (document), *functional
  currency* (company books), *presentation currency* (reporting). V1 of the
  foundation: transaction + functional.
- `currency` + `exchange_rate` on **journal entries** (and source documents);
  journal **lines store both transaction and functional amounts**; the GL balances
  in functional currency.
- **Exchange-rate table** (currency pair, date, rate, source) + a rate-resolution
  rule (document date / posting date).
- **FX gain/loss** auto-posting on settlement and **period-end revaluation** of
  monetary accounts (an approval point). Rounding accounts for sub-unit drift.
- Industry-neutral: single-currency tenants simply use one currency (rate = 1).

---

## 5. Tax Engine (generalize)

Today: per-document `tax_amount`/`tax_rate` + Egyptian **ETA** fields on invoices.
Design a **generic tax engine**:
- **Tax codes** (rate, type: VAT/GST/sales/withholding, jurisdiction, inclusive vs
  exclusive, recoverable flag, effective dates) — per company, industry-neutral.
- **Tax determination rule:** (entity tax profile × item/account × jurisdiction) →
  tax code(s); supports multiple taxes per line and **withholding**.
- **Tax accounts** mapped via posting rules (output/input/withholding payable).
- **Compliance adapters** (e.g., ETA e-invoicing) plug in as **connectors behind
  the egress allow-list** (reuse Workflow egress governance) — the core tax engine
  stays neutral.
- Returns/credit notes reverse tax symmetrically.

---

## 6. Journal Engine

**Exists:** `erp_journal_entries` (entry_number, entry_date, description,
**reference_type/reference_id**, fiscal_period_id, **status**, created_by/posted_by/
posted_at) + `erp_journal_lines` (account_id, **debit**, **credit**, cost_center_id).
**Formalize the engine guarantees:**
- **Balanced-entry invariant:** Σdebit = Σcredit (functional) enforced at post; an
  entry cannot post otherwise.
- **Immutability after post:** posted entries are never edited — corrections are
  **reversing entries** (audit-grade); status lifecycle draft → posted → (reversed).
- **Idempotent posting** keyed by `(reference_type, reference_id, rule)` so a source
  document posts **exactly once** (mirrors the Workflow effect-idempotency pattern).
- **Period + currency guards** applied at post (see §2, §4).
- **Entry numbering** per company/fiscal-year sequence.

---

## 7. Posting Rules

**Exists (seed):** `erp_account_map (company_id, account_key, account_code)` — a
semantic-key → account mapping.
**Formalize into a posting-rule engine** (the heart of "generic"):
- A **posting rule** = (source event/document type + condition) → a template of
  debit/credit lines, each line resolving its account via `account_key` →
  `account_map` (per-company override of an industry-neutral default), with
  cost-center/tax/currency derivation.
- Rules are **data, not code** (a rules table + the resolver), so a new industry or
  document type is configured, not coded — exactly the Workflow "one engine,
  registry of rules" discipline.
- The **resolver** is pure + unit-testable; the **poster** writes balanced journal
  entries idempotently (§6).

---

## 8. Integration with Sales, Purchases, Inventory, Returns, Expenses

The integration seam is the **event bus** (reuse — see §10), not point-to-point code:

| Source | Domain event(s) | Posting (via rules) |
|---|---|---|
| **Sales** | `invoice.issued`, `payment.received` | AR / Revenue / Output-tax; cash/bank on receipt |
| **Purchases** | purchase-invoice, `supplier.payment` | Inventory/Expense / AP / Input-tax; bank on payment |
| **Inventory** | `stock_transfer.completed`, adjustments, COGS on sale | Inventory / COGS / variance accounts (perpetual) |
| **Returns** | `return.approved` | symmetric reversal of sale/purchase + tax |
| **Expenses** | `erp_expenses` lifecycle | Expense / cash/bank/AP + (withholding) tax |

- Each source **emits an event** (it already does, or gains a producer); the
  **posting engine subscribes** and creates the journal entry via the matching
  rule. `journal.reference_type/reference_id` links back to the source for drill-down.
- **Perpetual vs periodic inventory** is a posting-rule choice, not a code fork.
- No source module is redesigned — they emit; finance posts.

---

## 9. Multi-tenant considerations

- **Tenant scoping standardized:** finance entities scoped by `company_id` (COA,
  periods, cost centers, rules, journals), with **branch** as an analytic dimension
  — today several tables are branch-scoped only; the foundation standardizes to
  company + branch dimension.
- **RLS** on every finance table using the platform primitives
  (`erp_user_company_id`, `erp_is_platform_owner`, `erp_has_branch_access`,
  `(select auth.uid())`).
- **Isolation of money:** journals/balances never cross tenants; posting runs under
  the originating tenant context (reuse the **impersonation** helper for
  event-driven/background posting).
- Per-tenant fiscal calendar, currency, COA overlay, and tax profile.

---

## 10. Reuse of Workflow Platform & Search OS

- **Workflow Platform (the posting + control plane):**
  - **Event bus** = the integration seam (§8): the posting engine is a **consumer**
    of `erp_events` (a sibling to the Search projector), so sales/purchase/inventory
    events drive GL postings — *one event stream, multiple consumers*.
  - **Approvals** (§11) for manual journals, period close/reopen, FX revaluation,
    write-offs — authored in the existing Workflow Builder/Canvas.
  - **Idempotency + tick** patterns reused for exactly-once posting and scheduled
    runs (recurring journals, period close, revaluation).
  - **Egress allow-list** governs tax/e-invoicing connectors.
- **Search OS:** add finance **providers** (accounts, journal entries, vouchers,
  cost centers) so users find an account/entry/voucher by code/number/name — reuse
  the unified index + palette; deep-link to the entry.

---

## 11. Required permissions & approval points

- **Permissions (reuse + extend `accounting.*`):** `accounting.view` (read GL/
  reports), `accounting.post` (create/post journals), `accounting.export`; new
  granular keys as needed: `accounting.period.close`, `accounting.coa.manage`,
  `accounting.rules.manage`, `accounting.fx.manage`. Reuse existing where present.
- **Approval points (Workflow):** manual/adjusting journals above a threshold;
  **period close & reopen**; FX period-end revaluation; bad-debt/write-off;
  posting-rule and COA changes; payment vouchers above a limit. Each is a workflow
  definition — no bespoke approval code.
- **Segregation of duties:** maker (create) vs checker (post/approve) enforced via
  permissions + approval steps.

---

## 12. Future modules that depend on this foundation

- **AR (Accounts Receivable):** customer invoices/payments → AR sub-ledger over the
  GL (`erp_invoices`/`erp_payments` already feed it); aging, statements, dunning
  (Workflow).
- **AP (Accounts Payable):** supplier invoices/payments (`erp_supplier_payments`/
  `erp_payment_vouchers`) → AP sub-ledger; payment runs (Workflow approval).
- **GL & Financial Reporting:** trial balance, P&L, balance sheet, cash flow off the
  journal + COA classes + periods (+ Search to find accounts).
- **Fixed Assets:** asset register + depreciation schedules posting to GL
  (recurring journals via the tick).
- **Budgeting:** budgets on COA × cost center × fiscal period; variance reporting;
  budget-check approval gates (Workflow).
- All consume the **same** COA/journal/posting/period/currency foundation — built
  once, reused by every module and industry.

---

## Design principles (carried from Workflow/Search)

One ledger, one posting engine, posting-rules-as-data, events as the integration
seam, additive + flag-gated rollout, RLS-first multi-tenancy, approvals via Workflow,
discoverability via Search. No second ledger; no per-industry fork.

---

## Open questions for review

1. **Multi-currency depth in the foundation V1:** transaction + functional only
   (recommended), or include presentation/consolidation now?
2. **Tenant re-scoping:** standardize finance tables to `company_id` + branch
   dimension (migration of existing branch-only scoping) — confirm appetite.
3. **Posting-rules engine vs. extend `account_map`:** full rule engine
   (recommended for "generic") vs. incremental mapping — scope for the first
   implementation phase.
4. **Tax engine V1 scope:** VAT (+ ETA adapter) first, withholding next?
5. **Inventory valuation method(s)** to support at the foundation (FIFO/weighted-avg)
   — affects COGS posting rules.
6. **Phasing:** which depends-on module (AR/AP/GL reporting) is the first consumer
   to validate the foundation against?

*Architecture only — no code, migrations, or implementation branches. Awaiting
architecture review/approval before any implementation.*
