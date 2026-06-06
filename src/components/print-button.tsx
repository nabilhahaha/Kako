'use client';

import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { printDocument } from '@/lib/erp/print';

export function PrintButton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <Button onClick={() => printDocument()} className="print:hidden">
      <Printer className="h-4 w-4" /> {label ?? t('shared.print')}
    </Button>
  );
}
