/**
 * Document Numbering — pure types + helpers (no I/O). Configures `erp_sequences`
 * (prefix + the next number to be issued) without touching the issuing engine.
 *
 * Engine contract (erp_next_number): on each issue it does current_val := current_val + 1
 * and renders `PREFIX-BRANCHCODE-NNNNNN` (zero-padded to 6). Therefore:
 *   - the NEXT number a document will get  = current_val + 1
 *   - to make the next issued number = N    set current_val = N - 1
 * The branch code and padding are engine-fixed and intentionally NOT editable
 * here (scope = prefix + next number + preview), so saved config can never
 * change the format of already-issued documents.
 */

export interface DocTypeDef {
  /** erp_sequences.seq_type */
  key: string;
  /** Default prefix the engine uses when a sequence is first created. */
  defaultPrefix: string;
}

/** The document types the engine knows (mirrors erp_next_number's CASE). */
export const DOC_TYPE_DEFS: DocTypeDef[] = [
  { key: 'invoice', defaultPrefix: 'INV' },
  { key: 'sales_order', defaultPrefix: 'SO' },
  { key: 'purchase_order', defaultPrefix: 'PO' },
  { key: 'journal', defaultPrefix: 'JV' },
  { key: 'transfer', defaultPrefix: 'TR' },
  { key: 'goods_receipt', defaultPrefix: 'GR' },
  { key: 'return', defaultPrefix: 'RET' },
  { key: 'payment_voucher', defaultPrefix: 'PV' },
  { key: 'receipt_voucher', defaultPrefix: 'RV' },
  { key: 'collection', defaultPrefix: 'COL' },
];

export const NUMBER_PAD = 6;

/** Zero-pad the running counter exactly as the engine does. */
export function padNumber(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(NUMBER_PAD, '0');
}

/** Render the document number the way erp_next_number will. */
export function previewNumber(prefix: string, branchCode: string, nextNumber: number): string {
  return `${prefix}-${branchCode}-${padNumber(nextNumber)}`;
}

/** Next number a document will receive, given the stored counter (or none yet). */
export function nextFromCurrent(currentVal: number | null): number {
  return (currentVal ?? 0) + 1;
}

/** Counter value to store so the next issued number equals `nextNumber`. */
export function currentFromNext(nextNumber: number): number {
  return Math.max(0, Math.trunc(nextNumber) - 1);
}

/** Keep prefixes safe + tidy: uppercase, letters/digits only, trimmed, ≤ 8. */
export function sanitizePrefix(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/**
 * A requested next number is valid only if it does not reuse an already-issued
 * number. The smallest allowed next number is `(currentVal ?? 0) + 1` — i.e. you
 * may keep or skip ahead, never go back below what's already been printed.
 */
export function isNextNumberAllowed(nextNumber: number, currentVal: number | null): boolean {
  if (!Number.isFinite(nextNumber) || nextNumber < 1) return false;
  return nextNumber >= nextFromCurrent(currentVal);
}
