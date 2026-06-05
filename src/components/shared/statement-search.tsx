'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency } from '@/lib/utils';
import { FileText, Printer, Search } from 'lucide-react';

export interface StmtRow {
  id: string;
  code: string | null;
  name: string;
  name_ar: string | null;
  phone: string | null;
  balance: number;
}

/** Search a customer/supplier, then open their statement or print it as PDF —
 *  reused by both Customer Statement and Supplier Statement landing pages. */
export function StatementSearch({
  rows,
  statementBase,
  printBase,
  balanceLabel,
}: {
  rows: StmtRow[];
  statementBase: string;
  printBase: string;
  balanceLabel: string;
}) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const pick = (en: string, ar: string | null) => (locale === 'ar' ? ar || en : en);
  const needle = q.trim().toLowerCase();
  const filtered = (needle
    ? rows.filter((r) => `${r.name} ${r.name_ar ?? ''} ${r.code ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(needle))
    : rows
  ).slice(0, 100);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('shared.statementSearch.search')} className="ps-8" />
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('shared.statementSearch.none')}</p>
          ) : filtered.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{pick(r.name, r.name_ar)}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">{r.code ?? ''}{r.phone ? ` · ${r.phone}` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm tabular-nums text-muted-foreground" dir="ltr">{balanceLabel}: {formatCurrency(r.balance)}</span>
                <Link href={`${statementBase}/${r.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                  <FileText className="h-3.5 w-3.5" /> {t('shared.statementSearch.open')}
                </Link>
                <Link href={`${printBase}/${r.id}`} target="_blank" className={buttonVariants({ size: 'sm' })}>
                  <Printer className="h-3.5 w-3.5" /> {t('shared.statementSearch.printPdf')}
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
