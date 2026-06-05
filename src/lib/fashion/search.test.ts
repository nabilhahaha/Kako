/** Unit tests for the pure POS product search/ranking (search.ts). */
import { describe, it, expect } from 'vitest';
import { scoreProduct, searchProducts, exactScanMatch, type SearchableProduct } from './search';

const items: SearchableProduct[] = [
  { product_id: '1', code: 'TSHIRT-M-BLACK', name: 'Polo Shirt Black M', barcode: '2000000000017' },
  { product_id: '2', code: 'TSHIRT-L-BLACK', name: 'Polo Shirt Black L', barcode: '2000000000024' },
  { product_id: '3', code: 'JEAN-32-BLUE', name: 'Slim Jeans Blue 32', barcode: '2000000000031' },
  { product_id: '4', code: 'CAP-NA-RED', name: 'Baseball Cap Red', barcode: '' },
];

describe('scoreProduct', () => {
  it('returns 0 for a blank query', () => {
    expect(scoreProduct(items[0], '')).toBe(0);
    expect(scoreProduct(items[0], '   ')).toBe(0);
  });

  it('ranks an exact barcode highest, then exact code, then prefixes', () => {
    expect(scoreProduct(items[0], '2000000000017')).toBe(100); // exact barcode
    expect(scoreProduct(items[0], 'tshirt-m-black')).toBe(95); // exact code
    expect(scoreProduct(items[0], '200000000001')).toBe(80); // barcode prefix
    expect(scoreProduct(items[0], 'tshirt-m')).toBe(75); // code prefix
    expect(scoreProduct(items[0], 'polo')).toBe(70); // name prefix
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(scoreProduct(items[0], '  POLO  ')).toBe(70);
  });

  it('matches all-tokens-in-name above a plain substring', () => {
    expect(scoreProduct(items[2], 'jeans blue')).toBe(60); // both tokens present
    expect(scoreProduct(items[2], 'jeans')).toBe(50); // single-token substring (not a prefix)
  });

  it('does not match an empty barcode against a blank-ish query', () => {
    expect(scoreProduct(items[3], '2000000000017')).toBe(0);
  });
});

describe('searchProducts', () => {
  it('returns [] for a blank query', () => {
    expect(searchProducts(items, '')).toEqual([]);
    expect(searchProducts(items, '   ')).toEqual([]);
  });

  it('finds by name and orders the most relevant first', () => {
    const res = searchProducts(items, 'polo');
    expect(res.map((r) => r.product_id)).toEqual(['2', '1']); // both polos, name asc on tie
  });

  it('returns the exact barcode hit first when scanning', () => {
    const res = searchProducts(items, '2000000000024');
    expect(res[0].product_id).toBe('2');
  });

  it('finds by SKU/code fragment', () => {
    const res = searchProducts(items, 'jean');
    expect(res.map((r) => r.product_id)).toContain('3');
  });

  it('respects the result limit', () => {
    expect(searchProducts(items, 'shirt', 1)).toHaveLength(1);
    expect(searchProducts(items, 'shirt', 8).length).toBeGreaterThanOrEqual(2);
  });

  it('returns nothing for an unknown query', () => {
    expect(searchProducts(items, 'zzz-nope')).toEqual([]);
  });
});

describe('exactScanMatch', () => {
  it('resolves a unique barcode', () => {
    expect(exactScanMatch(items, '2000000000031')?.product_id).toBe('3');
  });

  it('resolves a unique code (SKU)', () => {
    expect(exactScanMatch(items, 'cap-na-red')?.product_id).toBe('4');
  });

  it('returns null for a blank query', () => {
    expect(exactScanMatch(items, '')).toBeNull();
  });

  it('returns null when no exact match exists', () => {
    expect(exactScanMatch(items, 'polo')).toBeNull();
  });

  it('returns null on an ambiguous duplicate code rather than guessing', () => {
    const dupes: SearchableProduct[] = [
      { product_id: 'a', code: 'DUP', name: 'A', barcode: '' },
      { product_id: 'b', code: 'DUP', name: 'B', barcode: '' },
    ];
    expect(exactScanMatch(dupes, 'dup')).toBeNull();
  });
});
