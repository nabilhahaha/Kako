import { redirect } from 'next/navigation';
import { Clock, CheckCircle2, AlertTriangle, XCircle, Smartphone } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { MOBILE_ENABLED } from '@/lib/offline-sync';

export const dynamic = 'force-dynamic';

type Conflict = { id: string; entity: string; operation: string; conflict_reason: string | null; device_id: string };
type Device = { id: string; device_id: string; platform: string | null; app_version: string | null; last_sync_at: string | null };

export default async function FieldSyncPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();

  if (!MOBILE_ENABLED()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.fieldSyncTitle')} description={t('distribution.fieldSyncDescription')} />
        <EmptyState icon={<Smartphone className="h-7 w-7" />} title={t('distribution.fieldSyncDisabled')} />
      </div>
    );
  }

  const supabase = await createClient();
  const countFor = (status: string) => supabase.from('erp_offline_mutations').select('id', { count: 'exact', head: true }).eq('status', status);
  const [pending, applied, conflicts, rejected, { data: conflictRows }, { data: deviceRows }] = await Promise.all([
    countFor('pending'), countFor('applied'), countFor('conflict'), countFor('rejected'),
    supabase.from('erp_offline_mutations').select('id, entity, operation, conflict_reason, device_id').eq('status', 'conflict').order('created_at', { ascending: false }).limit(20),
    supabase.from('erp_device_sessions').select('id, device_id, platform, app_version, last_sync_at').order('last_sync_at', { ascending: false, nullsFirst: false }).limit(50),
  ]);

  const counts = { pending: pending.count ?? 0, applied: applied.count ?? 0, conflicts: conflicts.count ?? 0, rejected: rejected.count ?? 0 };
  const conflictList = (conflictRows ?? []) as Conflict[];
  const devices = (deviceRows ?? []) as Device[];
  const isEmpty = counts.pending + counts.applied + counts.conflicts + counts.rejected === 0 && devices.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.fieldSyncTitle')} description={t('distribution.fieldSyncDescription')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('distribution.fieldSyncPending')} value={String(counts.pending)} icon={Clock} tone="info" />
        <StatCard label={t('distribution.fieldSyncApplied')} value={String(counts.applied)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('distribution.fieldSyncConflicts')} value={String(counts.conflicts)} icon={AlertTriangle} tone={counts.conflicts > 0 ? 'warning' : 'info'} />
        <StatCard label={t('distribution.fieldSyncRejected')} value={String(counts.rejected)} icon={XCircle} tone={counts.rejected > 0 ? 'destructive' : 'info'} />
      </div>

      {isEmpty ? (
        <EmptyState icon={<Smartphone className="h-7 w-7" />} title={t('distribution.fieldSyncEmpty')} />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t('distribution.fieldSyncDevicesTitle')}</h2>
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('distribution.fieldSyncEmpty')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="p-2 text-start">{t('distribution.fieldSyncColDevice')}</th>
                      <th className="p-2 text-start">{t('distribution.fieldSyncColPlatform')}</th>
                      <th className="p-2 text-start">{t('distribution.fieldSyncColVersion')}</th>
                      <th className="p-2 text-start">{t('distribution.fieldSyncColLastSync')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{d.device_id}</td>
                        <td className="p-2">{d.platform ?? '—'}</td>
                        <td className="p-2">{d.app_version ?? '—'}</td>
                        <td className="p-2 text-muted-foreground">{d.last_sync_at ? new Date(d.last_sync_at).toLocaleString() : t('distribution.fieldSyncNever')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {conflictList.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">{t('distribution.fieldSyncConflictsTitle')}</h2>
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="p-2 text-start">{t('distribution.fieldSyncColEntity')}</th>
                      <th className="p-2 text-start">{t('distribution.fieldSyncColOperation')}</th>
                      <th className="p-2 text-start">{t('distribution.fieldSyncColReason')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflictList.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="p-2">{c.entity}</td>
                        <td className="p-2">{c.operation}</td>
                        <td className="p-2 text-muted-foreground">{c.conflict_reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
