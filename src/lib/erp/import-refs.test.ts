import { describe, it, expect } from 'vitest';
import { collectRefValues, resolveRowRefs, type RefFieldDef } from './import-refs';

const refFields: RefFieldDef[] = [
  { key: 'invoice_ref', labelEn: 'Invoice', required: true, ref: { table: 'erp_invoices', match: ['invoice_number'], column: 'invoice_id' } },
  { key: 'product_ref', labelEn: 'Product', ref: { table: 'erp_products_catalog', match: ['code'], column: 'product_id' } },
];

describe('import-refs · collectRefValues', () => {
  it('collects distinct lower-cased values per ref field', () => {
    const rows = [
      { invoice_ref: 'INV-1', product_ref: 'P1' },
      { invoice_ref: 'inv-1', product_ref: 'P2' },
      { invoice_ref: 'INV-2', product_ref: '' },
    ];
    const m = collectRefValues(rows, refFields);
    expect(m.get('invoice_ref')!.sort()).toEqual(['inv-1', 'inv-2']);
    expect(m.get('product_ref')!.sort()).toEqual(['p1', 'p2']);
  });
});

describe('import-refs · resolveRowRefs', () => {
  const maps = new Map<string, Map<string, string>>([
    ['invoice_ref', new Map([['inv-1', 'inv-id-1']])],
    ['product_ref', new Map([['p1', 'prod-id-1']])],
  ]);

  it('maps resolved values to FK columns', () => {
    const { fk, missing } = resolveRowRefs({ invoice_ref: 'INV-1', product_ref: 'P1' }, refFields, maps);
    expect(fk).toEqual({ invoice_id: 'inv-id-1', product_id: 'prod-id-1' });
    expect(missing).toEqual([]);
  });
  it('reports an unresolved (provided-but-not-found) value as missing', () => {
    const { fk, missing } = resolveRowRefs({ invoice_ref: 'INV-9', product_ref: 'P1' }, refFields, maps);
    expect(fk).toEqual({ product_id: 'prod-id-1' });
    expect(missing).toEqual([{ field: 'invoice_ref', label: 'Invoice', value: 'INV-9' }]);
  });
  it('skips empty optional refs (no FK, no error)', () => {
    const { fk, missing } = resolveRowRefs({ invoice_ref: 'INV-1', product_ref: '' }, refFields, maps);
    expect(fk).toEqual({ invoice_id: 'inv-id-1' });
    expect(missing).toEqual([]);
  });
});
