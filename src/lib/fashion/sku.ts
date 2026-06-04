/** Fashion pack — SKU + barcode helpers (pure, client-safe, no DB).
 *  A variant's SKU is human-readable (STYLE-SIZE-COLOR); its barcode is a valid
 *  EAN-13 derived from a numeric base so any scanner reads it. */

/** Slug a token to uppercase alphanumerics (for SKU segments). */
function seg(token: string | null | undefined, fallback: string): string {
  const s = (token ?? '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s || fallback;
}

/** Build a readable variant SKU, e.g. "TSHIRT-M-BLACK". */
export function buildSku(styleCode: string, sizeCode?: string | null, colorCode?: string | null): string {
  return [seg(styleCode, 'STYLE'), seg(sizeCode, 'NA'), seg(colorCode, 'NA')].join('-');
}

/** EAN-13 check digit for a 12-digit numeric base. */
export function ean13CheckDigit(base12: string): number {
  const digits = base12.padStart(12, '0').slice(0, 12).split('').map((d) => Number(d) || 0);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Deterministic 12-digit numeric base from an arbitrary seed string. */
function numericBase(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  // Prefix '200' = in-store / restricted-circulation range (GS1), then 9 digits.
  return ('200' + h.toString().padStart(9, '0')).slice(0, 12);
}

/** Build a valid EAN-13 barcode for a variant seed (e.g. its SKU or id). */
export function buildBarcode(seed: string): string {
  const base = numericBase(seed);
  return base + String(ean13CheckDigit(base));
}

/** Validate an EAN-13 string (13 digits + correct check digit). */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}
