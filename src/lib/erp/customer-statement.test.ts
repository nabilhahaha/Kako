import { describe, it, expect } from 'vitest';
import {
  agingBucketFor,
  daysOverdueFor,
  buildCustomerStatement,
  type BuildStatementInput,
} from './customer-statement';

const base = (over: Partial<BuildStatementInput> = {}): BuildStatementInput => ({
  customer: { credit_limit: 5000, balance: 0, payment_terms_days: 30 },
  invoices: [],
  collections: [],
  payments: [],
  creditNotes: [],
  todayISO: '2026-06-14',
  ...over,
});

describe('customer-statement pure core', () => {
  describe('agingBucketFor', () => {
    it('maps days overdue to the standard AR buckets', () => {
      expect(agingBucketFor(0)).toBe('current');
      expect(agingBucketFor(-3)).toBe('current');
      expect(agingBucketFor(1)).toBe('d30');
      expect(agingBucketFor(30)).toBe('d30');
      expect(agingBucketFor(31)).toBe('d60');
      expect(agingBucketFor(60)).toBe('d60');
      expect(agingBucketFor(61)).toBe('d90');
      expect(agingBucketFor(90)).toBe('d90');
      expect(agingBucketFor(91)).toBe('d90p');
    });
  });

  it('daysOverdueFor counts whole days from the reference date', () => {
    expect(daysOverdueFor('2026-06-10', '2026-06-14')).toBe(4);
    expect(daysOverdueFor('2026-04-01', '2026-06-14')).toBe(74);
    expect(daysOverdueFor(null, '2026-06-14')).toBe(0);
  });

  it('builds summary, aging, open invoices and a reconciling ledger', () => {
    const s = buildCustomerStatement(base({
      customer: { credit_limit: 5000, balance: 159.6, payment_terms_days: 30 },
      invoices: [
        { id: 'i1', invoice_number: 'INV-1', net_amount: 200, paid_amount: 200, status: 'paid', due_date: null, created_at: '2026-05-01' },
        { id: 'i2', invoice_number: 'INV-2', net_amount: 159.6, paid_amount: 0, status: 'issued', due_date: '2026-06-30', created_at: '2026-06-10' },
      ],
      collections: [
        { collection_number: 'COL-1', collection_date: '2026-05-02', method: 'cash', applied_amount: 200, unapplied_amount: 0 },
      ],
    }));

    expect(s.summary.currentBalance).toBe(159.6);
    expect(s.summary.availableCredit).toBe(4840.4);
    expect(s.summary.overdueAmount).toBe(0);          // INV-2 due 2026-06-30 (future) → current
    expect(s.summary.openInvoiceCount).toBe(1);
    expect(s.aging.current).toBe(159.6);
    expect(s.openInvoices.map((o) => o.invoiceNumber)).toEqual(['INV-2']);
    // ledger ordered by date: INV-1 (debit), COL-1 (credit), INV-2 (debit)
    expect(s.ledger.map((e) => e.ref)).toEqual(['INV-1', 'COL-1', 'INV-2']);
    // closing = 200 - 200 + 159.6 = 159.6 == balance ⇒ reconciled
    expect(s.closingBalance).toBe(159.6);
    expect(s.reconDelta).toBe(0);
  });

  it('reconciles with legacy payments and credit notes, and ages overdue invoices', () => {
    const s = buildCustomerStatement(base({
      customer: { credit_limit: 1000, balance: 100, payment_terms_days: 30 },
      invoices: [
        { id: 'i1', invoice_number: 'INV-9', net_amount: 300, paid_amount: 200, status: 'partially_paid', due_date: null, created_at: '2026-04-01' },
      ],
      collections: [{ collection_number: 'COL-9', collection_date: '2026-04-05', method: 'cash', applied_amount: 150, unapplied_amount: 20 }],
      payments: [{ amount: 30, payment_method: 'cash', payment_date: '2026-04-10', invoice_number: 'INV-9' }],
      creditNotes: [{ credit_note_number: 'CN-1', amount: 20, created_at: '2026-04-12' }],
    }));

    // outstanding 100, invoice 74 days old → d90 bucket; overdue = 100
    expect(s.openInvoices[0].bucket).toBe('d90');
    expect(s.aging.d90).toBe(100);
    expect(s.summary.overdueAmount).toBe(100);
    expect(s.summary.onAccount).toBe(20);
    // closing = 300 - 150 - 30 - 20 = 100 == balance
    expect(s.closingBalance).toBe(100);
    expect(s.reconDelta).toBe(0);
  });

  it('applies a date range with a carried-forward opening balance', () => {
    const s = buildCustomerStatement(base({
      customer: { credit_limit: 1000, balance: 400, payment_terms_days: 30 },
      invoices: [
        { id: 'i1', invoice_number: 'INV-A', net_amount: 300, paid_amount: 0, status: 'issued', due_date: null, created_at: '2026-05-01' },
        { id: 'i2', invoice_number: 'INV-B', net_amount: 100, paid_amount: 0, status: 'issued', due_date: null, created_at: '2026-06-10' },
      ],
      range: { from: '2026-06-01' },
    }));

    expect(s.openingBalance).toBe(300);                 // INV-A is before the range
    expect(s.ledger[0].kind).toBe('opening');
    expect(s.ledger[0].debit).toBe(300);
    expect(s.ledger.map((e) => e.ref)).toEqual(['—', 'INV-B']);
    expect(s.closingBalance).toBe(400);                 // full history still reconciles
  });
});
