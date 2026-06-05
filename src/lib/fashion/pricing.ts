/** Fashion pack — cart + price math (pure, client-safe, no DB).
 *  Mirrors the line/total math in erp_fashion_checkout (migration 0146). */

import { round2 } from './installments';

export type SaleType = 'cash' | 'installment';

export interface CartLine {
  product_id: string;
  quantity: number;
  unit_price: number;
  /** 0–100 line discount percentage. */
  discount_pct?: number;
}

export interface CartTotals {
  /** Sum of line totals before the header discount. */
  total: number;
  /** Header discount actually applied (clamped to total). */
  discount: number;
  /** Payable amount = total − discount, floored at 0. */
  net: number;
}

/** The unit price to charge for a variant given the sale type. */
export function variantUnitPrice(
  variant: { cash_price: number; installment_price: number },
  saleType: SaleType,
): number {
  if (saleType === 'installment') {
    // Fall back to the cash price when no installment price is configured.
    return variant.installment_price > 0 ? variant.installment_price : variant.cash_price;
  }
  return variant.cash_price;
}

/** Total a single line: qty × price × (1 − discount%/100). */
export function lineTotal(line: CartLine): number {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const dpct = Number(line.discount_pct) || 0;
  return round2(qty * price * (1 - dpct / 100));
}

/** Total a cart and apply an optional header discount (clamped to the subtotal). */
export function cartTotals(lines: CartLine[], headerDiscount = 0): CartTotals {
  const total = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const discount = round2(Math.min(Math.max(headerDiscount, 0), total));
  return { total, discount, net: round2(Math.max(total - discount, 0)) };
}

/** Gross profit for a sold line: (price − cost) × qty, after line discount. */
export function lineProfit(line: CartLine & { cost_price: number }): number {
  return round2(lineTotal(line) - (Number(line.cost_price) || 0) * (Number(line.quantity) || 0));
}
