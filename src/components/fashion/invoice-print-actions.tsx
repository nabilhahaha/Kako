'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, FileDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/** Print toolbar for the fashion invoice (hidden on the printed page itself).
 *  Both actions use the browser print pipeline: "Print" sends to a printer,
 *  "Save as PDF" opens the same dialog where the user picks the PDF destination —
 *  dependency-free and offline-tolerant. The page is the canonical PDF artifact.
 *  When `autoPrint` is set (e.g. opened via a "Reprint"/"Download PDF" link with
 *  ?print=1) the print dialog is triggered once on mount. */
export function InvoicePrintActions({ autoPrint = false }: { autoPrint?: boolean }) {
  const { t } = useI18n();
  const fired = useRef(false);
  useEffect(() => {
    if (autoPrint && !fired.current) {
      fired.current = true;
      // Defer so the page (logo/images) has painted before the dialog opens.
      const id = setTimeout(() => window.print(), 350);
      return () => clearTimeout(id);
    }
  }, [autoPrint]);

  return (
    <div className="flex gap-2 print:hidden">
      <Button onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> {t('fashion.invoices.print')}
      </Button>
      <Button variant="outline" onClick={() => window.print()} title={t('fashion.invoices.savePdfHint')}>
        <FileDown className="h-4 w-4" /> {t('fashion.invoices.savePdf')}
      </Button>
    </div>
  );
}
