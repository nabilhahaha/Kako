import { describe, it, expect } from 'vitest';
import { entityKind, clientPolicyFor } from './policy';

describe('entity sync policy (§14 matrix)', () => {
  it('classifies each entity per the locked matrix', () => {
    expect(entityKind('visits')).toBe('append-only');
    expect(entityKind('orders')).toBe('append-only');
    expect(entityKind('audit_logs')).toBe('append-only');
    expect(entityKind('customers')).toBe('field-merge');
    expect(entityKind('products')).toBe('last-write-wins');
    expect(entityKind('settings')).toBe('last-write-wins');
    expect(entityKind('inventory_counts')).toBe('review');
    // Financial ledger documents are append-only (§14 immutable ledger events).
    expect(entityKind('sales_invoices')).toBe('append-only');
    expect(entityKind('sales_returns')).toBe('append-only');
    expect(entityKind('customer_payments')).toBe('append-only');
  });

  it('defaults unknown entities to deterministic LWW', () => {
    expect(entityKind('something_new')).toBe('last-write-wins');
  });

  it('maps each kind to a client engine ConflictPolicy', () => {
    expect(clientPolicyFor('orders')).toBe('client-wins');       // append-only
    expect(clientPolicyFor('customers')).toBe('field-merge');
    expect(clientPolicyFor('products')).toBe('last-write-wins');
    expect(clientPolicyFor('inventory_counts')).toBe('server-wins'); // review → defer
  });
});
