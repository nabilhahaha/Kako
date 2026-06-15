import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Lock, Play, Clock, XCircle } from 'lucide-react';
import { loadDayReopenGate } from '@/lib/van-sales/day-server';
import { ReopenRequestForm } from './reopen-request-form';

// Day-close UI gate (Sell / Collect / Return). The server actions are the source
// of truth; this is the friendly "start a new day" screen the rep sees when the
// day is closed (settled) or not started. Statements / prints stay available.
// When platform.day_reopen is ON, it also offers the governed reopen request and
// reflects its pending / rejected state.
export async function DayClosedGate({ title }: { title: string }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  const gate = ctx ? await loadDayReopenGate(ctx) : null;
  const pending = gate?.request?.status === 'pending';
  const rejected = gate?.request && (gate.request.status === 'rejected' || gate.request.status === 'cancelled');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" home="/today" label={t('vanSales.sell.back')} />
      <PageHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          {pending ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Clock className="h-6 w-6" />
              </div>
              <p className="font-semibold">{t('vanSales.reopen.pendingTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('vanSales.reopen.pendingBody')}</p>
              <Link href="/field/van-sales" className={buttonVariants({ variant: 'outline' })}>
                <Play className="h-4 w-4" /> {t('vanSales.start')}
              </Link>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Lock className="h-6 w-6" />
              </div>
              <p className="font-semibold">{t('vanSales.dayClosedTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('vanSales.dayClosedBody')}</p>
              {rejected && (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle className="h-4 w-4" /> {t('vanSales.reopen.rejectedTitle')}
                </div>
              )}
              <Link href="/field/van-sales" className={buttonVariants()}>
                <Play className="h-4 w-4" /> {t('vanSales.start')}
              </Link>
              {gate?.canRequest && gate.sessionId && (
                <ReopenRequestForm workSessionId={gate.sessionId} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
