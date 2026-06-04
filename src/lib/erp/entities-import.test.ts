import { describe, it, expect } from 'vitest';
import {
  getEntity, entityRefFields, entityStamps, entityUniqueKey, entityDedupeKeys,
  orderEntitiesByDependency, listImportableEntities,
} from './entities';

describe('entities · Import Engine Extension descriptors', () => {
  const newKeys = ['warehouse', 'stock', 'collection', 'sales_return', 'invoice_line'];

  it('registers all five priority entities as importable', () => {
    const importable = new Set(listImportableEntities().map((e) => e.key));
    for (const k of newKeys) expect(importable.has(k)).toBe(true);
  });

  it('declares FK ref fields with table + match + column', () => {
    const line = entityRefFields(getEntity('invoice_line')!);
    const byKey = new Map(line.map((f) => [f.key, f]));
    expect(byKey.get('invoice_ref')!.ref).toEqual({ table: 'erp_invoices', match: ['invoice_number', 'external_id'], column: 'invoice_id' });
    expect(byKey.get('invoice_ref')!.required).toBe(true);
    expect(byKey.get('product_ref')!.ref.column).toBe('product_id');
  });

  it('marks the right required ref vs optional ref (sales_return.invoice optional)', () => {
    const refs = entityRefFields(getEntity('sales_return')!);
    const byKey = new Map(refs.map((f) => [f.key, f]));
    expect(byKey.get('branch_ref')!.required).toBe(true);
    expect(byKey.get('customer_ref')!.required).toBe(true);
    expect(byKey.get('invoice_ref')!.required).toBeFalsy();
  });

  it('stamps reflect the actual audit columns each table has', () => {
    // None of the child tables carry import_job_id / created_by (except sales_returns.created_by).
    expect(entityStamps(getEntity('warehouse')!)).toEqual({ importJobId: false, createdBy: false, updatedBy: false, updatedAt: true, custom: false });
    expect(entityStamps(getEntity('invoice_line')!)).toEqual({ importJobId: false, createdBy: false, updatedBy: false, updatedAt: false, custom: false });
    expect(entityStamps(getEntity('sales_return')!).createdBy).toBe(true);
  });

  it('legacy entities (no stamps) default to the full master-data audit set', () => {
    expect(entityStamps(getEntity('customer')!)).toEqual({ importJobId: true, createdBy: true, updatedBy: true, updatedAt: true, custom: true });
  });

  it('unique/dedupe keys: warehouse by code, returns by return_number, stock composite dedupe', () => {
    expect(entityUniqueKey(getEntity('warehouse')!)).toBe('code');
    expect(entityUniqueKey(getEntity('sales_return')!)).toBe('return_number');
    expect(entityDedupeKeys(getEntity('stock')!)).toEqual(['warehouse_ref', 'product_ref']);
  });
});

describe('entities · orderEntitiesByDependency', () => {
  it('orders parents before children (FK-safe import order)', () => {
    const order = orderEntitiesByDependency(['invoice_line', 'invoice', 'product', 'stock', 'warehouse', 'branch']);
    const pos = (k: string) => order.indexOf(k);
    expect(pos('product')).toBeLessThan(pos('invoice_line'));
    expect(pos('invoice')).toBeLessThan(pos('invoice_line'));
    expect(pos('branch')).toBeLessThan(pos('warehouse'));
    expect(pos('warehouse')).toBeLessThan(pos('stock'));
    expect(pos('product')).toBeLessThan(pos('stock'));
  });

  it('ignores out-of-set dependencies and is stable', () => {
    // collection depends on invoice, but invoice isn't in the set → just returns the input.
    expect(orderEntitiesByDependency(['collection'])).toEqual(['collection']);
  });

  it('returns every requested key exactly once', () => {
    const keys = ['stock', 'warehouse', 'product', 'branch'];
    const order = orderEntitiesByDependency(keys);
    expect(order.slice().sort()).toEqual(keys.slice().sort());
  });
});
