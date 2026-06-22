import type { HCustomer } from './route-planner-data-health';

/**
 * Shared "Map" step for the Route Planner ingestion pipeline. Turns raw rows + a
 * column mapping into the canonical HCustomer shape used by Data Health and the sync
 * summary. ONE implementation, used by both the Manual Upload flow (client) and the
 * Google Sheets / API connectors (server) — so every source maps identically.
 */

export type CmMapping = Record<string, string | undefined>;

const str = (v: unknown) => { const s = (v ?? '').toString().trim(); return s || null; };
const num = (v: unknown) => { const n = Number((v ?? '').toString().trim()); return Number.isFinite(n) ? n : null; };

/** Customer-master fields that drive the planner + Data Health. */
export const CM_FIELD_KEYS = ['name', 'lat', 'lng', 'code', 'salesman', 'route'] as const;

export function toCustomers(records: Record<string, string>[], m: CmMapping): HCustomer[] {
  return records.map((r) => ({
    code: m.code ? str(r[m.code]) : null,
    name: m.name ? str(r[m.name]) : null,
    lat: m.lat ? num(r[m.lat]) : null,
    lng: m.lng ? num(r[m.lng]) : null,
    salesman: m.salesman ? str(r[m.salesman]) : null,
    route: m.route ? str(r[m.route]) : null,
  }));
}

/** A customer is "valid" (importable) when it has a name and finite coordinates. */
export function isValidCustomer(c: HCustomer): boolean {
  return Boolean(c.name && c.lat != null && c.lng != null);
}
