import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Lock, Play } from 'lucide-react';

// Day-close UI gate (Sell / Collect / Return). The server actions are the source
// of truth; this is the friendly "start a new day" screen the rep sees when the
// day is closed (settled) or not started. Statements / prints stay available.
export async function DayClosedGate({ title }: { title: string }) {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
      <PageHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Lock className="h-6 w-6" />
          </div>
          <p className="font-semibold">{t('vanSales.dayClosedTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('vanSales.dayClosedBody')}</p>
          <Link href="/field/van-sales" className={buttonVariants()}>
            <Play className="h-4 w-4" /> {t('vanSales.start')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
