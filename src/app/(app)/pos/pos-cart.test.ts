import { describe, it, expect } from 'vitest';
import {
  addToCart, setQty, incQty, decQty, removeLine, setLineNote, cartTotals, changeDue,
  balanceDue, quickCashOptions, type CartLine, type CartCharges,
} from './pos-cart';

const P = (id: string, price: number) => ({ productId: id, name: id, price, taxRate: 0 });

describe('pos-cart — pure ticket model', () => {
  it('addToCart appends new, bumps qty on repeat', () => {
    let lines: CartLine[] = [];
    lines = addToCart(lines, P('a', 10));
    lines = addToCart(lines, P('b', 5));
    lines = addToCart(lines, P('a', 10)); // repeat → qty 2
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.productId === 'a')!.qty).toBe(2);
  });

  it('inc/dec/setQty/remove behave', () => {
    let lines = addToCart([], P('a', 10), 1);
    lines = incQty(lines, 'a');           // 2
    expect(lines[0].qty).toBe(2);
    lines = decQty(lines, 'a');           // 1
    expect(lines[0].qty).toBe(1);
    lines = decQty(lines, 'a');           // 0 → removed
    expect(lines).toHaveLength(0);
    lines = addToCart([], P('a', 10), 3);
    lines = setQty(lines, 'a', 0);        // remove
    expect(lines).toHaveLength(0);
  });

  it('setLineNote trims and nulls empty', () => {
    let lines = addToCart([], P('a', 10));
    lines = setLineNote(lines, 'a', '  extra cheese ');
    expect(lines[0].note).toBe('extra cheese');
    lines = setLineNote(lines, 'a', '   ');
    expect(lines[0].note).toBeNull();
  });

  it('removeLine drops the line', () => {
    const lines = removeLine(addToCart(addToCart([], P('a', 10)), P('b', 5)), 'a');
    expect(lines.map((l) => l.productId)).toEqual(['b']);
  });

  it('cartTotals: subtotal/discount/service/tax/total match the RPC formula', () => {
    const lines: CartLine[] = [
      { productId: 'a', name: 'Burger', price: 50, taxRate: 0, qty: 2 }, // 100
      { productId: 'b', name: 'Fries', price: 20, taxRate: 0, qty: 1 },  // 20
    ];
    // subtotal 120; 10% discount = 12; base = 108; service 10% = 10.8; tax 14% of 118.8 = 16.632→16.63
    const charges: CartCharges = { discountType: 'percent', discountValue: 10, serviceRate: 10, taxRate: 14, deliveryFee: 0 };
    const t = cartTotals(lines, charges);
    expect(t.subtotal).toBe(120);
    expect(t.discount).toBe(12);
    expect(t.service).toBe(10.8);
    expect(t.tax).toBe(16.63);
    expect(t.total).toBe(135.43); // 108 + 10.8 + 16.63
    expect(t.unitCount).toBe(3);
    expect(t.itemCount).toBe(2);
  });

  it('cartTotals: amount discount is capped at subtotal; delivery fee adds to base', () => {
    const lines: CartLine[] = [{ productId: 'a', name: 'x', price: 30, taxRate: 0, qty: 1 }];
    const t = cartTotals(lines, { discountType: 'amount', discountValue: 999, serviceRate: 0, taxRate: 0, deliveryFee: 15 });
    expect(t.discount).toBe(30);       // capped
    expect(t.total).toBe(15);          // 0 + delivery 15
  });

  it('changeDue / balanceDue never go negative', () => {
    expect(changeDue(100, 120)).toBe(20);
    expect(changeDue(100, 80)).toBe(0);
    expect(balanceDue(100, 60)).toBe(40);
    expect(balanceDue(100, 130)).toBe(0);
  });

  it('quickCashOptions returns rounded suggestions ≥ total', () => {
    const opts = quickCashOptions(72);
    expect(opts.every((o) => o >= 72)).toBe(true);
    expect(opts).toContain(80); // next 10
    expect(opts).toContain(100);
  });
});
