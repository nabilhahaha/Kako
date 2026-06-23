// FV mobile — Assigned Customer List search. Pure (no JSX / no 'use client' / no
// 'use server') so the rep's manual-selection search is unit-tested and reusable by the
// client component. Matches a free-text query against the fields the rep can search by:
// customer code, name, city, or channel (case-insensitive, trimmed, substring).

export interface SearchableCustomer {
  code: string | null;
  name: string;
  city: string | null;
  channel: string | null;
}

/** True when the query is empty, or it appears (case-insensitive substring) in the
 *  customer's code, name, city, or channel. */
export function matchesCustomerSearch(c: SearchableCustomer, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [c.code, c.name, c.city, c.channel].some((f) => (f ?? '').toLowerCase().includes(needle));
}

/** Filter assigned customers by the search query (code / name / city / channel). */
export function filterAssignedCustomers<T extends SearchableCustomer>(rows: T[], query: string): T[] {
  return rows.filter((c) => matchesCustomerSearch(c, query));
}

/** A completed verification, searchable by code / name / submitted (new) city + channel. */
export interface SearchableCompleted {
  code: string | null;
  name: string;
  newCity: string | null;
  newChannel: string | null;
}

/** Filter the "Completed" tab by code / name / city / channel (the submitted/new values). */
export function filterCompletedVerifications<T extends SearchableCompleted>(rows: T[], query: string): T[] {
  return rows.filter((c) =>
    matchesCustomerSearch({ code: c.code, name: c.name, city: c.newCity, channel: c.newChannel }, query),
  );
}
