'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Boxes, HandCoins, LockOpen, Send, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { requestCashHandover, type MyRequest } from '@/lib/van-sales/requests-server';

const TONE: Record<MyRequest['tone'], 'secondary' | 'success' | 'destructive'> = { pending: 'secondary', done: 'success', rejected: 'destructive' };

export function RequestsHub({
  myRequests, canLoad, canCash, canReopen, dayClosed,
}: {
  myRequests: MyRequest[];
  canLoad: boolean; canCash: boolean; canReopen: boolean; dayClosed: boolean;
}) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const router = useRouter();
  const [cashOpen, setCashOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en'); } catch { return iso; } };

  async function submitCash() {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error(t('vanSales.requests.amountRequired')); return; }
    setBusy(true);
    try {
      const res = await requestCashHandover({ amount: amt, note });
      if (!res.ok) { toast.error(res.error ?? '—'); return; }
      toast.success(t('vanSales.requests.submitted'));
      setCashOpen(false); setAmount(''); setNote('');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* Request types */}
      <div className="space-y-3">
        {canLoad && (
          <Link href="/field/van-sales/request" className="block">
            <Card className="transition-colors hover:bg-secondary/50">
              <CardContent className="flex items-center gap-3 py-4">
                <Boxes className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t('vanSales.requests.load')}</div>
                  <div className="text-xs text-muted-foreground">{t('vanSales.requests.loadDesc')}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </CardContent>
            </Card>
          </Link>
        )}

        {canCash && (
          <Card>
            <CardContent className="py-4">
              <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setCashOpen((v) => !v)}>
                <HandCoins className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t('vanSales.requests.cashHandover')}</div>
                  <div className="text-xs text-muted-foreground">{t('vanSales.requests.cashDesc')}</div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${cashOpen ? 'rotate-90' : 'rtl:rotate-180'}`} />
              </button>
              {cashOpen && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="space-y-1.5">
                    <Label>{t('vanSales.requests.amount')}</Label>
                    <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('vanSales.requests.note')}</Label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('vanSales.requests.notePlaceholder')} />
                  </div>
                  <Button className="w-full" disabled={busy} onClick={submitCash}>
                    <Send className="h-4 w-4" /> {busy ? t('vanSales.requests.submitting') : t('vanSales.requests.submit')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canReopen && (
          <Link href="/today" className="block">
            <Card className="transition-colors hover:bg-secondary/50">
              <CardContent className="flex items-center gap-3 py-4">
                <LockOpen className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t('vanSales.requests.reopen')}</div>
                  <div className="text-xs text-muted-foreground">{dayClosed ? t('vanSales.requests.reopenReady') : t('vanSales.requests.reopenWhenClosed')}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* My requests */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.requests.myRequests')}</h2>
        {myRequests.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('vanSales.requests.empty')}</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {myRequests.map((r) => (
                  <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t(`vanSales.requests.kind.${r.kind}`)}{r.amount != null ? ` · ${formatCurrency(r.amount, 'EGP', intl)}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</div>
                    </div>
                    <Badge variant={TONE[r.tone]}>{t(`vanSales.requests.st.${r.tone}`)}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
