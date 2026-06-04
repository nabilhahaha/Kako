'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Plus, PlayCircle, Ban, ScrollText, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { listImportableEntities } from '@/lib/erp/entities';
import {
  createSyncJob, runSyncJobNow, setSyncJobActive, revokeSyncJob,
  type SyncJobRow, type SyncRunRow, type ConnectionOption,
} from './actions';

function SectionHeader({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

const runVariant = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
  s === 'ok' ? 'success' : s === 'partial' || s === 'running' ? 'warning' : s === 'failed' ? 'destructive' : 'secondary';

export function SyncManager({ initialJobs, initialRuns, connections }: {
  initialJobs: SyncJobRow[]; initialRuns: SyncRunRow[]; connections: ConnectionOption[];
}) {
  const { t, locale } = useI18n();
  const entities = listImportableEntities();
  const [jobs, setJobs] = useState<SyncJobRow[]>(initialJobs);
  const [runs] = useState<SyncRunRow[]>(initialRuns);
  const [busy, setBusy] = useState(false);

  const [integrationId, setIntegrationId] = useState(connections[0]?.id ?? '');
  const [entity, setEntity] = useState(entities[0]?.key ?? '');
  const [direction, setDirection] = useState('in');
  const [mode, setMode] = useState('delta');
  const [interval, setIntervalMin] = useState('15');
  const [conflict, setConflict] = useState('manual_review');
  const [path, setPath] = useState('');
  const [cursorParam, setCursorParam] = useState('');
  const [cursorField, setCursorField] = useState('');

  const entLabel = (key: string) => {
    const e = entities.find((x) => x.key === key);
    return e ? (locale === 'ar' ? e.labelAr : e.labelEn) : key;
  };

  async function create() {
    if (!integrationId) return toast.error(t('integrations.sync.connectionRequired'));
    setBusy(true);
    try {
      const config: Record<string, unknown> = {};
      if (path.trim()) config.path = path.trim();
      if (cursorParam.trim()) config.cursor_param = cursorParam.trim();
      if (cursorField.trim()) config.cursor_field = cursorField.trim();
      const res = await createSyncJob({
        integrationId, entity, direction, mode, intervalMinutes: parseInt(interval || '15', 10), conflictPolicy: conflict, config,
      });
      if (!res.ok || !res.data) return toast.error(res.error ?? t('integrations.sync.error'));
      const conn = connections.find((c) => c.id === integrationId);
      setJobs((j) => [{
        id: res.data!.id, integrationId, integrationName: conn?.name ?? '—', entity, direction, mode,
        intervalMinutes: parseInt(interval || '15', 10), conflictPolicy: conflict, isActive: true, cursor: null, lastRunAt: null,
      }, ...j]);
      toast.success(t('integrations.sync.created'));
      setPath(''); setCursorParam(''); setCursorField('');
    } catch {
      toast.error(t('integrations.sync.error'));
    } finally { setBusy(false); }
  }

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void, ok?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? t('integrations.sync.error'));
      after();
      if (ok) toast.success(ok);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={Plus} title={t('integrations.sync.newTitle')} hint={t('integrations.sync.newHint')} />
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.sync.noConnections')}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sj-conn">{t('integrations.sync.connection')}</Label>
                  <Select id="sj-conn" value={integrationId} onChange={(e) => setIntegrationId(e.target.value)}>
                    {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-entity">{t('integrations.sync.entity')}</Label>
                  <Select id="sj-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
                    {entities.map((e) => <option key={e.key} value={e.key}>{entLabel(e.key)}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-dir">{t('integrations.sync.direction')}</Label>
                  <Select id="sj-dir" value={direction} onChange={(e) => setDirection(e.target.value)}>
                    <option value="in">{t('integrations.sync.dir.in')}</option>
                    <option value="out">{t('integrations.sync.dir.out')}</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-mode">{t('integrations.sync.mode')}</Label>
                  <Select id="sj-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="delta">{t('integrations.sync.modeDelta')}</option>
                    <option value="full">{t('integrations.sync.modeFull')}</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-interval">{t('integrations.sync.interval')}</Label>
                  <Input id="sj-interval" type="number" min={1} dir="ltr" value={interval} onChange={(e) => setIntervalMin(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-conflict">{t('integrations.sync.conflict')}</Label>
                  <Select id="sj-conflict" value={conflict} onChange={(e) => setConflict(e.target.value)}>
                    <option value="manual_review">{t('integrations.sync.cf.manual_review')}</option>
                    <option value="source_wins">{t('integrations.sync.cf.source_wins')}</option>
                    <option value="vantora_wins">{t('integrations.sync.cf.vantora_wins')}</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-path">{t('integrations.sync.path')}</Label>
                  <Input id="sj-path" dir="ltr" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/customers" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-cp">{t('integrations.sync.cursorParam')}</Label>
                  <Input id="sj-cp" dir="ltr" value={cursorParam} onChange={(e) => setCursorParam(e.target.value)} placeholder="updated_since" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sj-cf">{t('integrations.sync.cursorField')}</Label>
                  <Input id="sj-cf" dir="ltr" value={cursorField} onChange={(e) => setCursorField(e.target.value)} placeholder="updated_at" />
                </div>
              </div>
              <Button disabled={busy} onClick={create} className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4" /> {t('integrations.sync.create')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Jobs */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={RefreshCw} title={t('integrations.sync.jobsTitle')} />
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.sync.jobsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.connection')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.entity')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.direction')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.every')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.lastRun')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.status')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.sync.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2">{j.integrationName}</td>
                      <td className="px-3 py-2">{entLabel(j.entity)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{t(`integrations.sync.dir.${j.direction}`)}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{j.intervalMinutes}m</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{j.lastRunAt ? formatDate(j.lastRunAt, INTL_LOCALE[locale]) : '—'}</td>
                      <td className="px-3 py-2"><Badge variant={j.isActive ? 'success' : 'secondary'}>{j.isActive ? t('integrations.sync.active') : t('integrations.sync.paused')}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => runSyncJobNow(j.id), () => {}, t('integrations.sync.queued'))}>
                            <PlayCircle className="h-3.5 w-3.5" /> {t('integrations.sync.runNow')}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => setSyncJobActive(j.id, !j.isActive), () => setJobs((r) => r.map((x) => x.id === j.id ? { ...x, isActive: !j.isActive } : x)))}>
                            {j.isActive ? t('integrations.sync.pause') : t('integrations.sync.resume')}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm(t('integrations.sync.revokeConfirm'))) act(() => revokeSyncJob(j.id), () => setJobs((r) => r.filter((x) => x.id !== j.id)), t('integrations.sync.revoked')); }}>
                            <Ban className="h-3.5 w-3.5 text-destructive" /> {t('integrations.sync.revoke')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Runs */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionHeader icon={ScrollText} title={t('integrations.sync.runsTitle')} />
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('integrations.sync.runsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.status')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.sync.pulled')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.sync.written')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.sync.skipped')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('integrations.sync.failed')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('integrations.sync.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2"><Badge variant={runVariant(r.status)}>{r.status}</Badge></td>
                      <td className="px-3 py-2 text-end tabular-nums">{r.pulled}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{r.written}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{r.skipped}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{r.failed}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(r.startedAt, INTL_LOCALE[locale])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
