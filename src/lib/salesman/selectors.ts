import type { Collection, Invoice, RouteStop } from './types';

/** First stop that still needs attention, in route order. */
export function nextStop(route: RouteStop[]): RouteStop | null {
  return (
    route.find((r) => r.status === 'in_progress') ??
    route.find((r) => r.status === 'pending') ??
    null
  );
}

export interface DayStats {
  planned: number;
  visited: number;
  remaining: number;
  productive: number;
  salesTotal: number;
  collectionTotal: number;
}

export function dayStats(
  route: RouteStop[],
  invoices: Invoice[],
  collections: Collection[],
): DayStats {
  const planned = route.length;
  const visited = route.filter((r) => r.status === 'visited').length;
  const productive = route.filter((r) => r.outcome === 'sale').length;
  const salesTotal = invoices
    .filter((i) => i.type === 'sale')
    .reduce((a, i) => a + i.total, 0);
  const collectionTotal = collections.reduce((a, c) => a + c.amount, 0);
  return {
    planned,
    visited,
    remaining: planned - visited,
    productive,
    salesTotal,
    collectionTotal,
  };
}
