'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { decideTask } from './actions';

export interface TaskRow {
  id: string; entity: string; recordId: string; recordLabel: string; stepNo: number; createdAt: string;
  overdue?: boolean; escalated?: boolean;
}

export function ApprovalsManager({ tasks }: { tasks: TaskRow[] }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await decideTask(id, decision, comments[id]);
      if (!res.ok) return toast.error(res.error ?? t('workflow.toast.error'));
      toast.success(decision === 'approve' ? t('workflow.toast.approved') : t('workflow.toast.rejected'));
    } catch {
      toast.error(t('workflow.toast.error'));
    } finally {
      setBusy(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p>{t('workflow.empty')}</p>
        </CardContent>
      </Card>
    );
  }

  const entityLabel = (e: string) => t(`workflow.entity.${e}`, {}) || e;

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{entityLabel(task.entity)}</Badge>
                <span className="font-medium">{task.recordLabel}</span>
                {task.escalated && <Badge variant="destructive">{t('workflow.escalated')}</Badge>}
                {task.overdue && !task.escalated && <Badge variant="warning">{t('workflow.overdue')}</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t('workflow.step', { n: task.stepNo })} · {formatDate(task.createdAt, INTL_LOCALE[locale])}
              </div>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <Input
                className="h-9 max-w-xs"
                placeholder={t('workflow.commentPlaceholder')}
                value={comments[task.id] ?? ''}
                onChange={(e) => setComments((c) => ({ ...c, [task.id]: e.target.value }))}
              />
              <Button size="sm" variant="outline" disabled={busy === task.id}
                onClick={() => decide(task.id, 'reject')}>
                <XCircle className="h-4 w-4 text-destructive" /> {t('workflow.reject')}
              </Button>
              <Button size="sm" disabled={busy === task.id} onClick={() => decide(task.id, 'approve')}>
                <CheckCircle2 className="h-4 w-4" /> {t('workflow.approve')}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
