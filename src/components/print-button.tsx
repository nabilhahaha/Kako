'use client';

import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export function PrintButton({ label = 'طباعة' }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
