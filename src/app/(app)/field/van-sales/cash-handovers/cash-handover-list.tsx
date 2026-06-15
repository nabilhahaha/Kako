'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, User, HandCoins } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { decideCashHandover, type PendingCashHandover } from '@/lib/van-sales/requests-server';

export function CashHandoverList({ requests }: { requests: PendingCashHandover[] }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(locale === 'ar' ? 'ar' : 'en'); } catch { return iso; } };

  async function decide(id: string, decision: 'confirm' | 'reject') {
    setBusy(id);
    try {
      const res = await decideCashHandover({ requestId: id, decision, note: notes[id] });
      if (!res.ok) { toast.error(res.error ?? '—'); return; }
      toast.success(t(decision === 'confirm' ? 'vanSales.requests.confirm.confirmed' : 'vanSales.requests.confirm.rejected'));
      router.refresh();
    } finally { setBusy(null); }
  }

  if (requests.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('vanSales.requests.confirm.empty')}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold"><HandCoins className="h-4 w-4 text-muted-foreground" /> {formatCurrency(r.amount, 'EGP', intl)}</span>
              <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4 text-muted-foreground" /> {r.salesmanName}</span>
              <span className="text-xs text-muted-foreground">{t('vanSales.requests.confirm.requestedAt')}: {fmt(r.createdAt)}</span>
            </div>
            {r.note && <div className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">{r.note}</div>}
            <div className="space-y-1.5">
              <Label>{t('vanSales.requests.confirm.noteLabel')}</Label>
              <input
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" loading={busy === r.id} onClick={() => decide(r.id, 'reject')}>
                {busy === r.id ? t('common.processing') : <><X className="h-4 w-4" /> {t('vanSales.requests.confirm.reject')}</>}
              </Button>
              <Button className="flex-1" loading={busy === r.id} onClick={() => decide(r.id, 'confirm')}>
                {busy === r.id ? t('common.processing') : <><Check className="h-4 w-4" /> {t('vanSales.requests.confirm.confirm')}</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
