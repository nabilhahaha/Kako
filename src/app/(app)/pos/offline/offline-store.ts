// Fast Food POS — OFFLINE local store interface + a browser localStorage implementation.
//
// Persists the offline sale queue + a cached menu on the device, scoped by company id so a
// shared device never leaks another company's data. Stores ONLY sale data (items, frozen
// prices, tax/discount, payment, cashier, timestamp, order mode, local UUID, sync status) and
// the menu cache — NEVER secrets or service-role keys. The interface is storage-agnostic so it
// can be swapped to IndexedDB (larger menus / images) without touching callers.

import type { OfflineSale } from './offline-queue';

export interface OfflineStore {
  list(): OfflineSale[];
  put(sale: OfflineSale): void;     // upsert by localUuid
  remove(localUuid: string): void;
  cacheMenu(menu: unknown): void;
  getMenu<T = unknown>(): T | null;
}

const qKey = (c: string) => `pos.offline.queue.${c}`;
const mKey = (c: string) => `pos.offline.menu.${c}`;

/** localStorage-backed store (browser). IndexedDB-ready: same interface, swap the impl. */
export function localStorageStore(companyId: string): OfflineStore {
  const read = (): OfflineSale[] => {
    try { return JSON.parse(localStorage.getItem(qKey(companyId)) || '[]') as OfflineSale[]; } catch { return []; }
  };
  const write = (l: OfflineSale[]) => { try { localStorage.setItem(qKey(companyId), JSON.stringify(l)); } catch { /* quota */ } };
  return {
    list: read,
    put(sale) { const l = read().filter((x) => x.localUuid !== sale.localUuid); l.push(sale); write(l); },
    remove(localUuid) { write(read().filter((x) => x.localUuid !== localUuid)); },
    cacheMenu(menu) { try { localStorage.setItem(mKey(companyId), JSON.stringify(menu)); } catch { /* quota */ } },
    getMenu<T = unknown>() { try { const v = localStorage.getItem(mKey(companyId)); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  };
}

/** SSR / no-storage fallback (no persistence). */
export function memoryStore(): OfflineStore {
  let q: OfflineSale[] = []; let menu: unknown = null;
  return {
    list: () => q,
    put(s) { q = q.filter((x) => x.localUuid !== s.localUuid).concat(s); },
    remove(uuid) { q = q.filter((x) => x.localUuid !== uuid); },
    cacheMenu(m) { menu = m; },
    getMenu<T = unknown>() { return (menu as T) ?? null; },
  };
}
