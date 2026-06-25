// Fast Food / Restaurant POS — reporting aggregation (pure, no I/O / no React).
// Aggregates closed restaurant orders + their items into the POS report shapes (summary,
// by cashier / product / category / payment / mode / hour, top items). Kept pure + tested.

export interface RepOrder {
  id: string;
  total: number;
  paymentMethod: string;     // cash | card | mixed
  orderType: string;         // dine_in | takeaway | delivery
  cashierId: string | null;
  cashierName: string | null;
  closedAt: string | null;   // ISO
}
export interface RepItem {
  orderId: string;
  name: string;
  qty: number;
  price: number;
  categoryName: string | null;
}

export interface Bucket { key: string; label: string; orders: number; revenue: number }
export interface ItemBucket { key: string; label: string; qty: number; revenue: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface RepSummary { orders: number; revenue: number; avgTicket: number; itemsSold: number }

export function summarize(orders: readonly RepOrder[], items: readonly RepItem[]): RepSummary {
  const revenue = r2(orders.reduce((s, o) => s + (o.total || 0), 0));
  const itemsSold = items.reduce((s, i) => s + (i.qty || 0), 0);
  return { orders: orders.length, revenue, avgTicket: orders.length ? r2(revenue / orders.length) : 0, itemsSold };
}

/** Group orders by a key (orders count + revenue), sorted by revenue desc. Pure. */
export function groupOrders(orders: readonly RepOrder[], keyFn: (o: RepOrder) => string, labelFn: (k: string) => string): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const o of orders) {
    const key = keyFn(o);
    const b = m.get(key) ?? { key, label: labelFn(key), orders: 0, revenue: 0 };
    b.orders += 1; b.revenue = r2(b.revenue + (o.total || 0));
    m.set(key, b);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Group items by a key (qty + revenue), sorted by revenue desc. Pure. */
export function groupItems(items: readonly RepItem[], keyFn: (i: RepItem) => string, labelFn: (k: string) => string): ItemBucket[] {
  const m = new Map<string, ItemBucket>();
  for (const i of items) {
    const key = keyFn(i);
    const b = m.get(key) ?? { key, label: labelFn(key), qty: 0, revenue: 0 };
    b.qty += (i.qty || 0); b.revenue = r2(b.revenue + (i.qty || 0) * (i.price || 0));
    m.set(key, b);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Orders + revenue per hour (0..23) for closed orders that have a timestamp. Pure. */
export function hourly(orders: readonly RepOrder[]): Bucket[] {
  const out: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${String(h).padStart(2, '0')}:00`, orders: 0, revenue: 0 }));
  for (const o of orders) {
    if (!o.closedAt) continue;
    const h = new Date(o.closedAt).getHours();
    if (h >= 0 && h < 24) { out[h].orders += 1; out[h].revenue = r2(out[h].revenue + (o.total || 0)); }
  }
  return out;
}

export function topItems(items: readonly RepItem[], n = 10): ItemBucket[] {
  return groupItems(items, (i) => i.name, (k) => k).slice(0, n);
}
