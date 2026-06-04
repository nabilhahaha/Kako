/**
 * Import engine — FK (referential) resolution helpers (pure; no I/O).
 *
 * A `ref` field on an entity carries a human value (e.g. an invoice number,
 * product code, customer code) that must be resolved to a foreign-key id before
 * insert. The DB lookups are batched by the server action; these pure helpers
 * (a) collect the distinct values to look up and (b) map a row's ref values to
 * FK columns, reporting any that don't resolve (referential-integrity errors).
 *
 * Pattern adapted from ERPNext "Link" import, Odoo external-id/relational import,
 * SAP Business One DTW key lookups, and Dynamics 365 alternate-key resolution.
 */

export interface RefSpec {
  /** Lookup table, e.g. 'erp_products_catalog'. */
  table: string;
  /** Columns to match the provided value against (any match wins), e.g. ['code','external_id']. */
  match: string[];
  /** FK column written on the imported row, e.g. 'product_id'. */
  column: string;
}

export interface RefFieldDef {
  key: string;        // the *_ref field key on the row
  labelEn: string;
  required?: boolean;
  ref: RefSpec;
}

export interface RefMissing {
  field: string;
  label: string;
  value: string;
}

/** Distinct, non-empty, lower-cased values to look up per ref field. */
export function collectRefValues(
  rows: readonly Record<string, string>[],
  refFields: readonly RefFieldDef[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const rf of refFields) {
    const set = new Set<string>();
    for (const r of rows) {
      const v = (r[rf.key] ?? '').trim();
      if (v) set.add(v.toLowerCase());
    }
    out.set(rf.key, [...set]);
  }
  return out;
}

/**
 * Resolve one row's ref values to FK columns using pre-built maps
 * (`fieldKey → Map<loweredValue, id>`). Returns the FK columns to merge into the
 * insert payload and any unresolved refs (a provided value that didn't match).
 * An empty value on a non-required ref is skipped; a required ref's emptiness is
 * handled by the standard required-field check, not here.
 */
export function resolveRowRefs(
  row: Record<string, string>,
  refFields: readonly RefFieldDef[],
  maps: ReadonlyMap<string, ReadonlyMap<string, string>>,
): { fk: Record<string, string>; missing: RefMissing[] } {
  const fk: Record<string, string> = {};
  const missing: RefMissing[] = [];
  for (const rf of refFields) {
    const raw = (row[rf.key] ?? '').trim();
    if (!raw) continue; // empty → required check covers it; optional → no FK
    const id = maps.get(rf.key)?.get(raw.toLowerCase());
    if (id) fk[rf.ref.column] = id;
    else missing.push({ field: rf.key, label: rf.labelEn, value: raw });
  }
  return { fk, missing };
}
