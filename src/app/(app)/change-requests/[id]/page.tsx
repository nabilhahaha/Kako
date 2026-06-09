import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';
import { loadChangeRequestDetail } from '@/lib/change-requests/list-server';
import { listAttachments } from '@/app/(app)/attachments/actions';

export const dynamic = 'force-dynamic';

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Universal Change Request — request detail (read): status, reason, effective
// date, field changes (before/after), affected records, and documents. RLS-scoped.
export default async function ChangeRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!CHANGE_REQUESTS_ENABLED()) notFound();

  const { id } = await params;
  const { t } = await getT();
  const supabase = await createClient();
  const cr = await loadChangeRequestDetail(supabase, id);
  if (!cr) return <div className="p-6 text-sm text-muted-foreground">{t('changeRequests.notFound')}</div>;
  const docs = await listAttachments('change_request', id);

  return (
    <div className="space-y-6">
      <PageHeader title={`${cr.entityKey} · ${t(`changeRequests.scope.${cr.scope}`)}`} description={t('changeRequests.title')} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-6 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">{t('changeRequests.statusLabel')}</div>{t(`changeRequests.status.${cr.status}`)}</div>
          <div><div className="text-xs text-muted-foreground">{t('changeRequests.created')}</div>{new Date(cr.createdAt).toLocaleString()}</div>
          {cr.effectiveAt && <div><div className="text-xs text-muted-foreground">{t('changeRequests.effectiveAt')}</div>{new Date(cr.effectiveAt).toLocaleString()}</div>}
          <div><div className="text-xs text-muted-foreground">{t('changeRequests.targetsLabel')}</div>{cr.targets.length}</div>
          {cr.reason && <div className="col-span-2 sm:col-span-4"><div className="text-xs text-muted-foreground">{t('changeRequests.reason')}</div>{cr.reason}</div>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-semibold">{t('changeRequests.fieldChanges')}</div>
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">{t('changeRequests.field')}</th>
                <th className="pb-2">{t('changeRequests.before')}</th>
                <th className="pb-2">{t('changeRequests.after')}</th>
              </tr></thead>
              <tbody>
                {cr.values.map((v, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 font-medium">{v.fieldKey}</td>
                    <td className="py-1.5 text-muted-foreground">{show(v.oldValue)}</td>
                    <td className="py-1.5">{show(v.newValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">{t('changeRequests.documents')}</div>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            {docs.length === 0 ? (
              <div className="text-muted-foreground">{t('changeRequests.noDocuments')}</div>
            ) : docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2">
                <span>{d.doc_type ? <span className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-xs">{d.doc_type}</span> : null}{d.file_name}</span>
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{t('changeRequests.view')}</a>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
