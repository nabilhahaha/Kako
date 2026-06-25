import { describe, it, expect } from 'vitest';
import { summarize, groupOrders, groupItems, hourly, topItems, type RepOrder, type RepItem } from './pos-report';

const o = (over: Partial<RepOrder>): RepOrder => ({
  id: 'o', total: 100, paymentMethod: 'cash', orderType: 'takeaway', cashierId: 'c1', cashierName: 'Sam', closedAt: '2026-06-25T13:30:00.000Z', ...over,
});
const it_ = (over: Partial<RepItem>): RepItem => ({ orderId: 'o', name: 'Burger', qty: 1, price: 50, categoryName: 'Mains', ...over });

describe('pos-report — pure aggregation', () => {
  it('summarize: revenue, avg ticket, items sold', () => {
    const s = summarize([o({ total: 100 }), o({ id: 'o2', total: 50 })], [it_({ qty: 2 }), it_({ qty: 3 })]);
    expect(s.orders).toBe(2);
    expect(s.revenue).toBe(150);
    expect(s.avgTicket).toBe(75);
    expect(s.itemsSold).toBe(5);
  });

  it('groupOrders by payment method, sorted by revenue', () => {
    const g = groupOrders(
      [o({ paymentMethod: 'cash', total: 30 }), o({ paymentMethod: 'card', total: 100 }), o({ paymentMethod: 'cash', total: 20 })],
      (x) => x.paymentMethod, (k) => k,
    );
    expect(g[0].key).toBe('card'); // 100 > 50
    expect(g[1].key).toBe('cash');
    expect(g[1].orders).toBe(2);
    expect(g[1].revenue).toBe(50);
  });

  it('groupItems by category aggregates qty + revenue', () => {
    const g = groupItems(
      [it_({ categoryName: 'Mains', qty: 2, price: 50 }), it_({ categoryName: 'Drinks', qty: 4, price: 10 }), it_({ categoryName: 'Mains', qty: 1, price: 50 })],
      (i) => i.categoryName ?? '—', (k) => k,
    );
    expect(g[0].label).toBe('Mains'); // 150 > 40
    expect(g[0].qty).toBe(3);
    expect(g[0].revenue).toBe(150);
  });

  it('hourly buckets by closedAt hour', () => {
    const h = hourly([o({ closedAt: '2026-06-25T13:00:00.000Z', total: 40 }), o({ closedAt: '2026-06-25T13:45:00.000Z', total: 60 })]);
    expect(h).toHaveLength(24);
    expect(h[13].orders).toBe(2);
    expect(h[13].revenue).toBe(100);
  });

  it('topItems returns the highest-revenue items first', () => {
    const t = topItems([it_({ name: 'A', qty: 1, price: 10 }), it_({ name: 'B', qty: 5, price: 10 })], 10);
    expect(t[0].label).toBe('B');
  });
});
