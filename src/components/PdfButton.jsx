import { useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import { generateSubmissionPdf } from '../lib/pdf.js';

export default function PdfButton({ submission, size = 'sm', variant = 'secondary', stop = true, fullWidth = false }) {
  const { tr, lang } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const onClick = async (e) => {
    if (stop) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy) return;
    setBusy(true);
    try {
      toast(tr.generatingPdf);
      await generateSubmissionPdf(submission, lang);
      toast(tr.pdfReady, 'success');
    } catch (err) {
      console.error(err);
      toast(tr.pdfFailed + ': ' + (err.message || 'error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const sizeCls =
    size === 'lg'
      ? 'text-sm px-4 py-3'
      : size === 'md'
      ? 'text-sm px-3 py-2'
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
