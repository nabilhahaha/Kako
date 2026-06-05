'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { exportBackup } from './actions';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Database } from 'lucide-react';

export function BackupPanel({ counts }: { counts: { products: number; customers: number; invoices: number } }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();

  function download() {
    start(async () => {
      const res = await exportBackup();
      if (!res.ok || !res.data) { toast.error(res.error ?? ''); return; }
      const blob = new Blob([res.data.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('settings.backup.done'));
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2 font-semibold"><Database className="h-5 w-5" /> {t('settings.backup.heading')}</div>
        <p className="text-sm text-muted-foreground">{t('settings.backup.note')}</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {([['products', counts.products], ['customers', counts.customers], ['invoices', counts.invoices]] as const).map(([k, n]) => (
            <div key={k} className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t(`settings.backup.${k}` as 'settings.backup.products')}</p>
              <p className="text-lg font-bold tabular-nums" dir="ltr">{n}</p>
            </div>
          ))}
        </div>
        <Button onClick={download} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t('settings.backup.download')}
        </Button>
        <p className="text-[11px] text-muted-foreground">{t('settings.backup.hint')}</p>
      </CardContent>
    </Card>
  );
}
