import { describe, it, expect } from 'vitest';
import {
  listEntities, getEntity, entityCapabilities, entityUniqueKey, entityDedupeKeys,
  isKnownEntity, listImportableEntities, listExportableEntities,
} from './entities';

describe('entity registry', () => {
  it('registers the core entities', () => {
    const keys = listEntities().map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining([
      'customer', 'supplier', 'product', 'branch', 'department', 'invoice', 'order', 'visit', 'ticket',
    ]));
  });

  it('registers the supplier-return entity (Electrical pack sub-slice A)', () => {
    const e = getEntity('purchase_return');
    expect(e?.table).toBe('erp_purchase_returns');
    expect(e?.permission).toBe('purchasing.return');
  });

  it('registers serials / warranty / RMA entities (Electrical pack sub-slice B)', () => {
    expect(getEntity('product_serial')?.table).toBe('erp_product_serials');
    expect(getEntity('warranty')?.table).toBe('erp_warranties');
    expect(getEntity('rma')?.table).toBe('erp_rma');
    expect(getEntity('rma')?.permission).toBe('electrical.rma');
  });

  it('getEntity + isKnownEntity resolve by key', () => {
    expect(getEntity('customer')?.table).toBe('erp_customers');
    expect(getEntity('not-a-thing')).toBeUndefined();
    expect(isKnownEntity('product')).toBe(true);
    expect(isKnownEntity('not-a-thing')).toBe(false);
  });

  it('capabilities default to ON', () => {
    const c = entityCapabilities('customer');
    expect(c.importable).toBe(true);
    expect(c.exportable).toBe(true);
    expect(c.apiAccess).toBe(true);
    expect(c.audit).toBe(true);
  });

  it('unique key defaults to external_id; dedupe keys include it', () => {
    const customer = getEntity('customer')!;
    expect(entityUniqueKey(customer)).toBe('external_id');
    expect(entityDedupeKeys(customer)).toContain('external_id');
    expect(entityDedupeKeys(customer)).toContain('code');
  });

  it('importable/exportable = entities that declare fields', () => {
    const imp = listImportableEntities().map((e) => e.key);
    expect(imp).toEqual(expect.arrayContaining(['customer', 'supplier', 'product', 'branch']));
    // entities without a field map are excluded
    expect(imp).not.toContain('department');
    expect(imp).not.toContain('invoice');
    expect(listExportableEntities().map((e) => e.key)).toEqual(expect.arrayContaining(['customer', 'product']));
  });
});
