'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { JOURNAL_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { JournalEntry, JournalLine, JournalStatus } from '@/lib/erp/types';
import { ChevronDown, ChevronLeft } from 'lucide-react';

export interface JournalLineRow extends JournalLine {
  account: { code: string; name: string; name_ar: string | null } | null;
}
export interface JournalEntryRow extends JournalEntry {
  lines: JournalLineRow[];
}

const STATUS_VARIANT: Record<JournalStatus, 'secondary' | 'success' | 'destructive'> = {
  draft: 'secondary',
  posted: 'success',
  reversed: 'destructive',
};

export function JournalList({ entries }: { entries: JournalEntryRow[] }) {
  const [open, setOpen] = useState<string | null>(entries[0]?.id ?? null);

  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const total = e.lines.reduce((s, l) => s + Number(l.debit), 0);
        const isOpen = open === e.id;
        return (
          <Card key={e.id}>
            <button
              onClick={() => setOpen(isOpen ? null : e.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-right hover:bg-secondary/30"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                <div>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{e.entry_number}</span>
                  <p className="text-sm font-medium">{e.description || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-sm" dir="ltr">{formatCurrency(total)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(e.entry_date)}</span>
                <Badge variant={STATUS_VARIANT[e.status]}>{JOURNAL_STATUS_LABELS[e.status].ar}</Badge>
              </div>
            </button>
            {isOpen && (
              <CardContent className="border-t p-0">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-right font-medium">الحساب</th>
                      <th className="p-2 text-left font-medium w-32">مدين</th>
                      <th className="p-2 text-left font-medium w-32">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="p-2">
                          <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">
                            {l.account?.code}
                          </span>
                          {l.account?.name_ar || l.account?.name || '—'}
                          {l.description && (
                            <span className="block text-xs text-muted-foreground">{l.description}</span>
                          )}
                        </td>
                        <td className="p-2 text-left tabular-nums" dir="ltr">
                          {Number(l.debit) > 0 ? formatCurrency(l.debit) : '—'}
                        </td>
                        <td className="p-2 text-left tabular-nums" dir="ltr">
                          {Number(l.credit) > 0 ? formatCurrency(l.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
