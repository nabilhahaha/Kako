'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { getActiveVisit, type ActiveVisit } from '@/lib/van-sales/active-visit';
import { RotateCcw } from 'lucide-react';

// Resume Current Visit — on launch, if a visit was started but not completed,
// surface a one-tap resume instead of forcing a return through the route screen.
// Reads the localStorage active-visit marker (survives app restart). Rendered by
// the workspace only when Smart Next Customer is enabled.
export function ResumeVisitBanner() {
  const { t } = useI18n();
  const [av, setAv] = useState<ActiveVisit | null>(null);
  useEffect(() => { setAv(getActiveVisit()); }, []);
  if (!av) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex items-center gap-3 p-3">
        <RotateCcw className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t('vanSales.smartNext.resumeTitle')}</div>
          <div className="truncate text-xs text-muted-foreground">{t('vanSales.smartNext.resumeBody', { name: av.name })}</div>
        </div>
        <Link href={`/field/van-sales/statement/${av.customerId}?from=route`} className={buttonVariants({ size: 'sm' })}>
          {t('vanSales.smartNext.resume')}
        </Link>
      </CardContent>
    </Card>
  );
}
