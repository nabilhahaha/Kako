'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { formatDate } from '@/lib/utils';
import type { RollbackRow, RollbackReason } from '@/lib/erp/import-rollback';
import { rollbackImportJob } from '../actions';

export interface RollbackItem extends RollbackRow { entityLabel: string }

export function RollbackList({ items }: { items: RollbackItem[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function onRollback(item: RollbackItem) {
    if (!window.confirm(t('onboarding.rollback.confirm', { count: item.successRows }))) return;
    setBusy(item.id);
    try {
      const res = await rollbackImportJob(item.id);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('onboarding.rollback.error'));
        return;
      }
      toast.success(t('onboarding.rollback.reverted', { count: res.data.deleted }));
      router.refresh();
    } catch {
      toast.error(t('onboarding.rollback.error'));
    } finally {
      setBusy(null);
    }
  }

  const reasonText = (reason: RollbackReason) =>
    reason === 'ok' ? '' : t(`onboarding.rollback.reason.${reason}`);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-start font-medium">{t('onboarding.rollback.file')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('onboarding.rollback.entity')}</th>
            <th className="px-4 py-2 text-end font-medium">{t('onboarding.rollback.rows')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('onboarding.rollback.date')}</th>
            <th className="px-4 py-2 text-end font-medium">{t('onboarding.rollback.action')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t align-middle">
              <td className="px-4 py-2">{item.fileName}</td>
              <td className="px-4 py-2">{item.entityLabel}</td>
              <td className="px-4 py-2 text-end tabular-nums">{item.successRows}/{item.totalRows}</td>
              <td className="px-4 py-2 whitespace-nowrap">{item.createdAt ? formatDate(item.createdAt) : '—'}</td>
              <td className="px-4 py-2 text-end">
                {item.rolledBack ? (
                  <Badge variant="secondary"><CheckCircle2 className="me-1 h-3 w-3" />{t('onboarding.rollback.rolledBack')}</Badge>
                ) : item.eligible ? (
                  <Button variant="outline" size="sm" disabled={busy === item.id} onClick={() => onRollback(item)}>
                    <Undo2 className="h-4 w-4" /> {t('onboarding.rollback.action')}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{reasonText(item.reason)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
