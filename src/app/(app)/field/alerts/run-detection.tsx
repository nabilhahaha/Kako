'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, ScanLine } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { runDetection } from './alerts-actions';

/** Admin-only "Run detection" — re-runs the company's alert rules (idempotent). */
export function RunDetection() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      const res = await runDetection();
      if (!res.ok) { toast.error(res.error === 'forbidden' ? t('field.alerts.runForbidden') : t('field.alerts.runFailed')); return; }
      toast.success(t('field.alerts.ran').replace('{n}', String(res.data?.total ?? 0)));
      router.refresh();
    })}>
      {pending ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : <ScanLine className="me-1.5 h-4 w-4" />}
      {pending ? t('field.alerts.running') : t('field.alerts.run')}
    </Button>
  );
}
