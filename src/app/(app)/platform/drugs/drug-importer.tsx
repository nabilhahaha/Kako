'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Loader2, Pill, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { importEgyptianDrugs } from '../../clinic/reference-actions';
import { useI18n } from '@/lib/i18n/provider';

export function DrugImporter({ initialCount }: { initialCount: number }) {
  const { t } = useI18n();
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await importEgyptianDrugs();
      if (!res.ok) { toast.error(res.error ?? t('platform.drugs.toastError')); return; }
      setCount(res.count ?? 0);
      toast.success(t('platform.drugs.toastImported', { count: String(res.count?.toLocaleString('en') ?? 0) }));
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Pill className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">{t('platform.drugs.loadedCount')}</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{count.toLocaleString('en')}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {t('platform.drugs.importHint')}
        </p>

        <Button onClick={run} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {count > 0 ? t('platform.drugs.updateButton') : t('platform.drugs.importButton')}
        </Button>

        {count > 0 && (
          <p className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t('platform.drugs.readyLabel')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
