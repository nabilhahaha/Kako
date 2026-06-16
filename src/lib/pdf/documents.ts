// Document PDF mapping — PURE (no I/O). Maps a shareable document type to its
// print page (the single source of truth for layout, reused by Print + PDF) and
// sanitizes the share filename so it always carries the document number.

export type PdfDoc = 'invoice' | 'collection' | 'return' | 'statement';

export const PDF_DOCS: PdfDoc[] = ['invoice', 'collection', 'return', 'statement'];

export function isPdfDoc(s: string): s is PdfDoc {
  return (PDF_DOCS as string[]).includes(s);
}

/** The print-page path that renders this document (identical to the Print view). */
export function printPathFor(doc: PdfDoc, id: string): string {
  switch (doc) {
    case 'invoice': return `/print/invoices/${id}`;
    case 'collection': return `/print/collection/${id}`;
    case 'return': return `/sales/returns/${id}/print`;
    case 'statement': return `/print/statement/${id}`;
  }
}

/**
 * A safe PDF filename that contains the document number (e.g. INV-PILOT-000044 →
 * "INV-PILOT-000044.pdf"). Strips unsafe characters, falls back to the id when no
 * usable name is given, and always ends in ".pdf". Pure.
 */
export function pdfFilename(rawName: string | null | undefined, fallbackId: string): string {
  const cleaned = String(rawName ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const base = cleaned || `DOC-${fallbackId}`;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}
