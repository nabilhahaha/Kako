import type { Product, ProductUoM, UoMCode } from './types';

export function getUoM(product: Product, code: UoMCode): ProductUoM | undefined {
  return product.uoms.find((u) => u.code === code);
}

export function defaultUoM(product: Product): ProductUoM {
  return product.uoms.find((u) => u.isSalesDefault) ?? product.uoms[0];
}

/** Convert a quantity in `code` UoM to base units. */
export function toBaseQty(product: Product, code: UoMCode, qty: number): number {
  const u = getUoM(product, code);
  return u ? qty * u.factor : qty;
}

/** How many full units of `code` are available given a base-unit stock. */
export function availableInUoM(
  product: Product,
  code: UoMCode,
  qtyBase: number,
): number {
  const u = getUoM(product, code);
  if (!u || u.factor <= 0) return 0;
  return Math.floor(qtyBase / u.factor);
}

export const UOM_LABELS: Record<UoMCode, { en: string; ar: string }> = {
  PIECE: { en: 'Piece', ar: 'قطعة' },
  PACK: { en: 'Pack', ar: 'علبة' },
  BOX: { en: 'Box', ar: 'صندوق' },
  CARTON: { en: 'Carton', ar: 'كرتون' },
  CASE: { en: 'Case', ar: 'كيس' },
};
