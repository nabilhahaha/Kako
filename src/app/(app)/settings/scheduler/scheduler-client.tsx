'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { ensureDefaults, runJob, setEnabled } from './sched-actions';

export interface Job {
  id: string; key: string; label: string; enabled: boolean; critical: boolean; interval_minutes: number;
  last_run_at: string | null; next_run_at: string | null; last_status: string | null; last_duration_ms: number | null; last_error: string | null; stale: boolean;
}
const STATUS_TONE: Record<string, string> = { ok: 'border-green-500/50 text-green-700', failed: 'border-red-500/50 text-red-700', running: 'border-sky-500/50 text-sky-700' };

export function SchedulerClient({ jobs }: { jobs: Job[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg: string) => start(async () => {
    const r = await fn();
    const d = r.data as { ok?: boolean; error?: string } | undefined;
    if (!r.ok || (d && d.ok === false)) { toast.error(d?.error ?? r.error ?? t('scheduler.runFailed')); router.refresh(); return; }
    toast.success(okMsg); router.refresh();
  });
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const dur = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(ensureDefaults, t('scheduler.ran'))}>{t('scheduler.ensure')}</Button>
      </div>
      {jobs.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('scheduler.empty')}</CardContent></Card>
      ) : jobs.map((j) => (
        <Card key={j.id} className={j.stale ? 'border-red-500/50' : undefined}><CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{j.label}</span>
            {j.critical && <Badge variant="outline">{t('scheduler.critical')}</Badge>}
            {j.last_status && <Badge variant="outline" className={STATUS_TONE[j.last_status]}>{t(`scheduler.st.${j.last_status}`)}</Badge>}
            {!j.last_status && <Badge variant="secondary">{t('scheduler.st.none')}</Badge>}
            {j.stale && <Badge variant="outline" className="border-red-500/50 text-red-700"><AlertTriangle className="me-1 h-3 w-3" />{t('scheduler.stale')}</Badge>}
            {!j.enabled && <Badge variant="secondary">{t('scheduler.disable')}d</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-4">
            <span>{t('scheduler.lastRun')}: {fmt(j.last_run_at)}</span>
            <span>{t('scheduler.nextRun')}: {fmt(j.next_run_at)}</span>
            <span>{t('scheduler.duration')}: {dur(j.last_duration_ms)}</span>
            <span>{t('scheduler.interval')}: {j.interval_minutes}</span>
          </div>
          {j.last_error && <div className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-700">{j.last_error}</div>}
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => runJob(j.id), t('scheduler.ran'))}><Play className="me-1 h-3.5 w-3.5" />{t('scheduler.runNow')}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setEnabled(j.id, !j.enabled), t('scheduler.ran'))}>{j.enabled ? t('scheduler.disable') : t('scheduler.enable')}</Button>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}
