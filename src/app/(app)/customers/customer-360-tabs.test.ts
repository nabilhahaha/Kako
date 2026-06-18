import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_360_TAB_KEYS,
  isCustomer360Tab,
  customerBadgeState,
  customerNeedsDecision,
} from './customer-360-tabs';

describe('customer-360 tabs', () => {
  it('exposes the approved 6-facet order', () => {
    expect([...CUSTOMER_360_TAB_KEYS]).toEqual([
      'overview',
      'profile',
      'statement',
      'activity',
      'related',
      'audit',
    ]);
  });

  it('recognizes valid tab keys', () => {
    expect(isCustomer360Tab('statement')).toBe(true);
    expect(isCustomer360Tab('nope')).toBe(false);
  });
});

describe('customerBadgeState', () => {
  it('prioritizes approval state over active flag', () => {
    expect(customerBadgeState({ approval_status: 'draft', is_active: true })).toBe('draft');
    expect(customerBadgeState({ approval_status: 'pending', is_active: true })).toBe('pending');
    expect(customerBadgeState({ approval_status: 'rejected', is_active: true })).toBe('rejected');
  });

  it('falls back to active/inactive once approved', () => {
    expect(customerBadgeState({ approval_status: 'approved', is_active: true })).toBe('active');
    expect(customerBadgeState({ approval_status: 'approved', is_active: false })).toBe('inactive');
    expect(customerBadgeState({ approval_status: null, is_active: true })).toBe('active');
  });
});

describe('customerNeedsDecision', () => {
  it('is true only for draft/pending/rejected', () => {
    expect(customerNeedsDecision({ approval_status: 'pending' })).toBe(true);
    expect(customerNeedsDecision({ approval_status: 'draft' })).toBe(true);
    expect(customerNeedsDecision({ approval_status: 'rejected' })).toBe(true);
    expect(customerNeedsDecision({ approval_status: 'approved' })).toBe(false);
    expect(customerNeedsDecision({ approval_status: null })).toBe(false);
  });
});
