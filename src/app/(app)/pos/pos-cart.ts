// Fast Food / Restaurant POS — pure cart/ticket model (no I/O / no React).
//
// The on-screen totals MUST match the server checkout (erp_close_restaurant_order, 0055), so
// this replicates that exact formula:
//   subtotal = Σ qty*price
//   discount = percent ? subtotal*value/100 : value
//   base     = subtotal - discount + deliveryFee
//   service  = round(base * serviceRate/100, 2)
//   tax      = round((base + service) * taxRate/100, 2)
//   total    = base + service + tax
// Kept pure so it is unit-tested and identical on client + server. Cash/card/mixed tender +
// change-due also live here.

export type OrderMode = 'dine_in' | 'takeaway' | 'delivery';
export type DiscountType = 'amount' | 'percent';

export interface CartLine {
  /** product id (erp_products_catalog) */
  productId: string;
  name: string;
  price: number;
  taxRate: number;   // kept for reference; POS uses order-level tax to match the RPC
  qty: number;
  note?: string | null;
}

export interface CartCharges {
  discountType: DiscountType;
  discountValue: number;
  serviceRate: number;   // %
  taxRate: number;       // %
  deliveryFee: number;
}

export interface CartTotals {
  itemCount: number;     // distinct lines
  unitCount: number;     // Σ qty
  subtotal: number;
  discount: number;
  service: number;
  tax: number;
  total: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const DEFAULT_CHARGES: CartCharges = {
  discountType: 'amount', discountValue: 0, serviceRate: 0, taxRate: 0, deliveryFee: 0,
};

/** Add a product (or bump qty if already on the ticket). Pure — returns a new array. */
export function addToCart(lines: readonly CartLine[], p: { productId: string; name: string; price: number; taxRate?: number }, qty = 1): CartLine[] {
  const i = lines.findIndex((l) => l.productId === p.productId);
  if (i >= 0) {
    const next = lines.slice();
    next[i] = { ...next[i], qty: next[i].qty + qty };
    return next;
  }
  return [...lines, { productId: p.productId, name: p.name, price: p.price, taxRate: p.taxRate ?? 0, qty }];
}

/** Set a line's qty; qty<=0 removes the line. Pure. */
export function setQty(lines: readonly CartLine[], productId: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.productId !== productId);
  return lines.map((l) => (l.productId === productId ? { ...l, qty: Math.round(qty) } : l));
}

export function incQty(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
}
export function decQty(lines: readonly CartLine[], productId: string): CartLine[] {
  const l = lines.find((x) => x.productId === productId);
  if (!l) return lines.slice();
  return setQty(lines, productId, l.qty - 1);
}
export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((l) => l.productId !== productId);
}
export function setLineNote(lines: readonly CartLine[], productId: string, note: string): CartLine[] {
  return lines.map((l) => (l.productId === productId ? { ...l, note: note.trim() || null } : l));
}

/** Compute totals — byte-for-byte the same math as erp_close_restaurant_order. Pure. */
export function cartTotals(lines: readonly CartLine[], charges: CartCharges = DEFAULT_CHARGES): CartTotals {
  const subtotal = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const discount = r2(
    charges.discountType === 'percent'
      ? subtotal * (charges.discountValue || 0) / 100
      : Math.min(charges.discountValue || 0, subtotal),
  );
  const base = subtotal - discount + (charges.deliveryFee || 0);
  const service = r2(base * (charges.serviceRate || 0) / 100);
  const tax = r2((base + service) * (charges.taxRate || 0) / 100);
  const total = r2(base + service + tax);
  return {
    itemCount: lines.length,
    unitCount: lines.reduce((s, l) => s + l.qty, 0),
    subtotal, discount, service, tax, total,
  };
}

/** Change due for a cash/mixed tender (never negative). Pure. */
export function changeDue(total: number, tendered: number): number {
  return r2(Math.max(0, (tendered || 0) - total));
}

/** Remaining balance when splitting a mixed payment (never negative). Pure. */
export function balanceDue(total: number, paid: number): number {
  return r2(Math.max(0, total - (paid || 0)));
}

/** Quick-cash suggestions above a total (rounded notes). Pure. */
export function quickCashOptions(total: number): number[] {
  if (total <= 0) return [];
  const opts = new Set<number>();
  opts.add(Math.ceil(total));                       // exact (rounded up to whole)
  for (const note of [5, 10, 20, 50, 100, 200, 500]) {
    const up = Math.ceil(total / note) * note;
    if (up >= total) opts.add(up);
  }
  return [...opts].sort((a, b) => a - b).slice(0, 5);
}
