import { describe, it, expect, vi } from 'vitest';
import { classifyQuery, digitsOf, normPhone, normCode, normIdentifier, buildIdentifiers, isIdentifierQuery, phoneVariants } from './classify';
import { SEARCH_PROVIDERS, BACKFILL_PROVIDERS } from './providers';
import { allowedTypes, groupHits, search } from './service';

describe('search/classify', () => {
  it('classifies barcodes, phones, numeric, text, empty', () => {
    expect(classifyQuery('')).toBe('empty');
    expect(classifyQuery('6221031492657')).toBe('barcode'); // 13-digit EAN
    expect(classifyQuery('01001234567')).toBe('barcode');    // 11 digits → barcode-range (>=8)
    expect(classifyQuery('012 345')).toBe('phone');          // 6 digits
    expect(classifyQuery('Ahmed')).toBe('text');
    expect(classifyQuery('شركة')).toBe('text');
  });
  it('digitsOf + normPhone are format-agnostic', () => {
    expect(digitsOf('+20 (100) 123-4567')).toBe('201001234567');
    expect(normPhone('0100-123-4567')).toBe('01001234567');
    expect(normPhone('12')).toBeNull();
  });
  it('normCode lowercases/trims; normIdentifier strips separators', () => {
    expect(normCode('  CUST-001 ')).toBe('cust-001');
    expect(normIdentifier('EG 123-456')).toBe('eg123456');
  });
  it('buildIdentifiers dedups + drops empties', () => {
    expect(buildIdentifiers(['a', null, 'a', '', 'b'])).toEqual(['a', 'b']);
  });
  it('isIdentifierQuery true for numeric-ish', () => {
    expect(isIdentifierQuery('6221031492657')).toBe(true);
    expect(isIdentifierQuery('cairo')).toBe(false);
  });
  it('phoneVariants covers leading-zero + last-10 national forms', () => {
    const v = phoneVariants('0100-111-2222');
    expect(v).toContain('01001112222');   // full
    expect(v).toContain('1001112222');     // drop leading 0 (== last 10 here)
    expect(phoneVariants('12')).toEqual([]); // too short
  });
});

describe('search/providers', () => {
  it('customer projects title/identifiers/href (code+phone+VAT)', () => {
    const d = SEARCH_PROVIDERS.customer.toDocument({ id: 'c1', code: 'CUST-1', name: 'Cairo Foods', phone: '0100-111-2222', tax_number: '123-456-789', city: 'Cairo', company_id: 'co1', branch_id: 'b1' });
    expect(d.title).toBe('Cairo Foods');
    expect(d.href).toBe('/customers/c1');
    expect(d.identifiers).toContain('cust-1');
    expect(d.identifiers).toContain('01001112222');
    expect(d.identifiers).toContain('123456789');
    expect(d.companyIdRaw).toBe('co1');
  });
  it('product carries barcode; invoice/order/return are branch-scoped with doc-number identifiers', () => {
    expect(SEARCH_PROVIDERS.product.toDocument({ id: 'p1', name: 'Widget', barcode: '6221031492657', company_id: 'co1' }).identifiers).toContain('6221031492657');
    const inv = SEARCH_PROVIDERS.invoice.toDocument({ id: 'i1', invoice_number: 'INV-9', branch_id: 'b1', status: 'issued' });
    expect(inv.identifiers).toContain('inv-9');
    expect(inv.href).toBe('/sales/invoices?focus=i1');
    expect(SEARCH_PROVIDERS.invoice.companyVia).toBe('branch');
  });
  it('attachment + user are registered but NOT backfilled in V1', () => {
    expect(SEARCH_PROVIDERS.attachment.backfill).toBe(false);
    expect(SEARCH_PROVIDERS.user.backfill).toBe(false);
    const keys = BACKFILL_PROVIDERS.map((p) => p.entityType);
    expect(keys).toContain('customer'); expect(keys).toContain('workflow');
    expect(keys).not.toContain('attachment'); expect(keys).not.toContain('user');
    expect(BACKFILL_PROVIDERS).toHaveLength(8);
  });
});

describe('search/service', () => {
  it('allowedTypes gates by reused permission keys (RLS-only entities always allowed)', () => {
    const can = (k: string) => k === 'customers.view'; // user can only view customers
    const allowed = allowedTypes(can);
    expect(allowed).toContain('customer');                 // has key
    expect(allowed).toContain('order');                    // null key (RLS-only)
    expect(allowed).toContain('visit');                    // null key
    expect(allowed).not.toContain('supplier');             // suppliers.view not held
    expect(allowed).not.toContain('invoice');              // accounting.view not held
    expect(allowed).not.toContain('workflow');             // workflow.manage not held
  });
  it('groupHits groups by entity in provider order, caps per category', () => {
    const rows = [
      { entity_type: 'invoice', entity_id: 'i1', title: 'INV-1', subtitle: null, href: '/x', metadata: {}, score: 10, match_kind: 'exact' },
      { entity_type: 'customer', entity_id: 'c1', title: 'A', subtitle: null, href: '/x', metadata: {}, score: 9, match_kind: 'lexical' },
      { entity_type: 'customer', entity_id: 'c2', title: 'B', subtitle: null, href: '/x', metadata: {}, score: 8, match_kind: 'lexical' },
      { entity_type: 'customer', entity_id: 'c3', title: 'C', subtitle: null, href: '/x', metadata: {}, score: 7, match_kind: 'fuzzy' },
    ];
    const cats = groupHits(rows, 2);
    expect(cats.map((c) => c.entityType)).toEqual(['customer', 'invoice']); // provider order
    const cust = cats.find((c) => c.entityType === 'customer')!;
    expect(cust.count).toBe(3);          // total
    expect(cust.hits).toHaveLength(2);   // capped
  });
  it('search() passes allowed types to the RPC and returns categorized results', async () => {
    const rpc = vi.fn(async (_name: string, _params: { p_types: string[] }) => ({ data: [
      { entity_type: 'customer', entity_id: 'c1', title: 'Cairo', subtitle: null, href: '/customers/c1', metadata: {}, score: 1000, match_kind: 'exact' },
    ], error: null }));
    const db = { rpc } as never;
    const res = await search(db, '0100', { can: () => true, perCategory: 5 });
    expect(rpc).toHaveBeenCalledWith('erp_search', expect.objectContaining({ p_query: '0100' }));
    const passed = rpc.mock.calls[0][1] as { p_types: string[] };
    expect(passed.p_types).toContain('customer');
    expect(res.total).toBe(1);
    expect(res.categories[0].hits[0].href).toBe('/customers/c1');
  });
  it('empty query returns no categories', async () => {
    const res = await search({ rpc: vi.fn() } as never, '   ', { can: () => true });
    expect(res).toEqual({ query: '', categories: [], total: 0 });
  });
});
