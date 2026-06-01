import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';

interface Run { processed: number; created: number; updated: number; errors: number; status: string; finished_at: string | null }
interface Entity { entity: string; last_sync: string | null; mapped: number; errors: number; erp_systems: string[]; last_run: Run | null }

/** Req 5 — ERP integration dashboard: connection status + sync logs (read-only). */
export default async function SyncPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  if (!ctx.company?.id || !isAdmin) {
    return <div><PageHeader title={t('erpsync.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('erpsync.noAccess')}</CardContent></Card></div>;
  }
  const supabase = await createClient();
  const entities = ((await supabase.rpc('erp_sync_dashboard')).data as Entity[]) ?? [];
  const systems = [...new Set(entities.flatMap((e) => e.erp_systems ?? []))];
  const anyData = entities.some((e) => e.mapped > 0);
  const anyError = entities.some((e) => e.errors > 0);
  const status = anyError ? 'error' : anyData ? 'connected' : 'idle';
  const tone = status === 'connected' ? 'border-green-500/50 text-green-700' : status === 'error' ? 'border-red-500/50 text-red-700' : 'text-muted-foreground';
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <PageHeader title={t('erpsync.title')} />
      {/* connection status */}
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('erpsync.connection')}</span>
          <Badge variant="outline" className={tone}>{t(`erpsync.${status}`)}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('erpsync.systems')}:</span>
          {systems.length === 0 ? <span className="text-xs text-muted-foreground">{t('erpsync.none')}</span> : systems.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
        </div>
      </CardContent></Card>

      {/* per-entity status + logs */}
      {entities.map((e) => (
        <Card key={e.entity}><CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t(`erpsync.${e.entity}`)}</span>
            {e.last_run && <Badge variant="outline" className={e.last_run.status === 'ok' ? 'border-green-500/50 text-green-700' : e.last_run.status === 'failed' ? 'border-red-500/50 text-red-700' : 'border-amber-500/50 text-amber-700'}>{e.last_run.status}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-4">
            <span>{t('erpsync.lastSync')}: {fmt(e.last_sync)}</span>
            <span>{t('erpsync.mapped')}: {e.mapped}</span>
            <span>{t('erpsync.errors')}: {e.errors}</span>
            <span>{t('erpsync.processed')}: {e.last_run?.processed ?? 0}</span>
          </div>
          {e.last_run && (
            <div className="rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
              {t('erpsync.logs')} — {t('erpsync.processed')} {e.last_run.processed} · {t('erpsync.created')} {e.last_run.created} · {t('erpsync.updated')} {e.last_run.updated} · {t('erpsync.errors')} {e.last_run.errors} · {fmt(e.last_run.finished_at)}
            </div>
          )}
        </CardContent></Card>
      ))}
      {entities.every((e) => e.mapped === 0 && !e.last_run) && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('erpsync.empty')}</CardContent></Card>
      )}
    </div>
  );
}
