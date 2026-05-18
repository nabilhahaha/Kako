import { useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import { generateVisitPdf, generateDamageRequestPdf } from '../lib/pdf.js';
import { db } from '../lib/db.js';
import { visitItemFromDb, damageItemFromDb } from '../lib/mapping.js';

// Single button that handles both visits and damage requests, dispatched by
// which prop was passed. Items are optional — lazy-loaded if missing.
export default function PdfButton({
  visit,
  damageRequest,
  items,
  size = 'sm',
  variant = 'secondary',
  stop = true,
  fullWidth = false,
}) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const onClick = async (e) => {
    if (stop) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy) return;
    if (!visit && !damageRequest) {
      toast(tr.pdfFailed, 'error');
      return;
    }
    setBusy(true);
    try {
      toast(tr.generatingPdf);
      if (damageRequest) {
        let resolved = items;
        if (!resolved) {
          const rows = await db.listDamageItems(damageRequest.id);
          resolved = rows.map(damageItemFromDb);
        }
        await generateDamageRequestPdf(damageRequest, resolved);
      } else {
        let resolved = items;
        if (!resolved) {
          const rows = await db.listVisitItems(visit.id);
          resolved = rows.map(visitItemFromDb);
        }
        await generateVisitPdf(visit, resolved);
      }
      toast(tr.pdfReady, 'success');
    } catch (err) {
      console.error(err);
      toast(tr.pdfFailed + ': ' + (err.message || 'error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const sizeCls =
    size === 'lg' ? 'text-sm px-4 py-3'
    : size === 'md' ? 'text-sm px-3 py-2'
    : 'text-xs px-2.5 py-1';

  const variantCls =
    variant === 'primary'
      ? 'bg-roshen-600 text-white hover:bg-roshen-700'
      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-input font-semibold transition active:scale-[0.98] disabled:opacity-50 ${fullWidth ? 'w-full' : ''} ${sizeCls} ${variantCls}`}
      title={tr.downloadPdf}
    >
      <span aria-hidden>{busy ? '⏳' : '📄'}</span>
      <span className="whitespace-nowrap">{busy ? tr.generatingPdf : tr.downloadPdf}</span>
    </button>
  );
}
