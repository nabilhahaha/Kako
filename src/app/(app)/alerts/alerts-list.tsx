'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Clock, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { acknowledgeAlert, snoozeAlert, resolveAlert } from './actions';
import type { AlertRow } from '@/lib/alerts/list-server';

const SEVERITY_CLASS: Record<string, string> = {
  info: 'bg-secondary text-muted-foreground',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

export function AlertsList({ rows }: { rows: AlertRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(id);
    try {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('alertsUi.error')); return; }
      toast.success(ok);
      router.refresh();
    } catch {
      toast.error(t('alertsUi.error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_CLASS[r.severity] ?? SEVERITY_CLASS.info}`}>
                  {t(`alertsUi.severity.${r.severity}`)}
                </span>
                <span className="text-sm font-medium">{r.title ?? r.ruleKey}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t(`alertsUi.status.${r.status}`)}</span>
              </div>
              {r.body && <div className="text-xs text-muted-foreground">{r.body}</div>}
              <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-2">
              {r.status !== 'acknowledged' && (
                <Button type="button" size="sm" variant="outline" disabled={busy === r.id}
                  onClick={() => act(r.id, () => acknowledgeAlert(r.id), t('alertsUi.acknowledged'))}>
                  <Check className="h-4 w-4" /> {t('alertsUi.acknowledge')}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" disabled={busy === r.id}
                onClick={() => act(r.id, () => snoozeAlert(r.id, 24), t('alertsUi.snoozed'))}>
                <Clock className="h-4 w-4" /> {t('alertsUi.snooze')}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy === r.id}
                onClick={() => act(r.id, () => resolveAlert(r.id), t('alertsUi.resolved'))}>
                <X className="h-4 w-4" /> {t('alertsUi.resolve')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
