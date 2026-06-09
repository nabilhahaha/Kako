import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';
import { loadChangeRequests } from '@/lib/change-requests/list-server';

export const dynamic = 'force-dynamic';

// Universal Change Request — request list (metadata-driven, read). Tenant-scoped
// by RLS. Flag-gated by KAKO_CHANGE_REQUESTS.
export default async function ChangeRequestsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!CHANGE_REQUESTS_ENABLED()) notFound();

  const { t } = await getT();
  const supabase = await createClient();
  const rows = await loadChangeRequests(supabase);

  return (
    <div className="space-y-6">
      <PageHeader title={t('changeRequests.title')} description={t('changeRequests.subtitle')} />
      {rows.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('changeRequests.none')}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.id} href={`/change-requests/${r.id}`} className="block">
              <Card className="transition-colors hover:bg-secondary/50">
                <CardContent className="flex items-center justify-between gap-3 pt-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="capitalize">{r.entityKey}</span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{t(`changeRequests.scope.${r.scope}`)}</span>
                      {r.scope === 'bulk' && <span className="text-xs text-muted-foreground">· {r.targetCount} {t('changeRequests.targetsLabel')}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t(`changeRequests.status.${r.status}`)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
