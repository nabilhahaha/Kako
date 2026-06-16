'use client';

import type { PdfDoc } from './documents';

/**
 * Generate the document PDF (server-rendered from the print view) and open the
 * native share sheet with the FILE. Flow: fetch /api/pdf/... → blob → File →
 * navigator.share({ files }). If file-sharing isn't supported, downloads the PDF
 * (still a PDF, never raw text). Throws on generation failure so the caller can
 * show an error and NOT open the share sheet. A user-cancelled share is silent.
 */
export async function shareDocumentPdf(opts: {
  doc: PdfDoc;
  id: string;
  filename: string;   // includes the document number, e.g. INV-PILOT-000044.pdf
  title?: string;
}): Promise<void> {
  const url = `/api/pdf/${opts.doc}/${opts.id}?name=${encodeURIComponent(opts.filename)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('pdf_generation_failed');
  const blob = await res.blob();
  if (blob.size === 0 || (blob.type && !blob.type.includes('pdf'))) throw new Error('pdf_generation_failed');

  const file = new File([blob], opts.filename, { type: 'application/pdf' });
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  }) : undefined;

  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: opts.title });
    } catch (e) {
      // User dismissed the share sheet — not an error.
      if ((e as { name?: string })?.name === 'AbortError') return;
      throw e;
    }
    return;
  }

  // No Web Share (files) support → download the generated PDF.
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}
