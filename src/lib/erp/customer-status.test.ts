import { describe, it, expect } from 'vitest';
import { statusBlocks, statusBlockMessageKey, type CustomerOp } from './customer-status';

describe('customer-status · statusBlocks', () => {
  it('active blocks nothing', () => {
    for (const op of ['order', 'invoice', 'route', 'rep', 'return', 'payment'] as CustomerOp[]) {
      expect(statusBlocks('active', op)).toBe(false);
    }
  });

  it('payments and returns are always allowed (debt + stock recovery)', () => {
    for (const s of ['active', 'suspended', 'inactive', 'blocked']) {
      expect(statusBlocks(s, 'payment')).toBe(false);
      expect(statusBlocks(s, 'return')).toBe(false);
    }
  });

  it('suspended blocks new orders/invoices but keeps route/rep', () => {
    expect(statusBlocks('suspended', 'order')).toBe(true);
    expect(statusBlocks('suspended', 'invoice')).toBe(true);
    expect(statusBlocks('suspended', 'route')).toBe(false);
    expect(statusBlocks('suspended', 'rep')).toBe(false);
  });

  it('inactive behaves like suspended for transactions', () => {
    expect(statusBlocks('inactive', 'order')).toBe(true);
    expect(statusBlocks('inactive', 'invoice')).toBe(true);
    expect(statusBlocks('inactive', 'route')).toBe(false);
  });

  it('blocked stops all new business incl. route/rep', () => {
    expect(statusBlocks('blocked', 'order')).toBe(true);
    expect(statusBlocks('blocked', 'invoice')).toBe(true);
    expect(statusBlocks('blocked', 'route')).toBe(true);
    expect(statusBlocks('blocked', 'rep')).toBe(true);
  });

  it('null/unknown status defaults to active (no block)', () => {
    expect(statusBlocks(null, 'order')).toBe(false);
    expect(statusBlocks(undefined, 'invoice')).toBe(false);
  });

  it('message key reflects blocked vs suspended', () => {
    expect(statusBlockMessageKey('blocked')).toBe('customers.errCustomerBlocked');
    expect(statusBlockMessageKey('suspended')).toBe('customers.errCustomerSuspended');
    expect(statusBlockMessageKey('inactive')).toBe('customers.errCustomerSuspended');
  });
});
