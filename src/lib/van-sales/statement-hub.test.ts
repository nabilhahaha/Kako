import { describe, it, expect } from 'vitest';
import {
  hubStatus, isOverdue, isCreditBlocked, isDueThisWeek, matchesFilter, sortForCollection, compareForCollection,
  type StatementHubCustomer,
} from './statement-hub';

const TODAY = '2026-06-16';
const base: StatementHubCustomer = {
  id: 'c', name: 'C', name_ar: null, code: 'C1',
  balance: 0, overdueAmount: 0, oldestDueDate: null, creditLimit: 0, creditControlEnabled: true, openInvoices: 0,
};
const c = (over: Partial<StatementHubCustomer>): StatementHubCustomer => ({ ...base, ...over });

describe('statement hub — status classification', () => {
  it('overdue when there is an overdue amount or a past due date', () => {
    expect(isOverdue(c({ overdueAmount: 100 }), TODAY)).toBe(true);
    expect(isOverdue(c({ oldestDueDate: '2026-06-10' }), TODAY)).toBe(true);
    expect(isOverdue(c({ oldestDueDate: '2026-06-20' }), TODAY)).toBe(false);
  });

  it('credit blocked when balance >= limit (control on, limit > 0)', () => {
    expect(isCreditBlocked(c({ balance: 500, creditLimit: 500 }))).toBe(true);
    expect(isCreditBlocked(c({ balance: 400, creditLimit: 500 }))).toBe(false);
    expect(isCreditBlocked(c({ balance: 999, creditLimit: 0 }))).toBe(false);      // no limit set
    expect(isCreditBlocked(c({ balance: 999, creditLimit: 500, creditControlEnabled: false }))).toBe(false);
  });

  it('near due within the week but not overdue', () => {
    expect(isDueThisWeek(c({ oldestDueDate: '2026-06-20' }), TODAY)).toBe(true);  // +4d
    expect(isDueThisWeek(c({ oldestDueDate: '2026-06-30' }), TODAY)).toBe(false); // +14d
    expect(isDueThisWeek(c({ oldestDueDate: '2026-06-10' }), TODAY)).toBe(false); // overdue
  });

  it('badge status priority: overdue > credit_blocked > near_due > healthy', () => {
    expect(hubStatus(c({ overdueAmount: 10, balance: 999, creditLimit: 100 }), TODAY)).toBe('overdue');
    expect(hubStatus(c({ balance: 600, creditLimit: 500 }), TODAY)).toBe('credit_blocked');
    expect(hubStatus(c({ oldestDueDate: '2026-06-18' }), TODAY)).toBe('near_due');
    expect(hubStatus(c({ balance: 50, creditLimit: 500, oldestDueDate: '2026-07-30' }), TODAY)).toBe('healthy');
  });
});

describe('statement hub — quick filters', () => {
  it('matches each filter independently', () => {
    const overdue = c({ overdueAmount: 100 });
    const blocked = c({ balance: 600, creditLimit: 500 });
    const dueWk = c({ oldestDueDate: '2026-06-18' });
    const open = c({ openInvoices: 3 });
    expect(matchesFilter(overdue, 'overdue', TODAY)).toBe(true);
    expect(matchesFilter(blocked, 'credit_blocked', TODAY)).toBe(true);
    expect(matchesFilter(dueWk, 'due_week', TODAY)).toBe(true);
    expect(matchesFilter(open, 'open_invoices', TODAY)).toBe(true);
    expect(matchesFilter(c({}), 'all', TODAY)).toBe(true);
    expect(matchesFilter(c({}), 'overdue', TODAY)).toBe(false);
  });
});

describe('statement hub — collection priority sort', () => {
  it('orders by overdue amount, then oldest due, then blocked, then balance', () => {
    const a = c({ id: 'a', overdueAmount: 500 });
    const b = c({ id: 'b', overdueAmount: 900 });
    const d = c({ id: 'd', overdueAmount: 0, oldestDueDate: '2026-06-20' });
    const e = c({ id: 'e', overdueAmount: 0, oldestDueDate: '2026-06-25' });
    const sorted = sortForCollection([d, a, e, b]).map((x) => x.id);
    expect(sorted).toEqual(['b', 'a', 'd', 'e']); // 900, 500, then due-20, due-25
  });

  it('tie-breaks equal overdue/oldest by credit-blocked then balance', () => {
    const blocked = c({ id: 'blk', overdueAmount: 0, oldestDueDate: null, balance: 600, creditLimit: 500 });
    const bigBal = c({ id: 'big', overdueAmount: 0, oldestDueDate: null, balance: 5000, creditLimit: 0 });
    expect(compareForCollection(blocked, bigBal)).toBeLessThan(0); // blocked first despite lower balance
  });
});
