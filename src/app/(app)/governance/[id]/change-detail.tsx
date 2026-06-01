'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, GitBranch } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { setChangeState, publishChange, rollbackChange, newVersion } from '../gov-actions';

interface TimelineEvent { event: string; by: string | null; at: string | null }
export interface ChangeFull {
  id: string; config_type: string; config_ref: string; title: string; payload: { enabled?: boolean }; state: string; version: number;
  conflicts: { level: string; code: string; message: string }[];
  audience: { kind: string; labels: (string | null)[] }; pilot_users: { id: string; name: string | null }[]; timeline: TimelineEvent[];
}
export interface Impact { affected_users: number; sample_users: string[]; roles: string[]; branches: string[]; routes: string[]; regions: string[]; modules: string[] }
export interface RollbackPreview { config_ref: string; current: unknown; reverts_to: { id: string; version: number; payload: unknown } | null; removes: boolean }

export function ChangeDetail({ change, impact, rollback }: { change: ChangeFull; impact: Impact | null; rollback: RollbackPreview | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => start(async () => {
    const r = await fn();
    if (!r.ok || (r.data && (r.data as { ok?: boolean }).ok === false)) { toast.error(r.error ?? t('governance.actionFailed')); router.refresh(); return; }
    toast.success(t('governance.saved')); router.refresh();
  });
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <Badge variant="secondary">{change.config_type}</Badge>
        <span className="font-mono text-xs">{change.config_ref}</span>
        <Badge variant="outline">{t(`governance.st.${change.state}`)}</Badge>
        <span className="text-xs text-muted-foreground">v{change.version} · {t('governance.enabled')}: {String(change.payload?.enabled ?? '—')}</span>
      </CardContent></Card>

      {/* lifecycle actions */}
      <div className="flex flex-wrap gap-1.5">
        {change.state === 'draft' && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setChangeState(change.id, 'review'))}>{t('governance.actions.review')}</Button>}
        {change.state === 'review' && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setChangeState(change.id, 'approved'))}>{t('governance.actions.approve')}</Button>}
        {change.state === 'approved' && <Button size="sm" disabled={pending} onClick={() => run(() => publishChange(change.id))}>{t('governance.actions.publish')}</Button>}
        {change.state === 'published' && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rollbackChange(change.id))}>{t('governance.actions.rollback')}</Button>}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => newVersion(change.id))}><GitBranch className="me-1 h-3.5 w-3.5" />{t('governance.actions.newVersion')}</Button>
      </div>

      {/* conflicts */}
      {change.conflicts?.length > 0 && (
        <Card className="border-amber-500/50"><CardContent className="space-y-1 p-3 text-sm">
          <div className="text-xs font-medium">{t('governance.conflicts.title')}</div>
          {change.conflicts.map((c, i) => <div key={i} className={`text-xs ${c.level === 'error' ? 'text-red-600' : 'text-amber-600'}`}>{c.message}</div>)}
        </CardContent></Card>
      )}

      {/* audience + pilot visibility */}
      <Card><CardContent className="space-y-2 p-3 text-sm">
        <div className="text-xs font-medium">{t('governance.audience.title')}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{t(`governance.audience.${change.audience.kind}`)}</Badge>
          {change.audience.labels?.map((l, i) => l && <Badge key={i} variant="outline">{l}</Badge>)}
        </div>
        <div className="text-xs font-medium pt-1">{t('governance.pilot.title')}</div>
        <div className="flex flex-wrap gap-1.5">
          {change.pilot_users.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : change.pilot_users.map((p) => <Badge key={p.id} variant="outline">{p.name ?? p.id.slice(0, 8)}</Badge>)}
        </div>
      </CardContent></Card>

      {/* publish impact */}
      {impact && (
        <Card><CardContent className="space-y-1.5 p-3 text-sm">
          <div className="text-xs font-medium">{t('governance.impact.title')}</div>
          <Row label={t('governance.impact.users')} value={String(impact.affected_users)} />
          {impact.sample_users.length > 0 && <div className="text-xs text-muted-foreground">{t('governance.impact.sample')}: {impact.sample_users.join(', ')}</div>}
          <Chips label={t('governance.impact.roles')} items={impact.roles} />
          <Chips label={t('governance.impact.branches')} items={impact.branches} />
          <Chips label={t('governance.impact.regions')} items={impact.regions} />
          <Chips label={t('governance.impact.routes')} items={impact.routes} />
          {impact.modules.length > 0 && <Chips label={t('governance.impact.modules')} items={impact.modules} />}
        </CardContent></Card>
      )}

      {/* rollback preview */}
      {rollback && (
        <Card className="border-amber-500/40"><CardContent className="space-y-1 p-3 text-sm">
          <div className="text-xs font-medium">{t('governance.rollbackPreview.title')}</div>
          {rollback.removes
            ? <div className="text-xs text-amber-700">{t('governance.rollbackPreview.removes')}</div>
            : <div className="text-xs text-muted-foreground">{t('governance.rollbackPreview.revertsTo')}: {t('governance.rollbackPreview.version')} {rollback.reverts_to?.version} — {JSON.stringify(rollback.reverts_to?.payload)}</div>}
        </CardContent></Card>
      )}

      {/* audit timeline */}
      <Card><CardContent className="space-y-1.5 p-3">
        <div className="text-xs font-medium">{t('governance.timeline.title')}</div>
        {change.timeline.filter((e) => e.at).map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{t(`governance.timeline.${e.event}`)}</span>
            <span>{e.by ? `${e.by} · ` : ''}{fmt(e.at)}</span>
          </div>
        ))}
      </CardContent></Card>

      {pending && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>;
}
function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return <div className="flex flex-wrap items-center gap-1"><span className="text-xs text-muted-foreground">{label}:</span>{items.map((it, i) => <Badge key={i} variant="outline">{it}</Badge>)}</div>;
}
