import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadOverrideQueue } from '@/lib/van-sales/override-server';
import { OverrideCenter } from './override-center';

export const dynamic = 'force-dynamic';

const OVERRIDE_PERMS: Permission[] = ['returns.override', 'day.close.override', 'day.reopen'];

// Override & Reopen Center — controlled, audited exception actions. Visible only to
// holders of an override permission (none granted by default). Every action requires
// a reason and is audited; nothing is a silent bypass.
export default async function OverrideCenterPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!OVERRIDE_PERMS.some((p) => hasPermission(ctx, p)) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const res = await loadOverrideQueue();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <div className="flex items-center justify-between gap-2">
        <PageHeader title={t('override.title')} description={t('override.subtitle')} />
        <a href="/field/van-sales/override-center/history" className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary/50">
          {t('override.historyTitle')}
        </a>
      </div>
      {!res.ok ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.error}</CardContent></Card>
      ) : (
        <OverrideCenter data={res.data!} />
      )}
    </div>
  );
}
