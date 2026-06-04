import { describe, it, expect } from 'vitest';
import { GRANULAR_CAPABILITIES, expandAliases } from './capabilities';
import { PERMISSION_GROUP_LABELS } from './permissions';
import {
  DENY_ALL_CAPABILITIES,
  isDenyAllCapability,
  GRANULAR_CAPABILITY_LABELS,
  DEFAULT_CAPABILITY_GRANTS,
  defaultCapabilityGrantPairs,
} from './granular-capabilities';

describe('granular-capabilities · catalog integrity', () => {
  it('every deny-all capability is a real granular capability', () => {
    for (const c of DENY_ALL_CAPABILITIES) expect(GRANULAR_CAPABILITIES).toContain(c);
  });
  it('deny-all capabilities are NOT produced by any legacy alias (still deny-all)', () => {
    // expandAliases over the full legacy key set must never yield a deny-all cap.
    const everyLegacy = expandAliases([
      'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
      'customers.manage', 'customers.approve', 'customers.change_status',
      'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count',
      'stock_request.create', 'stock_request.approve',
      'purchasing.manage', 'purchasing.return', 'suppliers.manage',
      'accounting.view', 'accounting.post', 'reports.view', 'pricing.manage',
      'settings.branches', 'settings.users', 'settings.custom_fields',
      'integrations.manage', 'workflow.manage',
    ]);
    for (const c of DENY_ALL_CAPABILITIES) expect(everyLegacy.has(c)).toBe(false);
  });
  it('every capability has en/ar labels and a known group', () => {
    for (const c of DENY_ALL_CAPABILITIES) {
      const l = GRANULAR_CAPABILITY_LABELS[c];
      expect(l.en.length).toBeGreaterThan(0);
      expect(l.ar.length).toBeGreaterThan(0);
      expect(PERMISSION_GROUP_LABELS[l.group]).toBeDefined();
    }
  });
  it('isDenyAllCapability guards the set', () => {
    expect(isDenyAllCapability('customers.delete')).toBe(true);
    expect(isDenyAllCapability('sales.sell')).toBe(false);
  });
});

describe('granular-capabilities · least-privilege default matrix', () => {
  it('admin (owner) holds all eight', () => {
    expect([...(DEFAULT_CAPABILITY_GRANTS.admin ?? [])].sort()).toEqual([...DENY_ALL_CAPABILITIES].sort());
  });
  it('the generic manager role is granted NONE (no blanket manager grants)', () => {
    expect(DEFAULT_CAPABILITY_GRANTS.manager).toBeUndefined();
  });
  it('customers.delete is admin-only', () => {
    const holders = defaultCapabilityGrantPairs().filter((p) => p.capability === 'customers.delete').map((p) => p.roleKey);
    expect(holders).toEqual(['admin']);
  });
  it('functional ownership: finance, branch, warehouse, sales-leadership', () => {
    const pairs = defaultCapabilityGrantPairs();
    const holders = (cap: string) => pairs.filter((p) => p.capability === cap).map((p) => p.roleKey).sort();
    expect(holders('accounting.voucher.approve')).toEqual(['accountant', 'admin']);
    expect(holders('sales.payment.writeoff')).toEqual(['accountant', 'admin']);
    expect(holders('purchasing.po.approve')).toEqual(['admin', 'branch_manager']);
    expect(holders('inventory.adjustment.approve')).toEqual(['admin', 'warehouse_keeper']);
    expect(holders('sales.price.override')).toEqual(['admin', 'regional_manager', 'sales_director']);
    expect(holders('sales.order.cancel')).toEqual(['admin', 'branch_manager']);
    expect(holders('sales.invoice.cancel')).toEqual(['accountant', 'admin']);
  });
});
