import { describe, it, expect } from 'vitest';
import { buildSku, ean13CheckDigit, buildBarcode, isValidEan13 } from './sku';

describe('fashion · sku & barcode', () => {
  it('buildSku joins normalized style/size/color', () => {
    expect(buildSku('t-shirt', 'M', 'black')).toBe('TSHIRT-M-BLACK');
    expect(buildSku('Jeans', null, null)).toBe('JEANS-NA-NA');
  });

  it('ean13CheckDigit matches a known value', () => {
    // 400638133393 → check digit 1 (classic EAN-13 example)
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });

  it('buildBarcode produces a valid, deterministic EAN-13', () => {
    const a = buildBarcode('TSHIRT-M-BLACK');
    const b = buildBarcode('TSHIRT-M-BLACK');
    expect(a).toBe(b); // deterministic
    expect(a).toHaveLength(13);
    expect(isValidEan13(a)).toBe(true);
    expect(buildBarcode('TSHIRT-L-WHITE')).not.toBe(a); // distinct seeds differ
  });

  it('isValidEan13 rejects malformed codes', () => {
    expect(isValidEan13('12345')).toBe(false);
    expect(isValidEan13('4006381333931')).toBe(true); // valid (check digit 1)
    expect(isValidEan13('4006381333932')).toBe(false); // wrong check digit
    expect(isValidEan13('abcdefghijklm')).toBe(false); // non-numeric
  });
});
