'use client';

import Link from 'next/link';
import { Printer, ArrowLeft } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Sticky print/back action bar — hidden in the printed output (`print:hidden`). */
export function PrintBar({
  printLabel,
  backHref,
  backLabel,
}: {
  printLabel: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="print:hidden sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
      <Link href={backHref} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}>
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {backLabel}
      </Link>
      <Button onClick={() => window.print()} className="gap-1.5">
        <Printer className="h-4 w-4" />
        {printLabel}
      </Button>
    </div>
  );
}
