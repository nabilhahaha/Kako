// ============================================================================
// Customer Account Statement — PURE core (no I/O). The single authoritative
// builder: the screen, the print/PDF view, aging, open invoices, summary and the
// Collect-Now gating all derive from buildCustomerStatement() so they can never
// diverge. Debits = invoices (net), credits = collections (APPLIED amount) +
// legacy payments + credit notes — sourced so the closing running balance
// reconciles to erp_customers.balance (a built-in self-check). Pure + unit-tested.
// ============================================================================

export type AgingBucket = 'current' | 'd30' | 'd60' | 'd90' | 'd90p';
export const AGING_BUCKETS: AgingBucket[] = ['current', 'd30', 'd60', 'd90', 'd90p'];
export type AgingBuckets = Record<AgingBucket, number>;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const emptyAging = (): AgingBuckets => ({ current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 });

/** AR aging bucket from days overdue. Mirrors accounting/aging (single source). */
export function agingBucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd30';
  if (daysOverdue <= 60) return 'd60';
  if (daysOverdue <= 90) return 'd90';
  return 'd90p';
}

/** Whole days between an invoice's reference date (yyyy-mm-dd) and today. */
export function daysOverdueFor(refISO: string | null | undefined, todayISO: string): number {
  if (!refISO) return 0;
  const a = Date.parse(`${refISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${todayISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// ── Raw inputs (DB-shaped; the server adapter maps rows to these) ────────────
export interface RawInvoice {
  id: string; invoice_number: string; net_amount: number; paid_amount: number;
  status: string; due_date: string | null; created_at: string;
}
export interface RawCollection {
  collection_number: string; collection_date: string; method: string;
  applied_amount: number; unapplied_amount: number;
}
export interface RawPayment { amount: number; payment_method: string; payment_date: string; invoice_number?: string | null }
export interface RawCreditNote { credit_note_number: string | number; amount: number; created_at: string }

export interface StatementCustomer {
  credit_limit: number; balance: number; payment_terms_days: number | null;
}

// ── Output ───────────────────────────────────────────────────────────────────
export type LedgerKind = 'opening' | 'invoice' | 'collection' | 'payment' | 'credit_note';
export interface StatementLedgerEntry {
  date: string; ref: string; kind: LedgerKind; method?: string | null;
  debit: number; credit: number;
}
export interface OpenInvoiceRow {
  id: string; invoiceNumber: string; date: string; dueDate: string | null;
  net: number; paid: number; outstanding: number; status: string;
  daysOverdue: number; bucket: AgingBucket;
}
export interface StatementSummary {
  creditLimit: number; currentBalance: number; availableCredit: number;
  overdueAmount: number; openInvoiceCount: number; oldestInvoiceDays: number | null;
  onAccount: number;
}
export interface CustomerStatement {
  summary: StatementSummary;
  aging: AgingBuckets;
  openInvoices: OpenInvoiceRow[];
  ledger: StatementLedgerEntry[];     // ranged (or full) — what the table renders
  openingBalance: number;             // carried into a date-ranged view (0 when no range)
  closingBalance: number;             // Σdebit − Σcredit over FULL history (for reconciliation)
  reconciledBalance: number;          // erp_customers.balance (authoritative)
  reconDelta: number;                 // closingBalance − reconciledBalance (target 0.00)
}

export interface BuildStatementInput {
  customer: StatementCustomer;
  invoices: RawInvoice[];
  collections: RawCollection[];
  payments: RawPayment[];
  creditNotes: RawCreditNote[];
  todayISO: string;
  /** Optional period filter; the ledger is restricted to [from,to] with an opening balance. */
  range?: { from?: string; to?: string };
}

const inRange = (dateISO: string, range?: { from?: string; to?: string }) => {
  const d = dateISO.slice(0, 10);
  if (range?.from && d < range.from.slice(0, 10)) return false;
  if (range?.to && d > range.to.slice(0, 10)) return false;
  return true;
};

/**
 * Build the complete statement from raw rows. ONE function feeds the screen, the
 * print/PDF page, aging, open invoices, summary and Collect-Now — guaranteeing
 * they agree. Pure.
 */
export function buildCustomerStatement(input: BuildStatementInput): CustomerStatement {
  const { customer, invoices, collections, payments, creditNotes, todayISO, range } = input;

  // Open invoices + aging (outstanding = net − paid > 0).
  const aging = emptyAging();
  const openInvoices: OpenInvoiceRow[] = [];
  for (const inv of invoices) {
    const outstanding = r2(Number(inv.net_amount) - Number(inv.paid_amount));
    if (outstanding <= 0) continue;
    const ref = inv.due_date || inv.created_at;
    const daysOverdue = daysOverdueFor(ref, todayISO);
    const bucket = agingBucketFor(daysOverdue);
    aging[bucket] = r2(aging[bucket] + outstanding);
    openInvoices.push({
      id: inv.id, invoiceNumber: inv.invoice_number, date: inv.created_at, dueDate: inv.due_date,
      net: r2(Number(inv.net_amount)), paid: r2(Number(inv.paid_amount)), outstanding,
      status: inv.status, daysOverdue, bucket,
    });
  }
  openInvoices.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  const overdueAmount = r2(aging.d30 + aging.d60 + aging.d90 + aging.d90p);
  const oldestInvoiceDays = openInvoices.length ? Math.max(...openInvoices.map((o) => o.daysOverdue)) : null;
  const onAccount = r2(collections.reduce((s, c) => s + Number(c.unapplied_amount || 0), 0));

  const summary: StatementSummary = {
    creditLimit: r2(Number(customer.credit_limit) || 0),
    currentBalance: r2(Number(customer.balance) || 0),
    availableCredit: r2((Number(customer.credit_limit) || 0) - (Number(customer.balance) || 0)),
    overdueAmount,
    openInvoiceCount: openInvoices.length,
    oldestInvoiceDays,
    onAccount,
  };

  // Full ledger: debits = invoices; credits = collections (APPLIED) + payments + credit notes.
  const full: StatementLedgerEntry[] = [
    ...invoices.map((i): StatementLedgerEntry => ({
      date: i.created_at, ref: i.invoice_number, kind: 'invoice', debit: r2(Number(i.net_amount)), credit: 0,
    })),
    ...collections
      .filter((c) => Number(c.applied_amount) > 0)
      .map((c): StatementLedgerEntry => ({
        date: c.collection_date, ref: c.collection_number, kind: 'collection', method: c.method,
        debit: 0, credit: r2(Number(c.applied_amount)),
      })),
    ...payments.map((p): StatementLedgerEntry => ({
      date: p.payment_date, ref: p.invoice_number ?? '—', kind: 'payment', method: p.payment_method,
      debit: 0, credit: r2(Number(p.amount)),
    })),
    ...creditNotes.map((n): StatementLedgerEntry => ({
      date: n.created_at, ref: String(n.credit_note_number ?? '—'), kind: 'credit_note', debit: 0, credit: r2(Number(n.amount)),
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const closingBalance = r2(full.reduce((s, e) => s + e.debit - e.credit, 0));

  // Date-range view: opening balance = net movement before `from`; ledger = in-range,
  // with the opening prepended so the running balance stays correct.
  let openingBalance = 0;
  let ledger = full;
  if (range && (range.from || range.to)) {
    openingBalance = r2(
      full.filter((e) => range.from && e.date.slice(0, 10) < range.from.slice(0, 10))
        .reduce((s, e) => s + e.debit - e.credit, 0),
    );
    const ranged = full.filter((e) => inRange(e.date, range));
    ledger = [];
    if (range.from && openingBalance !== 0) {
      ledger.push({
        date: range.from.slice(0, 10), ref: '—', kind: 'opening',
        debit: openingBalance > 0 ? openingBalance : 0, credit: openingBalance < 0 ? -openingBalance : 0,
      });
    }
    ledger.push(...ranged);
  }

  const reconciledBalance = r2(Number(customer.balance) || 0);
  return {
    summary, aging, openInvoices, ledger, openingBalance,
    closingBalance, reconciledBalance, reconDelta: r2(closingBalance - reconciledBalance),
  };
}
